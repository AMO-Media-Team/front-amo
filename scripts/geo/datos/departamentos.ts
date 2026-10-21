import type { RegionNatural } from "../../../src/lib/geo/tipos"

export interface MetadatosDepartamento {
  readonly iso31662: string
  readonly region: RegionNatural
  readonly capitalCodigo: string
  /** Solo cuando difiere del nombre oficial. */
  readonly nombreCorto?: string
  /** Variantes de uso común (se normalizan en el build). */
  readonly alias?: readonly string[]
}

/**
 * Datos curados por departamento. Región natural según la clasificación de uso
 * común (IGAC/DANE) por región predominante; ISO 3166-2:CO vigente.
 */
export const METADATOS_DEPARTAMENTOS: Readonly<
  Record<string, MetadatosDepartamento>
> = {
  "05": { iso31662: "CO-ANT", region: "Andina", capitalCodigo: "05001" },
  "08": { iso31662: "CO-ATL", region: "Caribe", capitalCodigo: "08001" },
  "11": {
    iso31662: "CO-DC",
    region: "Andina",
    capitalCodigo: "11001",
    nombreCorto: "Bogotá",
    alias: [
      "Bogotá D.C.",
      "Distrito Capital",
      "Santafé de Bogotá",
      "Santa Fe de Bogotá",
      "Capital District",
    ],
  },
  "13": { iso31662: "CO-BOL", region: "Caribe", capitalCodigo: "13001" },
  "15": { iso31662: "CO-BOY", region: "Andina", capitalCodigo: "15001" },
  "17": { iso31662: "CO-CAL", region: "Andina", capitalCodigo: "17001" },
  "18": { iso31662: "CO-CAQ", region: "Amazonía", capitalCodigo: "18001" },
  "19": { iso31662: "CO-CAU", region: "Pacífica", capitalCodigo: "19001" },
  "20": { iso31662: "CO-CES", region: "Caribe", capitalCodigo: "20001" },
  "23": { iso31662: "CO-COR", region: "Caribe", capitalCodigo: "23001" },
  // La gobernación de Cundinamarca tiene sede en Bogotá, que es un distrito aparte (código 11).
  "25": { iso31662: "CO-CUN", region: "Andina", capitalCodigo: "11001" },
  "27": { iso31662: "CO-CHO", region: "Pacífica", capitalCodigo: "27001" },
  "41": { iso31662: "CO-HUI", region: "Andina", capitalCodigo: "41001" },
  "44": {
    iso31662: "CO-LAG",
    region: "Caribe",
    capitalCodigo: "44001",
    alias: ["Guajira"],
  },
  "47": { iso31662: "CO-MAG", region: "Caribe", capitalCodigo: "47001" },
  "50": { iso31662: "CO-MET", region: "Orinoquía", capitalCodigo: "50001" },
  "52": { iso31662: "CO-NAR", region: "Pacífica", capitalCodigo: "52001" },
  "54": {
    iso31662: "CO-NSA",
    region: "Andina",
    capitalCodigo: "54001",
    alias: ["N. de Santander", "Nte. de Santander", "Norte Santander"],
  },
  "63": { iso31662: "CO-QUI", region: "Andina", capitalCodigo: "63001" },
  "66": { iso31662: "CO-RIS", region: "Andina", capitalCodigo: "66001" },
  "68": { iso31662: "CO-SAN", region: "Andina", capitalCodigo: "68001" },
  "70": { iso31662: "CO-SUC", region: "Caribe", capitalCodigo: "70001" },
  "73": { iso31662: "CO-TOL", region: "Andina", capitalCodigo: "73001" },
  "76": {
    iso31662: "CO-VAC",
    region: "Pacífica",
    capitalCodigo: "76001",
    alias: ["Valle"],
  },
  "81": { iso31662: "CO-ARA", region: "Orinoquía", capitalCodigo: "81001" },
  "85": { iso31662: "CO-CAS", region: "Orinoquía", capitalCodigo: "85001" },
  "86": { iso31662: "CO-PUT", region: "Amazonía", capitalCodigo: "86001" },
  "88": {
    iso31662: "CO-SAP",
    region: "Insular",
    capitalCodigo: "88001",
    nombreCorto: "San Andrés",
    alias: [
      "San Andrés y Providencia",
      "San Andrés, Providencia y Santa Catalina",
      "Archipiélago de San Andrés",
      "San Andrés Islas",
    ],
  },
  "91": { iso31662: "CO-AMA", region: "Amazonía", capitalCodigo: "91001" },
  "94": { iso31662: "CO-GUA", region: "Amazonía", capitalCodigo: "94001" },
  "95": { iso31662: "CO-GUV", region: "Amazonía", capitalCodigo: "95001" },
  "97": { iso31662: "CO-VAU", region: "Amazonía", capitalCodigo: "97001" },
  "99": { iso31662: "CO-VID", region: "Orinoquía", capitalCodigo: "99001" },
}
