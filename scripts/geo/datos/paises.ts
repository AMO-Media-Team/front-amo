import type { Continente } from "../../../src/lib/geo/tipos"

/** Idiomas para `Intl.DisplayNames`: español latinoamericano ("Costa de Marfil", "Arabia Saudita"). */
export const LOCALES_NOMBRE = ["es-419", "es"] as const

/** Nombres que ICU presenta con un rótulo administrativo poco natural en la interfaz. */
export const NOMBRE_PREFERIDO: Readonly<Record<string, string>> = {
  BA: "Bosnia y Herzegovina",
  HK: "Hong Kong",
  MM: "Myanmar",
  MO: "Macao",
  PS: "Palestina",
}

export const CONTINENTES: Readonly<Record<string, Continente>> = {
  Africa: "África",
  Americas: "América",
  Asia: "Asia",
  Europe: "Europa",
  Oceania: "Oceanía",
  "": "Antártida",
}

/** Subregiones UN M49 (se usa la región intermedia cuando existe: Caribe, Sudamérica…). */
export const SUBREGIONES: Readonly<Record<string, string>> = {
  "Australia and New Zealand": "Australia y Nueva Zelanda",
  Caribbean: "Caribe",
  "Central America": "Centroamérica",
  "Central Asia": "Asia central",
  "Eastern Africa": "África oriental",
  "Eastern Asia": "Asia oriental",
  "Eastern Europe": "Europa oriental",
  Melanesia: "Melanesia",
  Micronesia: "Micronesia",
  "Middle Africa": "África central",
  "Northern Africa": "África septentrional",
  "Northern America": "América del Norte",
  "Northern Europe": "Europa septentrional",
  Polynesia: "Polinesia",
  "South America": "América del Sur",
  "South-eastern Asia": "Sudeste asiático",
  "Southern Africa": "África austral",
  "Southern Asia": "Asia meridional",
  "Southern Europe": "Europa meridional",
  "Western Africa": "África occidental",
  "Western Asia": "Asia occidental",
  "Western Europe": "Europa occidental",
}

/** El snapshot ISO deja sin región a Taiwán; se usa la de su entorno geográfico. */
export const REGION_FALTANTE: Readonly<
  Record<string, { region: string; subregion: string }>
> = {
  TW: { region: "Asia", subregion: "Eastern Asia" },
}

/**
 * Kosovo no tiene código ISO 3166-1 oficial, pero `XK` es de uso generalizado
 * (UE, Vercel `x-vercel-ip-country`, Natural Earth) y el mapa lo dibuja.
 */
export const PAISES_ADICIONALES = [
  {
    iso2: "XK",
    iso3: "XKX",
    numerico: null,
    nombreIngles: "Kosovo",
    region: "Europe",
    subregion: "Southern Europe",
  },
] as const

/**
 * Unidades de Natural Earth sin ISO propio que se fusionan con el país que las
 * reconoce ISO (evita huecos en el mapa y datos sin país).
 */
export const FUSIONES_NATURAL_EARTH: Readonly<Record<string, string>> = {
  CYN: "CY", // Chipre del Norte → Chipre.
  SOL: "SO", // Somalilandia → Somalia.
  KOS: "XK",
}

export interface TerritorioSeparado {
  readonly iso2: string
  /** [oeste, sur, este, norte] que contiene las partes del territorio. */
  readonly envolvente: readonly [number, number, number, number]
}

/**
 * Territorios que Natural Earth dibuja dentro del polígono de su metrópoli pero que
 * ISO 3166-1 (y `x-vercel-ip-country`) tratan como país aparte: sin separarlos, los
 * datos de Francia pintarían la Guayana Francesa y los de "GF" no pintarían nada.
 */
export const TERRITORIOS_SEPARADOS: Readonly<
  Record<string, readonly TerritorioSeparado[]>
> = {
  FRA: [{ iso2: "GF", envolvente: [-55, 1, -51, 6.5] }],
  NOR: [{ iso2: "SJ", envolvente: [0, 74, 40, 82] }], // Svalbard.
}

/**
 * Variantes automáticas (mledoze, ICU) que en el uso común nombran a más de un
 * territorio: "Islas Vírgenes" (británicas o de EE. UU.), "Guayana" (Guyana o la
 * Guayana Francesa). No se usan como alias para no adivinar.
 */
export const ALIAS_EXCLUIDOS: readonly string[] = [
  "Islas Vírgenes",
  "Virgin Islands",
  "Guayana",
  "Guiana",
]

/** Variantes de uso frecuente en datos importados y en lo que escriben los usuarios. */
export const ALIAS_PAISES: Readonly<Record<string, readonly string[]>> = {
  AE: ["Emiratos", "Emiratos Árabes", "EAU", "UAE"],
  BO: ["Estado Plurinacional de Bolivia"],
  CD: [
    "RD Congo",
    "RDC",
    "Congo-Kinshasa",
    "Congo Kinshasa",
    "República Democrática del Congo",
  ],
  CG: ["Congo-Brazzaville", "Congo Brazzaville", "República del Congo"],
  CI: ["Costa de Marfil", "Ivory Coast"],
  CN: ["República Popular China"],
  CZ: ["República Checa", "Chequia", "Czech Republic"],
  DE: ["Deutschland"],
  FK: ["Malvinas"],
  GB: [
    "Reino Unido",
    "Inglaterra",
    "Gran Bretaña",
    "UK",
    "Escocia",
    "Gales",
    "Irlanda del Norte",
    "England",
    "Scotland",
    "Wales",
    "Great Britain",
  ],
  IR: ["Persia"],
  KP: ["Corea del Norte", "North Korea"],
  KR: ["Corea del Sur", "Corea", "República de Corea", "South Korea"],
  MK: ["Macedonia"],
  MM: ["Birmania", "Burma"],
  NL: ["Holanda", "Países Bajos", "Holland"],
  NZ: ["Nueva Zelandia"],
  RU: ["Federación Rusa", "Federación de Rusia"],
  SA: ["Arabia Saudí", "Arabia Saudita"],
  SZ: ["Suazilandia", "Swaziland"],
  TL: ["Timor Oriental", "East Timor"],
  TR: ["Türkiye", "Turquía"],
  TW: ["Taipéi Chino", "Taipei Chino", "República de China"],
  US: [
    "EE. UU.",
    "EE.UU.",
    "EEUU",
    "EUA",
    "USA",
    "Estados Unidos de América",
    "Estados Unidos de Norteamérica",
    "United States of America",
  ],
  VA: ["Vaticano", "Santa Sede", "Holy See"],
  VE: ["República Bolivariana de Venezuela"],
}
