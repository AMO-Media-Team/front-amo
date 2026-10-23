import { cargarFiltrosMarketplace } from "../filtros"
import { anunciantesDeOfertas, conAnuncianteElegido } from "../mapeo"
import {
  elegibilidadMarketplace,
  facetasMarketplace,
  paginaMarketplace,
} from "../queries"
import { FiltrosMarketplace } from "./filtros-marketplace"
import { ListadoOfertas } from "./listado-ofertas"
import { SinElegibilidad } from "./vacio-marketplace"

/**
 * El marketplace del medio (MED-008): si aún no puede ver ofertas, el motivo
 * y cómo resolverlo; si puede, los filtros de la URL y la página de ofertas.
 * Elegibilidad, ofertas y opciones de los filtros se piden a la vez.
 */
export async function SeccionMarketplace({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filtros = await cargarFiltrosMarketplace(searchParams)
  const [elegibilidad, pagina, facetas] = await Promise.all([
    elegibilidadMarketplace(),
    paginaMarketplace(filtros),
    facetasMarketplace(filtros),
  ])
  if (elegibilidad.motivo !== "OK") {
    return (
      <SinElegibilidad
        elegibilidad={{ ...elegibilidad, motivo: elegibilidad.motivo }}
      />
    )
  }
  const ahora = new Date()
  return (
    <FiltrosMarketplace
      facetas={
        facetas &&
        conAnuncianteElegido(
          facetas,
          filtros.anunciante,
          anunciantesDeOfertas(pagina.filas)
        )
      }
    >
      <ListadoOfertas
        pagina={pagina}
        filtros={filtros}
        ahoraServidor={ahora.getTime()}
      />
    </FiltrosMarketplace>
  )
}
