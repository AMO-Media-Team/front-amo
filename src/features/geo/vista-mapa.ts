/**
 * Todo lo que el explorador pinta a partir de una respuesta de la API: valor
 * por polígono, ranking, escala de cuantiles, color y clase de cada zona,
 * conteos de la leyenda y círculos de los países sin polígono. Módulo puro.
 */
import { radioCirculo } from "@/components/maps/expresiones"
import type { CirculoMapa } from "@/components/maps/tipos"
import {
  clasificar,
  crearEscalaCuantiles,
  type EscalaCoropletica,
  type TemaMapa,
} from "@/lib/geo/escalas"

import {
  agruparPorGeometria,
  construirRanking,
  type FilaRanking,
  type Ranking,
  type ValorZona,
} from "./agregacion"
import type { CentroZona, FilaMetricaGeo } from "./tipos"

/** Polígono del GeoJSON del nivel. */
export interface ZonaDibujable {
  readonly codigo: string
  readonly nombre: string
}

export interface EntradaVistaMapa {
  readonly filas: readonly FilaMetricaGeo[]
  /** Polígonos del nivel: completan el ranking con las zonas sin dato. */
  readonly universo: readonly ZonaDibujable[]
  /** Listar también las zonas sin dato (no en el mapa mundial). */
  readonly incluirSinDatos: boolean
  readonly aditiva: boolean
  readonly por100k: boolean
  readonly tema: TemaMapa
}

export interface VistaMapa {
  /**
   * Sin actividad (ver `sinActividad`) no hay puestos ni participación y
   * `conDatos` es 0: el ámbito se presenta como un mapa sin datos.
   */
  readonly ranking: Ranking
  /**
   * Métrica aditiva sin ningún valor positivo. En departamentos y municipios
   * la BD devuelve una fila por zona aunque valga 0; si todas valen 0, el
   * periodo no tuvo actividad en el ámbito y un "Puesto 1 de 33" o un mapa
   * pintado de un solo color dirían lo contrario.
   */
  readonly sinActividad: boolean
  readonly escala: EscalaCoropletica
  /** Color por código de polígono (solo zonas con dato). */
  readonly colores: ReadonlyMap<string, string>
  /** Índice de clase de la leyenda por código (solo zonas con dato). */
  readonly claseDe: ReadonlyMap<string, number>
  /** Zonas por clase, en el orden de `escala.leyenda`. */
  readonly conteos: readonly number[]
  readonly sinDatos: number
  readonly porCodigo: ReadonlyMap<string, FilaRanking>
}

function zonaSinDato({ codigo, nombre }: ZonaDibujable): ValorZona {
  return {
    codigo,
    nombre,
    codigos: [codigo],
    valorBase: null,
    valor: null,
    n: null,
    poblacion: null,
  }
}

/** Ranking de un ámbito sin actividad: los ceros se listan, pero sin puesto. */
function rankingSinActividad(ranking: Ranking): Ranking {
  return {
    ...ranking,
    filas: ranking.filas.map((fila) => ({
      ...fila,
      posicion: null,
      participacion: null,
    })),
    conDatos: 0,
  }
}

export function construirVistaMapa({
  filas,
  universo,
  incluirSinDatos,
  aditiva,
  por100k,
  tema,
}: EntradaVistaMapa): VistaMapa {
  const opciones = { aditiva, por100k }
  const zonas = agruparPorGeometria(filas, opciones)
  if (incluirSinDatos) {
    const presentes = new Set(zonas.map((zona) => zona.codigo))
    for (const zona of universo) {
      if (!presentes.has(zona.codigo)) zonas.push(zonaSinDato(zona))
    }
  }

  const completo = construirRanking(zonas, opciones)
  const sinActividad =
    aditiva &&
    completo.conDatos > 0 &&
    completo.filas.every((fila) => fila.valor === null || fila.valor <= 0)
  const ranking = sinActividad ? rankingSinActividad(completo) : completo
  // Solo se colorean las zonas con dato; sin actividad, ninguna.
  const coloreables = sinActividad
    ? []
    : ranking.filas.flatMap((fila) =>
        fila.valor === null ? [] : [{ codigo: fila.codigo, valor: fila.valor }]
      )
  const escala = crearEscalaCuantiles(
    coloreables.map((zona) => zona.valor),
    { tema }
  )

  const colores = new Map<string, string>()
  const claseDe = new Map<string, number>()
  const conteos = escala.leyenda.map(() => 0)
  for (const fila of coloreables) {
    const clase = clasificar(fila.valor, escala.cortes)
    colores.set(fila.codigo, escala.colores[clase] ?? escala.colorSinDatos)
    claseDe.set(fila.codigo, clase)
    conteos[clase] = (conteos[clase] ?? 0) + 1
  }

  return {
    ranking,
    sinActividad,
    escala,
    colores,
    claseDe,
    conteos,
    sinDatos: ranking.filas.length - ranking.conDatos,
    porCodigo: new Map(ranking.filas.map((fila) => [fila.codigo, fila])),
  }
}

/** Códigos de las zonas de una clase de la leyenda (para resaltarlas). */
export function codigosDeClase(
  vista: VistaMapa,
  clase: number
): ReadonlySet<string> {
  const codigos = new Set<string>()
  for (const [codigo, indice] of vista.claseDe) {
    if (indice === clase) codigos.add(codigo)
  }
  return codigos
}

export interface CirculosVista {
  readonly circulos: readonly CirculoMapa[]
  readonly radios: ReadonlyMap<string, number>
}

/** Radio fijo (px) del marcador de una zona diminuta a la escala del nivel. */
export const RADIO_ZONA_DIMINUTA = 6

/**
 * Círculos para lo que el polígono no deja ver:
 * - zonas con dato sin polígono (países pequeños): área proporcional al valor;
 * - zonas diminutas a esta escala (San Andrés en el mapa nacional): marcador
 *   de tamaño fijo, con el color de su clase, para poder verlas y tocarlas.
 */
export function circulosDeVista(
  vista: VistaMapa,
  sinPoligono: readonly CentroZona[],
  diminutas: readonly CentroZona[] = []
): CirculosVista {
  const circulos: CirculoMapa[] = []
  const radios = new Map<string, number>()
  for (const { codigo, centro } of sinPoligono) {
    const valor = vista.porCodigo.get(codigo)?.valor ?? null
    const radio = radioCirculo(valor, vista.ranking.maximo)
    if (radio <= 0) continue
    circulos.push({ codigo, centro })
    radios.set(codigo, radio)
  }
  for (const { codigo, centro } of diminutas) {
    if (radios.has(codigo) || !vista.porCodigo.has(codigo)) continue
    circulos.push({ codigo, centro })
    radios.set(codigo, RADIO_ZONA_DIMINUTA)
  }
  return { circulos, radios }
}
