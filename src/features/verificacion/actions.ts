"use server"

/**
 * Server Actions de la verificación de medios (ADM-001) y de la pertinencia
 * geográfica (ADM-006). Patrón de cada acción:
 *
 * 1. DAL (`requerirPermiso`) antes que nada; lo que toca documentos de
 *    identidad exige además `datos_sensibles.ver` (como su RLS).
 * 2. zod: el MISMO esquema que el formulario.
 * 3. Los cambios de estado van por `transicionar_srv` y las RPC `*_srv` con
 *    actor y sesión (`contextoDelActor`): la BD revalida permiso, estado,
 *    documentos del nivel y cuenta vigente, y registra la bitácora. La
 *    pertinencia se escribe con el cliente del USUARIO (RLS + auditoría).
 * 4. Los archivos se firman como servicio SOLO tras leer la fila con la
 *    sesión (su RLS prueba el acceso) y con `URL_FIRMADA` en la bitácora.
 * 5. `refresh()` para que colas, contadores y ficha muestren el cambio.
 *
 * Los errores esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import { refresh } from "next/cache"

import { codigoCoincide } from "@/features/cuentas-medio/codigo"
import { type ContextoActor, contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import type { UrlFirmada } from "@/lib/archivos/tipos"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
import { serializarFecha } from "@/lib/fechas"
import { obtenerMunicipio } from "@/lib/geo/catalogo"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { firmarDescarga } from "@/lib/storage/descargas"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { Json } from "@/types/database.types"

import { esHuellaHex } from "./codigo"
import { interpretarErrorVerificacion, MENSAJES_VERIFICACION } from "./errores"
import {
  type EntradaAprobarCuenta,
  type EntradaAprobarDocumento,
  type EntradaCambiarNivel,
  type EntradaComprobarCodigo,
  type EntradaDocumento,
  type EntradaPertinencia,
  type EntradaQuitarPertinencia,
  type EntradaRechazarCuenta,
  type EntradaRechazarDocumento,
  type EntradaRechazarMedio,
  type EntradaVerificacionCuenta,
  type EntradaVerificarMedio,
  type EntradaVideollamada,
  esquemaAprobarCuenta,
  esquemaAprobarDocumento,
  esquemaCambiarNivel,
  esquemaComprobarCodigo,
  esquemaDocumento,
  esquemaPertinencia,
  esquemaQuitarPertinencia,
  esquemaRechazarCuenta,
  esquemaRechazarDocumento,
  esquemaRechazarMedio,
  esquemaVerificacionCuenta,
  esquemaVerificarMedio,
  esquemaVideollamada,
} from "./schemas"
import { vigenciaAdmisible } from "./vigencia"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[verificacion] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorVerificacion(error)
  if (!esperado) informar(operacion, error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

/** Ver o decidir sobre documentos de identidad exige los dos permisos (RLS). */
function puedeVerDocumentos(actor: UsuarioSesion): boolean {
  return tieneAlgunPermiso(actor, ["datos_sensibles.ver"])
}

interface Transicion {
  entidad: "medios" | "documentos_medio" | "verificaciones_cuenta"
  id: string
  hacia: string
  motivo?: string | null
  datos?: Json
}

async function transicionar(
  contexto: ContextoActor,
  { entidad, id, hacia, motivo = null, datos = {} }: Transicion
) {
  return contexto.admin.rpc(
    "transicionar_srv",
    argumentosRpc<"transicionar_srv">({
      p_entidad: entidad,
      p_id: id,
      p_hacia: hacia,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
      p_motivo: motivo,
      p_datos: datos,
    })
  )
}

/** Ejecuta una transición ya validada y refresca la página si sale bien. */
async function aplicarTransicion(
  actor: UsuarioSesion,
  operacion: string,
  transicion: Transicion
): Promise<ResultadoAccion> {
  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await transicionar(contexto, transicion)
    if (error) return falloBd(operacion, error)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado(operacion, error)
  }
}

