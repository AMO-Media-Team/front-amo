import "server-only"

/**
 * Consultas de la moderación de ofertas (ADM-005), con el cliente del
 * USUARIO (JWT + RLS: `ofertas.ver`). Un error de lectura se lanza y lo
 * recoge el límite de error de la sección.
 */
import {
  catalogos,
  clienteSolicitud,
  leerPagina,
} from "@/features/operacion/queries/comun"

import { paginaEfectiva, TAMANO_PAGINA_MODERACION } from "./cola"
import type { PaginaCola } from "./tipos"

const SELECCION_COLA = `
  id, titulo, plataforma, formato_id, presupuesto_maximo, cupos_totales, fecha_limite_aceptacion,
  enviada_at, devuelta_at,
  campana:campanas ( nombre ),
  anunciante:anunciantes ( nombre_comercial, razon_social )
`

/**
 * Ofertas en revisión, la enviada hace más tiempo primero (a igual envío,
 * la de fecha límite más cercana). Si la página pedida ya no existe, la última.
 */
export async function colaModeracion(pagina: number): Promise<PaginaCola> {
  const supabase = await clienteSolicitud()
  const [resultado, { formatos }] = await Promise.all([
    leerPagina(
      "leer la cola de moderación",
      pagina,
      TAMANO_PAGINA_MODERACION,
      (desde, hasta) =>
        supabase
          .from("ofertas")
          .select(SELECCION_COLA, { count: "exact" })
          .eq("estado", "EN_REVISION")
          .is("deleted_at", null)
          .order("enviada_at", { ascending: true, nullsFirst: false })
          .order("fecha_limite_aceptacion", { ascending: true })
          .order("id")
          .range(desde, hasta)
    ),
    catalogos(),
  ])

  return {
    total: resultado.total,
    pagina: paginaEfectiva(pagina, resultado.total),
    filas: resultado.filas.map((fila) => ({
      id: fila.id,
      titulo: fila.titulo,
      plataforma: fila.plataforma,
      formato: formatos.get(fila.formato_id)?.nombre ?? "Formato",
      anunciante:
        fila.anunciante?.nombre_comercial ??
        fila.anunciante?.razon_social ??
        null,
      campana: fila.campana?.nombre ?? null,
      presupuestoMaximo: fila.presupuesto_maximo,
      cuposTotales: fila.cupos_totales,
      fechaLimiteAceptacion: fila.fecha_limite_aceptacion,
      enviadaAt: fila.enviada_at,
      reenvio: fila.devuelta_at !== null,
    })),
  }
}
