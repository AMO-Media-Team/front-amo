import "server-only"

import { RejillaKpi } from "@/components/kpi/rejilla-kpi"
import { formatearNumero } from "@/lib/format"

import {
  estadoTablaFacturas,
  periodoEmision,
  rutaFacturasFiltradas,
} from "../listado"
import { contarAsignaciones } from "../presentacion"
import {
  anunciantesConFacturas,
  listarFacturas,
  resumenFacturas,
} from "../queries"
import { TablaFacturas } from "./tabla-facturas"
import { TarjetaKpiFacturas } from "./tarjeta-kpi-facturas"

type ParametrosBusqueda = Promise<Record<string, string | string[] | undefined>>

/**
 * Secciones del listado de facturas que consultan (Server Components): el
 * resumen (lo por facturar, borradores, saldo y vencido) y la tabla, que lee
 * la URL con los mismos parsers que el cliente.
 */

export async function SeccionResumenFacturas() {
  const resumen = await resumenFacturas()
  const anunciantes =
    resumen.anunciantesPorFacturar === 1
      ? "1 anunciante"
      : `${formatearNumero(resumen.anunciantesPorFacturar)} anunciantes`
  return (
    <RejillaKpi etiqueta="Resumen de la facturación" columnas={4}>
      <TarjetaKpiFacturas
        titulo="Por facturar"
        valor={resumen.porFacturar}
        unidad="COP"
        icono="porFacturar"
        sinComparativo={
          resumen.asignacionesPorFacturar > 0
            ? `${contarAsignaciones(resumen.asignacionesPorFacturar)} de ${anunciantes}, antes de IVA`
            : "Nada verificado sin facturar"
        }
        indice={0}
      />
      <TarjetaKpiFacturas
        titulo="Borradores por expedir"
        valor={resumen.borradores}
        unidad="conteo"
        icono="borrador"
        href={rutaFacturasFiltradas({ estado: ["BORRADOR"] })}
        sinComparativo="Falta registrarlos como expedidos"
        indice={1}
      />
      <TarjetaKpiFacturas
        titulo="Saldo por cobrar"
        valor={resumen.saldoPorCobrar}
        unidad="COP"
        icono="saldo"
        href={rutaFacturasFiltradas({
          estado: ["EMITIDA", "PAGADA_PARCIAL", "VENCIDA"],
        })}
        sinComparativo="Facturas expedidas con saldo, hoy"
        indice={2}
      />
      <TarjetaKpiFacturas
        titulo="Vencido"
        valor={resumen.saldoVencido}
        unidad="COP"
        icono="vencido"
        href={rutaFacturasFiltradas({ estado: ["VENCIDA"] })}
        sinComparativo={
          resumen.facturasVencidas === 0
            ? "Ninguna factura vencida"
            : resumen.facturasVencidas === 1
              ? "1 factura vencida"
              : `${formatearNumero(resumen.facturasVencidas)} facturas vencidas`
        }
        indice={3}
      />
    </RejillaKpi>
  )
}

export async function SeccionTablaFacturas({
  searchParams,
  puedeCrear,
}: {
  searchParams: ParametrosBusqueda
  puedeCrear: boolean
}) {
  const estado = await estadoTablaFacturas.cargar(searchParams)
  const [pagina, anunciantes] = await Promise.all([
    listarFacturas(estado),
    anunciantesConFacturas(),
  ])
  return (
    <TablaFacturas
      filas={pagina.filas}
      total={pagina.total}
      anunciantes={anunciantes}
      ahora={new Date().getTime()}
      puedeCrear={puedeCrear}
      conPeriodo={periodoEmision(estado) !== null}
    />
  )
}
