"use server"

/**
 * Server Actions de las disputas (ADM-011, ADM-012): abrir una (las partes y
 * el equipo), escribir en el hilo con un adjunto, firmar un adjunto y, para el
 * equipo con `disputas.resolver`, tomarla en revisión, resolverla con su
 * efecto sobre la asignación o descartarla. Patrón:
 *
 * 1. DAL (`requerirPermiso`) antes que nada.
 * 2. zod: el MISMO esquema que el formulario o el diálogo.
 * 3. Escrituras: abrir por `abrir_disputa_srv` y los cambios de estado por
 *    `transicionar` (actor y sesión: `contextoDelActor`); los mensajes con el
 *    cliente del USUARIO (RLS de `disputa_mensajes` + autor sellado por la BD).
 * 4. Los adjuntos se suben directo a Storage (`prepararAdjuntoDisputa` firma
 *    la ruta que construye el servidor) y se comprueban antes de guardar el
 *    mensaje (`perteneceA` + `confirmarObjeto`). Se firman como usuario: la
 *    RLS de Storage deja leer a las partes (sin `interno/`) y al equipo.
 * 5. `refresh()` para que la página muestre el cambio.
 *
 * Los errores esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import { refresh } from "next/cache"

import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { registrarEvento } from "@/lib/auth/registro"
import type { SubidaPreparada, UrlFirmada } from "@/lib/archivos/tipos"
import {
  codigoNegocio,
  type ErrorBd,
  MENSAJE_INESPERADO,
} from "@/lib/errores-bd"
import {
  type SolicitudTransicion,
  transicionar,
} from "@/lib/negocio/transicionar"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { firmarDescarga, MENSAJES_DESCARGA } from "@/lib/storage/descargas"
import {
  archivoPerteneceA,
  carpetaDisputa,
  nuevaRuta,
  perteneceA,
} from "@/lib/storage/rutas"
import { confirmarObjeto, prepararSubidaFirmada } from "@/lib/storage/subidas"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { Json } from "@/types/database.types"

import { describirAdjunto } from "./adjuntos"
import { interpretarErrorDisputa, MENSAJES_DISPUTA } from "./errores"
import { estaAbierta } from "./presentacion"
import { type DecisionDisputa, ORIGEN_DECISION_DISPUTA } from "./resolucion"
import {
  type EntradaAbrirDisputa,
  type EntradaConfirmarAdjunto,
  type EntradaDescartarDisputa,
  type EntradaExportacionDisputas,
  type EntradaFirmarAdjunto,
  type EntradaMensajeDisputa,
  type EntradaPrepararAdjunto,
  type EntradaResolverDisputa,
  type EntradaTomarDisputa,
  esquemaAbrirDisputa,
  esquemaConfirmarAdjunto,
  esquemaDescartarDisputa,
  esquemaExportacionDisputas,
  esquemaFirmarAdjunto,
  esquemaMensajeDisputa,
  esquemaPrepararAdjunto,
  esquemaResolverDisputa,
  esquemaTomarDisputa,
} from "./schemas"
import type { EstadoDisputa } from "./tipos"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>

/** Escriben en el hilo las partes (`disputas.abrir`) y quien resuelve. */
const PERMISOS_HILO = ["disputas.abrir", "disputas.resolver"] as const
/** Leen un adjunto el equipo (`disputas.ver`) y las partes (`disputas.abrir`). */
// Las partes leen su disputa (y sus adjuntos) con ver sus asignaciones; escribir exige `disputas.abrir`.
const PERMISOS_LECTURA = [
  "disputas.ver",
  "disputas.abrir",
  "asignaciones.ver_propias",
] as const

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[disputas] ${operacion} falló (${codigo})`)
}

function falloBd(
  operacion: string,
  error: ErrorBd,
  campos: Readonly<Record<string, string>> = {}
): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorDisputa(error)
  if (!esperado) informar(operacion, error)
  const destino = campo ? (campos[campo] ?? campo) : undefined
  return destino ? fallo(mensaje, { [destino]: [mensaje] }) : fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

function esResolutor(usuario: UsuarioSesion): boolean {
  return tieneAlgunPermiso(usuario, ["disputas.resolver"])
}

/** Estado actual de la disputa leído con la sesión (su RLS prueba el acceso). */
async function estadoActual(
  supabase: ClienteUsuario,
  disputaId: string
): Promise<EstadoDisputa | null> {
  const { data, error } = await supabase
    .from("disputas")
    .select("estado")
    .eq("id", disputaId)
    .maybeSingle()
  if (error) throw error
  return data?.estado ?? null
}

// ── Apertura ─────────────────────────────────────────────────────────────────

/**
 * Abre una disputa sobre una asignación (ADM-011): el medio, el anunciante o
 * el equipo AMO. La BD comprueba la propiedad, los estados disputables, que
 * no haya otra abierta y el reclamo de una vencida (solo el medio, «Otro» o
 * «Incumplimiento», dentro de su plazo); pasa la asignación a EN_DISPUTA y
 * avisa a la contraparte y a la cola del equipo.
 */
export async function abrirDisputa(
  entrada: EntradaAbrirDisputa
): Promise<ResultadoAccion<{ disputaId: string }>> {
  const actor = await requerirPermiso("disputas.abrir")
  const validacion = esquemaAbrirDisputa.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { asignacionId, motivo, descripcion } = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { data, error } = await contexto.admin.rpc(
      "abrir_disputa_srv",
      argumentosRpc<"abrir_disputa_srv">({
        p_asignacion_id: asignacionId,
        p_motivo: motivo,
        p_descripcion: descripcion,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    // Sin descripción la BD pide «el motivo»: en el formulario es la descripción.
    if (error) return falloBd("abrirDisputa", error, { motivo: "descripcion" })
    refresh()
    return exito({ disputaId: data })
  } catch (error) {
    return falloInesperado("abrirDisputa", error)
  }
}

// ── Adjuntos ─────────────────────────────────────────────────────────────────

/**
 * Firma la subida directa de un adjunto (imagen o PDF) a
 * `evidencias/disputa/{id}/{uuid}.{ext}` o, para una nota interna, a
 * `…/interno/`. Con la sesión: la política de Storage exige ser parte de la
 * disputa abierta (sin `interno/`) o tener `disputas.resolver`.
 */
export async function prepararAdjuntoDisputa(
  entrada: EntradaPrepararAdjunto
): Promise<ResultadoAccion<SubidaPreparada>> {
  const usuario = await requerirPermiso([...PERMISOS_HILO])
  const validacion = esquemaPrepararAdjunto.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { disputaId, interno, descripcion } = validacion.data
  if (interno && !esResolutor(usuario)) {
    return fallo(MENSAJES_DISPUTA.sinPermisoNota)
  }

  try {
    const supabase = await crearClienteServidor()
    const destino = nuevaRuta(
      carpetaDisputa(disputaId, { interno }),
      descripcion.tipo
    )
    return await prepararSubidaFirmada({ cliente: supabase, ...destino })
  } catch (error) {
    return falloInesperado("prepararAdjuntoDisputa", error)
  }
}

/**
 * Confirma que el adjunto quedó en la carpeta de la disputa con el peso y el
 * tipo declarados (idempotente por ruta). No guarda nada: el mensaje lo
 * guarda `enviarMensajeDisputa`, que lo vuelve a comprobar.
 */
export async function confirmarAdjuntoDisputa(
  entrada: EntradaConfirmarAdjunto
): Promise<ResultadoAccion> {
  await requerirPermiso([...PERMISOS_HILO])
  const validacion = esquemaConfirmarAdjunto.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { disputaId, interno, adjunto } = validacion.data
  if (!archivoPerteneceA(adjunto, carpetaDisputa(disputaId, { interno }))) {
    return fallo(MENSAJES_DISPUTA.adjuntoAjeno)
  }

  try {
    const supabase = await crearClienteServidor()
    const objeto = await confirmarObjeto({
      cliente: supabase,
      bucket: adjunto.bucket,
      ruta: adjunto.ruta,
      esperado: { tamano: adjunto.tamano, tipo: adjunto.tipo },
    })
    return objeto.ok ? exito() : fallo(objeto.error)
  } catch (error) {
    return falloInesperado("confirmarAdjuntoDisputa", error)
  }
}

/**
 * URL de corta duración del adjunto de un mensaje, firmada como usuario con
 * la ruta de ESA fila (leída con la sesión: las partes no ven las notas
 * internas). Con `descargar`, llega como archivo con un nombre legible.
 */
export async function firmarAdjuntoDisputa(
  entrada: EntradaFirmarAdjunto
): Promise<ResultadoAccion<UrlFirmada>> {
  await requerirPermiso([...PERMISOS_LECTURA])
  const validacion = esquemaFirmarAdjunto.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { disputaId, mensajeId, descargar } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("disputa_mensajes")
      .select("adjunto_path, created_at")
      .eq("id", mensajeId)
      .eq("disputa_id", disputaId)
      .maybeSingle()
    if (error) return falloBd("firmarAdjuntoDisputa", error)
    if (!data?.adjunto_path) return fallo(MENSAJES_DESCARGA.noEncontrado)
    return await firmarDescarga({
      bucket: "evidencias",
      ruta: data.adjunto_path,
      firmante: { como: "usuario", cliente: supabase },
      descarga: descargar
        ? describirAdjunto(data.adjunto_path, data.created_at)?.nombre
        : undefined,
    })
  } catch (error) {
    return falloInesperado("firmarAdjuntoDisputa", error)
  }
}

// ── Hilo ─────────────────────────────────────────────────────────────────────

/**
 * Escribe en el hilo (ADM-012): las partes mientras la disputa siga abierta;
 * el equipo que resuelve, también notas internas (también cerrada, solo
 * notas). La BD sella el autor y su parte, y avisa a las partes (salvo las
 * notas internas) y al equipo cuando escribe una parte.
 */
export async function enviarMensajeDisputa(
  entrada: EntradaMensajeDisputa
): Promise<ResultadoAccion<{ mensajeId: number }>> {
  const usuario = await requerirPermiso([...PERMISOS_HILO])
  const validacion = esquemaMensajeDisputa.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { disputaId, mensaje, adjuntoPath, interno } = validacion.data
  const resolutor = esResolutor(usuario)
  if (interno && !resolutor) return fallo(MENSAJES_DISPUTA.sinPermisoNota)

  try {
    const supabase = await crearClienteServidor()
    const estado = await estadoActual(supabase, disputaId)
    if (!estado) return fallo(MENSAJES_DISPUTA.noEncontrada)
    if (!estaAbierta(estado) && !(interno && resolutor)) {
      return fallo(MENSAJES_DISPUTA.cerrada)
    }
    if (adjuntoPath) {
      if (!perteneceA(adjuntoPath, carpetaDisputa(disputaId, { interno }))) {
        return fallo(MENSAJES_DISPUTA.adjuntoAjeno, {
          adjunto: [MENSAJES_DISPUTA.adjuntoAjeno],
        })
      }
      const objeto = await confirmarObjeto({
        cliente: supabase,
        bucket: "evidencias",
        ruta: adjuntoPath,
      })
      if (!objeto.ok) return fallo(objeto.error, { adjunto: [objeto.error] })
    }
    const { data, error } = await supabase
      .from("disputa_mensajes")
      .insert({
        disputa_id: disputaId,
        mensaje,
        adjunto_path: adjuntoPath ?? null,
        interno,
      })
      .select("id")
      .single()
    if (error) return falloBd("enviarMensajeDisputa", error)
    refresh()
    return exito({ mensajeId: data.id })
  } catch (error) {
    return falloInesperado("enviarMensajeDisputa", error)
  }
}

// ── Decisiones del equipo ────────────────────────────────────────────────────

/** Errores que delatan un cambio de la asignación: se refresca la ficha. */
const CAMBIO_DE_SITUACION = new Set([
  "oferta_cerrada",
  "metricas_pendientes",
  "asignacion_cerrada",
])

function cambioDeSituacion(error: ErrorBd): boolean {
  const codigo = codigoNegocio(error)
  return (
    CAMBIO_DE_SITUACION.has(error.hint ?? "") ||
    codigo === "AMO_PERMANENCIA_PENDIENTE" ||
    codigo === "AMO_TRANSICION_INVALIDA"
  )
}

async function decidir(
  actor: UsuarioSesion,
  operacion: string,
  decision: DecisionDisputa,
  solicitud: SolicitudTransicion<"disputas">
): Promise<ResultadoAccion> {
  try {
    const supabase = await crearClienteServidor()
    const estado = await estadoActual(supabase, solicitud.id)
    if (!estado) return fallo(MENSAJES_DISPUTA.noEncontrada)
    if (!ORIGEN_DECISION_DISPUTA[decision].includes(estado)) {
      return fallo(
        estaAbierta(estado)
          ? "La disputa ya está en revisión. Actualiza la página para ver su estado."
          : "La disputa ya se cerró. Actualiza la página para ver su resultado."
      )
    }
    const contexto = await contextoDelActor(actor)
    const { error } = await transicionar(contexto, solicitud)
    if (error) {
      // La ficha pasa a mostrar la situación nueva; el diálogo explica por qué no se pudo.
      if (cambioDeSituacion(error)) refresh()
      return falloBd(operacion, error)
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado(operacion, error)
  }
}

/** La toma en revisión (sin motivo): las partes ven que el equipo la atiende. */
export async function tomarDisputa(
  entrada: EntradaTomarDisputa
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("disputas.resolver")
  const validacion = esquemaTomarDisputa.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return decidir(actor, "tomarDisputa", "tomar", {
    entidad: "disputas",
    id: validacion.data.disputaId,
    hacia: "EN_REVISION",
  })
}

/**
 * Resuelve la disputa con su efecto sobre la asignación (ADM-012): restaurar
 * el estado previo, verificar (si venía de «métricas cargadas»), reabrir la
 * publicación de una vencida (con el plazo de recarga) o cancelar con causa.
 * La explicación queda como resolución, en la bitácora y en el aviso a las
 * partes.
 */
export async function resolverDisputa(
  entrada: EntradaResolverDisputa
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("disputas.resolver")
  const validacion = esquemaResolverDisputa.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { disputaId, estadoResultante, causa, permanenciaVerificada, motivo } =
    validacion.data
  if (
    permanenciaVerificada &&
    !tieneAlgunPermiso(actor, ["metricas.editar_validadas"])
  ) {
    return fallo(
      "Solo quien corrige métricas validadas deja constancia manual de la permanencia."
    )
  }
  const datos: Record<string, Json> = {
    estado_asignacion_resultante: estadoResultante,
  }
  if (estadoResultante === "CANCELADA" && causa) datos.causa = causa
  if (estadoResultante === "VERIFICADA" && permanenciaVerificada) {
    datos.permanencia_verificada = true
  }
  return decidir(actor, "resolverDisputa", "resolver", {
    entidad: "disputas",
    id: disputaId,
    hacia: "RESUELTA",
    motivo,
    datos,
  })
}

/** La descarta con motivo: la asignación vuelve al estado que tenía al abrirse. */
export async function descartarDisputa(
  entrada: EntradaDescartarDisputa
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("disputas.resolver")
  const validacion = esquemaDescartarDisputa.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return decidir(actor, "descartarDisputa", "descartar", {
    entidad: "disputas",
    id: validacion.data.disputaId,
    hacia: "DESCARTADA",
    motivo: validacion.data.motivo,
  })
}

// ── Exportación de la bandeja ────────────────────────────────────────────────

/** Deja `EXPORTAR` en la bitácora al descargar la bandeja (CSV o Excel). */
export async function registrarExportacionDisputas(
  entrada: EntradaExportacionDisputas
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("disputas.ver")
  const validacion = esquemaExportacionDisputas.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const contexto = await contextoDelActor(actor)
    const registrado = await registrarEvento({
      actorId: contexto.actorId,
      admin: contexto.admin,
      accion: "EXPORTAR",
      entidad: "disputas",
      entidadId: null,
      metadatos: validacion.data,
    })
    return registrado
      ? exito()
      : fallo("No se pudo registrar la exportación en la bitácora.")
  } catch (error) {
    return falloInesperado("registrarExportacionDisputas", error)
  }
}
