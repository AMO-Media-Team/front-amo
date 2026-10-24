import "server-only"

import { cargarPeriodoOpcional } from "@/features/operacion/periodo"
import { serializarFecha } from "@/lib/fechas"

import { estadoTablaFacturas } from "../estado-tabla"
import {
  listarFacturasAnunciante,
  opcionesCampanaFacturas,
  resumenFacturasAnunciante,
} from "../queries"
import { ResumenFacturas } from "./resumen-facturas"
import { TablaFacturas } from "./tabla-facturas"

/**
 * Secciones que consultan (Server Components), cada una en su `<Suspense>`
 * para llegar en streaming sin bloquear la página. `hoy` es el día de
 * Bogotá: decide qué está vencido igual en el servidor y en la hidratación.
 */

type ParametrosBusqueda = Promise<Record<string, string | string[] | undefined>>

export async function SeccionResumenFacturas({
  anuncianteId,
}: {
  anuncianteId: string
}) {
  const resumen = await resumenFacturasAnunciante(
    anuncianteId,
    serializarFecha(new Date())
  )
  return <ResumenFacturas resumen={resumen} />
}

export async function SeccionTablaFacturas({
  anuncianteId,
  searchParams,
}: {
  anuncianteId: string
  searchParams: ParametrosBusqueda
}) {
  const [estado, periodo] = await Promise.all([
    estadoTablaFacturas.cargar(searchParams),
    cargarPeriodoOpcional(searchParams),
  ])
  const [pagina, campanas] = await Promise.all([
    listarFacturasAnunciante(anuncianteId, {
      estado,
      periodo,
      hoy: serializarFecha(new Date()),
    }),
    opcionesCampanaFacturas(anuncianteId),
  ])
  return (
    <TablaFacturas
      filas={pagina.filas}
      total={pagina.total}
      campanas={campanas}
      conPeriodo={periodo !== null}
    />
  )
}
