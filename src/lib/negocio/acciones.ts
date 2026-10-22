/**
 * Qué cambios de estado se le ofrecen a una persona (módulo puro, cliente y
 * servidor), según la copia de la máquina de estados de la BD
 * (`transiciones.generated.ts`, `pnpm db:transiciones`).
 *
 * Solo decide qué botones mostrar: la autoridad es `transicionar_srv` y las
 * RPC `*_srv`, que además validan propiedad, presupuesto, ventanas, documentos
 * y, en `perfiles`, `private.puede_gestionar`.
 */
import type { ClavePermiso } from "@/lib/auth/permisos"

import type {
  ActorTransicion,
  EntidadTransicion,
  EstadoDe,
  OrigenDe,
  TipoActor,
  TransicionDe,
  TransicionEstado,
} from "./tipos"
import { TRANSICIONES } from "./transiciones.generated"

export interface AccionPermitida<E extends EntidadTransicion> {
  hacia: EstadoDe<E>
  permiso: ClavePermiso
  requiereMotivo: boolean
  descripcion: string
}

const POR_ENTIDAD: ReadonlyMap<EntidadTransicion, readonly TransicionEstado[]> =
  TRANSICIONES.reduce((indice, transicion) => {
    indice.set(transicion.entidad, [
      ...(indice.get(transicion.entidad) ?? []),
      transicion,
    ])
    return indice
  }, new Map<EntidadTransicion, TransicionEstado[]>())

function deEntidad<E extends EntidadTransicion>(
  entidad: E
): readonly TransicionDe<E>[] {
  return (POR_ENTIDAD.get(entidad) ?? []) as readonly TransicionDe<E>[]
}

/** Transiciones que la BD admite desde `estado` para ese actor (incluidas las del SISTEMA si se pide). */
export function transicionesDesde<E extends EntidadTransicion>(
  entidad: E,
  estado: OrigenDe<E>,
  tipoActor: ActorTransicion
): readonly TransicionDe<E>[] {
  return deEntidad(entidad).filter(
    (transicion) =>
      transicion.desde === estado && transicion.actor === tipoActor
  )
}

/** La transición exacta, p. ej. para saber en el servidor si exige motivo antes de llamar a la RPC. */
export function buscarTransicion<E extends EntidadTransicion>(
  entidad: E,
  desde: OrigenDe<E>,
  hacia: EstadoDe<E>,
  tipoActor: ActorTransicion
): TransicionDe<E> | undefined {
  return transicionesDesde(entidad, desde, tipoActor).find(
    (transicion) => transicion.hacia === hacia
  )
}

/**
 * Destinos que la persona puede elegir: transiciones de su tipo de rol desde
 * el estado actual cuyo permiso tiene (`usuario.permisos` del DAL).
 */
export function accionesPermitidas<E extends EntidadTransicion>(
  entidad: E,
  estado: OrigenDe<E>,
  tipoActor: TipoActor,
  permisos: Iterable<string>
): AccionPermitida<E>[] {
  const disponibles = new Set(permisos)
  return transicionesDesde(entidad, estado, tipoActor).flatMap(
    ({ hacia, permiso, requiereMotivo, descripcion }) =>
      permiso !== null && disponibles.has(permiso)
        ? [{ hacia, permiso, requiereMotivo, descripcion }]
        : []
  )
}
