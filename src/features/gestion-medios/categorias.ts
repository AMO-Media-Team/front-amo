/**
 * Categorías temáticas de un medio (módulo puro). `medio_categorias` no
 * valida que la categoría siga activa: lo hace el servidor con estas reglas
 * antes de escribir. Una categoría archivada que el medio ya tenía se puede
 * conservar (no se le quita a escondidas al editar otro dato), pero no se
 * puede agregar de nuevo.
 */
import type { OpcionCategoria } from "./tipos"

export interface CambioCategorias {
  agregar: string[]
  quitar: string[]
}

/** Qué filas de `medio_categorias` insertar y cuáles borrar para llegar a `elegidas`. */
export function diferenciaCategorias(
  actuales: readonly string[],
  elegidas: readonly string[]
): CambioCategorias {
  const antes = new Set(actuales)
  const despues = new Set(elegidas)
  return {
    agregar: [...despues].filter((id) => !antes.has(id)),
    quitar: [...antes].filter((id) => !despues.has(id)),
  }
}

export function hayCambioCategorias(cambio: CambioCategorias): boolean {
  return cambio.agregar.length > 0 || cambio.quitar.length > 0
}

/**
 * Elegidas que no se pueden guardar: ni están activas ni el medio ya las
 * tenía (archivadas o borradas mientras el formulario estaba abierto).
 */
export function categoriasNoPermitidas(
  elegidas: readonly string[],
  activas: Iterable<string>,
  actuales: readonly string[] = []
): string[] {
  const permitidas = new Set([...activas, ...actuales])
  return elegidas.filter((id) => !permitidas.has(id))
}

/** Nombre de una categoría elegida que ya no figura entre las opciones. */
export const CATEGORIA_RETIRADA = "Categoría retirada"

/**
 * Fichas a mostrar: las opciones y, al final, las elegidas que ya no figuran
 * entre ellas (se archivaron con la hoja abierta y el servidor refrescó la
 * lista). Sin ellas quedarían marcadas sin verse y el formulario no se podría
 * corregir.
 */
export function opcionesVisibles(
  opciones: readonly OpcionCategoria[],
  elegidas: readonly string[]
): OpcionCategoria[] {
  const ids = new Set(opciones.map((categoria) => categoria.id))
  const retiradas = elegidas
    .filter((id) => !ids.has(id))
    .map((id) => ({ id, nombre: CATEGORIA_RETIRADA, retirada: true }))
  return [...opciones, ...retiradas]
}

/**
 * Opciones del formulario: las activas en su orden de catálogo y, al final,
 * las archivadas que el medio todavía tiene (marcadas como tales).
 */
export function opcionesCategorias(
  activas: readonly OpcionCategoria[],
  delMedio: readonly OpcionCategoria[]
): OpcionCategoria[] {
  const ids = new Set(activas.map((categoria) => categoria.id))
  const archivadas = delMedio
    .filter((categoria) => !ids.has(categoria.id))
    .map((categoria) => ({ ...categoria, archivada: true }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  return [...activas, ...archivadas]
}
