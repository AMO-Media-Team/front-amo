/**
 * Plan de las fábricas E2E de la fase 4 (módulo puro): validación de
 * evidencias y métricas, verificación, cancelación, suspensión y disputas. Las
 * escrituras están en `fabricas-validacion.ts`; los specs las usan desde
 * `e2e/utilidades/validacion.ts`.
 *
 * Las campañas de estas fábricas llevan su propio prefijo («Validación E2E…»):
 * ni el restablecimiento de la pauta del medio («Pauta E2E…») ni los specs del
 * anunciante («Campaña E2E…», «Seguimiento E2E…») las tocan, y
 * `restablecerValidacion` solo limpia estas.
 */
import type { Database, Json } from "../../src/types/database.types"
import {
  type CorteMetrica,
  type PlataformaPauta,
  type ValoresMetrica,
  valoresMetricaE2E,
} from "./pauta-e2e"

type Enums = Database["public"]["Enums"]
export type EstadoAsignacion = Enums["asignacion_estado"]
export type CausaCancelacion = Enums["cancelacion_causa"]
export type MotivoDisputa = Enums["disputa_motivo"]
export type ParteDisputa = Enums["disputa_parte"]
export type EstadoDisputa = Enums["disputa_estado"]

/** Campañas de las fábricas de validación: las limpia `restablecerValidacion`. */
export const PREFIJO_VALIDACION = "Validación E2E"

/** Motivo con el que la limpieza cierra disputas, reclamos y asignaciones. */
export const MOTIVO_RESTABLECER_VALIDACION =
  "Restablecimiento de las pruebas de validación E2E"

const MINUTO_MS = 60_000
const HORA_MS = 60 * MINUTO_MS

// ── Alertas de métricas (INT-004) ────────────────────────────────────────────

/**
 * Múltiplo de seguidores de la plataforma en `metricas.multiplo_alcance_seguidores`
 * (`{"INSTAGRAM": 2, "FACEBOOK": 3, "TIKTOK": 20}`).
 */
export function multiploDe(
  configuracion: Json,
  plataforma: PlataformaPauta
): number {
  const valor =
    typeof configuracion === "object" &&
    configuracion !== null &&
    !Array.isArray(configuracion)
      ? configuracion[plataforma]
      : undefined
  const multiplo = Number(valor)
  if (
    valor === null ||
    valor === undefined ||
    !Number.isFinite(multiplo) ||
    multiplo <= 0
  ) {
    throw new RangeError(
      `metricas.multiplo_alcance_seguidores no tiene un múltiplo válido para ${plataforma}.`
    )
  }
  return multiplo
}

/** Alcance máximo sin alerta: múltiplo × seguidores al aceptar (la BD alerta si lo supera). */
export function limiteAlcance(seguidores: number, multiplo: number): number {
  return multiplo * seguidores
}

/**
 * Valores de un corte que dispara la alerta por múltiplo (INT-004): alcance
 * (en TikTok, espectadores únicos) un 25 % por encima del límite y
 * coherentes con el resto de reglas de la BD (impresiones ≥ alcance,
 * reproducciones ≥ espectadores, interacciones ≤ impresiones). Úsalo en un
 * solo corte: otro corte normal de la misma publicación quedaría incoherente
 * (bajaría más de la tolerancia).
 */
export function valoresConAlertaMultiplo({
  plataforma,
  corte,
  seguidores,
  multiplo,
}: {
  plataforma: PlataformaPauta
  corte: CorteMetrica
  seguidores: number
  multiplo: number
}): ValoresMetrica {
  if (!Number.isInteger(seguidores) || seguidores <= 0) {
    throw new RangeError(
      "Los seguidores al aceptar deben ser un entero positivo."
    )
  }
  const alcance = Math.ceil(limiteAlcance(seguidores, multiplo) * 1.25)
  const volumen = Math.ceil(alcance * 1.5)
  return valoresMetricaE2E(
    plataforma,
    corte,
    plataforma === "TIKTOK"
      ? { espectadores_unicos: alcance, reproducciones: volumen }
      : { alcance, impresiones: volumen }
  )
}

/** Lo que guarda la BD en `detalle_alertas` (solo lo que leen las fábricas). */
export interface AlertaDeMetrica {
  multiplo: boolean
  desviacion: boolean
  limiteAlcance: number | null
}

