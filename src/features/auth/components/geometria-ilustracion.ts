/**
 * Datos de la ilustración de Colombia del ingreso: departamentos
 * pre-proyectados, capitales, medios de muestra y arcos de conexión, todo en
 * coordenadas de `VIEWBOX_COLOMBIA`. Se calcula en el servidor (el
 * componente es un Server Component), así que los diccionarios no viajan al
 * navegador.
 */
import {
  listarDepartamentos,
  listarMunicipios,
  obtenerMunicipio,
} from "@/lib/geo/catalogo"
import { proyectarEnMapaColombia } from "@/lib/geo/mapa-svg"
import { PATHS_DEPARTAMENTOS } from "@/lib/geo/svg-departamentos"

export type Punto = readonly [x: number, y: number]

export interface DepartamentoIlustrado {
  codigo: string
  nombre: string
  path: string
  /** Posición en la secuencia de dibujo (de norte a sur). */
  orden: number
}

export interface CapitalIlustrada {
  codigoDepartamento: string
  nombre: string
  punto: Punto
  orden: number
}

export interface ArcoIlustrado {
  id: string
  path: string
  orden: number
}

export interface DatosIlustracion {
  departamentos: DepartamentoIlustrado[]
  capitales: CapitalIlustrada[]
  medios: Punto[]
  arcos: ArcoIlustrado[]
}

/**
 * Red de ejemplo: Bogotá como nodo central y enlaces regionales que cruzan
 * las cinco regiones y el archipiélago (códigos DANE de departamento).
 */
export const CONEXIONES: ReadonlyArray<readonly [string, string]> = [
  ["11", "05"],
  ["11", "76"],
  ["11", "08"],
  ["11", "68"],
  ["11", "50"],
  ["11", "73"],
  ["05", "23"],
  ["05", "27"],
  ["05", "66"],
  ["76", "19"],
  ["19", "52"],
  ["08", "47"],
  ["47", "44"],
  ["08", "13"],
  ["13", "88"],
  ["68", "54"],
  ["54", "81"],
  ["50", "85"],
  ["50", "95"],
  ["41", "18"],
  ["18", "86"],
  ["86", "91"],
]

/** Uno de cada N municipios se dibuja como "medio" (muestra determinista). */
const PASO_MUESTRA_MEDIOS = 7
const CURVATURA_ARCO = 0.22

const redondear = (valor: number) => Math.round(valor * 10) / 10

/**
 * Curva cuadrática de `a` a `b` que se arquea hacia arriba (como una ruta
 * aérea) una fracción `curvatura` de la distancia.
 */
export function arcoEntre(
  a: Punto,
  b: Punto,
  curvatura = CURVATURA_ARCO
): string {
  const [x1, y1] = a
  const [x2, y2] = b
  const dx = x2 - x1
  const dy = y2 - y1
  const distancia = Math.hypot(dx, dy)
  if (distancia === 0) return `M${x1},${y1}`

  let [nx, ny] = [-dy / distancia, dx / distancia]
  if (ny > 0 || (ny === 0 && nx > 0)) [nx, ny] = [-nx, -ny]

  const cx = (x1 + x2) / 2 + nx * distancia * curvatura
  const cy = (y1 + y2) / 2 + ny * distancia * curvatura
  return `M${redondear(x1)},${redondear(y1)}Q${redondear(cx)},${redondear(cy)} ${redondear(x2)},${redondear(y2)}`
}

function capitalesPorDepartamento(): Map<string, CapitalIlustrada> {
  const capitales = new Map<string, CapitalIlustrada>()
  const porLatitud = [...listarDepartamentos()].sort(
    (a, b) => b.centroide[1] - a.centroide[1]
  )
  porLatitud.forEach((departamento, orden) => {
    const capital = obtenerMunicipio(departamento.capitalCodigo)
    if (!capital) return
    const [x, y] = proyectarEnMapaColombia(capital.centroide)
    capitales.set(departamento.codigo, {
      codigoDepartamento: departamento.codigo,
      nombre: capital.nombre,
      punto: [redondear(x), redondear(y)],
      orden,
    })
  })
  return capitales
}

export function calcularDatosIlustracion(): DatosIlustracion {
  const capitales = capitalesPorDepartamento()
  const ordenDe = (codigo: string) => capitales.get(codigo)?.orden ?? 0

  const departamentos = listarDepartamentos()
    .filter((departamento) => PATHS_DEPARTAMENTOS[departamento.codigo])
    .map((departamento) => ({
      codigo: departamento.codigo,
      nombre: departamento.nombre,
      path: PATHS_DEPARTAMENTOS[departamento.codigo],
      orden: ordenDe(departamento.codigo),
    }))
    .sort((a, b) => a.orden - b.orden)

  const medios = listarMunicipios()
    .filter((_, indice) => indice % PASO_MUESTRA_MEDIOS === 0)
    .map((municipio): Punto => {
      const [x, y] = proyectarEnMapaColombia(municipio.centroide)
      return [redondear(x), redondear(y)]
    })

  const arcos = CONEXIONES.flatMap(([desde, hasta], orden) => {
    const a = capitales.get(desde)
    const b = capitales.get(hasta)
    return a && b
      ? [{ id: `${desde}-${hasta}`, path: arcoEntre(a.punto, b.punto), orden }]
      : []
  })

  return {
    departamentos,
    capitales: [...capitales.values()].sort((a, b) => a.orden - b.orden),
    medios,
    arcos,
  }
}
