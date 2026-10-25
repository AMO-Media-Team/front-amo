/**
 * Qué puede hacer quien gestiona la oferta (módulo puro, cliente y
 * servidor): el anunciante con la suya o el equipo AMO por cuenta del
 * anunciante (ADM-014), según la máquina de estados (`accionesPermitidas`)
 * para su tipo de actor y sus permisos, más archivarla cuando ya terminó
 * (`archivar_oferta_srv`). Solo decide qué botones mostrar: la BD revalida
 * propiedad o permiso, estado, envío y asignaciones.
 */
import type { EstadoOferta } from "@/features/operacion/estados"
import { contar } from "@/features/operacion/formato"
import type { ClavePermiso } from "@/lib/auth/permisos"
import { accionesPermitidas } from "@/lib/negocio/acciones"
import type { TipoActor } from "@/lib/negocio/tipos"

export type AccionGestion =
  "editar" | "enviar" | "reenviar" | "retirar" | "cancelar" | "archivar"

export interface OpcionGestion {
  accion: AccionGestion
  /**
   * La transición exige motivo: cancelar una publicada (anunciante) o
   * cualquier cancelación del equipo AMO.
   */
  requiereMotivo: boolean
  /** Por qué no se puede aunque el estado lo admita (se explica, no se oculta). */
  bloqueo: string | null
}

/** Estados en los que la oferta se edita en el asistente. */
export const ESTADOS_EDITABLES: ReadonlySet<EstadoOferta> = new Set([
  "BORRADOR",
  "DEVUELTA",
])

/**
 * Estados en que el anunciante archiva su oferta desde la ficha (la BD
 * también archiva borradores: el asistente los descarta así; en la ficha un
 * borrador se cancela).
 */
export const ESTADOS_ARCHIVABLES: ReadonlySet<EstadoOferta> = new Set([
  "CANCELADA",
  "VENCIDA",
  "CERRADA",
])

/**
 * Permiso de gestión de cada tipo de actor. Para el equipo AMO solo cuentan
 * las transiciones de `ofertas.gestionar`: las de `ofertas.moderar`
 * (publicar, devolver, rechazar, cancelar la publicada) son la moderación
 * (`decisionesDisponibles`), aunque el mismo rol tenga ambos permisos.
 */
const PERMISO_GESTION: Partial<Record<TipoActor, ClavePermiso>> = {
  ANUNCIANTE: "ofertas.gestionar_propias",
  ADMIN: "ofertas.gestionar",
}

const ORDEN: readonly AccionGestion[] = [
  "enviar",
  "reenviar",
  "editar",
  "retirar",
  "cancelar",
  "archivar",
]

/**
 * Una oferta publicada con cupos tomados ya generó obligaciones con esos
 * medios: la BD impide cancelarla y aquí se explica antes de intentarlo.
 */
export function bloqueoCancelacion(
  estado: EstadoOferta,
  cuposOcupados: number
): string | null {
  if (estado === "CANCELADA" || cuposOcupados <= 0) return null
  return `La oferta ya generó obligaciones: ${contar(
    cuposOcupados,
    "medio aceptó un cupo",
    "medios aceptaron cupos"
  )} y no se puede cancelar. Si necesitas ayuda, escríbele al equipo AMO.`
}

/**
 * Botones de la oferta para su gestor: editar (BORRADOR o DEVUELTA), enviar o
 * reenviar a revisión, retirarla de revisión, cancelarla (con motivo si la
 * transición lo pide a ese actor) y archivarla cuando terminó. Sin el
 * permiso de gestión de su tipo de actor no se ofrece nada.
 */
export function accionesGestion(
  estado: EstadoOferta,
  tipoActor: TipoActor,
  permisos: Iterable<string>,
  { cuposOcupados }: { cuposOcupados: number }
): OpcionGestion[] {
  const permiso = PERMISO_GESTION[tipoActor]
  const lista = [...permisos]
  if (!permiso || !lista.includes(permiso)) return []
  const opciones: OpcionGestion[] = []

  if (ESTADOS_EDITABLES.has(estado)) {
    opciones.push({ accion: "editar", requiereMotivo: false, bloqueo: null })
  }

  const transiciones = accionesPermitidas(
    "ofertas",
    estado,
    tipoActor,
    lista
  ).filter((transicion) => transicion.permiso === permiso)
  for (const { hacia, requiereMotivo } of transiciones) {
    if (hacia === "EN_REVISION") {
      opciones.push({
        accion: estado === "DEVUELTA" ? "reenviar" : "enviar",
        requiereMotivo,
        bloqueo: null,
      })
    } else if (hacia === "BORRADOR" && estado === "EN_REVISION") {
      opciones.push({ accion: "retirar", requiereMotivo, bloqueo: null })
    } else if (hacia === "CANCELADA") {
      opciones.push({
        accion: "cancelar",
        requiereMotivo,
        bloqueo: bloqueoCancelacion(estado, cuposOcupados),
      })
    }
  }

  // Una vencida nunca tiene cupos tomados (con alguno pasa a ejecución): se
  // archiva como una cancelada o una cerrada.
  if (ESTADOS_ARCHIVABLES.has(estado)) {
    opciones.push({ accion: "archivar", requiereMotivo: false, bloqueo: null })
  }

  return opciones.sort(
    (a, b) => ORDEN.indexOf(a.accion) - ORDEN.indexOf(b.accion)
  )
}
