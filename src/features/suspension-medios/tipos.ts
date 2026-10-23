/**
 * Tipos de la ficha y la suspensión de medios (ADM-002): asignaciones en
 * curso que el equipo AMO revisa al suspender, disputas de sus asignaciones y
 * métricas con alerta. Solo datos que el equipo puede ver (asignaciones.ver,
 * disputas.ver); nada de documentos, datos bancarios ni contacto.
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

export type MotivoDisputa = Enums["disputa_motivo"]
export type ParteDisputa = Enums["disputa_parte"]

/** Lo que se le ofrece al equipo AMO en la cabecera de la ficha (`medios.suspender`). */
export type AccionSuspension = "suspender" | "reactivar"

/** Una asignación del medio que sigue viva (`asignaciones_en_curso_medio`). */
export interface AsignacionEnCurso {
  id: string
  estado: EstadoAsignacion
  estadoPrevioDisputa: EstadoAsignacion | null
  ofertaId: string
  oferta: string
  anunciante: string
  fechaLimitePublicacion: string | null
  montoBruto: number | null
  /** Disputa abierta o en revisión: la asignación se decide al resolverla. */
  disputaAbiertaId: string | null
  /** `false` en disputa: se cancela al resolver la disputa, no desde su ficha. */
  cancelable: boolean
}

export interface ResumenEnCurso {
  total: number
  /** Se pueden cancelar con causa desde su ficha. */
  cancelables: number
  enDisputa: number
}

/**
 * Lo que devuelve suspender: cuántas asignaciones siguen en curso (`null` si
 * quien suspende no puede ver asignaciones).
 */
export interface ResultadoSuspension {
  enCurso: ResumenEnCurso | null
}

/** Disputa de una asignación del medio (pestaña «Disputas»). */
export interface DisputaDelMedio {
  id: string
  estado: EstadoDisputa
  motivo: MotivoDisputa
  parte: ParteDisputa
  descripcion: string
  resolucion: string | null
  /** Estado de la asignación al abrirla. */
  estadoOrigen: EstadoAsignacion
  /** Con qué estado quedó la asignación al resolverla (`null` mientras sigue abierta). */
  estadoResultante: EstadoAsignacion | null
  creadaAt: string
  resueltaAt: string | null
  asignacion: {
    id: string
    estado: EstadoAsignacion | null
    oferta: string | null
    anunciante: string | null
  }
}

/** Alerta anterior a una corrección del medio (`detalle_alertas.alerta_previa`). */
export interface AlertaPrevia {
  desviacion: boolean
  multiploSuperado: boolean
  alcance: number | null
  impresiones: number | null
}

/**
 * `detalle_alertas` de una métrica: lo que calculó la BD al marcarla (las
 * cifras reportadas, las medianas de la misma cuenta y corte, el factor, los
 * seguidores al aceptar y el múltiplo por plataforma).
 */
export interface DetalleAlerta {
  /** Alcance o, en TikTok, espectadores únicos. */
  alcance: number | null
  /** Impresiones o, en TikTok, reproducciones. */
  impresiones: number | null
  medianaAlcance: number | null
  medianaImpresiones: number | null
  /** Métricas aprobadas de la misma cuenta y corte con que se calcularon las medianas. */
  nHistorial: number | null
  factor: number | null
  seguidores: number | null
  multiplo: number | null
  limiteAlcance: number | null
  previa: AlertaPrevia | null
}

/** Métrica del medio con alerta de integridad (pestaña «Alertas»). */
export interface AlertaDelMedio {
  metricaId: string
  asignacionId: string
  estado: EstadoValidacion
  desviacion: boolean
  multiplo: boolean
  detalle: DetalleAlerta
  creadaAt: string
  corte: Corte | null
  plataforma: Plataforma | null
  fechaCorte: string | null
  numeroPublicacion: number | null
  /** Lo que anotó quien la validó (qué revisó o por qué la rechazó). */
  observaciones: string | null
  validadaAt: string | null
  oferta: string | null
  anunciante: string | null
  handle: string | null
}
