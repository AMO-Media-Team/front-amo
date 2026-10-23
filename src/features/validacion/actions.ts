"use server"

/**
 * Server Actions de la validación del equipo AMO (ADM-007, ADM-008, ADM-009).
 * Patrón:
 *
 * 1. DAL (`requerirPermiso`) antes que nada.
 * 2. zod: el MISMO esquema que el formulario o el diálogo.
 * 3. El cambio va por las RPC `*_srv` con actor y sesión
 *    (`validar_evidencia_srv`, `validar_metrica_srv`, `corregir_metrica_srv`)
 *    o por `transicionar` (verificar): la BD revalida permiso, estado,
 *    etiqueta, alerta revisada, cortes, pendientes y permanencia, mueve la
 *    asignación en la misma transacción y deja bitácora y avisos al medio.
 * 4. `revalidatePath` de la ficha de la asignación y de la cola.
 *
 * Los errores esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { conReglasMetricas, datosMetricas } from "@/features/ejecucion/schemas"
import { rutaAsignacion } from "@/features/operacion/rutas"
import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
import { transicionar } from "@/lib/negocio/transicionar"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { argumentosRpc } from "@/lib/supabase/rpc"
import type { Database } from "@/types/database.types"

import { RUTA_VALIDACION } from "./colas"
import { cambiosCorreccion, reglasCorreccion } from "./correccion"
import {
  type ContextoErrorValidacion,
  interpretarErrorValidacion,
  MENSAJES_VALIDACION,
} from "./errores"
import {
  estadoAsignacion,
  metricaParaCorregir,
  permanenciaPendienteHasta,
} from "./queries"
import {
  type EntradaLeerCorreccion,
  type EntradaValidarEvidencia,
  type EntradaValidarMetrica,
  type EntradaVerificar,
  esquemaCorreccion,
  esquemaLeerCorreccion,
  esquemaValidarEvidencia,
  esquemaValidarMetrica,
  esquemaVerificar,
  type ValoresCorreccion,
} from "./schemas"
import type { MetricaParaCorregir } from "./tipos"

type EstadoAsignacion = Database["public"]["Enums"]["asignacion_estado"]

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[validacion] ${operacion} falló (${codigo})`)
}

function falloBd(
  operacion: string,
  error: ErrorBd,
  contexto?: ContextoErrorValidacion
): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorValidacion(
    error,
    contexto
  )
  if (!esperado) informar(operacion, error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

/** La ficha de la asignación y las colas muestran el cambio. */
function revalidar(asignacionId: string | null): void {
  if (asignacionId) revalidatePath(rutaAsignacion(asignacionId))
  revalidatePath(RUTA_VALIDACION)
}

/** Lo que devuelven `validar_evidencia_srv` y `validar_metrica_srv`. */
const esquemaRespuesta = z.object({
  asignacion_id: z.string(),
  estado: z.string(),
  fecha_limite_publicacion: z.string().nullish(),
})

export interface ResultadoValidacion {
  asignacionId: string
  /** Estado de la asignación tras decidir. */
  estadoAsignacion: EstadoAsignacion
  /** Hasta cuándo puede el medio cargar otra evidencia (al rechazar). */
  fechaLimitePublicacion: string | null
}

function leerRespuesta(datos: unknown): ResultadoValidacion | null {
  const lectura = esquemaRespuesta.safeParse(datos)
  if (!lectura.success) return null
  return {
    asignacionId: lectura.data.asignacion_id,
    estadoAsignacion: lectura.data.estado as EstadoAsignacion,
    fechaLimitePublicacion: lectura.data.fecha_limite_publicacion ?? null,
  }
}

/**
 * Si otro validador ya decidió o la asignación cambió, la cola y la ficha se
 * actualizan para que lo que se ve sea lo vigente.
 */
function revalidarSiCambio(error: ErrorBd): void {
  if (
    error.message?.startsWith("AMO_TRANSICION_INVALIDA") ||
    error.hint === "asignacion_cerrada"
  ) {
    revalidatePath(RUTA_VALIDACION)
  }
}

// ── Evidencias (ADM-007) ─────────────────────────────────────────────────────

