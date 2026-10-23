/**
 * Gestión de una asignación por el equipo AMO (módulo puro, cliente y
 * servidor): qué ofrecer en la cabecera de la ficha según la máquina de
 * estados (`accionesPermitidas` con el tipo de rol ADMIN), qué está bloqueado
 * y por qué, y los textos de las causas y los motivos.
 *
 * - Cancelar (ADM-010 / INT-006, `asignaciones.gestionar`): desde cualquier
 *   estado previo a la liquidación, con causa del catálogo y motivo. Con
 *   fraude o incumplimiento del medio puede suspenderlo en la misma
 *   transacción (`cancelar_asignacion_srv`, que exige además
 *   `medios.suspender` al transicionar el medio). Liquidada o pagada: se
 *   anula antes la liquidación; en disputa: se cancela al resolverla.
 * - Disputa (ADM-011, `disputas.abrir`): en los estados disputables y sin
 *   otra abierta (`abrir_disputa_srv` como ADMIN); si ya hay una abierta, se
 *   enlaza a su ficha (`disputas.ver`).
 *
 * Solo decide la interfaz: la BD vuelve a validar permiso, estado y causa.
 */
import type { ClavePermiso } from "@/lib/auth/permisos"
import { accionesPermitidas } from "@/lib/negocio/acciones"
import { Constants } from "@/types/database.types"

import {
  CAUSAS_CANCELACION,
  type EstadoAsignacion,
  type EstadoDisputa,
  type EstadoMedio,
  MOTIVOS_DISPUTA,
} from "./estados"

export type CausaCancelacion = keyof typeof CAUSAS_CANCELACION
export type MotivoDisputa = keyof typeof MOTIVOS_DISPUTA

/** En el orden en que se ofrecen: de la más neutra a la más grave. */
export const ORDEN_CAUSAS: readonly CausaCancelacion[] =
  Constants.public.Enums.cancelacion_causa

/** Las causas que cuentan como incumplimiento y admiten suspender al medio. */
export const CAUSAS_CON_SUSPENSION: readonly CausaCancelacion[] = [
  "INCUMPLIMIENTO_MEDIO",
  "FRAUDE",
]

export function admiteSuspension(causa: CausaCancelacion | null): boolean {
  return causa !== null && CAUSAS_CON_SUSPENSION.includes(causa)
}

/** Qué significa cada causa para el medio (ayuda bajo cada opción). */
export const EFECTOS_CAUSA: Readonly<Record<CausaCancelacion, string>> = {
  ADMINISTRATIVA:
    "Decisión del equipo AMO, por ejemplo un error de configuración. No afecta el cumplimiento del medio.",
  ACUERDO:
    "El medio y el anunciante acordaron no continuar. No afecta el cumplimiento del medio.",
  INCUMPLIMIENTO_MEDIO:
    "El medio no cumplió lo pactado. Cuenta como incumplimiento en su historial.",
  FRAUDE:
    "Reporte falso o manipulación comprobada. Cuenta como incumplimiento y, según los términos que aceptó, el medio pierde el pago.",
}

/** Motivos frecuentes por causa (un toque llena el campo, que se puede editar). */
export const SUGERENCIAS_CANCELACION: Readonly<
  Record<CausaCancelacion, readonly string[]>
> = {
  ADMINISTRATIVA: [
    "La oferta se configuró con un error que no se puede corregir.",
    "El anunciante pidió retirar la campaña antes de la publicación.",
  ],
  ACUERDO: [
    "El medio y el anunciante acordaron no continuar con la publicación.",
  ],
  INCUMPLIMIENTO_MEDIO: [
    "El medio retiró la publicación antes de cumplir la permanencia mínima.",
    "El medio publicó un contenido distinto del aprobado (cambió el copy o el creativo).",
    "El medio no cargó las métricas a pesar de los recordatorios.",
  ],
  FRAUDE: [
    "Las métricas reportadas no coinciden con las de la plataforma: la captura fue alterada.",
    "La publicación no existe o no es de la cuenta registrada.",
  ],
}

/** Motivos de disputa con lo que significa cada uno (ADM-011). */
export const AYUDA_MOTIVOS_DISPUTA: Readonly<Record<MotivoDisputa, string>> = {
  INCUMPLIMIENTO: "El medio no cumplió lo pactado en la oferta.",
  METRICAS: "Las cifras reportadas no cuadran con la evidencia.",
  CONTENIDO:
    "Lo publicado no corresponde al creativo aprobado o a las condiciones.",
  PERMANENCIA:
    "La publicación se retiró antes de tiempo: quedará marcada como retirada.",
  PAGO: "Hay un problema con el pago de la asignación.",
  OTRO: "Cualquier otra situación: descríbela con detalle.",
}

export const ORDEN_MOTIVOS_DISPUTA: readonly MotivoDisputa[] =
  Constants.public.Enums.disputa_motivo

/** Mientras la disputa siga abierta, no se abre otra sobre la misma asignación. */
export const ESTADOS_DISPUTA_ABIERTA: readonly EstadoDisputa[] = [
  "ABIERTA",
  "EN_REVISION",
]

// ── Bloqueos ─────────────────────────────────────────────────────────────────

export const BLOQUEO_CANCELAR_LIQUIDADA =
  "Ya está en una liquidación: anula primero la liquidación para poder cancelarla."

export const BLOQUEO_CANCELAR_EN_DISPUTA =
  "Está en disputa: se cancela al resolver la disputa, eligiendo «Cancelar» como resultado."

/** `hint` de `cancelar_asignacion_srv` y su texto en la interfaz. */
export const MENSAJES_HINT_CANCELACION: Readonly<Record<string, string>> = {
  liquidacion_vigente: BLOQUEO_CANCELAR_LIQUIDADA,
  en_disputa: BLOQUEO_CANCELAR_EN_DISPUTA,
}

