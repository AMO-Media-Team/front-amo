/**
 * Qué puede hacer el anunciante con su oferta (módulo puro, cliente y
 * servidor), según la máquina de estados (`accionesPermitidas`) y sus
 * permisos, más archivarla cuando ya terminó (`archivar_oferta_srv`). Solo
 * decide qué botones mostrar: la BD revalida propiedad, estado, envío y
 * asignaciones.
 */
import type { EstadoOferta } from "@/features/operacion/estados"
import { contar } from "@/features/operacion/formato"
import { accionesPermitidas } from "@/lib/negocio/acciones"

export type AccionAnunciante =
  "editar" | "enviar" | "reenviar" | "retirar" | "cancelar" | "archivar"

export interface OpcionAnunciante {
  accion: AccionAnunciante
  /** La transición exige motivo (cancelar una publicada). */
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

const PERMISO_PROPIAS = "ofertas.gestionar_propias"

const ORDEN: readonly AccionAnunciante[] = [
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

export function accionesAnunciante(
  estado: EstadoOferta,
  permisos: Iterable<string>,
  { cuposOcupados }: { cuposOcupados: number }
): OpcionAnunciante[] {
  const lista = [...permisos]
  const opciones: OpcionAnunciante[] = []

  if (ESTADOS_EDITABLES.has(estado) && lista.includes(PERMISO_PROPIAS)) {
    opciones.push({ accion: "editar", requiereMotivo: false, bloqueo: null })
  }

  for (const { hacia, requiereMotivo } of accionesPermitidas(
    "ofertas",
    estado,
    "ANUNCIANTE",
    lista
  )) {
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
  if (ESTADOS_ARCHIVABLES.has(estado) && lista.includes(PERMISO_PROPIAS)) {
    opciones.push({ accion: "archivar", requiereMotivo: false, bloqueo: null })
  }

  return opciones.sort(
    (a, b) => ORDEN.indexOf(a.accion) - ORDEN.indexOf(b.accion)
  )
}
