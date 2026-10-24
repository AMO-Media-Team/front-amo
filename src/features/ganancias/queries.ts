import "server-only"

import { cache } from "react"

import { clienteSolicitud, fallar } from "@/features/operacion/queries/comun"
import { obtenerMunicipio } from "@/lib/geo/catalogo"
import { argumentosRpc } from "@/lib/supabase/rpc"

import {
  agruparRetenciones,
  aLinea,
  aLiquidacion,
  aResumen,
  paginaLiquidaciones,
  porLiquidar,
} from "./datos"
import type {
  AsignacionPorLiquidar,
  CondicionTributaria,
  LineaLiquidacionMedio,
  LiquidacionMedio,
  PaginaLiquidaciones,
  ResumenGanancias,
  RetencionAgrupada,
} from "./tipos"

/**
 * Lecturas de «Ganancias» con el cliente del USUARIO. El medio no lee las
 * tablas `liquidaciones` ni `documentos_soporte` (D82): sus RPC son definer y
 * filtran por `mi_medio_id()`, con bruto y comisión en `null` si
 * `comision.visible_para_medio` está apagada. Un error se lanza y lo recoge
 * el límite de error de la sección.
 */

/** Pagos por página (cursor por `id`). */
export const TAMANO_PAGINA_PAGOS = 12

/** Verificadas por liquidar que se listan (el resumen trae el total). */
export const LIMITE_POR_LIQUIDAR = 50

export const resumenGanancias = cache(async (): Promise<ResumenGanancias> => {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc("resumen_ganancias_medio")
  if (error) fallar("consultar el resumen de tus ganancias", error)
  return aResumen(data)
})

/** Una página de liquidaciones, de la más reciente a la más antigua. */
export async function misLiquidaciones(
  antesId: string | null = null
): Promise<PaginaLiquidaciones> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc(
    "mis_liquidaciones_medio",
    argumentosRpc<"mis_liquidaciones_medio">({
      p_limite: TAMANO_PAGINA_PAGOS + 1,
      p_antes_id: antesId,
      p_id: null,
    })
  )
  if (error) fallar("consultar tus pagos", error)
  return paginaLiquidaciones(data, TAMANO_PAGINA_PAGOS)
}

/** Una liquidación propia (`null` si no existe, es de otro medio o se anuló). */
export const miLiquidacion = cache(
  async (liquidacionId: string): Promise<LiquidacionMedio | null> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase.rpc(
      "mis_liquidaciones_medio",
      argumentosRpc<"mis_liquidaciones_medio">({
        p_limite: 1,
        p_antes_id: null,
        p_id: liquidacionId,
      })
    )
    if (error) fallar("consultar la liquidación", error)
    const fila = data.at(0)
    return fila ? aLiquidacion(fila) : null
  }
)

function nombreMunicipio(codigo: string): string | null {
  return obtenerMunicipio(codigo)?.nombre ?? null
}

export interface DetallePublicaciones {
  lineas: LineaLiquidacionMedio[]
  retenciones: RetencionAgrupada[]
}

/** Las publicaciones de la liquidación y sus retenciones agrupadas. */
export const publicacionesDeLiquidacion = cache(
  async (liquidacionId: string): Promise<DetallePublicaciones> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase.rpc("lineas_liquidacion_medio", {
      p_liquidacion_id: liquidacionId,
    })
    if (error) fallar("consultar las publicaciones de la liquidación", error)
    const lineas = data.map(aLinea)
    return {
      lineas,
      retenciones: agruparRetenciones(
        lineas.map((linea) => linea.retenciones),
        nombreMunicipio
      ),
    }
  }
)

/**
 * Verificadas que aún no entran en una liquidación (`mis_asignaciones_medio`
 * exige `asignaciones.ver_propias`; sin él no devuelve filas).
 */
export const asignacionesPorLiquidar = cache(
  async (): Promise<AsignacionPorLiquidar[]> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase.rpc("mis_asignaciones_medio", {
      p_estados: ["VERIFICADA"],
      p_limite: LIMITE_POR_LIQUIDAR,
    })
    if (error) fallar("consultar lo que tienes por liquidar", error)
    return porLiquidar(data)
  }
)

/** Su condición tributaria (`medios_privado` propio, por RLS); `null` si no la registró. */
export const condicionTributaria = cache(
  async (medioId: string): Promise<CondicionTributaria | null> => {
    const supabase = await clienteSolicitud()
    const { data, error } = await supabase
      .from("medios_privado")
      .select("es_declarante, obligado_facturar, responsable_iva")
      .eq("medio_id", medioId)
      .maybeSingle()
    if (error) fallar("consultar tu condición tributaria", error)
    if (!data) return null
    return {
      esDeclarante: data.es_declarante ?? false,
      obligadoFacturar: data.obligado_facturar ?? false,
      responsableIva: data.responsable_iva ?? false,
    }
  }
)
