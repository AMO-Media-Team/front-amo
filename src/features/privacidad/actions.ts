"use server"

/**
 * Server Actions de los derechos del titular de datos (CTA-007, Ley 1581 de
 * 2012). Patrón:
 *
 * 1. DAL antes que nada: el titular con `cuenta.gestionar`; el equipo con
 *    `privacidad.gestionar`.
 * 2. zod: el MISMO esquema que el formulario o el diálogo.
 * 3. Escrituras por los `*_srv` (actor y sesión: `contextoDelActor`); la BD
 *    vuelve a comprobar permiso, dueño, estado y plazos. Lecturas con la
 *    sesión (`datos_titular` deja `EXPORTAR` en la bitácora).
 * 4. Storage: la carpeta `soportes/titular/{id}/` no tiene política para la
 *    sesión, así que el soporte de la respuesta se firma (subida y descarga)
 *    con el cliente de servicio DESPUÉS del DAL y de leer la solicitud con la
 *    sesión. La supresión borra después del commit los archivos que devuelve
 *    la BD, solo si tienen una forma conocida (`planBorrado`).
 * 5. `refresh()` para que la página muestre el cambio.
 *
 * Los errores esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 * En el log del servidor solo van la operación y el código: nunca datos del
 * titular.
 */
import "server-only"

import { refresh } from "next/cache"

import { contextoDelActor, type ContextoActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso } from "@/lib/auth/dal"
import { registrarEvento } from "@/lib/auth/registro"
import { esBucketStorage } from "@/lib/archivos/buckets"
import type { SubidaPreparada, UrlFirmada } from "@/lib/archivos/tipos"
import {
  type ErrorBd,
  interpretarErrorBd,
  MENSAJE_INESPERADO,
} from "@/lib/errores-bd"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { firmarDescarga } from "@/lib/storage/descargas"
import {
  archivoPerteneceA,
  carpetaSoporte,
  nuevaRuta,
  perteneceA,
  rutaMiniatura,
} from "@/lib/storage/rutas"
import { confirmarObjeto, prepararSubidaFirmada } from "@/lib/storage/subidas"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { Json } from "@/types/database.types"

import { textoRadicado } from "./presentacion"
import { solicitudParaAccion } from "./queries"
import {
  type EntradaAportar,
  type EntradaConfirmarSoporte,
  type EntradaEjecutarSupresion,
  type EntradaExportacionSolicitudes,
  type EntradaPrepararSoporte,
  type EntradaProrrogar,
  type EntradaRadicar,
  type EntradaRequerir,
  type EntradaResponder,
  type EntradaSolicitud,
  esquemaAportar,
  esquemaConfirmarSoporte,
  esquemaEjecutarSupresion,
  esquemaExportacionSolicitudes,
  esquemaPrepararSoporte,
  esquemaProrrogar,
  esquemaRadicar,
  esquemaRequerir,
  esquemaResponder,
  esquemaSolicitud,
} from "./schemas"
import { enLotes, leerResultadoSupresion, planBorrado } from "./supresion"
import type { ResultadoSupresion, SupresionEjecutada } from "./tipos"

const PERMISO_TITULAR = "cuenta.gestionar"
const PERMISO_EQUIPO = "privacidad.gestionar"

