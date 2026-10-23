/**
 * Tipos del portal de campañas del anunciante (ANU-002, ANU-003, ANU-014).
 * Todo lo que llega aquí ya pasó por la RLS: la empresa solo ve lo suyo y lo
 * de sus compañeros de organización.
 */
import type {
  EstadoAnunciante,
  EstadoCampana,
  EstadoOferta,
  Plataforma,
} from "@/features/operacion/estados"

export type { EstadoAnunciante, EstadoCampana, EstadoOferta, Plataforma }

/** Cuántas ofertas hay en cada estado (solo los presentes). */
export type OfertasPorEstado = Partial<Record<EstadoOferta, number>>

/** Fila del listado `/campanas`. `type` (no `interface`): la usa la tabla. */
export type MiCampanaFila = {
  id: string
  nombre: string
  marca: string
  estado: EstadoCampana
  fechaInicio: string
  fechaFin: string
  presupuestoTotal: number
  presupuestoComprometido: number
  ofertas: number
  ofertasPorEstado: OfertasPorEstado
  creadaAt: string
}

export interface ResumenMisCampanas {
  total: number
  activas: number
  borradores: number
  /** Finalizadas y canceladas. */
  cerradas: number
  presupuestoActivas: number
  comprometidoActivas: number
}

/** Ficha de una campaña propia, con lo que necesita su edición. */
export interface MiCampana {
  id: string
  nombre: string
  marca: string
  objetivo: string | null
  anuncianteId: string
  estado: EstadoCampana
  fechaInicio: string
  fechaFin: string
  presupuestoTotal: number
  /** En cupos aceptados por los medios (lo mueve la plataforma). */
  presupuestoComprometido: number
  /**
   * Lo que queda para una oferta nueva (`disponible_campana`): el total menos
   * lo que reservan las ofertas en revisión o publicadas y lo comprometido de
   * las vencidas o cerradas. `null` si la BD no lo informa.
   */
  disponible: number | null
  activadaAt: string | null
  finalizadaAt: string | null
  canceladaAt: string | null
  creadaAt: string
  /** Versión del registro (`updated_at`) para no pisar cambios ajenos. */
  actualizadaAt: string
  esDemo: boolean
}

/** Oferta de la campaña tal como la lista su ficha y el inicio. */
export interface OfertaDeCampana {
  id: string
  campanaId: string
  titulo: string
  estado: EstadoOferta
  plataforma: Plataforma
  formato: string | null
  fechaLimiteAceptacion: string
  ventanaInicio: string
  ventanaFin: string
  presupuestoMaximo: number
  presupuestoComprometido: number
  cuposTotales: number
  cuposOcupados: number
  /** Último comentario de la moderación (el de la devolución). */
  comentarioModeracion: string | null
  devueltaAt: string | null
  actualizadaAt: string
}

/** Oferta que pide algo al anunciante, con la campaña a la que pertenece. */
export interface OfertaPorAtender extends OfertaDeCampana {
  campana: string
}

/** Estado de verificación de la empresa (lo lee el propio anunciante). */
export interface SituacionEmpresa {
  anuncianteId: string
  nombre: string
  estado: EstadoAnunciante
  motivo: string | null
  enviadaAt: string | null
}

/** Campaña activa resumida para el inicio del anunciante. */
export interface CampanaActiva {
  id: string
  nombre: string
  marca: string
  fechaInicio: string
  fechaFin: string
  presupuestoTotal: number
  presupuestoComprometido: number
  ofertasPorEstado: OfertasPorEstado
}
