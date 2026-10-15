/**
 * Qué entradas lleva la barra inferior del medio en móvil (`BarraInferior`). Sale del registro
 * de navegación YA filtrado por permisos (`filtrarNavegacion`), así una
 * sección nueva del medio (marketplace, liquidaciones…) aparece sola en
 * cuanto se registre. Módulo puro.
 */
import type { GrupoNavegacion, ItemNavegacion } from "@/lib/auth/navegacion"

/** Cuatro destinos + "Menú": cada pestaña conserva ≥ 72 px de ancho a 360 px. */
export const MAXIMO_DESTINOS_BARRA = 4

/** Títulos cortos: la etiqueta de la pestaña tiene una sola línea. */
const TITULOS_CORTOS: Readonly<Record<string, string>> = {
  notificaciones: "Avisos",
  perfil: "Perfil",
}

/** Respaldo de la barra lateral: lo personal que el medio consulta a diario. */
const IDS_CUENTA = ["notificaciones", "perfil"] as const

export interface DestinoBarra {
  id: string
  titulo: string
  item: ItemNavegacion
}

/**
 * Inicio primero, luego las secciones de la barra lateral en el orden del
 * registro y, si sobra espacio, Avisos y Perfil. Sin duplicados.
 */
export function destinosBarraInferior(
  navegacion: readonly GrupoNavegacion[],
  maximo: number = MAXIMO_DESTINOS_BARRA
): DestinoBarra[] {
  const lateral = navegacion
    .filter((grupo) => grupo.enBarraLateral)
    .flatMap((grupo) => grupo.items)
  const cuenta = navegacion
    .filter((grupo) => !grupo.enBarraLateral)
    .flatMap((grupo) => grupo.items)
    .filter((item) => (IDS_CUENTA as readonly string[]).includes(item.id))
    .sort(
      (a, b) =>
        (IDS_CUENTA as readonly string[]).indexOf(a.id) -
        (IDS_CUENTA as readonly string[]).indexOf(b.id)
    )
  const inicio = lateral.filter((item) => item.id === "inicio")
  const resto = lateral.filter((item) => item.id !== "inicio")

  const vistos = new Set<string>()
  const destinos: DestinoBarra[] = []
  for (const item of [...inicio, ...resto, ...cuenta]) {
    if (destinos.length >= maximo) break
    if (vistos.has(item.id)) continue
    vistos.add(item.id)
    destinos.push({
      id: item.id,
      titulo: TITULOS_CORTOS[item.id] ?? item.titulo,
      item,
    })
  }
  return destinos
}
