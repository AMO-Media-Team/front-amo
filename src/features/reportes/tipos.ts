/**
 * Conjuntos de datos de cada reporte (serializables: viajan del servidor a la
 * página y, en la exportación, de la Server Action al navegador) y la vista
 * común que de ellos se deriva. Las filas ya vienen normalizadas: números
 * finitos o `null`, fechas como texto ISO.
 */
import type { CeldaActividad } from "@/components/charts/datos"
import type { FilaKpi } from "@/components/kpi/tipos"
import type {
  ConfigInsights,
  Insight,
  Plataforma,
} from "@/features/dashboard/insights/tipos"
import type { ColumnaExcel, HojaExcel, ValorCelda } from "@/lib/export/excel"
import type { FiltroDocumento } from "@/lib/export/marca"
import type { ColumnaPdf } from "@/lib/export/pdf"
import type { Database } from "@/types/database.types"

import type { SlugReporte } from "./catalogo"
import type { Agrupacion } from "./filtros"
import type { EspecGrafico } from "./graficos"
import type { IndicadorReporte } from "./indicadores"

export type EstadoPerfil = Database["public"]["Enums"]["perfil_estado"]

/** Lo que todo reporte sabe de su consulta. */
export interface ContextoDatos {
  /** Filtros en palabras (portada, resumen bajo el encabezado). */
  filtros: FiltroDocumento[]
  /** "frente al mes anterior (1–31 ago 2026)"; `null` sin comparativo. */
  comparacion: string | null
  /** `analitica.n_minimo_tasas`. */
  nMinimo: number
  /** Periodo consultado ('YYYY-MM-DD'), para enlaces que lo conservan. */
  periodo: { desde: string; hasta: string } | null
}

export interface NotaDefinicion {
  termino: string
  explicacion: string
}

// ── Resumen ejecutivo ────────────────────────────────────────────────────────

export interface PuntoSerieGmv {
  periodo: string
  gmvComprometido: number
  gmvVerificado: number
  comision: number
  negocios: number
}

export interface FilaMezcla {
  plataforma: Plataforma
  formatoClave: string
  formatoNombre: string
  asignaciones: number
  gmv: number
  alcance: number
  participacion: number | null
  cpm: number | null
}

export interface FilaZona {
  codigo: string
  nombre: string
  valor: number
  valorAnterior: number | null
  participacion: number | null
  variacion: number | null
}

export interface DatosResumen {
  contexto: ContextoDatos
  /** Umbrales de analítica de la configuración (los mismos del panel de Inicio). */
  config: ConfigInsights
  kpis: FilaKpi[]
  granularidad: "dia" | "semana" | "mes"
  serie: PuntoSerieGmv[]
  serieAnterior: PuntoSerieGmv[]
  mezcla: FilaMezcla[]
  /**
   * GMV comprometido de cada departamento en el periodo y en el de
   * comparación del reporte (`zonasComparadas`). `null`: sin
   * `analitica.global` (el ranking por departamento no se ofrece).
   */
  zonas: FilaZona[] | null
}

// ── Cobertura territorial ────────────────────────────────────────────────────

export interface FilaCobertura {
  /** DANE del departamento o DIVIPOLA del municipio. */
  codigo: string
  departamentoCodigo: string
  departamento: string
  municipio: string | null
  poblacion: number | null
  medios: number
  mediosActivos: number
  mediosPor100k: number | null
  asignaciones: number
  gmv: number
  alcance: number
  /** GMV comprometido del periodo anterior (comparativo por zona). */
  gmvAnterior: number | null
}

export interface TotalesCobertura {
  medios: number
  mediosActivos: number
  asignaciones: number
  gmv: number
  alcance: number
  poblacion: number
  zonasConMedios: number
  zonas: number
}

export interface DatosCobertura {
  contexto: ContextoDatos
  nivel: "departamento" | "municipio"
  departamento: string | null
  filas: FilaCobertura[]
  /** Todos los departamentos (para el mapa nacional). */
  departamentos: FilaCobertura[]
  totales: TotalesCobertura
  anterior: TotalesCobertura
  /** Municipios con más medios del país (`top_zonas`); `null` sin permiso o con departamento. */
  topMunicipios: FilaZona[] | null
}

// ── Usuarios y accesos ───────────────────────────────────────────────────────

export interface FilaUsuarioAcceso {
  id: string
  nombre: string | null
  email: string
  rol: string | null
  estado: EstadoPerfil
  ultimoAccesoAt: string | null
  exitosos: number
  fallidos: number
  paises: number
  sospechosos: number
  mfaActivo: boolean
}

export interface TotalesAccesos {
  usuariosConIngreso: number
  exitosos: number
  fallidos: number
  sospechosos: number
  activosSinMfa: number
  activosSinIngreso: number
  activos: number
}

export interface DatosUsuariosAccesos {
  contexto: ContextoDatos
  filas: FilaUsuarioAcceso[]
  totales: TotalesAccesos
  anterior: TotalesAccesos
  actividad: CeldaActividad[]
}

// ── Desempeño de campañas ────────────────────────────────────────────────────

export interface FilaCampana {
  id: string
  campana: string
  anunciante: string | null
  ofertas: number
  cupos: number
  cuposOcupados: number
  tasaLlenado: number | null
  gmvComprometido: number
  gmvVerificado: number
  alcance: number
  impresiones: number
  interacciones: number
  reproducciones: number
  clics: number
  cpm: number | null
  costoPorInteraccion: number | null
  engagement: number | null
  costoPorAlcance: number | null
  tasaCumplimiento: number | null
  nVerificadas: number
}

