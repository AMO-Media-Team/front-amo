/**
 * Lectura de cifras escritas a mano en es-CO (módulo puro). En Colombia la
 * coma es decimal y el punto agrupa miles ("1.250.000", "15,5"), pero muchas
 * personas escriben "15.5": un punto solo se toma como separador de miles
 * cuando agrupa exactamente de a tres cifras ("1.500", "12.000.000").
 */
import { redondear } from "./valores"

const MILES_CON_PUNTO = /^-?\d{1,3}(\.\d{3})+$/
const NUMERO_PLANO = /^-?\d+(\.\d+)?$/

/** "1.250.000" → 1250000 · "15,5" → 15.5 · "15.5" → 15.5 · "" → null · "abc" → null. */
export function textoANumero(texto: string): number | null {
  const limpio = texto.replace(/[\s $%×]/g, "").replace(/^\+/, "")
  if (limpio === "") return null
  let normalizado: string
  if (limpio.includes(",")) {
    // La coma es decimal: los puntos son miles.
    const [entero, decimal, ...resto] = limpio.split(",")
    if (resto.length > 0) return null
    const sinMiles = entero.replaceAll(".", "")
    if (entero.includes(".") && !MILES_CON_PUNTO.test(entero)) return null
    normalizado = `${sinMiles}.${decimal}`
  } else if (MILES_CON_PUNTO.test(limpio) && !/^-?0\./.test(limpio)) {
    normalizado = limpio.replaceAll(".", "")
  } else {
    normalizado = limpio
  }
  if (!NUMERO_PLANO.test(normalizado)) return null
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : null
}

/** Decimales de un número (para validar la precisión de una columna `numeric`). */
export function cantidadDecimales(valor: number): number {
  if (Number.isInteger(valor)) return 0
  const texto = String(redondear(valor, 10))
  const [, decimales = ""] = texto.split(".")
  return decimales.length
}

const formatoEntrada = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 4,
  useGrouping: true,
})

/** Número → texto para un campo editable ("1.250.000", "15,5"). */
export function numeroAEntrada(valor: number | null | undefined): string {
  return typeof valor === "number" && Number.isFinite(valor)
    ? formatoEntrada.format(valor).replace(/ /g, " ")
    : ""
}
