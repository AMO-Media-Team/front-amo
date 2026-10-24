/**
 * Tipos de la ficha de una oferta (ANU-009, ANU-014, ADM-005) que las
 * consultas entregan a la interfaz. Son DTO planos (serializables en RSC):
 * solo lo que muestran la ficha del anunciante y la de moderación, nunca
 * cifras de medios individuales ni datos de otras empresas.
 */
import type { PasoOferta } from "@/features/asistente-oferta/pasos"
import type { VersionCreativo } from "@/features/creativos/tipos"
import type { ResumenCupos } from "@/features/operacion/calculos"
import type {
  Corte,
  EstadoCampana,
  EstadoOferta,
  Plataforma,
} from "@/features/operacion/estados"
import type { ResultadoExito, ResultadoFallo } from "@/lib/result"
import type { Database } from "@/types/database.types"

/** Quién hizo un cambio de estado (`oferta_historial.actor_tipo`). */
export type ActorHistorial = Database["public"]["Enums"]["transicion_actor"]

/** Desde dónde se mira la oferta: su anunciante o el equipo AMO. */
export type Perspectiva = "anunciante" | "interno"

/** Medio que el anunciante excluyó (solo nombre público y municipio). */
export interface MedioExcluido {
  id: string
  nombre: string
  municipio: string | null
}

export interface SegmentacionOferta {
  departamentos: { codigo: string; nombre: string }[]
  municipios: { codigo: string; nombre: string; departamento: string | null }[]
  categorias: string[]
  /** Mínimo que pidió el anunciante (`null`: sin mínimo propio). */
  seguidoresMinimos: number | null
  /** Umbral de la plataforma (`medios.umbral_seguidores`). */
  umbralPlataforma: number
  /** Mínimo que de verdad se aplica: el mayor de los dos. */
  seguidoresEfectivos: number
  excluidos: {
    total: number
    /** `null` si el rol no puede leer los nombres (solo se muestra la cantidad). */
    medios: MedioExcluido[] | null
  }
}

/** Una fila de `oferta_historial`, del más viejo al más nuevo. */
export interface FilaHistorial {
  id: string
  desde: EstadoOferta
  hacia: EstadoOferta
  actorTipo: ActorHistorial
  actorId: string | null
  /** Nombre del actor si el rol puede leer su perfil. */
  actorNombre: string | null
  comentario: string | null
  at: string
}

/** Instantes que la máquina de estados guarda en la oferta. */
export interface FechasOferta {
  creadaAt: string
  enviadaAt: string | null
  devueltaAt: string | null
  publicadaAt: string | null
  cuposCompletosAt: string | null
  enEjecucionAt: string | null
  vencidaAt: string | null
  cerradaAt: string | null
  canceladaAt: string | null
}

export interface CampanaDeOferta {
  id: string
  nombre: string
  marca: string
  estado: EstadoCampana
  fechaInicio: string
  fechaFin: string
  /** Base del tope por medio (la BD lo aplica sobre la campaña, no sobre la oferta). */
  presupuestoTotal: number
}

/** Todo lo que muestran las dos fichas de la oferta. */
export interface OfertaCompleta {
  id: string
  titulo: string
  estado: EstadoOferta
  plataforma: Plataforma
  /** Nombre del formato ("Reel", "Video"…). */
  formato: string
  campana: CampanaDeOferta
  anunciante: { id: string; nombre: string | null }
  publicacionesPorMedio: number
  permiteMultiplesCupos: boolean
  presupuestoMaximo: number
  presupuestoComprometido: number
  /**
   * Fracción del presupuesto TOTAL de la campaña que puede llevarse un medio
   * en ella (0–1; `reservar_cupo` lo exige con `AMO_TOPE_MEDIO`).
   */
  topePorMedio: number
  cupos: ResumenCupos
  ventanaInicio: string
  ventanaFin: string
  fechaLimiteAceptacion: string
  permanenciaDias: number
  exclusividadDias: number | null
  /** Multiplicador de precio por exclusividad (`precios.recargo_exclusividad`). */
  recargoExclusividad: number | null
  cortes: Corte[]
  instrucciones: string | null
  restricciones: string | null
  comentarioModeracion: string | null
  fechas: FechasOferta
  segmentacion: SegmentacionOferta
  historial: FilaHistorial[]
  creativos: VersionCreativo[]
  /** La creó el equipo AMO por cuenta del anunciante (ADM-014; la fija la BD). */
  gestionAsistida: boolean
}

/**
 * Resultado de enviar (o reenviar) a revisión: si la BD dice qué paso del
 * asistente falta (`hint` `envio_oferta:<paso>`), viaja con el fallo para
 * llevar a la persona a ese paso.
 */
export type ResultadoEnvio =
  ResultadoExito<void> | (ResultadoFallo & { paso: PasoOferta | null })
