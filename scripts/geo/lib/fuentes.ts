import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { FeatureCollection, Geometry } from "geojson"
import ExcelJS from "exceljs"

import { ARCHIVOS_FUENTE, RUTAS } from "./rutas"

export interface RegistroDivipola {
  readonly cod_dpto: string
  readonly dpto: string
  readonly cod_mpio: string
  readonly nom_mpio: string
  readonly tipo_municipio: "Municipio" | "Área no municipalizada" | "Isla"
  /** Decimal con coma, tal como lo publica datos.gov.co. */
  readonly longitud: string
  readonly latitud: string
}

export interface RegistroIso3166 {
  readonly name: string
  readonly "alpha-2": string
  readonly "alpha-3": string
  readonly "country-code": string
  readonly region: string | null
  readonly "sub-region": string | null
  readonly "intermediate-region": string | null
}

export interface RegistroPaisMledoze {
  readonly cca2: string
  readonly cca3: string
  readonly nombre: { readonly comun: string; readonly oficial: string }
  readonly alternativos: readonly string[]
  readonly espanol: { readonly comun: string; readonly oficial: string } | null
  /** [latitud, longitud] del centro aproximado del territorio. */
  readonly latlng: readonly number[]
}

export interface PoblacionDepartamental {
  readonly anio: number
  readonly fuente: string
  readonly url: string
  readonly hoja: string
  readonly consultado: string
  readonly valores: Readonly<
    Record<string, { readonly nombre: string; readonly poblacion: number }>
  >
}

type PropiedadesFuente = Record<string, string | number | null>
export type ColeccionFuente = FeatureCollection<Geometry, PropiedadesFuente>

export interface Fuentes {
  readonly divipola: readonly RegistroDivipola[]
  readonly iso3166: readonly RegistroIso3166[]
  readonly paisesMledoze: readonly RegistroPaisMledoze[]
  readonly poblacion: PoblacionDepartamental
  readonly geoPaises: ColeccionFuente
  readonly geoDepartamentos: ColeccionFuente
  readonly geoMunicipios: ColeccionFuente
}

const leerJson = <T>(archivo: string): T =>
  JSON.parse(readFileSync(join(RUTAS.fuentes, archivo), "utf8")) as T

export function cargarFuentes(): Fuentes {
  return {
    divipola: leerJson(ARCHIVOS_FUENTE.divipola),
    iso3166: leerJson(ARCHIVOS_FUENTE.iso3166),
    paisesMledoze: leerJson(ARCHIVOS_FUENTE.paisesMledoze),
    poblacion: leerJson(ARCHIVOS_FUENTE.poblacion),
    geoPaises: leerJson(ARCHIVOS_FUENTE.geoPaises),
    geoDepartamentos: leerJson(ARCHIVOS_FUENTE.geoDepartamentos),
    geoMunicipios: leerJson(ARCHIVOS_FUENTE.geoMunicipios),
  }
}

// ---------------------------------------------------------------------------
// Descarga de snapshots (solo con --descargar). Los GeoJSON no se descargan:
// son los archivos entregados por el cliente y se versionan tal cual.
// ---------------------------------------------------------------------------

export const URLS_FUENTE = {
  divipola: "https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=2000",
  iso3166:
    "https://raw.githubusercontent.com/lukes/ISO-3166-Countries-with-Regional-Codes/master/all/all.json",
  paisesMledoze:
    "https://raw.githubusercontent.com/mledoze/countries/master/countries.json",
  poblacion:
    "https://www.dane.gov.co/files/censo2018/proyecciones-de-poblacion/Departamental/PPED-AreaDep-2018-2050_VP.xlsx",
} as const

const ANIO_POBLACION = 2025
const HOJA_POBLACION = "PobDepartamentalxÁrea"

interface PaisMledozeCrudo {
  cca2: string
  cca3: string
  name: { common: string; official: string }
  altSpellings: string[]
  translations: Record<string, { common: string; official: string } | undefined>
  latlng: number[]
}

