import type {
  Departamento,
  Municipio,
  Pais,
  Posicion,
  TipoMunicipio,
} from "../../../src/lib/geo/tipos"
import { normalizarNombreGeo } from "../../../src/lib/geo/normalizar"
import { METADATOS_DEPARTAMENTOS } from "../datos/departamentos"
import { ALIAS_MUNICIPIOS, GEOMETRIA_SUSTITUTA } from "../datos/municipios"
import {
  ALIAS_EXCLUIDOS,
  ALIAS_PAISES,
  CONTINENTES,
  LOCALES_NOMBRE,
  NOMBRE_PREFERIDO,
  PAISES_ADICIONALES,
  REGION_FALTANTE,
  SUBREGIONES,
} from "../datos/paises"
import {
  codigoMunicipalVigente,
  iso2DeNaturalEarth,
  unirBboxes,
  type GeometriaProcesada,
} from "./capas"
import type { ColeccionFuente, Fuentes, RegistroDivipola } from "./fuentes"
import { aTituloEspanol, parsearDecimalConComa, redondear } from "./texto"

type IndiceGeometrias = ReadonlyMap<string, GeometriaProcesada>

const TIPOS_MUNICIPIO: Readonly<
  Record<RegistroDivipola["tipo_municipio"], TipoMunicipio>
> = {
  Municipio: "MUNICIPIO",
  "Área no municipalizada": "AREA_NO_MUNICIPALIZADA",
  Isla: "ISLA",
}

const ESCRITURA_LATINA = /^[a-z0-9 ]+$/

/** Normaliza, quita duplicados, el propio nombre y variantes en otra escritura; orden estable. */
function normalizarAlias(
  variantes: Iterable<string>,
  nombreNormalizado: string
): string[] {
  const unicos = new Set<string>()
  for (const variante of variantes) {
    const alias = normalizarNombreGeo(variante)
    if (alias && alias !== nombreNormalizado && ESCRITURA_LATINA.test(alias))
      unicos.add(alias)
  }
  return [...unicos].sort()
}

function exigir<T>(valor: T | undefined, mensaje: string): T {
  if (valor === undefined) throw new Error(mensaje)
  return valor
}

// ---------------------------------------------------------------------------
// Municipios
// ---------------------------------------------------------------------------

export function construirMunicipios(
  fuentes: Fuentes,
  geometrias: IndiceGeometrias
): Municipio[] {
  const capitales = new Set(
    Object.values(METADATOS_DEPARTAMENTOS).map((m) => m.capitalCodigo)
  )

  const municipios = fuentes.divipola.map((registro): Municipio => {
    const codigoGeometria =
      GEOMETRIA_SUSTITUTA[registro.cod_mpio] ?? registro.cod_mpio
    const geometria = exigir(
      geometrias.get(codigoGeometria),
      `Sin polígono ${codigoGeometria} para ${registro.cod_mpio}`
    )
    const nombre = aTituloEspanol(registro.nom_mpio)
    return {
      codigo: registro.cod_mpio,
      departamentoCodigo: registro.cod_dpto,
      nombre,
      nombreNormalizado: normalizarNombreGeo(nombre),
      tipo: TIPOS_MUNICIPIO[registro.tipo_municipio],
      esCapital: capitales.has(registro.cod_mpio),
      centroide: [
        redondear(parsearDecimalConComa(registro.longitud), 6),
        redondear(parsearDecimalConComa(registro.latitud), 6),
      ],
      codigoGeometria,
      bbox: geometria.bbox,
    }
  })

  const representados = new Set(municipios.map((m) => m.codigoGeometria))
  const huerfanos = [...geometrias.keys()].filter(
    (codigo) => !representados.has(codigo)
  )
  if (huerfanos.length > 0)
    throw new Error(`Polígonos sin municipio DIVIPOLA: ${huerfanos.join(", ")}`)

  return municipios.sort((a, b) => a.codigo.localeCompare(b.codigo))
}

/**
 * Alias normalizados por municipio: los curados más los nombres del GeoJSON fuente
 * que difieren del oficial ("BARRANCO MINAS", "PAPUNAUA"…). Se descartan los que
 * chocarían con el nombre de otro municipio del mismo departamento.
 */