/** Ruta del archivo de un documento, leída con la sesión (RLS). */
async function rutaDocumento(
  supabase: ClienteUsuario,
  documentoId: string
): Promise<{ ruta: string | null } | null> {
  const { data, error } = await supabase
    .from("documentos_medio")
    .select("archivo_path")
    .eq("id", documentoId)
    .maybeSingle()
  if (error) throw error
  return data ? { ruta: data.archivo_path } : null
}

// ── Archivos (URL firmadas de corta duración, como servicio) ─────────────────

/**
 * URL firmada para ver un documento de identidad. El equipo AMO no tiene
 * lectura directa en el bucket `documentos`: se lee la fila con la sesión y
 * se firma como servicio dejando `URL_FIRMADA` en la bitácora. Sin opción de
 * descarga: el documento se revisa en pantalla.
 */
export async function firmarDocumento(
  entrada: EntradaDocumento
): Promise<ResultadoAccion<UrlFirmada>> {
  const actor = await requerirPermiso("medios.verificar")
  if (!puedeVerDocumentos(actor)) {
    return fallo(MENSAJES_VERIFICACION.sinPermisoDocumentos)
  }
  const validacion = esquemaDocumento.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { documentoId } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const documento = await rutaDocumento(supabase, documentoId)
    if (!documento) return fallo(MENSAJES_VERIFICACION.documentoNoEncontrado)
    if (!documento.ruta) return fallo(MENSAJES_VERIFICACION.documentoSinArchivo)
    return await firmarDescarga({
      bucket: "documentos",
      ruta: documento.ruta,
      firmante: {
        como: "servicio",
        contexto: await contextoDelActor(actor),
        entidad: "documentos_medio",
        entidadId: documentoId,
      },
    })
  } catch (error) {
    return falloInesperado("firmarDocumento", error)
  }
}

/** URL firmada de la captura de una verificación de cuenta (mismo camino). */
export async function firmarCaptura(
  entrada: EntradaVerificacionCuenta
): Promise<ResultadoAccion<UrlFirmada>> {
  const actor = await requerirPermiso("medios.verificar")
  const validacion = esquemaVerificacionCuenta.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { verificacionId } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("verificaciones_cuenta")
      .select("captura_path")
      .eq("id", verificacionId)
      .maybeSingle()
    if (error) return falloBd("leer verificación", error)
    if (!data) return fallo(MENSAJES_VERIFICACION.verificacionNoEncontrada)
    if (!data.captura_path) {
      return fallo(MENSAJES_VERIFICACION.verificacionSinCaptura)
    }
    return await firmarDescarga({
      bucket: "documentos",
      ruta: data.captura_path,
      firmante: {
        como: "servicio",
        contexto: await contextoDelActor(actor),
        entidad: "verificaciones_cuenta",
        entidadId: verificacionId,
      },
    })
  } catch (error) {
    return falloInesperado("firmarCaptura", error)
  }
}

// ── Documentos ───────────────────────────────────────────────────────────────

/** Aprueba un documento; opcionalmente fija su vigencia (MED-003). */
export async function aprobarDocumento(
  entrada: EntradaAprobarDocumento
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("medios.verificar")
  if (!puedeVerDocumentos(actor)) {
    return fallo(MENSAJES_VERIFICACION.sinPermisoDocumentos)
  }
  const validacion = esquemaAprobarDocumento.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { documentoId, fechaVencimiento, observaciones } = validacion.data
  if (
    fechaVencimiento &&
    !vigenciaAdmisible(fechaVencimiento, serializarFecha(new Date()))
  ) {
    const mensaje = MENSAJES_VERIFICACION.vigenciaPasada
    return fallo(mensaje, { fechaVencimiento: [mensaje] })
  }
  const datos: Record<string, string> = {}
  if (fechaVencimiento) datos.fecha_vencimiento = fechaVencimiento
  if (observaciones) datos.observaciones = observaciones
  return aplicarTransicion(actor, "aprobarDocumento", {
    entidad: "documentos_medio",
    id: documentoId,
    hacia: "APROBADO",
    datos,
  })
}

