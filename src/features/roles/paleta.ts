/**
 * Paleta de marca para los roles (HEX, CHECK `roles.color`). Incluye los
 * colores de los roles de sistema (§3.2) y tonos de la paleta categórica,
 * todos legibles como punto y tinte sobre fondo claro y oscuro. Módulo puro.
 */

export interface ColorRol {
  valor: string
  nombre: string
}

export const PALETA_ROLES: readonly ColorRol[] = [
  { valor: "#8C66EE", nombre: "Lila" },
  { valor: "#A788F6", nombre: "Lavanda" },
  { valor: "#7549DE", nombre: "Violeta" },
  { valor: "#C77DFF", nombre: "Orquídea" },
  { valor: "#5B6CF0", nombre: "Índigo" },
  { valor: "#3987E5", nombre: "Azul" },
  { valor: "#3FB8AF", nombre: "Turquesa" },
  { valor: "#1BAF7A", nombre: "Esmeralda" },
  { valor: "#F2A65A", nombre: "Ámbar" },
  { valor: "#EB6834", nombre: "Mandarina" },
  { valor: "#E87BA4", nombre: "Rosa" },
  { valor: "#8A8499", nombre: "Pizarra" },
]

export const COLOR_ROL_POR_DEFECTO = PALETA_ROLES[0].valor

export const PATRON_COLOR = /^#[0-9A-Fa-f]{6}$/

/** Nombre del color si está en la paleta (comparación sin mayúsculas). */
export function nombreColor(valor: string): string | null {
  const buscado = valor.toUpperCase()
  return (
    PALETA_ROLES.find((color) => color.valor.toUpperCase() === buscado)
      ?.nombre ?? null
  )
}