export function construirAliasMunicipios(
  municipios: readonly Municipio[],
  geoMunicipios: ColeccionFuente,
  advertencias: string[]
): Record<string, string[]> {
  const variantes = new Map<string, string[]>(
    Object.entries(ALIAS_MUNICIPIOS).map(([codigo, alias]) => [
      codigo,
      [...alias],
    ])
  )
  for (const { properties } of geoMunicipios.features) {
    const codigo = codigoMunicipalVigente(String(properties.MPIOS))
    variantes.set(codigo, [
      ...(variantes.get(codigo) ?? []),
      String(properties.NOMBRE_MPI),
    ])
  }

  const nombresPorDepartamento = new Map<string, Set<string>>()
  for (const m of municipios) {
    const nombres =
      nombresPorDepartamento.get(m.departamentoCodigo) ?? new Set<string>()
    nombresPorDepartamento.set(
      m.departamentoCodigo,
      nombres.add(m.nombreNormalizado)
    )
  }

  const resultado: Record<string, string[]> = {}
  for (const municipio of municipios) {
    const nombresVecinos =
      nombresPorDepartamento.get(municipio.departamentoCodigo) ??
      new Set<string>()
    const alias = normalizarAlias(
      variantes.get(municipio.codigo) ?? [],
      municipio.nombreNormalizado
    ).filter((candidato) => {
      const choca = nombresVecinos.has(candidato)
      if (choca)
        advertencias.push(
          `Alias "${candidato}" de ${municipio.codigo} descartado: es otro municipio`
        )
      return !choca
    })
    if (alias.length > 0) resultado[municipio.codigo] = alias
  }
  return resultado
}

// ---------------------------------------------------------------------------
// Departamentos
// ---------------------------------------------------------------------------

export function construirDepartamentos(
  fuentes: Fuentes,
  geometriasDepartamentales: IndiceGeometrias,
  municipios: readonly Municipio[],
  advertencias: string[]
): Departamento[] {
  const nombresDivipola = new Map(
    fuentes.divipola.map((r) => [r.cod_dpto, r.dpto])
  )
  const nombresGeoJson = new Map(
    fuentes.geoDepartamentos.features.map((f) => [
      String(f.properties.DPTO),
      String(f.properties.NOMBRE_DPT),
    ])
  )

  return [...nombresDivipola.keys()].sort().map((codigo): Departamento => {
    const meta = exigir(
      METADATOS_DEPARTAMENTOS[codigo],
      `Faltan metadatos del departamento ${codigo}`
    )
    const nombre = aTituloEspanol(
      exigir(nombresDivipola.get(codigo), `Sin nombre DIVIPOLA ${codigo}`)
    )
    const poblacion = exigir(
      fuentes.poblacion.valores[codigo],
      `Sin población DANE para ${codigo}`
    )
    if (poblacion.nombre !== nombre) {
      advertencias.push(
        `Nombre del departamento ${codigo}: DIVIPOLA "${nombre}" ≠ DANE "${poblacion.nombre}"`
      )
    }
    const nombreCorto = meta.nombreCorto ?? nombre
    const nombreNormalizado = normalizarNombreGeo(nombre)
    const geometria = exigir(
      geometriasDepartamentales.get(codigo),
      `Sin polígono departamental ${codigo}`
    )

    return {
      codigo,
      nombre,
      nombreCorto,
      nombreNormalizado,
      alias: normalizarAlias(
        [
          nombreCorto,
          poblacion.nombre,
          nombresGeoJson.get(codigo) ?? "",
          ...(meta.alias ?? []),
        ],
        nombreNormalizado
      ),
      iso31662: meta.iso31662,
      region: meta.region,
      capitalCodigo: meta.capitalCodigo,
      poblacion: poblacion.poblacion,
      centroide: geometria.puntoInterior,
      bbox: unirBboxes(
        municipios
          .filter((m) => m.departamentoCodigo === codigo)
          .map((m) => m.bbox)
      ),
    }
  })
}

// ---------------------------------------------------------------------------
// Países
// ---------------------------------------------------------------------------