/** Rechaza un documento con el motivo que verá el medio. */
export async function rechazarDocumento(
  entrada: EntradaRechazarDocumento
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("medios.verificar")
  if (!puedeVerDocumentos(actor)) {
    return fallo(MENSAJES_VERIFICACION.sinPermisoDocumentos)
  }
  const validacion = esquemaRechazarDocumento.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return aplicarTransicion(actor, "rechazarDocumento", {
    entidad: "documentos_medio",
    id: validacion.data.documentoId,
    hacia: "RECHAZADO",
    motivo: validacion.data.motivo,
  })
}

/**
 * Deja constancia de una prueba de vida por videollamada (alternativa a la
 * foto, dato biométrico facultativo): nace aprobada.
 */
export async function registrarVideollamada(
  entrada: EntradaVideollamada
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("medios.verificar")
  if (!puedeVerDocumentos(actor)) {
    return fallo(MENSAJES_VERIFICACION.sinPermisoDocumentos)
  }
  const validacion = esquemaVideollamada.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "registrar_verificacion_videollamada_srv",
      {
        p_medio_id: validacion.data.medioId,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_observaciones: validacion.data.observaciones,
      }
    )
    if (error) return falloBd("registrarVideollamada", error)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("registrarVideollamada", error)
  }
}

// ── Cuentas sociales ─────────────────────────────────────────────────────────

/** Aprueba la verificación con los seguidores comprobados (deriva la franja). */
export async function aprobarVerificacionCuenta(
  entrada: EntradaAprobarCuenta
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("medios.verificar")
  const validacion = esquemaAprobarCuenta.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { verificacionId, seguidoresVerificados, observaciones } =
    validacion.data
  return aplicarTransicion(actor, "aprobarVerificacionCuenta", {
    entidad: "verificaciones_cuenta",
    id: verificacionId,
    hacia: "APROBADA",
    datos: {
      seguidores_verificados: seguidoresVerificados,
      ...(observaciones ? { observaciones } : {}),
    },
  })
}

/** Rechaza la verificación (una verificación previa vigente se conserva). */
export async function rechazarVerificacionCuenta(
  entrada: EntradaRechazarCuenta
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("medios.verificar")
  const validacion = esquemaRechazarCuenta.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return aplicarTransicion(actor, "rechazarVerificacionCuenta", {
    entidad: "verificaciones_cuenta",
    id: validacion.data.verificacionId,
    hacia: "RECHAZADA",
    motivo: validacion.data.motivo,
  })
}

/**
 * ¿El código que se ve en la captura es el que la plataforma generó? Se
 * compara su sha256 con `codigo_hash` sin revelar nada más: el código en
 * claro nunca se guardó. La comparación es la de «Mi medio › Cuentas
 * sociales», que generó la huella (misma normalización).
 */
export async function comprobarCodigoHistoria(
  entrada: EntradaComprobarCodigo
): Promise<ResultadoAccion<{ coincide: boolean }>> {
  await requerirPermiso("medios.verificar")
  const validacion = esquemaComprobarCodigo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { verificacionId, codigo } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("verificaciones_cuenta")
      .select("metodo, codigo_hash")
      .eq("id", verificacionId)
      .maybeSingle()
    if (error) return falloBd("leer código de verificación", error)
    if (!data) return fallo(MENSAJES_VERIFICACION.verificacionNoEncontrada)
    if (data.metodo !== "CODIGO_HISTORIA" || !esHuellaHex(data.codigo_hash)) {
      return fallo(MENSAJES_VERIFICACION.sinCodigo)
    }
    return exito({ coincide: codigoCoincide(codigo, data.codigo_hash) })
  } catch (error) {
    return falloInesperado("comprobarCodigoHistoria", error)
  }
}

// ── Decisión sobre el medio ──────────────────────────────────────────────────

/**
 * Verifica un medio PENDIENTE en un nivel. La BD exige los documentos del
 * nivel, el certificado de su medio de pago y una cuenta vigente; si falta
 * algo, su detalle lo enumera y se muestra tal cual (con nombres legibles).
 */
