import { TIPOS_MUNICIPIO } from "../../../src/lib/geo/compacto"
import type { Departamento, Municipio, Pais } from "../../../src/lib/geo/tipos"
import { CODIGOS_HISTORICOS } from "../datos/municipios"
import type { SvgColombia } from "./svg"

const CABECERA = "// Generado por scripts/geo/build-geo.ts — no editar."

const literal = (valor: unknown) => JSON.stringify(valor)

function lineas(valores: readonly unknown[]): string {
  return valores.map((valor) => `  ${literal(valor)},`).join("\n")
}

function registro(valores: Readonly<Record<string, unknown>>): string {
  return `{\n${Object.entries(valores)
    .map(([clave, valor]) => `  ${literal(clave)}: ${literal(valor)},`)
    .join("\n")}\n}`
}

export function emitirPaises(
  paises: readonly Pais[],
  adm0AIso2: Record<string, string>
): string {
  return `${CABECERA}
// Fuentes: ISO 3166-1 (lukes/ISO-3166-Countries-with-Regional-Codes), nombres ICU es-419,
// alias de mledoze/countries (ODbL) y Natural Earth. Ver scripts/geo/fuentes/README.md.
import type { Pais } from '../tipos';

export const PAISES: readonly Pais[] = [
${lineas(paises)}
];

/** Códigos ADM0_A3 de Natural Earth que no coinciden con el ISO3 del país al que pertenecen. */
export const ADM0_A3_A_ISO2: Readonly<Record<string, string>> = ${registro(adm0AIso2)};
`
}

export function emitirDepartamentos(
  departamentos: readonly Departamento[],
  anioPoblacion: number
): string {
  return `${CABECERA}
// Fuentes: DIVIPOLA (DANE, datos.gov.co gdxc-w37w), proyecciones de población DANE ${anioPoblacion}.
import type { Departamento } from '../tipos';

export const ANIO_POBLACION = ${anioPoblacion};

export const DEPARTAMENTOS: readonly Departamento[] = [
${lineas(departamentos)}
];
`
}

export function emitirMunicipios(
  municipios: readonly Municipio[],
  alias: Record<string, string[]>
): string {
  const filas = municipios.map((m) => [
    m.codigo,
    m.nombre,
    TIPOS_MUNICIPIO.indexOf(m.tipo),
    m.esCapital ? 1 : 0,
    ...m.centroide,
    m.codigoGeometria,
    ...m.bbox,
  ])
  return `${CABECERA}
// Fuente: DIVIPOLA (DANE, datos.gov.co gdxc-w37w). Formato compacto: ver ../compacto.ts.
import { decodificarMunicipio, type FilaMunicipio } from '../compacto';
import type { Municipio } from '../tipos';

/** [codigo, nombre, tipo, esCapital, lon, lat, codigoGeometria, oeste, sur, este, norte] */
const FILAS: readonly FilaMunicipio[] = [
${lineas(filas)}
];

export const MUNICIPIOS: readonly Municipio[] = FILAS.map(decodificarMunicipio);

/** Códigos anteriores a la DIVIPOLA vigente que aún aparecen en datos externos. */
export const CODIGOS_MUNICIPIO_HISTORICOS: Readonly<Record<string, string>> = ${registro(CODIGOS_HISTORICOS)};

/** Alias normalizados (nombres de uso común y de la cartografía fuente). */
export const ALIAS_MUNICIPIOS: Readonly<Record<string, readonly string[]>> = ${registro(alias)};
`
}

export function emitirSvg(svg: SvgColombia): string {
  return `${CABECERA}
// Departamentos pre-proyectados (Mercator) para mini-mapas e ilustraciones sin Mapbox.
// El archipiélago de San Andrés (88) se dibuja dentro de RECUADRO_SAN_ANDRES.
import type { ParametrosProyeccion } from './proyeccion';

export const VIEWBOX_COLOMBIA = ${literal(svg.viewBox)};

export const PATHS_DEPARTAMENTOS: Readonly<Record<string, string>> = ${registro(svg.paths)};

/** Punto interior proyectado de cada departamento (marcadores y etiquetas). */
export const CENTROS_DEPARTAMENTOS: Readonly<Record<string, readonly [number, number]>> = ${registro(svg.centros)};

/** Contorno de la Colombia continental (unión de departamentos, sin el archipiélago). */
export const CONTORNO_COLOMBIA = ${literal(svg.contorno)};

export const RECUADRO_SAN_ANDRES = ${literal(svg.recuadro)} as const;

export const PROYECCION_CONTINENTAL: ParametrosProyeccion = ${literal(svg.proyeccionContinental)};

export const PROYECCION_SAN_ANDRES: ParametrosProyeccion = ${literal(svg.proyeccionSanAndres)};
`
}
