export type TemaMapa = "oscuro" | "claro"

export const CLASES_POR_DEFECTO = 5

/**
 * Rampas secuenciales de una sola tonalidad (Lila AMO), de menor a mayor valor.
 * En tema oscuro el valor alto es el más claro (resalta sobre el fondo nocturno);
 * en tema claro, el más oscuro. Pasos elegidos por luminosidad OKLab casi
 * equidistante: oscuro 900·700·500·300·100, claro 200·400·600·800·950.
 * En HEX porque Chart.js y las expresiones de Mapbox no interpretan `oklch()`.
 */
export const PALETAS_SECUENCIALES: Readonly<
  Record<TemaMapa, readonly string[]>
> = {
  oscuro: ["#3F2A76", "#6238BF", "#8C66EE", "#C3AEFB", "#EDE7FE"],
  claro: ["#DCD0FD", "#A788F6", "#7549DE", "#4F2F98", "#261848"],
}

/**
 * "Sin datos" es una clase aparte, neutra (mauve), distinta del valor cero, que sí
 * es un dato y recibe el primer color. El mapa la complementa con un rayado.
 */
export const COLOR_SIN_DATOS: Readonly<Record<TemaMapa, string>> = {
  oscuro: "#2A2338",
  claro: "#E7E3F0",
}

/**
 * Cortes por cuantiles: devuelve los umbrales inferiores de las clases 1..k-1
 * (la clase 0 empieza en el mínimo). Con pocos valores distintos cada valor es
 * su propia clase; los cortes repetidos por empates (muchos ceros) se funden,
 * así que puede haber menos de `clases` clases, nunca clases vacías.
 */
export function calcularCortesCuantiles(
  valores: readonly number[],
  clases = CLASES_POR_DEFECTO
): number[] {
  const ordenados = valores.filter(Number.isFinite).sort((a, b) => a - b)
  if (ordenados.length === 0 || clases < 2) return []

  const distintos = [...new Set(ordenados)]
  if (distintos.length <= clases) return distintos.slice(1)

  const minimo = ordenados[0]
  const cortes = new Set<number>()
  for (let clase = 1; clase < clases; clase++) {
    const corte = ordenados[Math.floor((clase * ordenados.length) / clases)]
    if (corte > minimo) cortes.add(corte)
  }
  return [...cortes]
}

/** Índice de clase (0..cortes.length) de un valor: la clase i cubre [cortes[i-1], cortes[i]). */
export function clasificar(valor: number, cortes: readonly number[]): number {
  let clase = 0
  while (clase < cortes.length && valor >= cortes[clase]) clase++
  return clase
}

/** Colores repartidos a lo largo de la rampa completa para `cantidad` clases. */
export function coloresParaClases(cantidad: number, tema: TemaMapa): string[] {
  const rampa = PALETAS_SECUENCIALES[tema]
  if (cantidad <= 0) return []
  if (cantidad === 1) return [rampa[Math.floor(rampa.length / 2)]]
  return Array.from(
    { length: cantidad },
    (_, i) => rampa[Math.round((i * (rampa.length - 1)) / (cantidad - 1))]
  )
}

export interface EntradaLeyenda {
  readonly desde: number
  /** `null` en la última clase (sin tope). */
  readonly hasta: number | null
  readonly color: string
}

export interface EscalaCoropletica {
  readonly cortes: readonly number[]
  readonly colores: readonly string[]
  readonly colorSinDatos: string
  readonly leyenda: readonly EntradaLeyenda[]
  colorPara(valor: number | null | undefined): string
}

export interface OpcionesEscala {
  readonly tema: TemaMapa
  readonly clases?: number
}

export function crearEscalaCuantiles(
  valores: readonly number[],
  { tema, clases }: OpcionesEscala
): EscalaCoropletica {
  const finitos = valores.filter(Number.isFinite)
  const cortes = calcularCortesCuantiles(finitos, clases)
  const colores =
    finitos.length === 0 ? [] : coloresParaClases(cortes.length + 1, tema)
  const colorSinDatos = COLOR_SIN_DATOS[tema]
  const minimo = finitos.length === 0 ? 0 : Math.min(...finitos)

  return {
    cortes,
    colores,
    colorSinDatos,
    leyenda: colores.map((color, clase) => ({
      desde: clase === 0 ? minimo : cortes[clase - 1],
      hasta: clase < cortes.length ? cortes[clase] : null,
      color,
    })),
    colorPara: (valor) =>
      valor === null ||
      valor === undefined ||
      !Number.isFinite(valor) ||
      colores.length === 0
        ? colorSinDatos
        : colores[clasificar(valor, cortes)],
  }
}