/** Lee las columnas de alerta de una métrica (con el cliente de servicio). */
export function leerAlerta(fila: {
  alerta_multiplo: boolean
  alerta_desviacion: boolean
  detalle_alertas: Json
}): AlertaDeMetrica {
  const detalle = fila.detalle_alertas
  const limite =
    typeof detalle === "object" && detalle !== null && !Array.isArray(detalle)
      ? Number(detalle.limite_alcance)
      : Number.NaN
  return {
    multiplo: fila.alerta_multiplo,
    desviacion: fila.alerta_desviacion,
    limiteAlcance: Number.isFinite(limite) ? limite : null,
  }
}

// ── Disputas ─────────────────────────────────────────────────────────────────

/** Quién actúa en una disputa: el medio, la empresa o el equipo AMO. */
export type ComoParte = ParteDisputa

/** Estados desde los que una parte puede abrir una disputa (`abrir_disputa_srv`). */
export const ESTADOS_DISPUTABLES: readonly EstadoAsignacion[] = [
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
  "VERIFICADA",
]

/**
 * ¿Puede `como` abrir una disputa con ese motivo sobre una asignación en ese
 * estado? Una vencida solo la reclama el medio, con Otro o Incumplimiento y
 * dentro del plazo (el plazo lo revisa `esReclamable`).
 */
export function puedeAbrirDisputa(
  estado: EstadoAsignacion,
  como: ComoParte,
  motivo: MotivoDisputa
): boolean {
  if (estado === "VENCIDA_SIN_PUBLICAR") {
    return (
      como === "MEDIO" && (motivo === "OTRO" || motivo === "INCUMPLIMIENTO")
    )
  }
  return ESTADOS_DISPUTABLES.includes(estado)
}

/** Fin del plazo para reclamar una vencida (`vencida_at + disputas.plazo_vencida_horas`). */
export function reclamoHasta(
  vencidaAt: string | null,
  plazoHoras: number
): Date | null {
  if (!vencidaAt) return null
  return new Date(Date.parse(vencidaAt) + plazoHoras * HORA_MS)
}

/** ¿El medio aún puede reclamar esta vencida (sin disputa y dentro del plazo)? */
export function esReclamable(
  asignacion: {
    estado: EstadoAsignacion
    vencidaAt: string | null
    conDisputa: boolean
  },
  plazoHoras: number,
  ahora: Date
): boolean {
  const hasta = reclamoHasta(asignacion.vencidaAt, plazoHoras)
  return (
    asignacion.estado === "VENCIDA_SIN_PUBLICAR" &&
    !asignacion.conDisputa &&
    hasta !== null &&
    hasta.getTime() >= ahora.getTime()
  )
}

/**
 * Cómo resuelve el equipo AMO una disputa (ADM-012):
 *
 * - `RESTAURAR`: la asignación vuelve a su estado previo («Se mantuvo la decisión»).
 * - `VERIFICAR`: con estado previo METRICAS_CARGADAS, queda VERIFICADA (mismas
 *   exigencias que verificar: métricas aprobadas y permanencia).
 * - `REABRIR`: una vencida reclamada vuelve a CONTENIDO_ENTREGADO, retoma su
 *   cupo y el medio tiene `disputas.plazo_recarga_horas` para la evidencia.
 * - `CANCELAR`: la asignación queda CANCELADA con su causa.
 * - `DESCARTAR`: la disputa se descarta y la asignación vuelve a su estado previo.
 */
export type ResultadoDisputa =
  "RESTAURAR" | "VERIFICAR" | "REABRIR" | "CANCELAR" | "DESCARTAR"

export const RESULTADOS_DISPUTA: readonly ResultadoDisputa[] = [
  "RESTAURAR",
  "VERIFICAR",
  "REABRIR",
  "CANCELAR",
  "DESCARTAR",
]

/** Motivo por omisión de cada resolución, como lo escribiría el equipo AMO. */
export const MOTIVO_RESOLUCION: Readonly<Record<ResultadoDisputa, string>> = {
  RESTAURAR:
    "Revisamos lo que aportaron las partes: la publicación sigue como estaba.",
  VERIFICAR:
    "Las métricas quedaron confirmadas: la publicación queda verificada.",
  REABRIR:
    "El medio demostró que sí publicó: le damos un plazo nuevo para cargar la evidencia.",
  CANCELAR:
    "Se confirmó el incumplimiento: la participación del medio queda cancelada.",
  DESCARTAR: "La disputa no aporta elementos nuevos: se descarta.",
}

export interface ResolucionDisputa {
  /** Estado al que pasa la disputa. */
  hacia: "RESUELTA" | "DESCARTADA"
  /** `p_datos` de `transicionar_srv('disputas', …)`. */
  datos: { [clave: string]: Json }
  /** Estado en que queda la asignación. */
  estadoAsignacion: EstadoAsignacion
}

