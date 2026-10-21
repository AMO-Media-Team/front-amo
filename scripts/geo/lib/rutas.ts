import { fileURLToPath } from "node:url"

const raiz = (relativa: string) =>
  fileURLToPath(new URL(`../../../${relativa}`, import.meta.url))

export const RUTAS = {
  fuentes: raiz("scripts/geo/fuentes"),
  salidaGeo: raiz("public/data/geo"),
  salidaMunicipios: raiz("public/data/geo/municipios"),
  diccionarios: raiz("src/lib/geo/diccionarios"),
  svgDepartamentos: raiz("src/lib/geo/svg-departamentos.ts"),
  semillaSql: raiz("supabase/seed/geo.sql"),
} as const

export const ARCHIVOS_FUENTE = {
  divipola: "divipola.json",
  iso3166: "iso3166-1.json",
  paisesMledoze: "paises-mledoze.json",
  poblacion: "poblacion-departamentos.json",
  geoPaises: "internacional.geojson",
  geoDepartamentos: "colombia-departamentos.geojson",
  geoMunicipios: "colombia-municipios.geojson",
} as const