const MENSAJES_PRIVACIDAD = {
  noEncontrada: "No encontramos la solicitud o no tienes acceso a ella.",
  sinSoporte: "Esta respuesta no tiene un soporte adjunto.",
  soporteAjeno:
    "El soporte no corresponde a esta solicitud. Vuelve a adjuntarlo.",
  sinCuenta: "El titular ya no tiene cuenta en AMO.",
  radicadoDistinto:
    "El número de radicado no coincide con el de esta solicitud.",
  respuestaInvalida:
    "La base de datos devolvió una respuesta que no reconocemos. No se borró ningún archivo.",
} as const

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[privacidad] ${operacion} falló (${codigo})`)
}

/**
 * Error de la BD → mensaje. `campo` lleva el de AMO_MOTIVO_REQUERIDO (el texto
 * corto) al campo del formulario que lo escribe.
 */
function falloBd(
  operacion: string,
  error: ErrorBd,
  campo?: string
): ResultadoFallo {
  const { mensaje, codigo, esperado } = interpretarErrorBd(error)
  if (!esperado) informar(operacion, error)
  return campo && codigo === "AMO_MOTIVO_REQUERIDO"
    ? fallo(mensaje, { [campo]: [mensaje] })
    : fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

/** Carpeta del soporte de la respuesta: `soportes/titular/{id}/`. */
function carpetaRespuesta(solicitudId: string) {
  return carpetaSoporte("titular", solicitudId)
}

/** Nombre legible del soporte al descargarlo. */
function nombreSoporte(numero: number, ruta: string): string {
  const extension = ruta.slice(ruta.lastIndexOf(".") + 1) || "pdf"
  return `Respuesta solicitud ${textoRadicado(numero).replace("N.º ", "")}.${extension}`
}

async function firmarSoporte(
  contexto: ContextoActor,
  solicitud: { id: string; numero: number; evidenciaPath: string | null }
): Promise<ResultadoAccion<UrlFirmada>> {
  if (!solicitud.evidenciaPath) return fallo(MENSAJES_PRIVACIDAD.sinSoporte)
  return firmarDescarga({
    bucket: "soportes",
    ruta: solicitud.evidenciaPath,
    firmante: {
      como: "servicio",
      contexto,
      entidad: "solicitudes_titular",
      entidadId: solicitud.id,
    },
    descarga: nombreSoporte(solicitud.numero, solicitud.evidenciaPath),
  })
}

// ── El titular ───────────────────────────────────────────────────────────────

export interface SolicitudRadicada {
  solicitudId: string
  numero: number
  /** Día ('YYYY-MM-DD') en que vence el plazo legal. */
  plazoVence: string
}

/**
 * Radica una solicitud del titular (consulta, prueba de la autorización,
 * actualización, rectificación, supresión o revocatoria). La BD calcula el
 * plazo legal en días hábiles de Colombia, admite una abierta por tipo
 * (`AMO_SOLICITUD_ABIERTA`) y avisa al titular y a la cola del equipo.
 */
export async function radicarSolicitud(
  entrada: EntradaRadicar
): Promise<ResultadoAccion<SolicitudRadicada>> {
  const actor = await requerirPermiso(PERMISO_TITULAR)
  const validacion = esquemaRadicar.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { tipo, descripcion, datosAfectados } = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { data: id, error } = await contexto.admin.rpc(
      "radicar_solicitud_titular_srv",
      argumentosRpc<"radicar_solicitud_titular_srv">({
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_tipo: tipo,
        p_descripcion: descripcion,
        p_datos_afectados: datosAfectados,
      })
    )
    if (error) return falloBd("radicarSolicitud", error, "descripcion")

    // Radicado y vencimiento, leídos con la sesión (la RLS: la suya).
    const supabase = await crearClienteServidor()
    const { data: fila, error: errorLectura } = await supabase
      .from("solicitudes_titular")
      .select("numero, plazo_vence")
      .eq("id", id)
      .single()
    if (errorLectura) {
      informar("leer la solicitud radicada", errorLectura)
      return fallo(MENSAJE_INESPERADO)
    }
    refresh()
    return exito({
      solicitudId: id,
      numero: fila.numero,
      plazoVence: fila.plazo_vence,
    })
  } catch (error) {
    return falloInesperado("radicarSolicitud", error)
  }
}

/**
 * Responde el requerimiento del equipo: la solicitud vuelve a En trámite y el
 * plazo legal se cuenta de nuevo desde hoy (art. 15).
 */
export async function aportarInformacion(
  entrada: EntradaAportar
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso(PERMISO_TITULAR)
  const validacion = esquemaAportar.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { solicitudId, informacion } = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "aportar_informacion_titular_srv",
      argumentosRpc<"aportar_informacion_titular_srv">({
        p_id: solicitudId,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_informacion: informacion,
      })
    )
    if (error) return falloBd("aportarInformacion", error, "informacion")
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("aportarInformacion", error)
  }
}

/** El titular desiste de una solicitud abierta (queda cerrada, sin respuesta de fondo). */
export async function desistirSolicitud(
  entrada: EntradaSolicitud
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso(PERMISO_TITULAR)
  const validacion = esquemaSolicitud.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "desistir_solicitud_titular_srv",
      argumentosRpc<"desistir_solicitud_titular_srv">({
        p_id: validacion.data.solicitudId,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    if (error) return falloBd("desistirSolicitud", error)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("desistirSolicitud", error)
  }
}

/**
 * «Descargar mis datos»: `datos_titular()` con la sesión (nunca valores
 * cifrados; queda `EXPORTAR`). El navegador arma el JSON y el Excel.
 */
export async function descargarMisDatos(): Promise<ResultadoAccion<Json>> {
  await requerirPermiso(PERMISO_TITULAR)
  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase.rpc("datos_titular", {})
    if (error) return falloBd("descargarMisDatos", error)
    return exito(data)
  } catch (error) {
    return falloInesperado("descargarMisDatos", error)
  }
}

/**
 * URL de corta duración del soporte de la respuesta, para su titular. Se
 * comprueba con la sesión que la solicitud es suya y se firma como servicio
 * (Storage no tiene política para esa carpeta); queda `URL_FIRMADA`.
 */
export async function firmarSoportePropio(
  entrada: EntradaSolicitud
): Promise<ResultadoAccion<UrlFirmada>> {
  const actor = await requerirPermiso(PERMISO_TITULAR)
  const validacion = esquemaSolicitud.safeParse(entrada)
  if (!validacion.success) return fallo(MENSAJES_PRIVACIDAD.noEncontrada)

  try {
    const solicitud = await solicitudParaAccion(validacion.data.solicitudId)
    if (!solicitud || solicitud.perfilId !== actor.id) {
      return fallo(MENSAJES_PRIVACIDAD.noEncontrada)
    }
    return await firmarSoporte(await contextoDelActor(actor), solicitud)
  } catch (error) {
    return falloInesperado("firmarSoportePropio", error)
  }
}

// ── El equipo AMO ────────────────────────────────────────────────────────────

/** Toma la solicitud en trámite (Radicada → En trámite). */
export async function tramitarSolicitud(
  entrada: EntradaSolicitud
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso(PERMISO_EQUIPO)
  const validacion = esquemaSolicitud.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "tramitar_solicitud_titular_srv",
      argumentosRpc<"tramitar_solicitud_titular_srv">({
        p_id: validacion.data.solicitudId,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    if (error) return falloBd("tramitarSolicitud", error)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("tramitarSolicitud", error)
  }
}

/**
 * Pide información al titular (reclamo incompleto, art. 15). El plazo se
 * suspende; si no responde en el plazo de desistimiento, se cierra sola.
 */
export async function requerirInformacion(
  entrada: EntradaRequerir
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso(PERMISO_EQUIPO)
  const validacion = esquemaRequerir.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { solicitudId, requerimiento } = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "requerir_informacion_titular_srv",
      argumentosRpc<"requerir_informacion_titular_srv">({
        p_id: solicitudId,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_requerimiento: requerimiento,
      })
    )
    if (error) return falloBd("requerirInformacion", error, "requerimiento")
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("requerirInformacion", error)
  }
}

/** Prorroga el plazo legal una vez, antes del vencimiento, con el motivo para el titular. */
export async function prorrogarSolicitud(
  entrada: EntradaProrrogar
): Promise<ResultadoAccion<{ plazoVence: string }>> {
  const actor = await requerirPermiso(PERMISO_EQUIPO)
  const validacion = esquemaProrrogar.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { solicitudId, motivo } = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { data, error } = await contexto.admin.rpc(
      "prorrogar_solicitud_titular_srv",
      argumentosRpc<"prorrogar_solicitud_titular_srv">({
        p_id: solicitudId,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_motivo: motivo,
      })
    )
    if (error) return falloBd("prorrogarSolicitud", error, "motivo")
    refresh()
    return exito({ plazoVence: data })
  } catch (error) {
    return falloInesperado("prorrogarSolicitud", error)
  }
}

/**
 * Firma la subida del PDF de soporte de la respuesta a
 * `soportes/titular/{id}/{uuid}.pdf`. Como servicio y después del DAL:
 * Storage no tiene política para esa carpeta. La solicitud se lee antes con
 * la sesión (debe existir y verse).
 */
export async function prepararSoporteRespuesta(
  entrada: EntradaPrepararSoporte
): Promise<ResultadoAccion<SubidaPreparada>> {
  const actor = await requerirPermiso(PERMISO_EQUIPO)
  const validacion = esquemaPrepararSoporte.safeParse(entrada)
  if (!validacion.success) {
    return fallo(validacion.error.issues[0]?.message ?? MENSAJE_INESPERADO)
  }
  const { solicitudId, archivo } = validacion.data

  try {
    const solicitud = await solicitudParaAccion(solicitudId)
    if (!solicitud) return fallo(MENSAJES_PRIVACIDAD.noEncontrada)
    const contexto = await contextoDelActor(actor)
    return await prepararSubidaFirmada({
      cliente: contexto.admin,
      ...nuevaRuta(carpetaRespuesta(solicitudId), archivo.tipo),
    })
  } catch (error) {
    return falloInesperado("prepararSoporteRespuesta", error)
  }
}

/**
 * Comprueba que el soporte quedó en la carpeta de ESA solicitud con el peso y
 * el tipo declarados (como servicio). No guarda nada: lo guarda la respuesta.
 */
export async function confirmarSoporteRespuesta(
  entrada: EntradaConfirmarSoporte
): Promise<ResultadoAccion<{ ruta: string }>> {
  const actor = await requerirPermiso(PERMISO_EQUIPO)
  const validacion = esquemaConfirmarSoporte.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { solicitudId, archivo } = validacion.data
  if (!archivoPerteneceA(archivo, carpetaRespuesta(solicitudId))) {
    return fallo(MENSAJES_PRIVACIDAD.soporteAjeno)
  }

  try {
    const contexto = await contextoDelActor(actor)
    const objeto = await confirmarObjeto({
      cliente: contexto.admin,
      bucket: archivo.bucket,
      ruta: archivo.ruta,
      esperado: { tamano: archivo.tamano, tipo: archivo.tipo },
    })
    return objeto.ok ? exito({ ruta: archivo.ruta }) : fallo(objeto.error)
  } catch (error) {
    return falloInesperado("confirmarSoporteRespuesta", error)
  }
}

/**
 * Responde la solicitud con su decisión, el texto para el titular y, si se
 * adjuntó, el soporte PDF ya confirmado. La BD exige el estado, la longitud y
 * la forma de la ruta, y avisa al titular.
 */
export async function responderSolicitud(
  entrada: EntradaResponder
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso(PERMISO_EQUIPO)
  const validacion = esquemaResponder.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { solicitudId, decision, respuesta, soportePath } = validacion.data
  if (soportePath && !perteneceA(soportePath, carpetaRespuesta(solicitudId))) {
    return fallo(MENSAJES_PRIVACIDAD.soporteAjeno, {
      soporte: [MENSAJES_PRIVACIDAD.soporteAjeno],
    })
  }

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "responder_solicitud_titular_srv",
      argumentosRpc<"responder_solicitud_titular_srv">({
        p_id: solicitudId,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_decision: decision,
        p_respuesta: respuesta,
        p_evidencia_path: soportePath ?? undefined,
      })
    )
    if (error) return falloBd("responderSolicitud", error, "respuesta")
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("responderSolicitud", error)
  }
}

/** El soporte de la respuesta, para el equipo (firmado como servicio; queda `URL_FIRMADA`). */
export async function firmarSoporteInterno(
  entrada: EntradaSolicitud
): Promise<ResultadoAccion<UrlFirmada>> {
  const actor = await requerirPermiso(PERMISO_EQUIPO)
  const validacion = esquemaSolicitud.safeParse(entrada)
  if (!validacion.success) return fallo(MENSAJES_PRIVACIDAD.noEncontrada)

  try {
    const solicitud = await solicitudParaAccion(validacion.data.solicitudId)
    if (!solicitud) return fallo(MENSAJES_PRIVACIDAD.noEncontrada)
    return await firmarSoporte(await contextoDelActor(actor), solicitud)
  } catch (error) {
    return falloInesperado("firmarSoporteInterno", error)
  }
}

/**
 * «Ver datos del titular» para atender una consulta: `datos_titular` del
 * titular de la solicitud, con la sesión (la BD exige `privacidad.gestionar`
 * y deja `EXPORTAR`). El titular sale de la solicitud, no del navegador.
 */
export async function consultarDatosTitular(
  entrada: EntradaSolicitud
): Promise<ResultadoAccion<Json>> {
  await requerirPermiso(PERMISO_EQUIPO)
  const validacion = esquemaSolicitud.safeParse(entrada)
  if (!validacion.success) return fallo(MENSAJES_PRIVACIDAD.noEncontrada)

  try {
    const solicitud = await solicitudParaAccion(validacion.data.solicitudId)
    if (!solicitud) return fallo(MENSAJES_PRIVACIDAD.noEncontrada)
    if (!solicitud.perfilId) return fallo(MENSAJES_PRIVACIDAD.sinCuenta)
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase.rpc("datos_titular", {
      p_perfil_id: solicitud.perfilId,
    })
    if (error) return falloBd("consultarDatosTitular", error)
    return exito(data)
  } catch (error) {
    return falloInesperado("consultarDatosTitular", error)
  }
}

/**
 * Simula la supresión (no cambia nada): bloqueos legales o contractuales, qué
 * se borra, qué se anonimiza y qué se conserva.
 */
export async function simularSupresion(
  entrada: EntradaSolicitud
): Promise<ResultadoAccion<ResultadoSupresion>> {
  const actor = await requerirPermiso(PERMISO_EQUIPO)
  const validacion = esquemaSolicitud.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const contexto = await contextoDelActor(actor)
    const { data, error } = await contexto.admin.rpc(
      "suprimir_titular_srv",
      argumentosRpc<"suprimir_titular_srv">({
        p_solicitud_id: validacion.data.solicitudId,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_simular: true,
      })
    )
    if (error) return falloBd("simularSupresion", error)
    const resultado = leerResultadoSupresion(data)
    if (!resultado) {
      informar("simularSupresion", new Error("respuesta desconocida"))
      return fallo(MENSAJE_INESPERADO)
    }
    return exito(resultado)
  } catch (error) {
    return falloInesperado("simularSupresion", error)
  }
}

type ClienteAdmin = ContextoActor["admin"]

const PAGINA_LISTADO = 1000

/** Todos los objetos bajo una carpeta (recorre las subcarpetas). */
async function objetosBajo(
  admin: ClienteAdmin,
  bucket: string,
  carpeta: string
): Promise<string[]> {
  const rutas: string[] = []
  for (let desde = 0; ; desde += PAGINA_LISTADO) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(carpeta, { limit: PAGINA_LISTADO, offset: desde })
    if (error) throw error
    for (const objeto of data) {
      const ruta = `${carpeta}/${objeto.name}`
      // Las carpetas del listado no traen id.
      if (objeto.id === null)
        rutas.push(...(await objetosBajo(admin, bucket, ruta)))
      else rutas.push(ruta)
    }
    if (data.length < PAGINA_LISTADO) return rutas
  }
}

/**
 * Borra de Storage lo que la supresión dejó sin fila (después del commit,
 * como servicio), por lotes. Un fallo no deshace la supresión: se cuenta como
 * pendiente para la limpieza programada.
 */
async function borrarArchivos(
  admin: ClienteAdmin,
  resultado: ResultadoSupresion
): Promise<{ borrados: number; pendientes: number }> {
  const plan = planBorrado(resultado.archivos)
  let borrados = 0
  let pendientes = plan.rechazados
  const porBucket = new Map<string, string[]>()
  for (const { bucket, prefijo } of plan.prefijos) {
    try {
      const rutas = await objetosBajo(admin, bucket, prefijo.replace(/\/$/, ""))
      porBucket.set(bucket, [...(porBucket.get(bucket) ?? []), ...rutas])
    } catch (error) {
      informar(`listar ${bucket} para la supresión`, error)
      pendientes += 1
    }
  }
  for (const [bucket, rutas] of plan.rutas) {
    // El documento y, si la tiene, su miniatura.
    const conMiniaturas = rutas.flatMap((ruta) => {
      try {
        return [ruta, rutaMiniatura(ruta)]
      } catch {
        return [ruta]
      }
    })
    porBucket.set(bucket, [...(porBucket.get(bucket) ?? []), ...conMiniaturas])
  }
  for (const [bucket, rutas] of porBucket) {
    if (!esBucketStorage(bucket)) continue
    for (const lote of enLotes([...new Set(rutas)])) {
      const { data, error } = await admin.storage.from(bucket).remove(lote)
      if (error) {
        informar(`borrar en ${bucket} tras la supresión`, error)
        pendientes += lote.length
        continue
      }
      borrados += data.length
    }
  }
  return { borrados, pendientes }
}

/**
 * Ejecuta la supresión de una solicitud respondida con «procede» o «procede
 * en parte». Quien confirma escribe el radicado. La BD borra la cuenta,
 * suprime o anonimiza el medio y el contacto de la empresa, y devuelve los
 * archivos que se borran de Storage después. Nadie suprime sus propios datos.
 */
export async function ejecutarSupresion(
  entrada: EntradaEjecutarSupresion
): Promise<ResultadoAccion<SupresionEjecutada>> {
  const actor = await requerirPermiso(PERMISO_EQUIPO)
  const validacion = esquemaEjecutarSupresion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { solicitudId, radicado } = validacion.data

  try {
    const solicitud = await solicitudParaAccion(solicitudId)
    if (!solicitud) return fallo(MENSAJES_PRIVACIDAD.noEncontrada)
    if (solicitud.numero !== Number(radicado)) {
      return fallo(MENSAJES_PRIVACIDAD.radicadoDistinto, {
        radicado: [MENSAJES_PRIVACIDAD.radicadoDistinto],
      })
    }
    const contexto = await contextoDelActor(actor)
    const { data, error } = await contexto.admin.rpc(
      "suprimir_titular_srv",
      argumentosRpc<"suprimir_titular_srv">({
        p_solicitud_id: solicitudId,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_simular: false,
      })
    )
    if (error) return falloBd("ejecutarSupresion", error)
    refresh()
    const resultado = leerResultadoSupresion(data)
    if (!resultado) {
      informar("ejecutarSupresion", new Error("respuesta desconocida"))
      return fallo(MENSAJES_PRIVACIDAD.respuestaInvalida)
    }
    const { borrados, pendientes } = await borrarArchivos(
      contexto.admin,
      resultado
    )
    return exito({
      resultado,
      archivosBorrados: borrados,
      archivosPendientes: pendientes,
    })
  } catch (error) {
    return falloInesperado("ejecutarSupresion", error)
  }
}

/** Deja en la bitácora la exportación de la bandeja (formato y filas, sin datos). */
export async function registrarExportacionSolicitudes(
  entrada: EntradaExportacionSolicitudes
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso(PERMISO_EQUIPO)
  const validacion = esquemaExportacionSolicitudes.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const contexto = await contextoDelActor(actor)
    const registrado = await registrarEvento({
      actorId: contexto.actorId,
      admin: contexto.admin,
      accion: "EXPORTAR",
      entidad: "solicitudes_titular",
      entidadId: null,
      metadatos: validacion.data,
    })
    return registrado
      ? exito()
      : fallo("No se pudo registrar la exportación en la bitácora.")
  } catch (error) {
    return falloInesperado("registrarExportacionSolicitudes", error)
  }
}
