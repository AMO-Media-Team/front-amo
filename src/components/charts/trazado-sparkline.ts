/**
 * Geometría de una sparkline en SVG (pura): trazo, área bajo la curva y punto
 * final. Los huecos (`null`) cortan la línea en lugar de inventar valores.
 */

export interface TrazadoSparkline {
  linea: string
  area: string
  ultimo: { x: number; y: number } | null
}

const VACIO: TrazadoSparkline = { linea: "", area: "", ultimo: null }

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100
}

export function trazarSparkline(
  valores: readonly (number | null)[],
  ancho: number,
  alto: number,
  margen = 3
): TrazadoSparkline {
  const puntos = valores.flatMap((valor, indice) =>
    valor !== null && Number.isFinite(valor) ? [{ indice, valor }] : []
  )
  if (puntos.length === 0 || ancho <= 0 || alto <= 0) return VACIO

  const minimo = Math.min(...puntos.map((p) => p.valor))
  const maximo = Math.max(...puntos.map((p) => p.valor))
  const rango = maximo - minimo
  const pasos = Math.max(valores.length - 1, 1)
  const util = { ancho: ancho - margen * 2, alto: alto - margen * 2 }

  const x = (indice: number) =>
    redondear(
      valores.length === 1 ? ancho / 2 : margen + (indice / pasos) * util.ancho
    )
  // Serie plana: línea a media altura, no pegada al borde.
  const y = (valor: number) =>
    redondear(
      rango === 0
        ? alto / 2
        : margen + (1 - (valor - minimo) / rango) * util.alto
    )

  const tramos: { x: number; y: number }[][] = []
  let anterior = -2
  for (const punto of puntos) {
    if (punto.indice !== anterior + 1) tramos.push([])
    tramos.at(-1)?.push({ x: x(punto.indice), y: y(punto.valor) })
    anterior = punto.indice
  }

  const linea = tramos
    .map((tramo) =>
      tramo.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ")
    )
    .join(" ")
  const base = redondear(alto)
  const area = tramos
    .filter((tramo) => tramo.length > 1)
    .map((tramo) => {
      const [primero, ultimo] = [tramo[0], tramo[tramo.length - 1]]
      const recorrido = tramo.map((p) => `L${p.x} ${p.y}`).join(" ")
      return `M${primero.x} ${base} ${recorrido} L${ultimo.x} ${base} Z`
    })
    .join(" ")
  const final = puntos[puntos.length - 1]

  return { linea, area, ultimo: { x: x(final.indice), y: y(final.valor) } }
}