export async function verificarMedio(
  entrada: EntradaVerificarMedio
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("medios.verificar")
  const validacion = esquemaVerificarMedio.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return aplicarTransicion(actor, "verificarMedio", {
    entidad: "medios",
    id: validacion.data.medioId,
    hacia: "VERIFICADO",
    datos: { nivel: validacion.data.nivel },
  })
}

/** Cambia el nivel de un medio ya verificado (sube o baja; exige motivo). */
export async function cambiarNivelMedio(
  entrada: EntradaCambiarNivel
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("medios.verificar")
  const validacion = esquemaCambiarNivel.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return aplicarTransicion(actor, "cambiarNivelMedio", {
    entidad: "medios",
    id: validacion.data.medioId,
    hacia: "VERIFICADO",
    motivo: validacion.data.motivo,
    datos: { nivel: validacion.data.nivel },
  })
}

/** Rechaza la verificación con el motivo que verá el medio para corregir. */
export async function rechazarMedio(
  entrada: EntradaRechazarMedio
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("medios.verificar")
  const validacion = esquemaRechazarMedio.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return aplicarTransicion(actor, "rechazarMedio", {
    entidad: "medios",
    id: validacion.data.medioId,
    hacia: "RECHAZADO",
    motivo: validacion.data.motivo,
  })
}

// ── Pertinencia geográfica (ADM-006) ─────────────────────────────────────────

function municipioDesconocido(): ResultadoFallo {
  const mensaje = MENSAJES_VERIFICACION.municipioDesconocido
  return fallo(mensaje, { municipioCodigo: [mensaje] })
}

/** Clasifica un municipio nuevo para el medio. */
export async function agregarPertinencia(
  entrada: EntradaPertinencia
): Promise<ResultadoAccion> {
  await requerirPermiso("medios.clasificar_pertinencia")
  const validacion = esquemaPertinencia.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { medioId, municipioCodigo, multiplicador, notas } = validacion.data
  if (!obtenerMunicipio(municipioCodigo)) return municipioDesconocido()

  try {
    const supabase = await crearClienteServidor()
    const { error } = await supabase
      .from("medio_pertinencia_geografica")
      .insert({
        medio_id: medioId,
        municipio_codigo: municipioCodigo,
        multiplicador,
        notas,
      })
    if (error) return falloBd("agregarPertinencia", error)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("agregarPertinencia", error)
  }
}

/** Cambia el multiplicador o las notas de un municipio ya clasificado. */
export async function editarPertinencia(
  entrada: EntradaPertinencia
): Promise<ResultadoAccion> {
  await requerirPermiso("medios.clasificar_pertinencia")
  const validacion = esquemaPertinencia.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { medioId, municipioCodigo, multiplicador, notas } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("medio_pertinencia_geografica")
      .update({ multiplicador, notas })
      .eq("medio_id", medioId)
      .eq("municipio_codigo", municipioCodigo)
      .select("municipio_codigo")
    if (error) return falloBd("editarPertinencia", error)
    refresh()
    return data.length === 1
      ? exito()
      : fallo(MENSAJES_VERIFICACION.pertinenciaNoEncontrada)
  } catch (error) {
    return falloInesperado("editarPertinencia", error)
  }
}

/** Quita la clasificación: el municipio vuelve al multiplicador neutro. */
export async function quitarPertinencia(
  entrada: EntradaQuitarPertinencia
): Promise<ResultadoAccion> {
  await requerirPermiso("medios.clasificar_pertinencia")
  const validacion = esquemaQuitarPertinencia.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("medio_pertinencia_geografica")
      .delete()
      .eq("medio_id", validacion.data.medioId)
      .eq("municipio_codigo", validacion.data.municipioCodigo)
      .select("municipio_codigo")
    if (error) return falloBd("quitarPertinencia", error)
    refresh()
    return data.length === 1
      ? exito()
      : fallo(MENSAJES_VERIFICACION.pertinenciaNoEncontrada)
  } catch (error) {
    return falloInesperado("quitarPertinencia", error)
  }
}
