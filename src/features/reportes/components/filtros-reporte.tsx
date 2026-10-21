import "server-only"

import { opcionesAnunciantes } from "@/features/operacion/queries/anunciantes"
import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"

import { filtrosPara, REPORTES, type SlugReporte } from "../catalogo"
import { informar, type OpcionCatalogo, opcionesSectores } from "../servidor"
import { BarraFiltrosReporte } from "./barra-filtros"

/** Un catálogo que no carga solo oculta su filtro: el reporte sigue disponible. */
async function opcionalmente(
  operacion: string,
  cargar: () => Promise<OpcionCatalogo[]>
): Promise<OpcionCatalogo[] | null> {
  try {
    return await cargar()
  } catch (error) {
    informar(operacion, error)
    return null
  }
}

/**
 * Barra de filtros con los filtros que aplican a quien consulta
 * (`filtrosPara`: a un anunciante no se le ofrece el de anunciante) y las
 * opciones que necesitan.
 */
export async function FiltrosReporte({
  reporte,
  usuario,
}: {
  reporte: SlugReporte
  usuario: UsuarioSesion
}) {
  const filtros = filtrosPara(REPORTES[reporte], usuario)
  const [anunciantes, sectores] = await Promise.all([
    // Misma consulta que los listados de operación. Sin `anunciantes.ver` no
    // se ofrece el filtro (la RLS solo dejaría ver la propia empresa).
    filtros.includes("anunciante") &&
    tieneAlgunPermiso(usuario, ["anunciantes.ver"])
      ? opcionalmente("opcionesAnunciantes", opcionesAnunciantes)
      : null,
    filtros.includes("sector")
      ? opcionalmente("opcionesSectores", () => opcionesSectores())
      : null,
  ])
  return (
    <BarraFiltrosReporte
      filtros={filtros}
      anunciantes={anunciantes}
      sectores={sectores}
    />
  )
}