export async function descargarFuentes(fechaConsulta: string): Promise<void> {
  const divipola = await descargarJson<RegistroDivipola[]>(URLS_FUENTE.divipola)
  escribirSnapshot(
    ARCHIVOS_FUENTE.divipola,
    jsonPorLineas(ordenarPor(divipola, (r) => r.cod_mpio))
  )

  const iso = await descargarJson<RegistroIso3166[]>(URLS_FUENTE.iso3166)
  escribirSnapshot(
    ARCHIVOS_FUENTE.iso3166,
    jsonPorLineas(ordenarPor(iso, (r) => r["alpha-2"]))
  )

  const mledoze = await descargarJson<PaisMledozeCrudo[]>(
    URLS_FUENTE.paisesMledoze
  )
  escribirSnapshot(
    ARCHIVOS_FUENTE.paisesMledoze,
    jsonPorLineas(ordenarPor(mledoze.map(recortarMledoze), (r) => r.cca2))
  )

  const poblacion = await descargarPoblacion(fechaConsulta)
  escribirSnapshot(
    ARCHIVOS_FUENTE.poblacion,
    `${JSON.stringify(poblacion, null, 2)}\n`
  )
}

function recortarMledoze(pais: PaisMledozeCrudo): RegistroPaisMledoze {
  const espanol = pais.translations.spa
  return {
    cca2: pais.cca2,
    cca3: pais.cca3,
    nombre: { comun: pais.name.common, oficial: pais.name.official },
    alternativos: pais.altSpellings,
    espanol: espanol
      ? { comun: espanol.common, oficial: espanol.official }
      : null,
    latlng: pais.latlng,
  }
}

async function descargarPoblacion(
  fechaConsulta: string
): Promise<PoblacionDepartamental> {
  const respuesta = await fetch(URLS_FUENTE.poblacion)
  if (!respuesta.ok)
    throw new Error(
      `DANE respondió ${respuesta.status} para ${URLS_FUENTE.poblacion}`
    )
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(await respuesta.arrayBuffer())
  const hoja = libro.getWorksheet(HOJA_POBLACION)
  if (!hoja)
    throw new Error(`El libro del DANE no tiene la hoja ${HOJA_POBLACION}`)

  const valores: Record<string, { nombre: string; poblacion: number }> = {}
  hoja.eachRow((fila) => {
    const [codigo, nombre, anio, area, total] = [1, 2, 3, 4, 5].map(
      (columna) => fila.getCell(columna).value
    )
    if (anio === ANIO_POBLACION && area === "Total") {
      valores[String(codigo).padStart(2, "0")] = {
        nombre: String(nombre),
        poblacion: Number(total),
      }
    }
  })

  return {
    anio: ANIO_POBLACION,
    fuente:
      "DANE — Proyecciones de población y estudios demográficos (PPED): población departamental por área geográfica 2018-2050, actualizada el 30 de julio de 2025",
    url: URLS_FUENTE.poblacion,
    hoja: HOJA_POBLACION,
    consultado: fechaConsulta,
    valores: Object.fromEntries(
      Object.entries(valores).sort(([a], [b]) => a.localeCompare(b))
    ),
  }
}

async function descargarJson<T>(url: string): Promise<T> {
  const respuesta = await fetch(url)
  if (!respuesta.ok) throw new Error(`${url} respondió ${respuesta.status}`)
  return (await respuesta.json()) as T
}

function escribirSnapshot(archivo: string, contenido: string): void {
  writeFileSync(join(RUTAS.fuentes, archivo), contenido)
}

function ordenarPor<T>(
  registros: readonly T[],
  clave: (registro: T) => string
): T[] {
  return [...registros].sort((a, b) => clave(a).localeCompare(clave(b)))
}

/** Un registro por línea: diffs legibles al actualizar el snapshot. */
export function jsonPorLineas(registros: readonly unknown[]): string {
  return `[\n${registros.map((registro) => JSON.stringify(registro)).join(",\n")}\n]\n`
}
