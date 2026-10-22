/**
 * NIT colombiano (módulo puro): dígito de verificación de la DIAN, validación,
 * normalización de lo que se escribe o se pega y formato de presentación.
 *
 * El algoritmo es el mismo que `private.digito_verificacion_nit` (migración
 * `20261022024336_e2_desbloqueo`): el trigger de `anunciantes` rechaza un DV
 * que no corresponda, así que el formulario lo valida antes de enviar.
 */

/** Dígitos del NIT sin DV que acepta `anunciantes.nit` (CHECK `^[0-9]{6,15}$`). */
export const NIT_DIGITOS_MIN = 6
export const NIT_DIGITOS_MAX = 15

/** Pesos oficiales de la DIAN, aplicados a los dígitos de derecha a izquierda. */
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]

const SOLO_DIGITOS = /^\d+$/
const DIGITO = /^\d$/

/**
 * Dígito de verificación (módulo 11): residuo 0 o 1 → ese mismo dígito; si
 * no, 11 − residuo. Lanza `RangeError` si `nit` no son 1 a 15 dígitos (usa
 * `digitoSugerido` para texto libre).
 */
export function digitoVerificacion(nit: string): string {
  if (!SOLO_DIGITOS.test(nit) || nit.length > PESOS.length) {
    throw new RangeError("El NIT debe tener entre 1 y 15 dígitos.")
  }
  const suma = [...nit]
    .reverse()
    .reduce((total, digito, i) => total + Number(digito) * PESOS[i], 0)
  const residuo = suma % 11
  return String(residuo < 2 ? residuo : 11 - residuo)
}

/** ¿Son `nit` (6 a 15 dígitos, sin DV) y `dv` un NIT colombiano válido? */
export function nitValido(nit: string, dv: string): boolean {
  return (
    SOLO_DIGITOS.test(nit) &&
    nit.length >= NIT_DIGITOS_MIN &&
    nit.length <= NIT_DIGITOS_MAX &&
    DIGITO.test(dv) &&
    digitoVerificacion(nit) === dv
  )
}

/** Separadores de miles que se escriben o se copian del RUT. */
const SEPARADORES = /[.,\s]/g

/**
 * Guion del DV al final de un texto ya recortado: "900123456-8",
 * "900123456 - 8". Empieza en el guion (sin `\s*` delante) para que la
 * búsqueda sea lineal: con espacios a ambos lados del guion, un texto largo
 * de espacios costaba tiempo cuadrático (lo valida también el servidor).
 */
const GUION_DV = /-\s*(\d)?$/

/**
 * NIT y DV a partir de lo que se escribió o pegó ("900.123.456-8",
 * "900 123 456 - 8", "900123456"). El DV solo se reconoce tras un guion: sin
 * guion, todo es NIT. No descarta otros caracteres (una letra queda y la
 * validación la señala).
 */
export function separarNit(texto: string): { nit: string; dv: string | null } {
  const recortado = texto.trimEnd()
  const guion = GUION_DV.exec(recortado)
  const base = guion ? recortado.slice(0, guion.index) : recortado
  return {
    nit: base.replace(SEPARADORES, ""),
    dv: guion?.[1] ?? null,
  }
}

/** Solo el NIT: sin puntos, comas, espacios ni el guion con su DV. */
export function normalizarNit(texto: string): string {
  return separarNit(texto).nit
}

/**
 * DV que corresponde a lo escrito en el campo NIT, o `null` mientras no sea
 * un NIT completo (6 a 15 dígitos). Para sugerirlo en vivo.
 */
export function digitoSugerido(texto: string): string | null {
  const nit = normalizarNit(texto)
  return SOLO_DIGITOS.test(nit) &&
    nit.length >= NIT_DIGITOS_MIN &&
    nit.length <= NIT_DIGITOS_MAX
    ? digitoVerificacion(nit)
    : null
}

/** "900123456" → "900.123.456" (miles con punto, como en el RUT). */
function agruparMiles(digitos: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

/**
 * NIT para mostrar: `formatearNit("900123456", "8")` → "900.123.456-8"; sin
 * DV, "900.123.456". Un valor que no son solo dígitos se devuelve tal cual.
 */
export function formatearNit(nit: string, dv?: string | null): string {
  const base = SOLO_DIGITOS.test(nit) ? agruparMiles(nit) : nit
  return dv ? `${base}-${dv}` : base
}
