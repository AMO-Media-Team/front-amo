/**
 * Paletas de datos en HEX (Chart.js no entiende `oklch()`), validadas con el
 * método de la skill `dataviz` contra la superficie de las tarjetas de cada tema
 * (claro #FFFFFF, oscuro #15111F):
 *
 * - Categórica: espejo de los tokens `--chart-1..8` de globals.css (fuente de
 *   verdad; `paleta.test.ts` vigila que no diverjan). Orden fijo: CVD adyacente
 *   ΔE ≥ 8, visión normal ΔE ≥ 15; los 3 primeros también en todos-los-pares.
 *   En claro, los espacios 3–5 quedan bajo 3:1 → siempre hay tabla alternativa.
 * - Ordinal (embudos, etapas): un solo tono lila, ΔL ≥ 0,06 entre pasos y el
 *   extremo cercano a la superficie ≥ 2:1. En oscuro el ancla se invierte.
 * - Secuencial (mapa de calor): cinco clases lila de menos a más; "sin datos"
 *   usa un neutro distinto de la primera clase.
 */

export type ModoTema = "claro" | "oscuro"

type PorTema<T> = Readonly<Record<ModoTema, T>>

export const CATEGORICA: PorTema<readonly string[]> = {
  claro: [
    "#7549de",
    "#eb6834",
    "#1baf7a",
    "#eda100",
    "#e87ba4",
    "#008300",
    "#2a78d6",
    "#e34948",
  ],
  oscuro: [
    "#8c66ee",
    "#d95926",
    "#199e70",
    "#c98500",
    "#d55181",
    "#008300",
    "#3987e5",
    "#e66767",
  ],
}

/** Máximo de series con color propio; el resto se agrupa en "Otros". */
export const MAXIMO_SERIES = CATEGORICA.claro.length

export const ORDINAL: PorTema<readonly string[]> = {
  claro: [
    "#b9a2fa",
    "#a687f6",
    "#926ef0",
    "#7e55e4",
    "#6b40ce",
    "#5833ab",
    "#452c83",
    "#332260",
  ],
  oscuro: [
    "#6138bd",
    "#7347da",
    "#855de9",
    "#9876f2",
    "#ab8ef7",
    "#bda6fa",
    "#cfbffc",
    "#e1d7fd",
  ],
}

export const SECUENCIAL: PorTema<readonly string[]> = {
  claro: ["#dcd0fd", "#b9a2fa", "#9a78f2", "#7246d9", "#4d2e93"],
  oscuro: ["#3b276f", "#6138bd", "#8760eb", "#af94f8", "#d6c7fd"],
}

/**
 * Gris de contexto: periodo anterior, "Otros" y series atenuadas. Recesivo
 * pero visible (≥ 2,5:1 sobre la superficie).
 */
export const ATENUADO: PorTema<string> = {
  claro: "#a29bb5",
  oscuro: "#6a6280",
}

const HEX = /^#[0-9a-f]{6}$/i

export function esHex(valor: string): boolean {
  return HEX.test(valor.trim())
}

/**
 * Color de la serie en la posición dada. Nunca se generan ni se reciclan
 * tonos: pasada la octava, la serie debe ir agrupada en "Otros" (atenuado).
 */
export function colorCategorico(
  indice: number,
  categorica: readonly string[],
  atenuado: string
): string {
  return indice >= 0 && indice < categorica.length
    ? categorica[indice]
    : atenuado
}

/**
 * `cantidad` pasos ordinales repartidos de forma uniforme sobre la rampa, así
 * pocas etapas quedan más separadas que las ocho posibles.
 */
export function rampaOrdinal(
  cantidad: number,
  rampa: readonly string[]
): string[] {
  if (cantidad <= 0) return []
  if (cantidad === 1) return [rampa[Math.floor((rampa.length - 1) / 2)]]
  const pasos = Math.min(cantidad, rampa.length)
  const elegidos = Array.from(
    { length: pasos },
    (_, i) => rampa[Math.round((i * (rampa.length - 1)) / (pasos - 1))]
  )
  // Más etapas que pasos: las últimas comparten el tono más intenso.
  return Array.from(
    { length: cantidad },
    (_, i) => elegidos[Math.min(i, pasos - 1)]
  )
}

/**
 * Clase secuencial de un valor: -1 = sin actividad; 0..clases-1 según su
 * proporción respecto del máximo (clases de igual amplitud, legibles en la leyenda).
 */
export function claseSecuencial(
  valor: number,
  maximo: number,
  clases: number
): number {
  if (!(valor > 0) || !(maximo > 0) || clases <= 0) return -1
  const proporcion = Math.min(valor / maximo, 1)
  return Math.min(clases - 1, Math.ceil(proporcion * clases) - 1)
}

/** Límites superiores de cada clase secuencial (para la leyenda de escala). */
export function limitesClases(maximo: number, clases: number): number[] {
  if (!(maximo > 0) || clases <= 0) return []
  return Array.from({ length: clases }, (_, i) =>
    Math.ceil((maximo * (i + 1)) / clases)
  )
}

/**
 * Rango [desde, hasta] de cada clase secuencial (enteros); `null` si la clase
 * queda vacía porque el máximo es menor que el número de clases.
 */
export function rangosClases(
  limites: readonly number[]
): (readonly [number, number] | null)[] {
  return limites.map((hasta, i) => {
    const desde = i === 0 ? 1 : limites[i - 1] + 1
    return desde <= hasta ? ([desde, hasta] as const) : null
  })
}

function canales(hex: string): [number, number, number] {
  const limpio = hex.replace("#", "")
  return [0, 2, 4].map((i) => parseInt(limpio.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ]
}

function aHex(valores: readonly number[]): string {
  return `#${valores
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`
}

/** Mezcla lineal en sRGB: `t = 0` → `a`, `t = 1` → `b`. */
export function mezclar(a: string, b: string, t: number): string {
  const [ca, cb] = [canales(a), canales(b)]
  return aHex(ca.map((valor, i) => valor + (cb[i] - valor) * t))
}

/**
 * Color de una marca bajo el puntero: se aclara en oscuro y se oscurece en
 * claro, lo justo para que la barra "responda" sin cambiar de identidad.
 */
export function realce(color: string, modo: ModoTema): string {
  return mezclar(color, modo === "oscuro" ? "#ffffff" : "#1b1528", 0.16)
}

/** `#rrggbb` + opacidad → `rgba()` (lo entienden Chart.js y el canvas). */
export function conAlfa(hex: string, alfa: number): string {
  const [r, g, b] = canales(hex)
  return `rgba(${r}, ${g}, ${b}, ${alfa})`
}

function lineal(canal: number): number {
  const c = canal / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function luminancia(hex: string): number {
  const [r, g, b] = canales(hex).map(lineal)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contraste(a: string, b: string): number {
  const [alta, baja] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (alta + 0.05) / (baja + 0.05)
}

/**
 * Tinta para un texto dentro de un relleno de color (única excepción a "el
 * texto no usa el color de la serie"): la de mayor contraste.
 */
export function tintaSobre(
  fondo: string,
  clara = "#ffffff",
  oscura = "#1b1528"
): string {
  return contraste(fondo, clara) >= contraste(fondo, oscura) ? clara : oscura
}
