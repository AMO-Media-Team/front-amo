/**
 * Celular de la persona de contacto de la empresa (módulo puro). Un celular
 * colombiano se normaliza como en «Mi cuenta» (`+57 300 123 4567`); el de una
 * empresa del exterior se acepta con su indicativo (`+1 305 555 0100` →
 * `+13055550100`, formato E.164). Ambos cumplen el CHECK de
 * `anunciantes_privado.contacto_celular` (`^\+?[0-9 ]{7,20}$`).
 */
import {
  MENSAJES_CELULAR,
  normalizarCelularColombia,
  type ResultadoCelular,
} from "@/features/cuenta/celular"

export const MENSAJES_CELULAR_CONTACTO = {
  caracteres: MENSAJES_CELULAR.caracteres,
  formato:
    "Escribe un celular colombiano de 10 dígitos que empiece por 3, o uno de otro país con su indicativo (+1 305…).",
  internacional:
    "Revisa el número: con el indicativo de su país debe tener entre 8 y 15 dígitos.",
} as const

const INDICATIVO_COLOMBIA = "57"
const CON_INDICATIVO = /^\+[\d\s\-.()]+$/
/** E.164: indicativo y número, de 8 a 15 dígitos en total. */
const DIGITOS_MIN = 8
const DIGITOS_MAX = 15

/** Valida y normaliza el celular. Vacío = sin celular (`null`). */
export function normalizarCelularContacto(entrada: string): ResultadoCelular {
  const texto = entrada.trim()
  if (texto === "") return { valido: true, valor: null }
  const colombiano = normalizarCelularColombia(texto)
  if (colombiano.valido) return colombiano
  if (CON_INDICATIVO.test(texto)) {
    const digitos = texto.replace(/\D/g, "")
    if (!digitos.startsWith(INDICATIVO_COLOMBIA)) {
      return digitos.length >= DIGITOS_MIN && digitos.length <= DIGITOS_MAX
        ? { valido: true, valor: `+${digitos}` }
        : { valido: false, mensaje: MENSAJES_CELULAR_CONTACTO.internacional }
    }
  }
  return {
    valido: false,
    mensaje:
      colombiano.mensaje === MENSAJES_CELULAR.caracteres
        ? MENSAJES_CELULAR_CONTACTO.caracteres
        : MENSAJES_CELULAR_CONTACTO.formato,
  }
}

/** Valor para el formulario: el guardado, normalizado si es colombiano. */
export function celularContactoParaMostrar(guardado: string | null): string {
  if (!guardado) return ""
  const resultado = normalizarCelularContacto(guardado)
  return resultado.valido && resultado.valor ? resultado.valor : guardado
}
