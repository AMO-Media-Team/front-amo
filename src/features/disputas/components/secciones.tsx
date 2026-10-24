import "server-only"

import { estadoTablaDisputas } from "../bandeja"
import { listarDisputas, resumenBandeja } from "../queries"
import { ResumenBandeja } from "./resumen-bandeja"
import { TablaDisputas } from "./tabla-disputas"

type ParametrosBusqueda = Promise<Record<string, string | string[] | undefined>>

/**
 * Secciones de la bandeja que consultan (Server Components). Leen la URL con
 * los mismos parsers que la tabla: búsqueda, estado, motivo, parte, orden y
 * página.
 */

export async function SeccionResumenBandeja({
  searchParams,
}: {
  searchParams: ParametrosBusqueda
}) {
  const estado = await estadoTablaDisputas.cargar(searchParams)
  return <ResumenBandeja resumen={await resumenBandeja(estado)} />
}

export async function SeccionTablaDisputas({
  searchParams,
}: {
  searchParams: ParametrosBusqueda
}) {
  const estado = await estadoTablaDisputas.cargar(searchParams)
  const pagina = await listarDisputas(estado)
  return (
    <TablaDisputas
      filas={pagina.filas}
      total={pagina.total}
      ahora={new Date().getTime()}
    />
  )
}
