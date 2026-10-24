/**
 * Suspensión y reactivación de un medio (ADM-002), módulo puro: qué se le
 * ofrece al equipo AMO según el estado del medio y sus permisos (copia de
 * `private.transiciones_estado` vía `accionesPermitidas`), los motivos
 * frecuentes y qué significa cada paso. La suspensión es reversible y siempre
 * lleva motivo; nunca cancela asignaciones por su cuenta: el equipo revisa
 * cada una en su ficha. La transición en la BD tiene la última palabra.
 */
import type { EstadoMedio } from "@/features/operacion/estados"
import { accionesPermitidas } from "@/lib/negocio/acciones"

import type { AccionSuspension } from "./tipos"

const PERMISO_SUSPENDER = "medios.suspender"

/**
 * «Suspender» un medio VERIFICADO o «Reactivar» uno SUSPENDIDO, con
 * `medios.suspender`. Un medio en verificación o rechazado no se suspende.
 */
export function accionSuspension(
  estado: EstadoMedio,
  permisos: Iterable<string>
): AccionSuspension | null {
  const hacia = new Set(
    accionesPermitidas("medios", estado, "ADMIN", permisos)
      .filter((accion) => accion.permiso === PERMISO_SUSPENDER)
      .map((accion) => accion.hacia)
  )
  if (estado === "VERIFICADO" && hacia.has("SUSPENDIDO")) return "suspender"
  if (estado === "SUSPENDIDO" && hacia.has("VERIFICADO")) return "reactivar"
  return null
}

/**
 * Motivos frecuentes de una suspensión. El medio los recibe tal cual en su
 * aviso y en «Ofertas» («Tu medio está suspendido: …»): se escriben para él.
 */
export const MOTIVOS_SUSPENSION_MEDIO: readonly string[] = [
  "Las métricas reportadas no coinciden con las estadísticas de la cuenta.",
  "No publicó a tiempo en varias campañas que aceptó.",
  "Retiró publicaciones antes de cumplir la permanencia mínima.",
  "Sus documentos vencieron y no los ha renovado.",
  "Incumplió los términos y condiciones de la plataforma.",
]

export const MOTIVOS_REACTIVACION_MEDIO: readonly string[] = [
  "Se resolvió el motivo de la suspensión.",
  "Revisamos sus métricas y quedaron aclaradas.",
  "Renovó sus documentos y los aprobamos.",
]

export const PLACEHOLDER_MOTIVO_MEDIO =
  "Elige un motivo frecuente o escríbelo con tus palabras."

/** Qué implica suspender, para quien decide (encabezado del diálogo). */
export const EFECTO_SUSPENSION =
  "Deja de ver ofertas y no puede aceptar nuevas. Conserva lo que ya tiene en curso mientras decides si cancelas algo; sus asignaciones verificadas se liquidan. Su equipo recibirá un aviso con el motivo."

export const EFECTO_REACTIVACION =
  "Vuelve a estar verificado con el mismo nivel: verá las ofertas de su nivel y podrá aceptarlas. Su equipo recibirá un aviso."
