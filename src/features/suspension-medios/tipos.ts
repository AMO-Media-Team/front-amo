/**
 * Tipos de la ficha y la suspensión de medios (ADM-002): asignaciones en
 * curso que el equipo AMO revisa al suspender, disputas de sus asignaciones y
 * métricas con alerta. Solo datos que el equipo puede ver (asignaciones.ver,
 * disputas.ver); nada de documentos, datos bancarios ni contacto.
 */
import type { AlertaMetrica } from "@/features/operacion/alertas"
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

/** Métrica del medio con alerta de integridad (pestaña «Alertas»). */
export interface AlertaDelMedio {
  metricaId: string
  asignacionId: string
  estado: EstadoValidacion
  /** Lo que calculó la BD, con la alerta previa a una corrección (`@/features/operacion/alertas`). */
  alerta: AlertaMetrica
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