interface BasePais {
  readonly iso2: string
  readonly iso3: string
  readonly numerico: string | null
  readonly nombreIngles: string
  readonly region: string
  readonly subregion: string
}

export interface ResultadoPaises {
  readonly paises: Pais[]
  /** Códigos ADM0_A3 de Natural Earth que no coinciden con el ISO3 del país que representan. */
  readonly adm0AIso2: Record<string, string>
}

export function construirPaises(
  fuentes: Fuentes,
  geometrias: IndiceGeometrias,
  advertencias: string[]
): ResultadoPaises {
  const nombresEs = new Intl.DisplayNames([...LOCALES_NOMBRE], {
    type: "region",
    fallback: "none",
  })
  const nombresEsGeneral = new Intl.DisplayNames(["es"], {
    type: "region",
    fallback: "none",
  })
  const mledoze = new Map(fuentes.paisesMledoze.map((p) => [p.cca2, p]))
  const variantesNaturalEarth = agruparVariantesNaturalEarth(fuentes.geoPaises)

  const bases = [...fuentes.iso3166.map(aBasePais), ...PAISES_ADICIONALES].sort(
    (a, b) => a.iso2.localeCompare(b.iso2)
  )

  const borradores = bases.map((base) => {
    const nombre =
      NOMBRE_PREFERIDO[base.iso2] ??
      exigir(nombresEs.of(base.iso2), `ICU no nombra ${base.iso2}`)
    const externo = mledoze.get(base.iso2)
    const automaticos = [
      base.nombreIngles,
      nombresEsGeneral.of(base.iso2) ?? "",
      nombresEs.of(base.iso2) ?? "",
      ...(externo
        ? [
            externo.nombre.comun,
            externo.nombre.oficial,
            ...externo.alternativos,
          ]
        : []),
      ...(externo?.espanol
        ? [externo.espanol.comun, externo.espanol.oficial]
        : []),
      ...(variantesNaturalEarth.get(base.iso2) ?? []),
    ].filter((variante) => variante.length > 2)
    return {
      base,
      nombre,
      nombreNormalizado: normalizarNombreGeo(nombre),
      automaticos,
      externo,
    }
  })

  const aliasPorPais = depurarAliasPaises(borradores, advertencias)

  const paises = borradores.map(
    ({ base, nombre, nombreNormalizado, externo }): Pais => {
      const geometria = geometrias.get(base.iso2)
      return {
        iso2: base.iso2,
        iso3: base.iso3,
        numerico: base.numerico,
        nombre,
        nombreNormalizado,
        alias: aliasPorPais.get(base.iso2) ?? [],
        continente: exigir(
          CONTINENTES[base.region],
          `Continente desconocido: "${base.region}"`
        ),
        subregion: traducirSubregion(base.subregion),
        conGeometria: geometria !== undefined,
        centroide:
          geometria?.puntoInterior ??
          centroDeMledoze(base.iso2, externo?.latlng),
      }
    }
  )

  const sinPais = [...geometrias.keys()].filter(
    (iso2) => !paises.some((p) => p.iso2 === iso2)
  )
  if (sinPais.length > 0)
    throw new Error(`Polígonos de país sin entrada ISO: ${sinPais.join(", ")}`)

  return { paises, adm0AIso2: mapearAdm0(fuentes.geoPaises, paises) }
}

function aBasePais(registro: Fuentes["iso3166"][number]): BasePais {
  const faltante = REGION_FALTANTE[registro["alpha-2"]]
  return {
    iso2: registro["alpha-2"],
    iso3: registro["alpha-3"],
    numerico: registro["country-code"],
    nombreIngles: registro.name,
    region: faltante?.region ?? registro.region ?? "",
    subregion:
      faltante?.subregion ??
      (registro["intermediate-region"] || registro["sub-region"] || ""),
  }
}

/** UN M49 no asigna subregión a la Antártida: `null`, como en la columna `paises.subregion`. */
function traducirSubregion(subregion: string): string | null {
  if (subregion === "") return null
  return exigir(
    SUBREGIONES[subregion],
    `Subregión sin traducir: "${subregion}"`
  )
}

