/**
 * Pipeline geográfico de AMO: `pnpm geo:build` (o `pnpm exec tsx scripts/geo/build-geo.ts`).
 *
 * Determinista y sin red: lee los snapshots de scripts/geo/fuentes y genera
 *   - public/data/geo/{paises,departamentos}.json y municipios/{DPTO}.json
 *   - src/lib/geo/diccionarios/{paises,departamentos,municipios}.ts
 *   - src/lib/geo/svg-departamentos.ts
 *   - supabase/seed/geo.sql
 * Con `--descargar` actualiza antes los snapshots tabulares (DIVIPOLA, ISO, población).
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import type { Feature, FeatureCollection } from "geojson"

import type { Departamento, Municipio, Pais } from "../../src/lib/geo/tipos"
import { METADATOS_DEPARTAMENTOS } from "./datos/departamentos"
import { generarSqlGeo } from "./generar-sql"
import {
  adm0PrincipalPorIso2,
  departamentoDesdeMunicipios,
  procesarContorno,
  procesarDepartamentos,
  procesarDepartamentosSvg,
  procesarMunicipios,
  procesarPaises,
  type GeometriaArea,
  type GeometriaProcesada,
} from "./lib/capas"
import {
  construirAliasMunicipios,
  construirDepartamentos,
  construirMunicipios,
  construirPaises,
} from "./lib/diccionarios"
import {
  emitirDepartamentos,
  emitirMunicipios,
  emitirPaises,
  emitirSvg,
} from "./lib/emitir-ts"
import { cargarFuentes, descargarFuentes } from "./lib/fuentes"
import { RUTAS } from "./lib/rutas"
import { CODIGO_ARCHIPIELAGO, construirSvgColombia } from "./lib/svg"

const ESPERADOS = {
  municipios: 1122,
  departamentos: 33,
  geometriasMunicipales: 1118,
} as const

interface ArchivoEscrito {
  readonly ruta: string
  readonly bytes: number
  readonly gzip: number
}

async function main(): Promise<void> {
  if (process.argv.includes("--descargar")) {
    await descargarFuentes(new Date().toISOString().slice(0, 10))
  }
  const fuentes = cargarFuentes()
  const advertencias: string[] = []

  // En serie: mapshaper es CPU puro y así el orden de trabajo es siempre el mismo.
  const geoMunicipios = await procesarMunicipios(fuentes.geoMunicipios)
  const geoDepartamentos = departamentoDesdeMunicipios(
    await procesarDepartamentos(fuentes.geoDepartamentos),
    geoMunicipios,
    {
      codigo: CODIGO_ARCHIPIELAGO,
      capitalCodigo: METADATOS_DEPARTAMENTOS[CODIGO_ARCHIPIELAGO].capitalCodigo,
    }
  )
  const geoDepartamentosSvg = await procesarDepartamentosSvg(
    fuentes.geoDepartamentos
  )
  const geoPaises = await procesarPaises(fuentes.geoPaises)
  const continentales = new Set(
    geoDepartamentosSvg
      .map((d) => d.codigo)
      .filter((c) => c !== CODIGO_ARCHIPIELAGO)
  )
  const contorno = await procesarContorno(
    fuentes.geoDepartamentos,
    continentales
  )

  const municipios = construirMunicipios(fuentes, indexar(geoMunicipios))
  const aliasMunicipios = construirAliasMunicipios(
    municipios,
    fuentes.geoMunicipios,
    advertencias
  )
  const departamentos = construirDepartamentos(
    fuentes,
    indexar(geoDepartamentos),
    municipios,
    advertencias
  )
  const { paises, adm0AIso2 } = construirPaises(
    fuentes,
    indexar(geoPaises),
    advertencias
  )
  verificarConteos(municipios, departamentos, geoMunicipios)

  const escritos = [
    escribirGeoJson(
      join(RUTAS.salidaGeo, "paises.json"),
      coleccionPaises(
        geoPaises,
        paises,
        adm0PrincipalPorIso2(fuentes.geoPaises)
      )
    ),
    escribirGeoJson(
      join(RUTAS.salidaGeo, "departamentos.json"),
      coleccionDepartamentos(geoDepartamentos, departamentos)
    ),
    ...escribirMunicipiosPorDepartamento(geoMunicipios, municipios),
    escribirTexto(
      join(RUTAS.diccionarios, "paises.ts"),
      emitirPaises(paises, adm0AIso2)
    ),
    escribirTexto(
      join(RUTAS.diccionarios, "departamentos.ts"),
      emitirDepartamentos(departamentos, fuentes.poblacion.anio)
    ),
    escribirTexto(
      join(RUTAS.diccionarios, "municipios.ts"),
      emitirMunicipios(municipios, aliasMunicipios)
    ),
    escribirTexto(
      RUTAS.svgDepartamentos,
      emitirSvg(
        construirSvgColombia({
          departamentos: geoDepartamentosSvg,
          contornoContinental: contorno,
          islas: geoMunicipios.filter((g) =>
            g.codigo.startsWith(CODIGO_ARCHIPIELAGO)
          ),
          centroArchipielago: centroDeCapital(departamentos, municipios),
        })
      )
    ),
    escribirTexto(
      RUTAS.semillaSql,
      generarSqlGeo({ paises, departamentos, municipios })
    ),
  ]

  informar(escritos, advertencias, {
    paises,
    departamentos,
    municipios,
    geoMunicipios,
  })
}

function centroDeCapital(
  departamentos: readonly Departamento[],
  municipios: readonly Municipio[]
) {
  const capital = departamentos.find(
    (d) => d.codigo === CODIGO_ARCHIPIELAGO
  )?.capitalCodigo
  const municipio = municipios.find((m) => m.codigo === capital)
  if (!municipio) throw new Error("Sin capital del archipiélago")
  return municipio.centroide
}

function indexar(
  geometrias: readonly GeometriaProcesada[]
): Map<string, GeometriaProcesada> {
  const indice = new Map<string, GeometriaProcesada>()
  for (const geometria of geometrias) {
    if (indice.has(geometria.codigo))
      throw new Error(`Código de geometría repetido: ${geometria.codigo}`)
    indice.set(geometria.codigo, geometria)
  }
  return indice
}

function verificarConteos(
  municipios: readonly Municipio[],
  departamentos: readonly Departamento[],
  geoMunicipios: readonly GeometriaProcesada[]
): void {
  const reales = {
    municipios: municipios.length,
    departamentos: departamentos.length,
    geometriasMunicipales: geoMunicipios.length,
  }
  for (const [clave, esperado] of Object.entries(ESPERADOS)) {
    const real = reales[clave as keyof typeof reales]
    if (real !== esperado)
      throw new Error(`Se esperaban ${esperado} ${clave} y hay ${real}`)
  }
}

// ---------------------------------------------------------------------------
// Colecciones de salida: cada feature lleva solo lo que el mapa necesita.
// ---------------------------------------------------------------------------

type PropiedadesSalida = Record<string, string>

function feature(
  geometria: GeometriaProcesada,
  properties: PropiedadesSalida
): Feature<GeometriaArea, PropiedadesSalida> {
  return { type: "Feature", properties, geometry: geometria.geometria }
}

function coleccion(
  features: Feature<GeometriaArea, PropiedadesSalida>[]
): FeatureCollection<GeometriaArea, PropiedadesSalida> {
  return { type: "FeatureCollection", features }
}

function coleccionPaises(
  geometrias: readonly GeometriaProcesada[],
  paises: readonly Pais[],
  adm0PorIso2: ReadonlyMap<string, string>
) {
  const porIso2 = new Map(paises.map((p) => [p.iso2, p]))
  return coleccion(
    geometrias.map((g) => {
      const pais = porIso2.get(g.codigo)
      if (!pais) throw new Error(`País sin diccionario: ${g.codigo}`)
      return feature(g, {
        codigo: pais.iso2,
        nombre: pais.nombre,
        adm0_a3: adm0PorIso2.get(pais.iso2) ?? pais.iso3,
      })
    })
  )
}

function coleccionDepartamentos(
  geometrias: readonly GeometriaProcesada[],
  departamentos: readonly Departamento[]
) {
  const nombres = new Map(departamentos.map((d) => [d.codigo, d.nombre]))
  return coleccion(
    geometrias.map((g) =>
      feature(g, { codigo: g.codigo, nombre: nombreDe(nombres, g.codigo) })
    )
  )
}

function nombreDe(nombres: ReadonlyMap<string, string>, codigo: string) {
  const nombre = nombres.get(codigo)
  if (nombre === undefined) throw new Error(`Polígono sin nombre: ${codigo}`)
  return nombre
}

function escribirMunicipiosPorDepartamento(
  geometrias: readonly GeometriaProcesada[],
  municipios: readonly Municipio[]
): ArchivoEscrito[] {
  const nombres = new Map(municipios.map((m) => [m.codigo, m.nombre]))
  const porDepartamento = new Map<string, GeometriaProcesada[]>()
  for (const geometria of geometrias) {
    const dpto = geometria.codigo.slice(0, 2)
    porDepartamento.set(dpto, [...(porDepartamento.get(dpto) ?? []), geometria])
  }

  mkdirSync(RUTAS.salidaMunicipios, { recursive: true })
  for (const archivo of readdirSync(RUTAS.salidaMunicipios))
    rmSync(join(RUTAS.salidaMunicipios, archivo))

  return [...porDepartamento.entries()].map(([dpto, lista]) =>
    escribirGeoJson(
      join(RUTAS.salidaMunicipios, `${dpto}.json`),
      coleccion(
        lista.map((g) =>
          feature(g, {
            codigo: g.codigo,
            nombre: nombreDe(nombres, g.codigo),
            dpto,
          })
        )
      )
    )
  )
}

// ---------------------------------------------------------------------------
// Escritura e informe
// ---------------------------------------------------------------------------

function escribirGeoJson(
  ruta: string,
  contenido: FeatureCollection
): ArchivoEscrito {
  return escribirTexto(ruta, `${JSON.stringify(contenido)}\n`)
}

function escribirTexto(ruta: string, contenido: string): ArchivoEscrito {
  mkdirSync(join(ruta, ".."), { recursive: true })
  writeFileSync(ruta, contenido)
  return {
    ruta,
    bytes: Buffer.byteLength(contenido),
    gzip: gzipSync(contenido, { level: 9 }).length,
  }
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

function informar(
  escritos: readonly ArchivoEscrito[],
  advertencias: readonly string[],
  datos: {
    paises: readonly Pais[]
    departamentos: readonly Departamento[]
    municipios: readonly Municipio[]
    geoMunicipios: readonly GeometriaProcesada[]
  }
): void {
  const raiz = join(RUTAS.salidaGeo, "../../..")
  const municipales = escritos.filter((e) =>
    e.ruta.startsWith(RUTAS.salidaMunicipios)
  )
  const otros = escritos.filter(
    (e) => !e.ruta.startsWith(RUTAS.salidaMunicipios)
  )
  const suma = (lista: readonly ArchivoEscrito[], campo: "bytes" | "gzip") =>
    lista.reduce((t, e) => t + e[campo], 0)
  const mayor = municipales.reduce((a, b) => (b.bytes > a.bytes ? b : a))

  console.log("\nArchivos generados")
  for (const e of otros)
    console.log(
      `  ${e.ruta.replace(raiz, "")}  ${kb(e.bytes)} (gzip ${kb(e.gzip)})`
    )
  console.log(
    `  public/data/geo/municipios/*.json  ${municipales.length} archivos, ${kb(suma(municipales, "bytes"))} ` +
      `(gzip ${kb(suma(municipales, "gzip"))}); mayor ${mayor.ruta.slice(-7)} ${kb(mayor.bytes)}`
  )
  console.log(
    `\nConteos: ${datos.paises.length} países (${datos.paises.filter((p) => p.conGeometria).length} con polígono), ` +
      `${datos.departamentos.length} departamentos, ${datos.municipios.length} municipios, ` +
      `${datos.geoMunicipios.length} polígonos municipales`
  )
  if (advertencias.length > 0) {
    console.log(`\nAdvertencias (${advertencias.length})`)
    for (const advertencia of advertencias) console.log(`  - ${advertencia}`)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
