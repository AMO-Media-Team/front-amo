/**
 * Tipos de la cola de moderación (ADM-005): DTO planos para la interfaz.
 */
import type { Plataforma } from "@/features/operacion/estados"

export interface OfertaEnCola {
  id: string
  titulo: string
  plataforma: Plataforma
  formato: string
  anunciante: string | null
  campana: string | null
  presupuestoMaximo: number
  cuposTotales: number
  fechaLimiteAceptacion: string
  /** Momento del envío (o reenvío) a revisión: ordena la cola. */
  enviadaAt: string | null
  /** Ya fue devuelta antes: el anunciante la ajustó y la reenvió. */
  reenvio: boolean
}

export interface PaginaCola {
  filas: OfertaEnCola[]
  total: number
  /** Página efectiva (si la pedida ya no existe, la última). */
  pagina: number
}
