import "server-only"

import { cache } from "react"

import type { FilaKpi } from "@/components/kpi/tipos"
import { numero } from "@/features/dashboard/insights/adaptadores"

import { filasKpi } from "../kpi"
import { clientePanel, fallar } from "../servidor"
import {
  ESTADOS_PENDIENTES,
  etiquetaMunicipio,
  type FacturaPendiente,
  type FilaDesempeno,
} from "./datos"

/**
 * Consultas del panel del anunciante. `kpis_anunciante` y
 * `desempeno_anunciante` son invoker y filtran a su organización
 * (`mi_anunciante_id()`); las facturas pasan por la RLS (`facturas.ver_propias`).
 */

const n = (valor: number | string | null | undefined) => numero(valor) ?? 0

export const kpisAnunciante = cache(
  async (
    desde: string,
    hasta: string,
    desdeAnterior: string,
    hastaAnterior: string
  ): Promise<FilaKpi[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase.rpc("kpis_anunciante", {
      p_desde: desde,
      p_hasta: hasta,
      p_desde_ant: desdeAnterior,
      p_hasta_ant: hastaAnterior,
    })
    if (error) fallar("consultar tus indicadores", error)
    return filasKpi(data)
  }
)

export type DimensionDesempeno =
  "plataforma" | "medio" | "municipio" | "departamento" | "fecha"

export const desempenoAnunciante = cache(
  async (
    desde: string,
    hasta: string,
    dimension: DimensionDesempeno
  ): Promise<FilaDesempeno[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase.rpc("desempeno_anunciante", {
      p_desde: desde,
      p_hasta: hasta,
      p_dimension: dimension,
    })
    if (error) fallar("consultar el desempeño de tus campañas", error)
    return data.map((fila) => ({
      clave: fila.clave,
      nombre:
        dimension === "municipio" && fila.nombre
          ? etiquetaMunicipio(fila.nombre)
          : (fila.nombre ?? fila.clave),
      asignaciones: n(fila.asignaciones),
      gmv: n(fila.gmv),
      alcance: n(fila.alcance),
      impresiones: n(fila.impresiones),
      interacciones: n(fila.interacciones),
      reproducciones: n(fila.reproducciones),
      clics: n(fila.clics),
      cpm: numero(fila.cpm_efectivo),
      costoInteraccion: numero(fila.costo_por_interaccion),
      engagement: numero(fila.engagement),
      costoAlcance: numero(fila.costo_por_alcance),
      n: n(fila.n),
    }))
  }
)

const LIMITE_FACTURAS = 100

/** Facturas con saldo (emitidas, abonadas o vencidas) del propio anunciante. */
export const facturasPendientes = cache(
  async (): Promise<FacturaPendiente[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase
      .from("facturas")
      .select("id, prefijo, numero, total, saldo, estado, fecha_vencimiento")
      .in("estado", [...ESTADOS_PENDIENTES])
      .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
      .limit(LIMITE_FACTURAS)
    if (error) fallar("consultar tus facturas", error)
    return data.flatMap((fila) =>
      fila.estado === "EMITIDA" ||
      fila.estado === "PAGADA_PARCIAL" ||
      fila.estado === "VENCIDA"
        ? [
            {
              id: fila.id,
              numero: fila.numero
                ? `${fila.prefijo ?? ""}${fila.numero}`
                : null,
              total: n(fila.total),
              saldo: n(fila.saldo),
              estado: fila.estado,
              fechaVencimiento: fila.fecha_vencimiento,
            },
          ]
        : []
    )
  }
)
