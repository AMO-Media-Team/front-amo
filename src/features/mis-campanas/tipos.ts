/**
 * Contratos de «Mis campañas» del medio (MED-011, MED-012; paquete MC de la
 * fase 3). Los importan también el inicio del medio (DM) y la ejecución (EV):
 * se amplían agregando campos, nunca quitando ni renombrando.
 */
import type { Route } from "next"

import type { Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

export type EstadoAsignacion = Enums["asignacion_estado"]
export type Corte = Enums["corte_metrica"]
export type Plataforma = Enums["plataforma"]
export type EstadoValidacion = Enums["validacion_estado"]
export type CausaCancelacion = Enums["cancelacion_causa"]
export type TipoCreativo = Enums["creativo_tipo"]
export type EstadoDisputa = Enums["disputa_estado"]
export type ParteDisputa = Enums["disputa_parte"]

/**
 * Lo que el medio recibe por la asignación, congelado al aceptar. El
 * multiplicador de calidad y `montoMedio` se ven siempre (PRC-003); la tarifa,
 * el bruto, la comisión y los demás multiplicadores solo si la configuración
 * deja ver la comisión al medio (`comision.visible_para_medio`): si no, `null`.
 */
export interface PagoAsignacion {
  /** Lo que recibe el medio antes de retenciones. */
  montoMedio: number | null
  multiplicadorCalidad: number | null
  tarifaBase: number | null
  multiplicadorGeografico: number | null
  multiplicadorExclusividad: number | null
  montoBruto: number | null
  /** Fracción (0,15 = 15 %). */
  porcentajeComision: number | null
  montoComision: number | null
  /** Se conocen al liquidar. */
  montoRetenciones: number | null
  montoNeto: number | null
}

/**
 * La disputa más reciente de una asignación, resumida (ADM-011, MED-011 c2):
 * basta para saber si hay una abierta, si el medio ya reclamó una vencida y a
 * dónde llevarlo. El hilo y el resultado completo se leen en su página.
 */
export interface DisputaDeAsignacion {
  id: string
  estado: EstadoDisputa
  /** Parte que la abrió. */
  parte: ParteDisputa
  /** Estado de la asignación al abrirla (`VENCIDA_SIN_PUBLICAR`: un reclamo). */
  estadoOrigen: EstadoAsignacion
  estadoResultante: EstadoAsignacion | null
  creadaAt: string
  resueltaAt: string | null
}

/** Una asignación aceptada del medio (`mis_asignaciones_medio`) con su oferta. */
export interface AsignacionMedio {
  id: string
  ofertaId: string
  estado: EstadoAsignacion
  estadoPrevioDisputa: EstadoAsignacion | null
  causaCancelacion: CausaCancelacion | null
  /** Motivo del último cambio que lo pide (desistir, cancelar). */
  motivo: string | null
  plataforma: Plataforma
  /** Publicaciones que pide la oferta (1–10). */
  publicaciones: number
  ofertaTitulo: string
  marca: string | null
  anuncianteNombre: string | null
  formatoId: string
  formatoNombre: string
  ventanaInicio: string
  ventanaFin: string
  fechaLimiteAceptacion: string
  cortesRequeridos: Corte[]
  permanenciaMinimaDias: number
  /** Cuenta con la que aceptó (sin `@`). */
  handle: string | null
  franjaClave: string | null
  seguidoresAlAceptar: number | null
  creadaAt: string
  aceptadaAt: string | null
  contenidoDescargadoAt: string | null
  publicadaAt: string | null
  evidenciaValidadaAt: string | null
  metricasCargadasAt: string | null
  verificadaAt: string | null
  liquidadaAt: string | null
  pagadaAt: string | null
  rechazadaAt: string | null
  vencidaAt: string | null
  enDisputaAt: string | null
  canceladaAt: string | null
  metricasAtrasadasAt: string | null
  /** Hasta cuándo puede publicar y cargar la evidencia. */
  fechaLimitePublicacion: string
  /** Vencida sin publicar: hasta cuándo puede reclamar (`disputas.plazo_vencida_horas`). */
  reclamoHasta: string | null
  /** Versión del creativo que descargó por última vez. */
  creativoDescargadoId: string | null
  pago: PagoAsignacion
  /**
   * Su disputa más reciente (fase 4). `undefined`: no se consultó (el tablero
   * solo la lee en las vencidas que aún se pueden reclamar); `null`: no tiene.
   */
  disputa?: DisputaDeAsignacion | null
}

// ── Próximas acciones (`proximas_acciones_medio`) ────────────────────────────

/** Fila de `proximas_acciones_medio` tal como llega (en camelCase). */
export interface FilaAccionMedio {
  asignacionId: string
  ofertaTitulo: string
  /** `DESCARGAR`, `PUBLICAR`, `CARGAR_METRICA_H72`… */
  accion: string
  venceAt: string | null
  numero: number | null
  corte: Corte | null
  /**
   * Métrica rechazada que se corrige (`CORREGIR_METRICAS`): identifica cada
   * corte personalizado, que una publicación puede tener varios.
   */
  metricaId?: string | null
}

export type TipoAccionMedio =
  | "DESCARGAR"
  | "DESCARGAR_NUEVA_VERSION"
  | "PUBLICAR"
  | "CORREGIR_EVIDENCIA"
  | "CARGAR_METRICA"
  | "CORREGIR_METRICAS"
  /** Reclamar una vencida dentro de su plazo (fase 4: `vence_at` = fin del plazo). */
  | "RECLAMAR"

/** Una próxima acción interpretada: qué hacer, dónde y para cuándo. */
export interface AccionMedio {
  asignacionId: string
  ofertaTitulo: string
  tipo: TipoAccionMedio
  /** Código de la BD (`CARGAR_METRICA_H24`): clave estable para listas. */
  codigo: string
  /** Publicación a la que va (evidencia o métricas). */
  numero: number | null
  corte: Corte | null
  /** La métrica que se corrige (`CORREGIR_METRICAS`); `null` en las demás. */
  metricaId: string | null
  /** Fecha límite (publicar o cargar el corte). */
  venceAt: string | null
  /**
   * Desde cuándo se puede hacer: un corte de métricas se habilita al
   * cumplirse su tiempo desde la publicación. `null`: ya se puede.
   */
  disponibleDesde: string | null
  /** En voz del medio: «Descarga el contenido», «Carga las métricas de 72 horas». */
  etiqueta: string
  /** Qué vence, para la cuenta regresiva: «Publicación», «Métricas de 72 h». */
  etiquetaPlazo: string
  /** Pantalla donde se hace. */
  ruta: Route
}

/** Lo que sigue en una asignación, para su tarjeta y su ficha. */
export type PasoMedio =
  | { tipo: "accion"; accion: AccionMedio }
  | {
      tipo: "espera"
      titulo: string
      descripcion: string
      /** Hay una disputa abierta (no una revisión de rutina). */
      disputa?: boolean
      /** La disputa es el reclamo de una vencida. */
      reclamo?: boolean
      /** Con `disputa`: la asignación, para enlazar su página de disputa. */
      asignacionId?: string
    }
  | {
      tipo: "reclamo"
      /** Fin del plazo para reclamar la vencida (`reclamo_hasta`). */
      hasta: string | null
      asignacionId?: string
      /** Ya reclamó esta vencida y el equipo AMO lo resolvió: no hay otro reclamo. */
      reclamada?: boolean
    }
  | {
      tipo: "cerrada"
      titulo: string
      descripcion: string
      tono: "exito" | "neutro" | "peligro"
      /** Terminó por una disputa: enlaza su resultado. */
      asignacionId?: string
      disputa?: boolean
    }

// ── Ejecución: publicaciones, métricas y descargas ───────────────────────────

export interface PublicacionMedio {
  id: string
  numero: number
  urlPost: string
  fechaPublicacion: string
  /** Hasta cuándo debe seguir publicada (fecha de publicación + permanencia). */
  permanenciaHasta: string | null
  estado: EstadoValidacion
  observaciones: string | null
  validadaAt: string | null
  creadaAt: string
  actualizadaAt: string
}

export interface MetricaMedio {
  id: string
  publicacionId: string
  corte: Corte
  fechaCorte: string
  periodoDesde: string | null
  periodoHasta: string | null
  estado: EstadoValidacion
  observaciones: string | null
  validadaAt: string | null
  creadaAt: string
  actualizadaAt: string
}

export interface DescargaContenido {
  at: string
  creativoId: string
  /** Versión del creativo descargada (`null` si ya no se puede leer). */
  version: number | null
}

/** Lo que el medio cargó y descargó en una asignación (ficha y línea de tiempo). */
export interface EjecucionAsignacion {
  publicaciones: PublicacionMedio[]
  metricas: MetricaMedio[]
  /** De la primera a la última. */
  descargas: DescargaContenido[]
}

// ── Contenido (MED-012) ──────────────────────────────────────────────────────

/** Condiciones de la oferta que se leen antes de descargar (`ofertas_para_medio`). */
export interface CondicionesOferta {
  instrucciones: string | null
  restricciones: string | null
  exclusividadDias: number | null
}

/** Un archivo del paquete creativo, sin su ruta en Storage (se firma por id). */
export interface ArchivoContenido {
  id: string
  mime: string
  tamanoBytes: number
  ancho: number | null
  alto: number | null
  duracionSegundos: number | null
  orden: number
}

/** Una versión del paquete creativo tal como la ve el medio. */
export interface VersionContenido {
  id: string
  version: number
  tipo: TipoCreativo
  activadoAt: string | null
  copySugerido: string | null
  hashtags: string[]
  menciones: string[]
  enlaceDestino: string | null
  archivos: ArchivoContenido[]
}

/** La versión vigente de la oferta, para saber si hay una nueva por descargar. */
export interface VersionVigente {
  id: string
  version: number
  activadoAt: string | null
}

/** Todo lo de la pantalla «Contenido» de una asignación. */
export interface ContenidoAsignacion {
  /** `null` si la oferta ya no se puede leer (no debería pasar con asignación). */
  condiciones: CondicionesOferta | null
  /** La versión que los medios descargan hoy. */
  vigente: VersionContenido | null
  /**
   * La última versión que el medio descargó (`creativo_descargado_id`); es la
   * que se muestra. `null` antes de la primera descarga.
   */
  descargada: VersionContenido | null
  descargas: DescargaContenido[]
}
