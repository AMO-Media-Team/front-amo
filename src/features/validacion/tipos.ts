/**
 * Tipos de la validación del equipo AMO (ADM-007, ADM-008, ADM-009): DTO
 * planos para la interfaz (serializables en RSC). Las rutas de Storage nunca
 * viajan al navegador: solo `conImagen`, y la captura se firma bajo demanda.
 */
import type { ValoresMetricas } from "@/features/ejecucion/tipos"
import type {
  Corte,
  EstadoAsignacion,
  Plataforma,
} from "@/features/operacion/estados"

import type { AlertaMetrica } from "./alertas"

export interface PaginaValidacion<T> {
  filas: T[]
  total: number
  /** Página efectiva (si la pedida ya no existe, la última). */
  pagina: number
}

export interface MedioEnCola {
  id: string
  nombre: string
  /** Cuenta con la que aceptó (sin `@`). */
  handle: string | null
}

/** Una evidencia de publicación por validar (`cola_evidencias`). */
export interface EvidenciaEnCola {
  publicacionId: string
  asignacionId: string
  /** Número de la publicación (1…publicaciones). */
  numero: number
  /** Publicaciones que pide la oferta. */
  publicaciones: number
  plataforma: Plataforma
  /** Nombre del formato («Reel»); `null` si no se pudo leer. */
  formato: string | null
  urlPost: string
  fechaPublicacion: string
  /** Hay captura que firmar (la ruta no viaja al navegador). */
  conImagen: boolean
  /** Cuándo la cargó (o la corrigió) el medio: ordena la cola. */
  enviadaAt: string
  /** Observaciones de una revisión anterior (la corrigió tras un rechazo). */
  observacionesPrevias: string | null
  /** El medio declaró la etiqueta de publicidad al cargarla. */
  etiquetaDeclarada: boolean
  medio: MedioEnCola
  /** Perfil de la cuenta en la red. */
  cuentaUrl: string | null
  oferta: { id: string; titulo: string; marca: string | null }
  ventanaInicio: string
  ventanaFin: string
  permanenciaHasta: string
  estadoAsignacion: EstadoAsignacion
}

/** Una métrica por validar (`cola_metricas`), con su alerta y su porqué. */
export interface MetricaEnCola {
  metricaId: string
  publicacionId: string
  asignacionId: string
  numero: number
  corte: Corte
  fechaCorte: string
  /** Periodo del corte personalizado. */
  periodo: { desde: string; hasta: string } | null
  plataforma: Plataforma
  /** Clave del formato (`REEL`…): decide qué cifras pide la plataforma. */
  formatoClave: string | null
  formato: string | null
  /** Todas las cifras que cargó el medio. */
  valores: ValoresMetricas
  /** Me gusta + comentarios + compartidos + guardados. */
  interacciones: number | null
  conImagen: boolean
  alerta: AlertaMetrica
  /** La evidencia de la publicación ya está aprobada (requisito para aprobar). */
  evidenciaAprobada: boolean
  enviadaAt: string
  /** Observaciones de una revisión anterior (la corrigió tras un rechazo). */
  observaciones: string | null
  medio: MedioEnCola
  seguidoresAlAceptar: number | null
  ofertaTitulo: string
  estadoAsignacion: EstadoAsignacion
}

/** Lo que impide verificar una asignación de la cola (`cola_verificacion.bloqueo`). */
export type BloqueoVerificacion = "METRICAS" | "PERMANENCIA"

/** Una asignación con las métricas cargadas, lista o no para verificar. */
export interface AsignacionPorVerificar {
  asignacionId: string
  ofertaTitulo: string
  marca: string | null
  medio: MedioEnCola
  plataforma: Plataforma
  publicaciones: number
  metricasCargadasAt: string | null
  /** Publicaciones × cortes que pide la oferta. */
  cortesRequeridos: number
  cortesAprobados: number
  metricasPendientes: number
  /** Métricas que tuvieron alerta (ya revisadas al aprobarlas). */
  metricasConAlerta: number
  /** Hasta cuándo debe seguir publicada (la última sin comprobar). */
  permanenciaHasta: string | null
  lista: boolean
  bloqueo: BloqueoVerificacion | null
}

/** Pendientes de cada cola; `null` en las que la persona no atiende. */
export interface ContadoresValidacion {
  evidencias: number | null
  metricas: number | null
  metricasConAlerta: number | null
  verificar: number | null
  /** De las anteriores, las que ya se pueden verificar. */
  verificarListas: number | null
}

/** Lo que muestra el formulario de corrección de una métrica aprobada. */
export interface MetricaParaCorregir {
  metricaId: string
  asignacionId: string
  publicacionId: string
  numero: number
  corte: Corte
  plataforma: Plataforma
  formatoClave: string | null
  fechaCorte: string
  /** Días del periodo personalizado ('YYYY-MM-DD' de Bogotá). */
  periodo: { desde: string; hasta: string } | null
  fechaPublicacion: string
  valores: ValoresMetricas
  /** Los demás cortes de la publicación (coherencia, INT-005). */
  otros: {
    id: string
    corte: Corte
    estado: "PENDIENTE" | "APROBADA" | "RECHAZADA"
    alcance: number | null
    impresiones: number | null
    interacciones: number
  }[]
  /** `metricas.tolerancia_cortes` (fracción). */
  tolerancia: number
}

/**
 * Lo que la ficha de la asignación le dice a las decisiones de evidencia y
 * métricas (`EvidenciasAsignacion`): el estado de la asignación y los
 * permisos de quien la ve.
 */
export interface ValidacionEnFicha {
  estadoAsignacion: EstadoAsignacion
  /** `evidencias.validar`. */
  evidencias: boolean
  /** `metricas.validar`. */
  metricas: boolean
  /** `metricas.editar_validadas`: corregir una métrica aprobada. */
  corregir: boolean
}
