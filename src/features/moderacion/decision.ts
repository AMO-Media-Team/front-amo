/**
 * Decisiones de moderación sobre una oferta (ADM-005), módulo puro: qué
 * botones ofrecer según la máquina de estados (`accionesPermitidas` con
 * `ofertas.moderar`), sus textos y los motivos frecuentes. Solo decide la
 * interfaz: `transicionar_srv` revalida permiso, estado, fecha límite y el
 * resto de condiciones del envío.
 */
import type { EstadoOferta } from "@/features/operacion/estados"
import { formatearNumero } from "@/lib/format"
import { accionesPermitidas } from "@/lib/negocio/acciones"

export type Decision = "publicar" | "devolver" | "rechazar" | "cancelar"

export interface OpcionDecision {
  decision: Decision
  requiereMotivo: boolean
  /** Por qué no se puede ahora aunque el estado lo admita (se explica). */
  bloqueo: string | null
}

const PERMISO_MODERAR = "ofertas.moderar"

const ORDEN: readonly Decision[] = [
  "publicar",
  "devolver",
  "rechazar",
  "cancelar",
]

export const BLOQUEO_FECHA_LIMITE =
  "La fecha límite de aceptación ya pasó: no se puede publicar. Devuélvela para que el anunciante ajuste las fechas."

/** Una publicada con cupos tomados ya generó obligaciones con esos medios. */
export function bloqueoCancelacionInterna(
  cuposOcupados: number
): string | null {
  if (cuposOcupados <= 0) return null
  return `Ya ${cuposOcupados === 1 ? "hay 1 cupo tomado" : `hay ${formatearNumero(cuposOcupados)} cupos tomados`}: la oferta generó obligaciones con esos medios y no se puede cancelar.`
}

/** Destino de cada decisión según el estado de origen. */
function decisionDe(
  estado: EstadoOferta,
  hacia: EstadoOferta
): Decision | null {
  if (estado === "EN_REVISION") {
    if (hacia === "PUBLICADA") return "publicar"
    if (hacia === "DEVUELTA") return "devolver"
    if (hacia === "CANCELADA") return "rechazar"
  }
  if (estado === "PUBLICADA" && hacia === "CANCELADA") return "cancelar"
  return null
}

function bloqueoDe(
  decision: Decision,
  {
    fechaLimiteVencida,
    cuposOcupados,
  }: { fechaLimiteVencida: boolean; cuposOcupados: number }
): string | null {
  if (decision === "publicar" && fechaLimiteVencida) {
    return BLOQUEO_FECHA_LIMITE
  }
  if (decision === "cancelar") return bloqueoCancelacionInterna(cuposOcupados)
  return null
}

export function decisionesDisponibles(
  estado: EstadoOferta,
  permisos: Iterable<string>,
  situacion: { fechaLimiteVencida: boolean; cuposOcupados: number }
): OpcionDecision[] {
  return accionesPermitidas("ofertas", estado, "ADMIN", permisos)
    .filter((accion) => accion.permiso === PERMISO_MODERAR)
    .flatMap(({ hacia, requiereMotivo }) => {
      const decision = decisionDe(estado, hacia)
      if (!decision) return []
      return [
        { decision, requiereMotivo, bloqueo: bloqueoDe(decision, situacion) },
      ]
    })
    .sort((a, b) => ORDEN.indexOf(a.decision) - ORDEN.indexOf(b.decision))
}

/** Estado del que parte cada decisión (lo comprueba la acción antes de cancelar). */
export const ORIGEN_DECISION: Readonly<Record<Decision, EstadoOferta>> = {
  publicar: "EN_REVISION",
  devolver: "EN_REVISION",
  rechazar: "EN_REVISION",
  cancelar: "PUBLICADA",
}

/**
 * `hint` de la BD cuando el anunciante retiró y reenvió la oferta mientras se
 * revisaba: el envío que mostraba la ficha ya no es el vigente.
 */
export const HINT_OFERTA_REENVIADA = "oferta_reenviada"

/** La acción ya refrescó la ficha: lo nuevo se revisa antes de decidir. */
export const MENSAJE_OFERTA_REENVIADA =
  "El anunciante cambió la oferta mientras la revisabas. La ficha ya muestra lo que envió ahora: cancela y revísala antes de decidir."

// ── Motivos frecuentes (un toque llena el campo, que se puede editar) ────────

export const SUGERENCIAS_DEVOLUCION: readonly string[] = [
  "El copy sugerido no es adecuado para la marca o la audiencia: ajústalo.",
  "El creativo debe mostrar la etiqueta de publicidad (por ejemplo, «Publicidad» o «Colaboración pagada»).",
  "El enlace de destino no es seguro o no funciona: usa una dirección https válida.",
  "Las fechas no son consistentes: la ventana de publicación y la fecha límite deben dar tiempo a los medios.",
  "Las instrucciones o restricciones no son claras: precisa qué esperas del medio.",
]

export const SUGERENCIAS_RECHAZO: readonly string[] = [
  "Promociona productos o servicios que la política de publicidad de AMO no permite.",
  "El contenido es engañoso o puede afectar a la audiencia.",
  "Duplica otra oferta de la misma campaña que ya está en revisión o publicada.",
]

/** El anunciante los lee en el aviso de la cancelación («Motivo: …»). */
export const SUGERENCIAS_CANCELACION: readonly string[] = [
  "Lo solicitó la empresa.",
  "El contenido incumple la política de publicidad de AMO.",
  "La oferta tiene un error de configuración que no se puede corregir publicada.",
]
