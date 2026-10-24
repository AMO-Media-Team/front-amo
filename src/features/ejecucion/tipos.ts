/**
 * Contratos de la ejecución del medio: evidencia de publicación y métricas por
 * corte (MED-013, MED-014, INT-001, INT-002, INT-005; paquete EV de la fase
 * 3). Módulo puro: lo usan las consultas, las acciones y los formularios.
 */
import type { Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

export type Plataforma = Enums["plataforma"]
export type Corte = Enums["corte_metrica"]
export type CorteFijo = Exclude<Corte, "PERSONALIZADO">
export type EstadoAsignacion = Enums["asignacion_estado"]
export type EstadoValidacion = Enums["validacion_estado"]

/** Lo que las pantallas de ejecución necesitan de la asignación y su oferta. */
export interface AsignacionEjecucion {
  id: string
  estado: EstadoAsignacion
  /**
   * Con una disputa abierta, el estado que tenía al abrirla (`null` sin
   * disputa): los cortes de métricas siguen con él (D72).
   */
  estadoPrevioDisputa: EstadoAsignacion | null
  plataforma: Plataforma
  /** Clave del formato (`REEL`, `POST_FEED`…); `null` si no se pudo leer. */
  formatoClave: string | null
  formatoNombre: string
  ofertaTitulo: string
  marca: string | null
  /** Cuenta con la que aceptó (sin `@`). */
  handle: string | null
  /** Publicaciones que pide la oferta (1–10). */
  publicaciones: number
  ventanaInicio: string
  ventanaFin: string
  /** Primera descarga del contenido: no pudo publicar antes (`null` sin descargar). */
  contenidoDescargadoAt: string | null
  /** Hasta cuándo puede publicar y cargar la evidencia. */
  fechaLimitePublicacion: string
  cortesRequeridos: Corte[]
  permanenciaMinimaDias: number
  /** Vencida sin publicar: hasta cuándo puede reclamar. */
  reclamoHasta: string | null
}

/** Una publicación registrada (evidencia) tal como la ve el medio. */
export interface PublicacionEjecucion {
  id: string
  numero: number
  urlPost: string
  fechaPublicacion: string
  estado: EstadoValidacion
  /** Por qué el equipo AMO la rechazó. */
  observaciones: string | null
  /** Hay miniatura de la captura (la ruta no viaja al navegador). */
  conMiniatura: boolean
  actualizadaAt: string
}

/** Versión del contenido que importa para registrar la evidencia (NOT-006). */
export interface ContenidoEjecucion {
  /** Versión vigente del creativo y desde cuándo. */
  vigente: { version: number; activadoAt: string } | null
  /** Última versión que el medio descargó (`null`: ninguna). */
  versionDescargada: number | null
}

/** Campos de una carga de métricas (columnas de `metricas`, en camelCase). */
export type CampoMetrica =
  | "alcance"
  | "impresiones"
  | "reproducciones"
  | "espectadoresUnicos"
  | "meGusta"
  | "comentarios"
  | "compartidos"
  | "guardados"
  | "clicsEnlace"
  | "visitasPerfil"
  | "tiempoPromedioS"
  | "porcentajeCompleto"

export type ValoresMetricas = Readonly<Record<CampoMetrica, number | null>>

/** Un corte ya cargado de la misma publicación (para editarlo o compararlo). */
export interface MetricaEjecucion {
  id: string
  corte: Corte
  fechaCorte: string
  periodoDesde: string | null
  periodoHasta: string | null
  valores: ValoresMetricas
  estado: EstadoValidacion
  observaciones: string | null
  conMiniatura: boolean
}

/**
 * Las cifras con que la BD compara los cortes (`alcance_norm`,
 * `impresiones_norm`, `interacciones`): en TikTok, espectadores únicos y
 * reproducciones.
 */
export interface CifrasCorte {
  alcance: number | null
  impresiones: number | null
  interacciones: number
}

/** Otro corte de la publicación con el que se compara uno nuevo (INT-005). */
export interface CorteComparable extends CifrasCorte {
  id: string
  corte: Corte
  estado: EstadoValidacion
}

/** Lo que pinta `/mis-campanas/[id]/evidencia`. */
export interface ContextoEvidencia {
  asignacion: AsignacionEjecucion
  /** Publicación que se carga o corrige (1…publicaciones). */
  numero: number
  /** Evidencia ya registrada para ese número. */
  publicacion: PublicacionEjecucion | null
  /** Todas las publicaciones registradas (para el selector de número). */
  publicaciones: PublicacionEjecucion[]
  contenido: ContenidoEjecucion
}

/** Lo que pinta `/mis-campanas/[id]/metricas`. */
export interface ContextoMetricas {
  asignacion: AsignacionEjecucion
  numero: number
  /** `null`: esa publicación aún no tiene evidencia. */
  publicacion: PublicacionEjecucion | null
  /** Todas las publicaciones registradas (para el selector de número). */
  publicaciones: PublicacionEjecucion[]
  corte: Corte
  /** El corte que se corrige (fijo por publicación o el personalizado pedido). */
  metrica: MetricaEjecucion | null
  /** Los demás cortes de la publicación (incluye los personalizados). */
  otros: MetricaEjecucion[]
  /** `metricas.tolerancia_cortes` (fracción: 0,02 = 2 %). */
  toleranciaCortes: number
  /** `metricas.plazo_carga_horas`. */
  plazoCargaHoras: number
}

/** Lo que devuelven las acciones al guardar. */
export interface EvidenciaRegistrada {
  publicacionId: string
  /** Estado de la asignación después de guardar (`PUBLICADA` al completar). */
  estadoAsignacion: EstadoAsignacion | null
}

export interface MetricaGuardada {
  metricaId: string
  /** `METRICAS_CARGADAS` cuando era el último corte que faltaba. */
  estadoAsignacion: EstadoAsignacion | null
}
