/**
 * Territorio activo (DANE/DIVIPOLA) para elegir ubicación o segmentar. Solo
 * lo activo: la BD rechaza municipios o departamentos inactivos al registrar
 * medios y anunciantes o al segmentar ofertas (`AMO_CONFIG_INVALIDA`).
 */

export interface DepartamentoActivo {
  /** Código DANE de dos dígitos («05»). */
  codigo: string
  /** Nombre oficial («Bogotá, D.C.»). */
  nombre: string
  /** Nombre para la interfaz («Bogotá», «San Andrés»). */
  nombreCorto: string
  region: string
}

export interface MunicipioActivo {
  /** Código DIVIPOLA de cinco dígitos («05001»); sus dos primeros son el departamento. */
  codigo: string
  nombre: string
  departamentoCodigo: string
  esCapital: boolean
}

/** Segmentación geográfica de una oferta. Vacía = todo el país. */
export interface Segmentacion {
  departamentos: readonly string[]
  municipios: readonly string[]
}
