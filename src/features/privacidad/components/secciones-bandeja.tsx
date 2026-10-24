import "server-only"

import { serializarFecha } from "@/lib/fechas"

import { estadoTablaSolicitudes } from "../bandeja"
import { listarSolicitudes, resumenPlazos } from "../queries"
import { ResumenPlazos } from "./resumen-plazos"
import { TablaSolicitudes } from "./tabla-solicitudes"

type ParametrosBusqueda = Promise<Record<string, string | string[] | undefined>>

/**
 * Secciones de la bandeja de privacidad que consultan (Server Components).
 * Leen la URL con los mismos parsers que la tabla. «Hoy» es el día de Bogotá
 * del servidor: el semáforo de la tabla y el del resumen coinciden.
 */

export async function SeccionResumenPlazos() {
  return (
    <ResumenPlazos resumen={await resumenPlazos(serializarFecha(new Date()))} />
  )
}

export async function SeccionTablaSolicitudes({
  searchParams,
}: {
  searchParams: ParametrosBusqueda
}) {
  const hoy = serializarFecha(new Date())
  const estado = await estadoTablaSolicitudes.cargar(searchParams)
  const pagina = await listarSolicitudes(estado, hoy)
  return (
    <TablaSolicitudes filas={pagina.filas} total={pagina.total} hoy={hoy} />
  )
}
