/**
 * Contrato de datos del explorador geográfico, compartido por el Route
 * Handler, los proveedores (Supabase y simulado) y el cliente.
 */
import type { ZonaMundo } from "@/components/maps/mapa-mundi"

import type { MetricaGeo, NivelGeo } from "./metricas"
import type { GranularidadSerie } from "./serie"

export interface ConsultaMapaGeo {
  readonly nivel: NivelGeo
  readonly metrica: MetricaGeo
  /** 'YYYY-MM-DD' inclusivo, hora de Bogotá. */
  readonly desde: string
  readonly hasta: string
  /** Código DANE; obligatorio en el nivel departamental. */
  readonly departamento: string | null
}

export interface ConsultaDetalleGeo extends ConsultaMapaGeo {
  /** ISO2 (internacional), DANE de 2 dígitos (nacional) o DIVIPOLA (departamental). */
  readonly zona: string
  /** Métricas de las tarjetas del detalle (las del nivel que el usuario puede ver). */
  readonly metricasKpi: readonly MetricaGeo[]
  /** Incluir los medios destacados de la zona (requiere `medios.ver` y `asignaciones.ver`). */
  readonly conMedios: boolean
}

/** Una fila de `geo_metricas` (docs/modelo-datos.md §5.9) en camelCase. */
export interface FilaMetricaGeo {
  readonly codigo: string
  /** Polígono que la dibuja (municipios sin polígono propio comparten el de otro). */
  readonly codigoGeometria: string
  readonly nombre: string
  /** `null`: sin dato o muestra insuficiente (tasas con n < mínimo). */
  readonly valor: number | null
  readonly n: number | null
  readonly poblacion: number | null
  readonly valorPor100k: number | null
}

/** Celda del mapa de calor (coordenadas reales agregadas): [longitud, latitud, peso]. */
export type PuntoGeo = readonly [lon: number, lat: number, peso: number]

/** Zona sin polígono en el GeoJSON (microestados, islas): se dibuja como círculo. */
export interface CentroZona {
  readonly codigo: string
  readonly centro: readonly [lon: number, lat: number]
}

export type OrigenDatosGeo = "base-de-datos" | "simulado"

export interface RespuestaMapaGeo {
  readonly consulta: ConsultaMapaGeo
  readonly filas: readonly FilaMetricaGeo[]
  /** Zonas con fila pero sin polígono propio (solo países). */
  readonly sinPoligono: readonly CentroZona[]
  readonly origen: OrigenDatosGeo
}

/**
 * Modo calor (`?vista=puntos`), solo para métricas con coordenadas reales
 * (accesos, medios). Se pide aparte y solo al activarlo: el mapa coroplético
 * no espera la lectura de coordenadas.
 */
export interface RespuestaPuntosGeo {
  readonly consulta: ConsultaMapaGeo
  /** Celdas agregadas (nunca coordenadas individuales). */
  readonly puntos: readonly PuntoGeo[]
  /** Registros con coordenadas en el periodo. */
  readonly total: number
  /** Registros leídos; menor que `total` si la lectura se muestreó. */
  readonly muestra: number
  /** Lado de la celda de agregación, en grados. */
  readonly pasoGrados: number
  readonly origen: OrigenDatosGeo
}

export interface KpiZona {
  readonly metrica: MetricaGeo
  readonly valor: number | null
  readonly n: number | null
  /**
   * Valor del periodo anterior de igual duración; `null` sin comparativo
   * (fotos actuales, tasas con muestra insuficiente).
   */
  readonly anterior: number | null
  /** (valor − anterior) / anterior; `null` si el anterior es 0 o no existe. */
  readonly variacion: number | null
}

export interface PuntoSerieZona {
  /** Días inclusivos de la cubeta ('YYYY-MM-DD'). */
  readonly desde: string
  readonly hasta: string
  /** `null`: muestra insuficiente (tasas con n < mínimo). */
  readonly valor: number | null
  /** La cubeta no cubre su semana o su mes completos. */
  readonly parcial: boolean
}

export interface SerieZona {
  readonly granularidad: GranularidadSerie
  readonly puntos: readonly PuntoSerieZona[]
}

/** Por qué el detalle no trae evolución. */
export type MotivoSinSerie =
  /** La métrica es una foto actual sin dimensión temporal (audiencia). */
  | "foto-actual"
  /** Ninguna cubeta tiene valor (sin movimiento o muestra insuficiente). */
  | "sin-datos"
  /** La consulta falló; el resto del detalle sí llegó. */
  | "fallo"

export interface FilaTopZona {
  readonly codigo: string | null
  readonly nombre: string
  readonly valor: number | null
  /** Contexto corto (municipio de un medio, tasa de cumplimiento…). */
  readonly detalle: string | null
}

export interface TopZona {
  readonly titulo: string
  /** Aclaración del criterio ("con entrega en el periodo"). */
  readonly descripcion?: string
  readonly metrica: MetricaGeo
  readonly filas: readonly FilaTopZona[]
}

export interface RespuestaDetalleGeo {
  readonly consulta: ConsultaDetalleGeo
  readonly kpis: readonly KpiZona[]
  /** Evolución de la métrica en el periodo. */
  readonly serie: SerieZona | null
  /** Motivo cuando `serie` es `null`. */
  readonly sinSerie: MotivoSinSerie | null
  /** Subzonas con mayor valor (departamentos de Colombia, municipios de un departamento). */
  readonly top: TopZona | null
  /** Medios con más GMV comprometido en la zona (solo si `conMedios`). */
  readonly medios: TopZona | null
  readonly origen: OrigenDatosGeo
}

/**
 * Fuente de datos del explorador. Dos implementaciones: Supabase (RPC
 * `geo_metricas` y `detalle_zona_geo`, y lecturas con la RLS del usuario;
 * producción) y simulada (determinista, solo desarrollo y pruebas).
 */
export interface ProveedorMetricasGeo {
  mapa(consulta: ConsultaMapaGeo): Promise<RespuestaMapaGeo>
  puntos(consulta: ConsultaMapaGeo): Promise<RespuestaPuntosGeo>
  detalle(consulta: ConsultaDetalleGeo): Promise<RespuestaDetalleGeo>
}

export type MotivoErrorGeo =
  "no-disponible" | "no-autorizado" | "consulta-invalida" | "fallo"

/** Error esperado de un proveedor; el Route Handler lo traduce a un estado HTTP. */
export class ErrorDatosGeo extends Error {
  constructor(
    readonly motivo: MotivoErrorGeo,
    mensaje: string
  ) {
    super(mensaje)
    this.name = "ErrorDatosGeo"
  }
}

/** Cuerpo de error de `GET /api/geo/metricas`. */
export interface ErrorApiGeo {
  readonly error: {
    readonly motivo: MotivoErrorGeo | "sin-sesion"
    readonly mensaje: string
    /** Sugerencia para desarrollo (nunca en producción). */
    readonly pista?: string
  }
}

/** Ingresos exitosos del periodo por ubicación (mapa de la página de Accesos). */
export interface IngresosPorUbicacion {
  readonly paises: readonly ZonaMundo[]
  /** Por código DANE; los departamentos sin ingresos valen 0. */
  readonly departamentos: Readonly<Record<string, number>>
  /** Ingresos exitosos con país conocido. */
  readonly total: number
  /** Cifras estimadas a partir de una muestra (solo por la vía de la tabla). */
  readonly estimado: boolean
}
