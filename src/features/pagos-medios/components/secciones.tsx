import "server-only"

import { paginaLiquidacionesDispersion } from "../ficha-dispersion"
import { paginaDispersiones, paginaPorPagar } from "../queries"
import type { LiquidacionDeDispersion } from "../tipos"
import {
  estadoTablaDispersiones,
  estadoTablaLiquidacionesDispersion,
  estadoTablaPorPagar,
} from "../vistas"
import { TablaDispersiones } from "./tabla-dispersiones"
import { TablaLiquidacionesDispersion } from "./tabla-liquidaciones-dispersion"
import { TablaPorPagar } from "./tabla-por-pagar"

type ParametrosBusqueda = Promise<Record<string, string | string[] | undefined>>

/**
 * Secciones de Pagos a medios que consultan (Server Components). Leen la URL
 * con los mismos parsers que la tabla: búsqueda, filtros, orden y página.
 */

export async function SeccionPorPagar({
  searchParams,
  puedeVerDatosSensibles,
}: {
  searchParams: ParametrosBusqueda
  puedeVerDatosSensibles: boolean
}) {
  const estado = await estadoTablaPorPagar.cargar(searchParams)
  const pagina = await paginaPorPagar(estado)
  return (
    <TablaPorPagar
      filas={pagina.filas}
      total={pagina.total}
      resumen={pagina.resumen}
      puedeVerDatosSensibles={puedeVerDatosSensibles}
    />
  )
}

export async function SeccionDispersiones({
  searchParams,
  puedeVerDatosSensibles,
}: {
  searchParams: ParametrosBusqueda
  puedeVerDatosSensibles: boolean
}) {
  const estado = await estadoTablaDispersiones.cargar(searchParams)
  const pagina = await paginaDispersiones(estado)
  return (
    <TablaDispersiones
      filas={pagina.filas}
      total={pagina.total}
      puedeVerDatosSensibles={puedeVerDatosSensibles}
    />
  )
}

export async function SeccionLiquidacionesDispersion({
  searchParams,
  liquidaciones,
}: {
  searchParams: ParametrosBusqueda
  liquidaciones: readonly LiquidacionDeDispersion[]
}) {
  const estado = await estadoTablaLiquidacionesDispersion.cargar(searchParams)
  const pagina = paginaLiquidacionesDispersion(liquidaciones, estado)
  return (
    <TablaLiquidacionesDispersion filas={pagina.filas} total={pagina.total} />
  )
}