/**
 * La transición de la disputa que produce `resultado` desde el estado previo
 * de la asignación, o un error en palabras si no aplica (la BD también lo
 * rechazaría). `permanenciaVerificada` deja constancia manual de la
 * permanencia al verificar (solo con `metricas.editar_validadas`).
 */
export function planResolucion({
  resultado,
  estadoPrevio,
  causa = "ADMINISTRATIVA",
  permanenciaVerificada = false,
}: {
  resultado: ResultadoDisputa
  estadoPrevio: EstadoAsignacion | null
  causa?: CausaCancelacion
  permanenciaVerificada?: boolean
}): ResolucionDisputa {
  if (!estadoPrevio) {
    throw new RangeError(
      "La asignación no está en disputa: no tiene estado previo."
    )
  }
  switch (resultado) {
    case "DESCARTAR":
      return { hacia: "DESCARTADA", datos: {}, estadoAsignacion: estadoPrevio }
    case "RESTAURAR":
      return {
        hacia: "RESUELTA",
        datos: { estado_asignacion_resultante: estadoPrevio },
        estadoAsignacion: estadoPrevio,
      }
    case "VERIFICAR":
      if (estadoPrevio !== "METRICAS_CARGADAS") {
        throw new RangeError(
          `Solo se verifica al resolver si el estado previo es METRICAS_CARGADAS (es ${estadoPrevio}).`
        )
      }
      return {
        hacia: "RESUELTA",
        datos: {
          estado_asignacion_resultante: "VERIFICADA",
          ...(permanenciaVerificada ? { permanencia_verificada: true } : {}),
        },
        estadoAsignacion: "VERIFICADA",
      }
    case "REABRIR":
      if (estadoPrevio !== "VENCIDA_SIN_PUBLICAR") {
        throw new RangeError(
          `Solo se reabre una vencida reclamada (el estado previo es ${estadoPrevio}).`
        )
      }
      return {
        hacia: "RESUELTA",
        datos: { estado_asignacion_resultante: "CONTENIDO_ENTREGADO" },
        estadoAsignacion: "CONTENIDO_ENTREGADO",
      }
    case "CANCELAR":
      return {
        hacia: "RESUELTA",
        datos: { estado_asignacion_resultante: "CANCELADA", causa },
        estadoAsignacion: "CANCELADA",
      }
  }
}

// ── Vencer una asignación (solo la base local) ───────────────────────────────

const HOSTS_LOCALES: ReadonlySet<string> = new Set([
  "127.0.0.1",
  "localhost",
  "[::1]",
])

/** ¿La URL de Supabase es la pila local de `supabase start`? */
export function esBaseLocal(supabaseUrl: string | undefined): boolean {
  if (!supabaseUrl || !URL.canParse(supabaseUrl)) return false
  return HOSTS_LOCALES.has(new URL(supabaseUrl).hostname.toLowerCase())
}

/** Plazo para publicar ya vencido: un minuto antes de `ahora`. */
export function plazoVencido(ahora: Date): Date {
  return new Date(ahora.getTime() - MINUTO_MS)
}

/** Estados que el cron vence al pasar el plazo de publicación sin evidencia. */
export const ESTADOS_VENCIBLES: readonly EstadoAsignacion[] = [
  "ACEPTADA",
  "CONTENIDO_ENTREGADO",
]

// ── Resumen de la limpieza ───────────────────────────────────────────────────

/** Resumen legible de `restablecerValidacion` para el registro de una corrida. */
export function describirRestablecimiento({
  campanasBorradas,
  campanasArchivadas,
  asignacionesBorradas,
  disputasCerradas,
  reclamosCerrados,
  medioReactivado,
}: {
  campanasBorradas: number
  campanasArchivadas: number
  asignacionesBorradas: number
  disputasCerradas: number
  reclamosCerrados: number
  medioReactivado: boolean
}): string {
  const partes = [
    campanasBorradas > 0 &&
      `${campanasBorradas} campaña(s) de validación borradas`,
    campanasArchivadas > 0 &&
      `${campanasArchivadas} campaña(s) canceladas y archivadas (la BD no deja borrar descargas ni mensajes)`,
    asignacionesBorradas > 0 &&
      `${asignacionesBorradas} asignación(es) borradas`,
    disputasCerradas > 0 && `${disputasCerradas} disputa(s) cerradas`,
    reclamosCerrados > 0 &&
      `${reclamosCerrados} reclamo(s) pendientes cerrados`,
    medioReactivado && "Medio Suspensión E2E reactivado",
  ].filter((parte): parte is string => typeof parte === "string")
  return partes.length > 0
    ? partes.join("; ")
    : "sin pruebas de validación anteriores"
}