/**
 * Aprueba (con la etiqueta de publicidad verificada a la vista) o rechaza
 * (con observaciones para el medio) una evidencia de publicación. Aprobar la
 * última deja la asignación en EVIDENCIA_VALIDADA; rechazar la devuelve a
 * CONTENIDO_ENTREGADO y le da al medio al menos `evidencias.plazo_recarga_horas`
 * para cargar otra.
 */
export async function validarEvidencia(
  entrada: EntradaValidarEvidencia
): Promise<ResultadoAccion<ResultadoValidacion>> {
  const actor = await requerirPermiso("evidencias.validar")
  const validacion = esquemaValidarEvidencia.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const decision = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { data, error } = await contexto.admin.rpc(
      "validar_evidencia_srv",
      argumentosRpc<"validar_evidencia_srv">({
        p_publicacion_id: decision.publicacionId,
        p_aprobar: decision.aprobar,
        p_etiqueta_verificada: decision.aprobar
          ? decision.etiquetaVerificada
          : false,
        p_observaciones: decision.observaciones || null,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    if (error) {
      revalidarSiCambio(error)
      return falloBd("validarEvidencia", error)
    }
    const resultado = leerRespuesta(data)
    revalidar(resultado?.asignacionId ?? null)
    if (!resultado) {
      informar("validarEvidencia", new Error("RespuestaInesperada"))
      return fallo(MENSAJE_INESPERADO)
    }
    return exito(resultado)
  } catch (error) {
    informar("validarEvidencia", error)
    return fallo(MENSAJE_INESPERADO)
  }
}

// ── Métricas (ADM-008) ───────────────────────────────────────────────────────

/**
 * Aprueba (si tiene alerta, con la constancia de lo revisado) o rechaza (con
 * observaciones para el medio) un corte de métricas. Rechazar en una
 * asignación con todo cargado la devuelve a EVIDENCIA_VALIDADA.
 */
export async function validarMetrica(
  entrada: EntradaValidarMetrica
): Promise<ResultadoAccion<ResultadoValidacion>> {
  const actor = await requerirPermiso("metricas.validar")
  const validacion = esquemaValidarMetrica.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const decision = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { data, error } = await contexto.admin.rpc(
      "validar_metrica_srv",
      argumentosRpc<"validar_metrica_srv">({
        p_metrica_id: decision.metricaId,
        p_aprobar: decision.aprobar,
        p_observaciones: decision.observaciones || null,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    if (error) {
      revalidarSiCambio(error)
      return falloBd("validarMetrica", error)
    }
    const resultado = leerRespuesta(data)
    revalidar(resultado?.asignacionId ?? null)
    if (!resultado) {
      informar("validarMetrica", new Error("RespuestaInesperada"))
      return fallo(MENSAJE_INESPERADO)
    }
    return exito(resultado)
  } catch (error) {
    informar("validarMetrica", error)
    return fallo(MENSAJE_INESPERADO)
  }
}

/**
 * Lo que necesita el formulario de corrección de una métrica aprobada: se
 * lee al abrirlo (con la sesión: la RLS decide) y solo con permiso de
 * corregir.
 */
export async function prepararCorreccionMetrica(
  entrada: EntradaLeerCorreccion
): Promise<ResultadoAccion<MetricaParaCorregir>> {
  await requerirPermiso("metricas.editar_validadas")
  const validacion = esquemaLeerCorreccion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const lectura = await metricaParaCorregir(validacion.data.metricaId)
    if (!lectura) return fallo(MENSAJES_VALIDACION.noEncontrada)
    if (!lectura.aprobada) return fallo(MENSAJES_VALIDACION.noAprobada)
    return exito(lectura.metrica)
  } catch (error) {
    informar("prepararCorreccionMetrica", error)
    return fallo("No pudimos cargar la métrica. Intenta de nuevo.")
  }
}

/** Campos del formulario de corrección donde se muestra un error. */
const CAMPOS_CORRECCION: readonly string[] = [
  "dia",
  "hora",
  "interacciones",
  "alcance",
  "impresiones",
  "reproducciones",
  "espectadoresUnicos",
  "meGusta",
  "comentarios",
  "compartidos",
  "guardados",
  "clicsEnlace",
  "visitasPerfil",
  "tiempoPromedioS",
  "porcentajeCompleto",
  "motivo",
]

/**
 * Corrige una métrica APROBADA con un motivo (ADM-008 c2): solo
 * `metricas.editar_validadas`. Las cifras se revalidan con las mismas reglas
 * de coherencia que la carga del medio y se manda solo lo que cambió; la BD
 * guarda actor y motivo en la bitácora y suma «Corrección: …» a las
 * observaciones. Nadie del equipo reescribe cifras por la sesión.
 */
export async function corregirMetrica(
  entrada: ValoresCorreccion
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("metricas.editar_validadas")
  const basica = esquemaCorreccion.safeParse(entrada)
  if (!basica.success) return desdeErrorZod(basica.error)

  try {
    const lectura = await metricaParaCorregir(basica.data.metricaId)
    if (!lectura) return fallo(MENSAJES_VALIDACION.noEncontrada)
    if (!lectura.aprobada) return fallo(MENSAJES_VALIDACION.noAprobada)
    const { metrica } = lectura

    const reglas = reglasCorreccion(metrica, new Date())
    const completa = conReglasMetricas(esquemaCorreccion, reglas).safeParse(
      entrada
    )
    if (!completa.success) return desdeErrorZod(completa.error)
    const datos = datosMetricas(completa.data, reglas)
    if (!datos) return fallo("Revisa la fecha y la hora de la captura.")

    const cambios = cambiosCorreccion(metrica, datos, completa.data)
    if (Object.keys(cambios).length === 0) {
      return fallo(MENSAJES_VALIDACION.sinCambios)
    }

    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "corregir_metrica_srv",
      argumentosRpc<"corregir_metrica_srv">({
        p_metrica_id: metrica.metricaId,
        p_valores: cambios,
        p_motivo: completa.data.motivo,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    if (error) {
      const respuesta = falloBd("corregirMetrica", error, {
        campoMotivo: "motivo",
      })
      // Un error en un campo que el formulario no tiene va al mensaje general.
      const ajeno = Object.keys(respuesta.erroresCampo ?? {}).some(
        (campo) => !CAMPOS_CORRECCION.includes(campo)
      )
      return ajeno ? fallo(respuesta.error) : respuesta
    }
    revalidar(metrica.asignacionId)
    return exito()
  } catch (error) {
    informar("corregirMetrica", error)
    return fallo(MENSAJE_INESPERADO)
  }
}

// ── Verificación (ADM-009) ───────────────────────────────────────────────────

/**
 * Verifica la asignación: METRICAS_CARGADAS → VERIFICADA, la única puerta a
 * la liquidación. La BD exige todos los cortes requeridos aprobados, ninguna
 * métrica pendiente y la permanencia cumplida; con `constancia` (solo
 * `metricas.editar_validadas`) se deja constancia manual de la permanencia con
 * un motivo.
 */
export async function verificarAsignacion(
  entrada: EntradaVerificar
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("metricas.validar")
  const validacion = esquemaVerificar.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { asignacionId, constancia, motivo } = validacion.data
  if (constancia && !tieneAlgunPermiso(actor, ["metricas.editar_validadas"])) {
    return fallo(MENSAJES_VALIDACION.constanciaSoloAdministrador)
  }

  try {
    const estado = await estadoAsignacion(asignacionId)
    if (!estado) return fallo(MENSAJES_VALIDACION.noEncontrada)
    if (estado !== "METRICAS_CARGADAS") {
      revalidar(asignacionId)
      return fallo(MENSAJES_VALIDACION.yaNoEsperaVerificacion)
    }
    const contexto = await contextoDelActor(actor)
    const { error } = await transicionar(contexto, {
      entidad: "asignaciones",
      id: asignacionId,
      hacia: "VERIFICADA",
      motivo: constancia ? motivo : null,
      datos: constancia ? { permanencia_verificada: true } : {},
    })
    if (error) {
      const permanenciaHasta = error.message?.startsWith(
        "AMO_PERMANENCIA_PENDIENTE"
      )
        ? await permanenciaPendienteHasta(asignacionId)
        : null
      revalidarSiCambio(error)
      return falloBd("verificarAsignacion", error, {
        campoMotivo: "motivo",
        permanenciaHasta,
      })
    }
    revalidar(asignacionId)
    return exito()
  } catch (error) {
    informar("verificarAsignacion", error)
    return fallo(MENSAJE_INESPERADO)
  }
}
