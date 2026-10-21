/** Coordenada geográfica WGS84 en el orden de GeoJSON y Mapbox: [longitud, latitud]. */
export type Posicion = readonly [lon: number, lat: number]

/** Rectángulo envolvente en el orden de GeoJSON y `fitBounds`: [oeste, sur, este, norte]. */
export type Bbox = readonly [
  oeste: number,
  sur: number,
  este: number,
  norte: number,
]

export type Continente =
  "América" | "Europa" | "Asia" | "África" | "Oceanía" | "Antártida"

export type RegionNatural =
  "Andina" | "Caribe" | "Pacífica" | "Orinoquía" | "Amazonía" | "Insular"

export type TipoMunicipio = "MUNICIPIO" | "AREA_NO_MUNICIPALIZADA" | "ISLA"

export interface Pais {
  /** ISO 3166-1 alfa-2 (incluye `XK`, Kosovo, código de uso generalizado no oficial). */
  readonly iso2: string
  readonly iso3: string
  /** ISO 3166-1 numérico de tres dígitos; `null` si no existe (Kosovo). */
  readonly numerico: string | null
  /** Nombre en español de Latinoamérica. */
  readonly nombre: string
  readonly nombreNormalizado: string
  /** Variantes ya normalizadas con `normalizarNombreGeo` (inglés, oficiales, comunes). */
  readonly alias: readonly string[]
  readonly continente: Continente
  /** Subregión UN M49 en español; `null` para la Antártida. */
  readonly subregion: string | null
  /** `true` si el país tiene polígono en `public/data/geo/paises.json`. */
  readonly conGeometria: boolean
  /** Punto interior del polígono o, sin geometría, centro aproximado del territorio. */
  readonly centroide: Posicion
}

export interface Departamento {
  /** Código DANE de dos dígitos (DIVIPOLA). */
  readonly codigo: string
  readonly nombre: string
  readonly nombreCorto: string
  readonly nombreNormalizado: string
  /** Variantes ya normalizadas con `normalizarNombreGeo`. */
  readonly alias: readonly string[]
  /** Código ISO 3166-2:CO, p. ej. `CO-ANT`. */
  readonly iso31662: string
  readonly region: RegionNatural
  /** Código DIVIPOLA del municipio capital (Cundinamarca → Bogotá, `11001`). */
  readonly capitalCodigo: string
  /** Proyección DANE de población total (año en `ANIO_POBLACION`). */
  readonly poblacion: number
  /** Punto interior del polígono departamental (posición de etiqueta). */
  readonly centroide: Posicion
  /** Envolvente de sus municipios, lista para `fitBounds`. */
  readonly bbox: Bbox
}

export interface Municipio {
  /** Código DIVIPOLA de cinco dígitos. */
  readonly codigo: string
  readonly departamentoCodigo: string
  readonly nombre: string
  readonly nombreNormalizado: string
  readonly tipo: TipoMunicipio
  /** Capital departamental. */
  readonly esCapital: boolean
  /** Coordenada de la cabecera municipal según DIVIPOLA. */
  readonly centroide: Posicion
  /** Código del polígono que lo representa en `municipios/{DPTO}.json`. */
  readonly codigoGeometria: string
  /** Envolvente del polígono `codigoGeometria`. */
  readonly bbox: Bbox
}
