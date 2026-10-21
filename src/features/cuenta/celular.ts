/**
 * Celulares de Colombia: 10 dígitos que empiezan por 3 (numeración móvil del
 * plan nacional), con o sin el indicativo +57. Se guardan siempre como
 * `+57 300 123 4567`, que cumple el CHECK de `perfiles.celular`
 * (`^\+?[0-9 ]{7,20}$`). Módulo puro: lo usan el formulario y la acción.
 */

const INDICATIVO = "57"
const MOVIL_NACIONAL = /^3\d{9}$/
/** Lo que se tolera al escribir: dígitos, espacios, guiones, puntos, paréntesis y un + inicial. */
const CARACTERES_PERMITIDOS = /^\+?[\d\s\-.()]*$/

export type ResultadoCelular =
  { valido: true; valor: string | null } | { valido: false; mensaje: string }

export const MENSAJES_CELULAR = {
  caracteres: "Escribe solo números (puedes separarlos con espacios).",
  extranjero: "Por ahora solo aceptamos celulares de Colombia (+57).",
  formato: "Escribe un celular colombiano de 10 dígitos que empiece por 3.",
} as const

/** `3001234567` → `+57 300 123 4567`. */
export function formatearCelularNacional(nacional: string): string {
  return `+${INDICATIVO} ${nacional.slice(0, 3)} ${nacional.slice(3, 6)} ${nacional.slice(6)}`
}

/** Número nacional (10 dígitos) a partir de lo escrito, o un mensaje de error. */
function numeroNacional(texto: string): ResultadoCelular | string {
  const conMas = texto.startsWith("+")
  const digitos = texto.replace(/\D/g, "")
  if (conMas && !digitos.startsWith(INDICATIVO)) {
    return { valido: false, mensaje: MENSAJES_CELULAR.extranjero }
  }
  if (digitos.length === 12 && digitos.startsWith(INDICATIVO)) {
    return digitos.slice(INDICATIVO.length)
  }
  return digitos
}

/**
 * Valida y normaliza un celular. Vacío = sin celular (`null`).
 * Acepta `300 123 4567`, `(300) 123-4567`, `+57 3001234567`, `573001234567`.
 */
export function normalizarCelularColombia(entrada: string): ResultadoCelular {
  const texto = entrada.trim()
  if (texto === "") return { valido: true, valor: null }
  if (!CARACTERES_PERMITIDOS.test(texto)) {
    return { valido: false, mensaje: MENSAJES_CELULAR.caracteres }
  }
  const nacional = numeroNacional(texto)
  if (typeof nacional !== "string") return nacional
  if (!MOVIL_NACIONAL.test(nacional)) {
    return { valido: false, mensaje: MENSAJES_CELULAR.formato }
  }
  return { valido: true, valor: formatearCelularNacional(nacional) }
}

/**
 * Valor para mostrar en el formulario: los celulares guardados con otro
 * formato (p. ej. por un administrador) se muestran normalizados si son
 * colombianos válidos; si no, tal cual.
 */
export function celularParaMostrar(guardado: string | null): string {
  if (!guardado) return ""
  const resultado = normalizarCelularColombia(guardado)
  return resultado.valido && resultado.valor ? resultado.valor : guardado
}
