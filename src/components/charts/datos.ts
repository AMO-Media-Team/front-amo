/**
 * Preparación pura de los datos de cada gráfico: agrupación en "Otros",
 * conversiones del embudo y matriz día × hora completa. Sin Chart.js ni DOM.
 */
import { MAXIMO_SERIES } from "./paleta"

const comparador = new Intl.Collator("es", { sensitivity: "base" })

export const ID_OTROS = "__otros__"

export interface ElementoValor {
  id: string
  nombre: string
  valor: number
}

/** Mayor a menor; los empates se ordenan por nombre para un orden estable. */
export function ordenarPorValor<T extends ElementoValor>(
  elementos: readonly T[]
): T[] {
  return [...elementos].sort(
    (a, b) => b.valor - a.valor || comparador.compare(a.nombre, b.nombre)
  )
}

function sumar(elementos: readonly ElementoValor[]): number {
  return elementos.reduce((total, elemento) => total + elemento.valor, 0)
}

/**
 * Top N de un ranking. Con `agruparResto`, lo que queda fuera suma en una fila
 * "Otros" al final (nunca compite por el primer puesto).
 */
export function prepararRanking(
  elementos: readonly ElementoValor[],
  limite: number,
  agruparResto = false,
  etiquetaResto = "Otros"
): ElementoValor[] {
  const ordenados = ordenarPorValor(
    elementos.filter((elemento) => Number.isFinite(elemento.valor))
  )
  const visibles = ordenados.slice(0, Math.max(0, limite))
  const resto = ordenados.slice(visibles.length)
  if (!agruparResto || resto.length === 0) return visibles
  return [
    ...visibles,
    {
      id: ID_OTROS,
      nombre: `${etiquetaResto} (${resto.length})`,
      valor: sumar(resto),
    },
  ]
}

/**
 * Segmentos de una dona (parte de un todo, ≤ `maximo`). Conserva el orden de
 * entrada —el color sigue a la entidad, no a su puesto— y pliega los menores
 * en "Otros" cuando hay más de los que caben.
 */
export function prepararSegmentos(
  segmentos: readonly ElementoValor[],
  maximo = 6,
  etiquetaResto = "Otros"
): ElementoValor[] {
  const validos = segmentos.filter(
    (s) => Number.isFinite(s.valor) && s.valor > 0
  )
  const tope = Math.min(maximo, MAXIMO_SERIES)
  if (validos.length <= tope) return validos
  const conservados = new Set(
    ordenarPorValor(validos)
      .slice(0, tope - 1)
      .map((s) => s.id)
  )
  const resto = validos.filter((s) => !conservados.has(s.id))
  return [
    ...validos.filter((s) => conservados.has(s.id)),
    { id: ID_OTROS, nombre: etiquetaResto, valor: sumar(resto) },
  ]
}

export interface EtapaEmbudo {
  id: string
  nombre: string
  cantidad: number
}

export interface EtapaConConversion extends EtapaEmbudo {
  /** Fracción respecto de la primera etapa (null si la primera es 0). */
  delInicio: number | null
  /** Fracción respecto de la etapa anterior (null en la primera o si era 0). */
  deLaAnterior: number | null
}

function fraccion(parte: number, total: number): number | null {
  return total > 0 ? parte / total : null
}

export function conversionesEmbudo(
  etapas: readonly EtapaEmbudo[]
): EtapaConConversion[] {
  const inicio = etapas[0]?.cantidad ?? 0
  return etapas.map((etapa, indice) => ({
    ...etapa,
    delInicio: fraccion(etapa.cantidad, inicio),
    deLaAnterior:
      indice === 0
        ? null
        : fraccion(etapa.cantidad, etapas[indice - 1].cantidad),
  }))
}

/** Transición con la menor conversión (la mayor fuga del embudo). */
export function mayorCaida(
  etapas: readonly EtapaConConversion[]
): EtapaConConversion | null {
  return etapas.reduce<EtapaConConversion | null>((peor, etapa) => {
    if (etapa.deLaAnterior === null) return peor
    return !peor || (peor.deLaAnterior ?? 1) > etapa.deLaAnterior ? etapa : peor
  }, null)
}

/** 1 = lunes … 7 = domingo (isodow, como `actividad_heatmap`). */
export const DIAS_SEMANA = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const

export const DIAS_CORTOS = [
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
  "Dom",
] as const

export interface CeldaActividad {
  /** 1 = lunes … 7 = domingo. */
  diaSemana: number
  /** 0–23, hora de Bogotá. */
  hora: number
  cantidad: number
}

/**
 * Las 168 celdas día × hora en orden (lunes 0 h → domingo 23 h); las que no
 * llegan valen 0 y las fuera de rango se descartan.
 */
export function completarMatriz(
  celdas: readonly CeldaActividad[]
): CeldaActividad[] {
  const porClave = new Map<string, number>()
  for (const celda of celdas) {
    const valida =
      Number.isInteger(celda.diaSemana) &&
      celda.diaSemana >= 1 &&
      celda.diaSemana <= 7 &&
      Number.isInteger(celda.hora) &&
      celda.hora >= 0 &&
      celda.hora <= 23
    if (!valida) continue
    const clave = `${celda.diaSemana}-${celda.hora}`
    porClave.set(
      clave,
      (porClave.get(clave) ?? 0) + Math.max(0, celda.cantidad)
    )
  }
  return DIAS_SEMANA.flatMap((_, d) =>
    Array.from({ length: 24 }, (_, hora) => ({
      diaSemana: d + 1,
      hora,
      cantidad: porClave.get(`${d + 1}-${hora}`) ?? 0,
    }))
  )
}

/** "14:00–15:00". */
export function franjaHoraria(hora: number): string {
  const dos = (h: number) => String(h).padStart(2, "0")
  return `${dos(hora)}:00–${dos((hora + 1) % 24)}:00`
}