function centroDeMledoze(
  iso2: string,
  latlng: readonly number[] | undefined
): Posicion {
  if (!latlng || latlng.length < 2)
    throw new Error(`Sin centroide para ${iso2}`)
  return [redondear(latlng[1], 4), redondear(latlng[0], 4)]
}

const CAMPOS_NOMBRE_NATURAL_EARTH = [
  "NAME",
  "NAME_LONG",
  "ADMIN",
  "NAME_EN",
  "NAME_ES",
  "FORMAL_EN",
  "NAME_ALT",
]

function agruparVariantesNaturalEarth(
  geoPaises: ColeccionFuente
): Map<string, string[]> {
  const variantes = new Map<string, string[]>()
  for (const { properties } of geoPaises.features) {
    const iso2 = iso2DeNaturalEarth(properties)
    const nombres = CAMPOS_NOMBRE_NATURAL_EARTH.map(
      (campo) => properties[campo]
    ).filter(
      (valor): valor is string => typeof valor === "string" && valor.length > 0
    )
    variantes.set(iso2, [...(variantes.get(iso2) ?? []), ...nombres])
  }
  return variantes
}

interface BorradorPais {
  readonly base: BasePais
  readonly nombreNormalizado: string
  readonly automaticos: readonly string[]
}

/**
 * Un alias debe identificar un solo país. Los curados mandan (un conflicto entre
 * curados es un error del dato); los automáticos excluidos a mano, los que chocan
 * con el nombre de otro país y los que aparecen en varios países se descartan (estos
 * dos últimos, con advertencia).
 */
function depurarAliasPaises(
  borradores: readonly BorradorPais[],
  advertencias: string[]
): Map<string, string[]> {
  const duenoDeNombre = new Map(
    borradores.map((b) => [b.nombreNormalizado, b.base.iso2])
  )
  const duenoCurado = new Map<string, string>()
  for (const b of borradores) {
    for (const alias of normalizarAlias(
      ALIAS_PAISES[b.base.iso2] ?? [],
      b.nombreNormalizado
    )) {
      const otro = duenoCurado.get(alias) ?? duenoDeNombre.get(alias)
      if (otro && otro !== b.base.iso2)
        throw new Error(
          `Alias curado "${alias}" repetido en ${otro} y ${b.base.iso2}`
        )
      duenoCurado.set(alias, b.base.iso2)
    }
  }

  const excluidos = new Set(ALIAS_EXCLUIDOS.map((a) => normalizarNombreGeo(a)))
  const candidatos = new Map<string, Set<string>>()
  for (const b of borradores) {
    for (const alias of normalizarAlias(b.automaticos, b.nombreNormalizado)) {
      candidatos.set(
        alias,
        (candidatos.get(alias) ?? new Set<string>()).add(b.base.iso2)
      )
    }
  }

  const resultado = new Map<string, string[]>()
  const asignar = (iso2: string, alias: string) =>
    resultado.set(iso2, [...(resultado.get(iso2) ?? []), alias])
  for (const [alias, iso2] of duenoCurado) asignar(iso2, alias)
  for (const [alias, paises] of candidatos) {
    if (duenoCurado.has(alias) || excluidos.has(alias)) continue
    const [unico] = paises
    const propietarioNombre = duenoDeNombre.get(alias)
    if (
      paises.size === 1 &&
      (propietarioNombre === undefined || propietarioNombre === unico)
    ) {
      asignar(unico, alias)
    } else {
      advertencias.push(
        `Alias de país ambiguo descartado: "${alias}" (${[...paises].join(", ")})`
      )
    }
  }
  for (const lista of resultado.values()) lista.sort()
  return resultado
}

function mapearAdm0(
  geoPaises: ColeccionFuente,
  paises: readonly Pais[]
): Record<string, string> {
  const iso3PorIso2 = new Map(paises.map((p) => [p.iso2, p.iso3]))
  const mapa: Record<string, string> = {}
  for (const { properties } of geoPaises.features) {
    const adm0 = String(properties.ADM0_A3)
    const iso2 = iso2DeNaturalEarth(properties)
    if (iso3PorIso2.get(iso2) !== adm0) mapa[adm0] = iso2
  }
  return Object.fromEntries(
    Object.entries(mapa).sort(([a], [b]) => a.localeCompare(b))
  )
}