export interface TotalesDesempeno {
  campanas: number
  gmvComprometido: number
  gmvVerificado: number
  alcance: number
  impresiones: number
  interacciones: number
  /** Cocientes de sumas reconstruidos desde las razones por campaña. */
  cpm: number | null
  engagement: number | null
  costoPorAlcance: number | null
  verificadas: number
}

export interface FilaPlataforma {
  plataforma: string
  nombre: string
  asignaciones: number
  gmv: number
  alcance: number
  impresiones: number
  cpm: number | null
  engagement: number | null
  n: number
}

export interface DatosDesempeno {
  contexto: ContextoDatos
  /**
   * Los datos son de un solo anunciante (el propio o el del filtro): sus
   * razones son cifras exactas y se informan siempre, con su n
   * (docs/kpis.md §0.4).
   */
  unAnunciante: boolean
  filas: FilaCampana[]
  totales: TotalesDesempeno
  anterior: TotalesDesempeno
  /** Corte por plataforma; `null` cuando un filtro de anunciante no se puede aplicar. */
  porPlataforma: FilaPlataforma[] | null
}

// ── Cumplimiento de medios ───────────────────────────────────────────────────

export interface FilaCumplimiento {
  id: string
  medio: string
  departamento: string | null
  municipio: string | null
  nivel: number | null
  comprometidas: number
  cumplidas: number
  vencidas: number
  canceladas: number
  enDisputa: number
  tasa: number | null
  alertas: number
  multiplicador: number | null
}

export interface TotalesCumplimiento {
  medios: number
  comprometidas: number
  cumplidas: number
  vencidas: number
  enDisputa: number
  alertas: number
}

export interface DatosCumplimiento {
  contexto: ContextoDatos
  departamento: string | null
  filas: FilaCumplimiento[]
  totales: TotalesCumplimiento
  anterior: TotalesCumplimiento
}

// ── Finanzas ─────────────────────────────────────────────────────────────────

export interface FilaFinanzas {
  id: string
  grupo: string
  gmvComprometido: number
  gmvVerificado: number
  comision: number
  takeRate: number | null
  pagadoMedios: number
  facturado: number
  recaudado: number
  cartera: number
}

export type TotalesFinanzas = Omit<FilaFinanzas, "id" | "grupo">

export interface DatosFinanzas {
  contexto: ContextoDatos
  agrupacion: Agrupacion
  /** Sector filtrado (nombre); `null` sin filtro. */
  sector: string | null
  /** Filas de la tabla según la agrupación elegida. */
  filas: FilaFinanzas[]
  porMes: FilaFinanzas[]
  porSector: FilaFinanzas[]
  porAnunciante: FilaFinanzas[]
  totales: TotalesFinanzas
  anterior: TotalesFinanzas
}

// ── Cartera ──────────────────────────────────────────────────────────────────

export interface FilaCartera {
  id: string
  anunciante: string
  facturado: number
  pagado: number
  saldo: number
  saldo0a30: number
  saldo31a60: number
  saldo61a90: number
  saldoMas90: number
  facturasVencidas: number
}

export interface TotalesCartera {
  anunciantes: number
  facturado: number
  saldo: number
  vencido: number
  saldoMas90: number
  facturasVencidas: number
  porTramo: [number, number, number, number]
}

export interface DatosCartera {
  contexto: ContextoDatos
  corte: string
  filas: FilaCartera[]
  totales: TotalesCartera
  anterior: TotalesCartera
}

// ── Registro ─────────────────────────────────────────────────────────────────

export interface DatosPorReporte {
  "resumen-ejecutivo": DatosResumen
  "desempeno-campanas": DatosDesempeno
  finanzas: DatosFinanzas
  cartera: DatosCartera
  "cobertura-territorial": DatosCobertura
  "cumplimiento-medios": DatosCumplimiento
  "usuarios-accesos": DatosUsuariosAccesos
}

/** Datos etiquetados con su reporte (salida de la exportación). */
export type DatosReporte = {
  [S in SlugReporte]: { reporte: S; datos: DatosPorReporte[S] }
}[SlugReporte]

/** Lo que pinta la página (y la exportación) además de la tabla. */
export interface VistaReporte {
  indicadores: IndicadorReporte[]
  graficos: EspecGrafico[]
  /** Hallazgos del motor de insights (resumen ejecutivo). */
  hallazgos: Insight[]
  /** Avisos sobre los datos: muestra pequeña, filtros que un gráfico no admite… */
  avisos: string[]
}

export interface TablaExportable {
  titulo: string
  descripcion?: string
  columnas: ColumnaExcel[]
  filas: ValorCelda[][]
  columnasPdf: ColumnaPdf[]
  filasPdf: string[][]
}

/** Todo lo que necesita un documento exportado. */
export interface ContenidoReporte {
  vista: VistaReporte
  tabla: TablaExportable
  /** Hojas adicionales del Excel (los datos de cada gráfico). */
  hojas: HojaExcel[]
  notas: readonly NotaDefinicion[]
}

/** Respuesta de la exportación: los datos del reporte, ya registrados en la bitácora. */
export interface ArchivoReporte {
  reporte: SlugReporte
  datos: DatosPorReporte[SlugReporte]
  generadoPor: string
  /** Instante ISO del registro (sello del documento). */
  generadoAt: string
}
