import "server-only"

import { estadoTablaAsignaciones } from "../estado-tablas"
import { cargarPeriodoOpcional } from "../periodo"
import { opcionesAnunciantes } from "../queries/anunciantes"
import {
  listarAsignaciones,
  opcionesMedios,
  resumenAsignaciones,
} from "../queries/asignaciones"
import { opcionesCampanas } from "../queries/campanas"
import { GruposAsignaciones } from "./grupos-asignaciones"
import { TablaAsignaciones } from "./tabla-asignaciones"

type ParametrosBusqueda = Promise<Record<string, string | string[] | undefined>>

/**
 * Secciones del listado de asignaciones que consultan (Server Components).
 * Ambas leen la URL con los mismos parsers que el cliente: tabla, filtros y
 * periodo opcional (`?periodo=`, `?desde=&hasta=`).
 */

async function cargarVista(searchParams: ParametrosBusqueda) {
  const [estado, rango] = await Promise.all([
    estadoTablaAsignaciones.cargar(searchParams),
    cargarPeriodoOpcional(searchParams),
  ])
  return { estado, rango }
}

export async function SeccionGruposAsignaciones({
  searchParams,
}: {
  searchParams: ParametrosBusqueda
}) {
  const { estado, rango } = await cargarVista(searchParams)
  return (
    <GruposAsignaciones resumen={await resumenAsignaciones(estado, rango)} />
  )
}

export async function SeccionTablaAsignaciones({
  searchParams,
  verCampanas,
}: {
  searchParams: ParametrosBusqueda
  /** `campanas.ver`: las filas enlazan a la ficha de su campaña. */
  verCampanas: boolean
}) {
  const { estado, rango } = await cargarVista(searchParams)
  const [pagina, campanas, medios, anunciantes] = await Promise.all([
    listarAsignaciones(estado, rango),
    opcionesCampanas(),
    opcionesMedios(),
    opcionesAnunciantes(),
  ])
  return (
    <TablaAsignaciones
      filas={pagina.filas}
      total={pagina.total}
      campanas={campanas}
      medios={medios}
      anunciantes={anunciantes}
      ahora={new Date().getTime()}
      conEnlaceCampana={verCampanas}
    />
  )
}
