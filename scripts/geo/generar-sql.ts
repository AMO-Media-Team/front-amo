import type { Departamento, Municipio, Pais } from "../../src/lib/geo/tipos"

type ValorSql =
  string | number | boolean | null | readonly string[] | readonly number[]

interface TablaSql {
  readonly nombre: string
  readonly clave: string
  readonly columnas: readonly string[]
  readonly filas: readonly (readonly ValorSql[])[]
}

export interface DatosSemillaGeo {
  readonly paises: readonly Pais[]
  readonly departamentos: readonly Departamento[]
  readonly municipios: readonly Municipio[]
}

/**
 * Semilla idempotente de las tablas geo (`insert … on conflict do update`).
 * Las columnas deben coincidir con la migración `geo`; ver docs/geodatos.md.
 */
export function generarSqlGeo({
  paises,
  departamentos,
  municipios,
}: DatosSemillaGeo): string {
  const tablas: TablaSql[] = [
    {
      nombre: "public.paises",
      clave: "iso2",
      columnas: [
        "iso2",
        "iso3",
        "numerico",
        "nombre",
        "nombre_normalizado",
        "alias",
        "continente",
        "subregion",
        "con_geometria",
        "lon",
        "lat",
      ],
      filas: paises.map((p) => [
        p.iso2,
        p.iso3,
        p.numerico,
        p.nombre,
        p.nombreNormalizado,
        p.alias,
        p.continente,
        p.subregion,
        p.conGeometria,
        ...p.centroide,
      ]),
    },
    {
      nombre: "public.departamentos",
      clave: "codigo",
      columnas: [
        "codigo",
        "nombre",
        "nombre_corto",
        "nombre_normalizado",
        "alias",
        "iso_3166_2",
        "region",
        "capital_codigo",
        "poblacion",
        "lon",
        "lat",
        "bbox",
      ],
      filas: departamentos.map((d) => [
        d.codigo,
        d.nombre,
        d.nombreCorto,
        d.nombreNormalizado,
        d.alias,
        d.iso31662,
        d.region,
        d.capitalCodigo,
        d.poblacion,
        ...d.centroide,
        d.bbox,
      ]),
    },
    {
      nombre: "public.municipios",
      clave: "codigo",
      columnas: [
        "codigo",
        "departamento_codigo",
        "nombre",
        "nombre_normalizado",
        "tipo",
        "es_capital",
        "lon",
        "lat",
        "codigo_geometria",
        "bbox",
      ],
      filas: municipios.map((m) => [
        m.codigo,
        m.departamentoCodigo,
        m.nombre,
        m.nombreNormalizado,
        m.tipo,
        m.esCapital,
        ...m.centroide,
        m.codigoGeometria,
        m.bbox,
      ]),
    },
  ]

  return [
    "-- Generado por scripts/geo/generar-sql.ts (pnpm geo:build) — no editar.",
    "-- Fuentes: DIVIPOLA (DANE), ISO 3166-1, proyecciones de población DANE. Ver docs/geodatos.md.",
    "begin;",
    "",
    "-- departamentos.capital_codigo puede apuntar a un municipio que se inserta después.",
    "set constraints all deferred;",
    "",
    ...tablas.map(insertarTabla),
    "commit;",
    "",
  ].join("\n")
}

function insertarTabla({ nombre, clave, columnas, filas }: TablaSql): string {
  const actualizaciones = columnas
    .filter((columna) => columna !== clave)
    .map((columna) => `  ${columna} = excluded.${columna}`)
    .join(",\n")
  return [
    `insert into ${nombre} (${columnas.join(", ")}) values`,
    filas.map((fila) => `  (${fila.map(literalSql).join(", ")})`).join(",\n"),
    `on conflict (${clave}) do update set`,
    `${actualizaciones};`,
    "",
  ].join("\n")
}

function literalSql(valor: ValorSql): string {
  if (valor === null) return "null"
  if (typeof valor === "boolean") return valor ? "true" : "false"
  if (typeof valor === "number") return formatearNumero(valor)
  if (typeof valor === "string") return textoSql(valor)
  if (valor.length === 0) return "'{}'"
  const esNumerico = typeof valor[0] === "number"
  const elementos = valor.map((elemento) =>
    typeof elemento === "number"
      ? formatearNumero(elemento)
      : textoSql(elemento)
  )
  return `array[${elementos.join(", ")}]::${esNumerico ? "numeric" : "text"}[]`
}

function formatearNumero(valor: number): string {
  if (!Number.isFinite(valor))
    throw new Error(`Número no finito en la semilla: ${valor}`)
  return String(valor)
}

function textoSql(texto: string): string {
  return `'${texto.replace(/'/g, "''")}'`
}