const PERMISO_CANCELAR: ClavePermiso = "asignaciones.gestionar"
const PERMISO_ABRIR_DISPUTA: ClavePermiso = "disputas.abrir"

const BLOQUEOS_CANCELAR: Partial<Record<EstadoAsignacion, string>> = {
  LIQUIDADA: BLOQUEO_CANCELAR_LIQUIDADA,
  PAGADA: BLOQUEO_CANCELAR_LIQUIDADA,
  EN_DISPUTA: BLOQUEO_CANCELAR_EN_DISPUTA,
}

// ── Opciones ─────────────────────────────────────────────────────────────────

export interface SituacionGestion {
  estado: EstadoAsignacion
  medioEstado: EstadoMedio | null
  disputas: readonly { id: string; estado: EstadoDisputa }[]
}

/**
 * Si al cancelar por fraude o incumplimiento se ofrece suspender al medio:
 * `disponible` (verificado y el rol puede suspender), `ya_suspendido`,
 * `sin_permiso` (verificado, pero el rol no tiene `medios.suspender`) o
 * `no_aplica` (el medio no está verificado).
 */
export type SuspensionMedio =
  "disponible" | "ya_suspendido" | "sin_permiso" | "no_aplica"

export interface OpcionCancelar {
  /** Por qué no se puede ahora aunque el rol pueda cancelar (se explica). */
  bloqueo: string | null
  suspension: SuspensionMedio
}

export type OpcionDisputa =
  { tipo: "abrir" } | { tipo: "ver"; disputaId: string }

export interface OpcionesGestion {
  cancelar: OpcionCancelar | null
  disputa: OpcionDisputa | null
}

/** La disputa abierta (o en revisión) más reciente, si la hay. */
export function disputaAbierta(
  disputas: SituacionGestion["disputas"]
): { id: string; estado: EstadoDisputa } | null {
  return (
    disputas.findLast((disputa) =>
      ESTADOS_DISPUTA_ABIERTA.includes(disputa.estado)
    ) ?? null
  )
}

function opcionCancelar(
  situacion: SituacionGestion,
  permisos: ReadonlySet<string>
): OpcionCancelar | null {
  if (!permisos.has(PERMISO_CANCELAR)) return null
  const bloqueo = BLOQUEOS_CANCELAR[situacion.estado] ?? null
  const admitida = accionesPermitidas(
    "asignaciones",
    situacion.estado,
    "ADMIN",
    permisos
  ).some(
    (accion) =>
      accion.hacia === "CANCELADA" && accion.permiso === PERMISO_CANCELAR
  )
  if (!admitida && !bloqueo) return null
  return { bloqueo, suspension: suspensionMedio(situacion, permisos) }
}

function suspensionMedio(
  situacion: SituacionGestion,
  permisos: ReadonlySet<string>
): SuspensionMedio {
  if (situacion.medioEstado === "SUSPENDIDO") return "ya_suspendido"
  if (situacion.medioEstado !== "VERIFICADO") return "no_aplica"
  return permisos.has("medios.suspender") ? "disponible" : "sin_permiso"
}

function opcionDisputa(
  situacion: SituacionGestion,
  permisos: ReadonlySet<string>
): OpcionDisputa | null {
  const abierta = disputaAbierta(situacion.disputas)
  if (abierta) {
    return permisos.has("disputas.ver")
      ? { tipo: "ver", disputaId: abierta.id }
      : null
  }
  if (!permisos.has(PERMISO_ABRIR_DISPUTA)) return null
  const disputable = accionesPermitidas(
    "asignaciones",
    situacion.estado,
    "ADMIN",
    permisos
  ).some(
    (accion) =>
      accion.hacia === "EN_DISPUTA" && accion.permiso === PERMISO_ABRIR_DISPUTA
  )
  return disputable ? { tipo: "abrir" } : null
}

export function opcionesGestion(
  situacion: SituacionGestion,
  permisos: Iterable<string>
): OpcionesGestion {
  const conjunto = new Set(permisos)
  return {
    cancelar: opcionCancelar(situacion, conjunto),
    disputa: opcionDisputa(situacion, conjunto),
  }
}

export function hayGestion(opciones: OpcionesGestion): boolean {
  return opciones.cancelar !== null || opciones.disputa !== null
}

// ── Efectos que se explican antes de confirmar ───────────────────────────────

const PUBLICADAS: readonly EstadoAsignacion[] = [
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
]

/** Qué pasa al cancelar desde el estado actual (lista para el diálogo). */
export function efectosCancelacion(estado: EstadoAsignacion): string[] {
  const efectos = ["Libera el cupo y el presupuesto de la oferta."]
  if (estado === "VERIFICADA") {
    efectos.push(
      "Ya estaba verificada: no entrará en ninguna liquidación y el medio no recibe ese pago."
    )
  } else if (PUBLICADAS.includes(estado)) {
    efectos.push(
      "El medio ya publicó, pero no recibe el pago de esta asignación."
    )
  }
  efectos.push(
    "El medio y el anunciante reciben un aviso con el motivo.",
    "No se puede deshacer."
  )
  return efectos
}

/** Qué pasa al abrir la disputa (lista para el diálogo). */
export function efectosDisputa(motivo: MotivoDisputa | null): string[] {
  const efectos = [
    "La asignación queda «En disputa»: no se verifica ni se liquida hasta resolverla.",
    "El medio y el anunciante reciben un aviso y pueden escribir en el hilo.",
  ]
  if (motivo === "PERMANENCIA") {
    efectos.push("La publicación queda marcada como retirada.")
  }
  return efectos
}
