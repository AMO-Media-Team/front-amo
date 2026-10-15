import type { Position } from "geojson"

import {
  ajustarProyeccion,
  proyectar,
  yMercator,
  type Caja,
  type ParametrosProyeccion,
} from "../../../src/lib/geo/proyeccion"
import type { Posicion } from "../../../src/lib/geo/tipos"
import {
  unirBboxes,
  type GeometriaArea,
  type GeometriaProcesada,
} from "./capas"
import { redondear } from "./texto"

export const CODIGO_ARCHIPIELAGO = "88"

const ANCHO = 1000
const MARGEN = 8
/** Mar Caribe al noroeste del Urabá: ahí no hay territorio continental que tapar. */
const RECUADRO_SAN_ANDRES: Caja = {
  x: MARGEN,
  y: MARGEN,
  ancho: 130,
  alto: 260,
}
const RELLENO_RECUADRO = 10
const DECIMALES = 1

export interface SvgColombia {
  readonly viewBox: string
  readonly paths: Record<string, string>
  readonly centros: Record<string, readonly [number, number]>
  readonly contorno: string
  readonly recuadro: Caja
  readonly proyeccionContinental: ParametrosProyeccion
  readonly proyeccionSanAndres: ParametrosProyeccion
}

export interface EntradaSvg {
  /** Departamentos muy simplificados; el 88 se ignora y se dibuja con `islas`. */
  readonly departamentos: readonly GeometriaProcesada[]
  readonly contornoContinental: GeometriaProcesada
  /**
   * Polígonos municipales del archipiélago: el recuadro los amplía ~3×, y con la
   * tolerancia del SVG Providencia quedaría reducida a una línea.
   */
  readonly islas: readonly GeometriaProcesada[]
  /** Punto del marcador del archipiélago (la cabecera de San Andrés). */
  readonly centroArchipielago: Posicion
}

export function construirSvgColombia({
  departamentos,
  contornoContinental,
  islas,
  centroArchipielago,
}: EntradaSvg): SvgColombia {
  const [oeste, sur, este, norte] = contornoContinental.bbox
  const escala = (ANCHO - 2 * MARGEN) / (este - oeste)
  const alto = Math.ceil(
    (yMercator(norte) - yMercator(sur)) * escala + 2 * MARGEN
  )
  const proyeccionContinental = redondearParametros(
    ajustarProyeccion(contornoContinental.bbox, {
      x: MARGEN,
      y: MARGEN,
      ancho: ANCHO - 2 * MARGEN,
      alto: alto - 2 * MARGEN,
    })
  )
  const proyeccionSanAndres = redondearParametros(
    ajustarProyeccion(unirBboxes(islas.map((i) => i.bbox)), {
      x: RECUADRO_SAN_ANDRES.x + RELLENO_RECUADRO,
      y: RECUADRO_SAN_ANDRES.y + RELLENO_RECUADRO,
      ancho: RECUADRO_SAN_ANDRES.ancho - 2 * RELLENO_RECUADRO,
      alto: RECUADRO_SAN_ANDRES.alto - 2 * RELLENO_RECUADRO,
    })
  )
  const continentales = departamentos.filter(
    (d) => d.codigo !== CODIGO_ARCHIPIELAGO
  )

  return {
    viewBox: `0 0 ${ANCHO} ${alto}`,
    paths: Object.fromEntries([
      ...continentales.map((d) => [
        d.codigo,
        trazar(d.geometria, proyeccionContinental),
      ]),
      [
        CODIGO_ARCHIPIELAGO,
        islas.map((i) => trazar(i.geometria, proyeccionSanAndres)).join(""),
      ],
    ]),
    centros: Object.fromEntries([
      ...continentales.map((d) => [
        d.codigo,
        redondearPunto(proyectar(d.puntoInterior, proyeccionContinental)),
      ]),
      [
        CODIGO_ARCHIPIELAGO,
        redondearPunto(proyectar(centroArchipielago, proyeccionSanAndres)),
      ],
    ]),
    contorno: trazar(contornoContinental.geometria, proyeccionContinental),
    recuadro: RECUADRO_SAN_ANDRES,
    proyeccionContinental,
    proyeccionSanAndres,
  }
}

function trazar(
  geometria: GeometriaArea,
  proyeccion: ParametrosProyeccion
): string {
  const poligonos =
    geometria.type === "Polygon"
      ? [geometria.coordinates]
      : geometria.coordinates
  return poligonos
    .flat()
    .map((anillo) => trazarAnillo(anillo, proyeccion))
    .filter(Boolean)
    .join("")
}

function trazarAnillo(
  anillo: readonly Position[],
  proyeccion: ParametrosProyeccion
): string {
  const puntos: string[] = []
  for (const posicion of anillo) {
    const [x, y] = redondearPunto(
      proyectar([posicion[0], posicion[1]], proyeccion)
    )
    const punto = `${x},${y}`
    if (puntos.at(-1) !== punto) puntos.push(punto)
  }
  if (puntos[0] === puntos.at(-1)) puntos.pop()
  if (puntos.length < 3) return ""
  const [inicio, ...resto] = puntos
  return `M${inicio}L${resto.join(" ")}Z`
}

function redondearPunto([x, y]: readonly [number, number]): readonly [
  number,
  number,
] {
  return [redondear(x, DECIMALES), redondear(y, DECIMALES)]
}

function redondearParametros(
  parametros: ParametrosProyeccion
): ParametrosProyeccion {
  return {
    oeste: redondear(parametros.oeste, 6),
    norteMercator: redondear(parametros.norteMercator, 6),
    escala: redondear(parametros.escala, 6),
    desplazamientoX: redondear(parametros.desplazamientoX, 3),
    desplazamientoY: redondear(parametros.desplazamientoY, 3),
  }
}
