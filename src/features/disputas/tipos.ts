/**
 * Tipos de las disputas (ADM-011, ADM-012): DTO planos que llegan a la
 * interfaz del equipo AMO, del medio y del anunciante. Las rutas de Storage
 * de los adjuntos nunca viajan al navegador: un mensaje dice si tiene adjunto
 * y de qué tipo, y la URL se firma bajo demanda (`firmarAdjuntoDisputa`).
 */
import type {
  Corte,
  EstadoAsignacion,
  EstadoDisputa,
  EstadoValidacion,
  Plataforma,
} from "@/features/operacion/estados"
import type { Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

export type { Corte, EstadoAsignacion, EstadoDisputa, Plataforma }
export type MotivoDisputa = Enums["disputa_motivo"]
export type ParteDisputa = Enums["disputa_parte"]
export type CausaCancelacion = Enums["cancelacion_causa"]

/** Quién mira la disputa: decide la voz de los textos y qué se muestra. */
export type Perspectiva = "interno" | "medio" | "anunciante"

/**
 * Una disputa tal como la leen el equipo AMO y las partes (solo columnas de
 * `disputas`: el medio no lee `asignaciones` por la API).
 */
export interface DisputaDetalle {
  id: string
  asignacionId: string
  estado: EstadoDisputa
  motivo: MotivoDisputa
  /** Parte que la abrió. */
  parte: ParteDisputa
  /** Lo que escribió quien la abrió (10 a 4.000 caracteres). */
  descripcion: string
  /** Estado de la asignación cuando se abrió. */
  estadoOrigen: EstadoAsignacion
  /** Explicación de la resolución o del descarte (la reciben las partes). */
  resolucion: string | null
  /** Estado en que quedó la asignación al cerrarse. */
  estadoResultante: EstadoAsignacion | null
  creadaAt: string
  actualizadaAt: string
  resueltaAt: string | null
}

/** Adjunto de un mensaje: su tipo y un nombre para mostrar (sin la ruta). */
export interface AdjuntoMensaje {
  /** MIME deducido de la extensión del objeto (`image/webp`, `application/pdf`…). */
  tipo: string
  /** Nombre para mostrar y descargar («Adjunto del 23 oct.pdf»). */
  nombre: string
}

/** Un mensaje del hilo (`mensajes_disputa`). */
export interface MensajeDisputa {
  id: number
  autorParte: ParteDisputa
  /** El medio, la empresa o «Equipo AMO». */
  autorNombre: string
  /** Persona que escribió: solo para quien tiene `usuarios.ver`. */
  autorPersona: string | null
  /** Lo escribió quien mira. */
  esMio: boolean
  mensaje: string
  adjunto: AdjuntoMensaje | null
  /** Nota interna: solo la ve el equipo AMO. */
  interno: boolean
  creadoAt: string
}

// ── Bandeja del equipo AMO ───────────────────────────────────────────────────

/** Fila de la bandeja (`type`: TanStack exige que sea asignable a un Record). */
export type DisputaFila = {
  id: string
  estado: EstadoDisputa
  motivo: MotivoDisputa
  parte: ParteDisputa
  estadoOrigen: EstadoAsignacion
  estadoResultante: EstadoAsignacion | null
  creadaAt: string
  resueltaAt: string | null
  /** Mensajes del hilo (con las notas internas). */
  mensajes: number
  asignacionId: string
  /** `null` si el rol no ve la asignación o sus relaciones. */
  medio: string | null
  oferta: string | null
  campana: string | null
  marca: string | null
  anunciante: string | null
  plataforma: Plataforma | null
}

export interface PaginaDisputas {
  filas: DisputaFila[]
  total: number
}

export type ResumenBandeja = Readonly<
  Record<"abiertas" | "en_revision" | "cerradas", number>
>

// ── Ficha interna ────────────────────────────────────────────────────────────

export interface PublicacionDisputa {
  id: string
  numero: number
  url: string
  estado: EstadoValidacion
  permanenciaHasta: string
  permanenciaVerificadaAt: string | null
  retiradaDetectadaAt: string | null
}

/** Lo que el equipo ve de la asignación disputada (resumen, no la ficha). */
export interface AsignacionDisputa {
  id: string
  estado: EstadoAsignacion
  estadoPrevioDisputa: EstadoAsignacion | null
  plataforma: Plataforma
  formato: string | null
  publicacionesEsperadas: number
  montoBruto: number | null
  aceptadaAt: string | null
  fechaLimitePublicacion: string | null
  vencidaAt: string | null
  causaCancelacion: CausaCancelacion | null
  medio: { id: string; nombre: string | null }
  cuenta: { handle: string; url: string } | null
  oferta: { id: string; titulo: string | null; cerrada: boolean }
  campana: { id: string; nombre: string | null; marca: string | null }
  anunciante: { id: string; nombre: string | null }
  cortesRequeridos: Corte[]
  publicaciones: PublicacionDisputa[]
  metricas: { publicacionId: string; corte: Corte; estado: EstadoValidacion }[]
}

export interface DisputaInterna extends DisputaDetalle {
  /** `null` si el rol no ve la asignación. */
  asignacion: AsignacionDisputa | null
  /** Personas (solo con `usuarios.ver`). */
  abiertaPor: string | null
  resueltaPor: string | null
  mensajes: MensajeDisputa[]
  /** Horas que tiene el medio para cargar la evidencia si se reabre (`disputas.plazo_recarga_horas`). */
  plazoRecargaHoras: number
}
