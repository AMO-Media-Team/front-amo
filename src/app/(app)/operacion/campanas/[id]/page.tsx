import { BarChart3, Handshake, Megaphone } from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EsqueletoIndicadores } from "@/features/operacion/components/esqueletos"
import { Diferida, UUID } from "@/features/operacion/components/ficha"
import {
  CabeceraCampana,
  SeccionDesempenoCampana,
  SeccionIndicadoresCampana,
  SeccionOfertasCampana,
} from "@/features/operacion/components/ficha-campana"
import {
  type PestanaFicha,
  PestanasFicha,
} from "@/features/operacion/components/pestanas-ficha"
import { SeccionActividad } from "@/features/operacion/components/seccion-actividad"
import { obtenerCampana } from "@/features/operacion/queries/campanas"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/operacion/campanas/[id]">): Promise<Metadata> {
  await requerirPermiso("campanas.ver")
  const { id } = await params
  const campana = UUID.test(id) ? await obtenerCampana(id) : null
  return { title: campana?.nombre ?? "Campaña" }
}

/**
 * Ficha de una campaña (consulta): presupuesto y compromiso, ofertas con sus
 * cupos por franja, asignaciones y desempeño verificado según los permisos.
 */
export default async function PaginaCampana({
  params,
}: PageProps<"/operacion/campanas/[id]">) {
  const usuario = await requerirPermiso("campanas.ver")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const verOfertas = tieneAlgunPermiso(usuario, ["ofertas.ver"])
  const verAsignaciones = tieneAlgunPermiso(usuario, ["asignaciones.ver"])
  const verReportes = tieneAlgunPermiso(usuario, ["reportes.ver"])

  const campana = await obtenerCampana(id)
  if (!campana) notFound()

  const pestanas: PestanaFicha[] = [
    {
      clave: "ofertas",
      titulo: "Ofertas",
      icono: <Megaphone aria-hidden />,
      contenido: verOfertas ? (
        <Diferida recurso="las ofertas de la campaña">
          <SeccionOfertasCampana campanaId={campana.id} />
        </Diferida>
      ) : (
        <EstadoVacio
          icono={Megaphone}
          titulo="Sin acceso a las ofertas"
          descripcion="Tu rol no incluye el permiso para consultar las ofertas de las campañas."
        />
      ),
    },
  ]
  if (verAsignaciones) {
    pestanas.push({
      clave: "asignaciones",
      titulo: "Asignaciones",
      icono: <Handshake aria-hidden />,
      contenido: (
        <Diferida recurso="las asignaciones de la campaña">
          <SeccionActividad dueno="campana" id={campana.id} />
        </Diferida>
      ),
    })
  }
  if (verReportes) {
    pestanas.push({
      clave: "desempeno",
      titulo: "Desempeño",
      icono: <BarChart3 aria-hidden />,
      contenido: (
        <Diferida recurso="el desempeño de la campaña">
          <SeccionDesempenoCampana campana={campana} />
        </Diferida>
      ),
    })
  }

  return (
    <ContenedorPagina>
      <CabeceraCampana
        campana={campana}
        verAnunciante={tieneAlgunPermiso(usuario, ["anunciantes.ver"])}
      />
      <Diferida
        recurso="los indicadores de la campaña"
        respaldo={<EsqueletoIndicadores cantidad={5} />}
      >
        <SeccionIndicadoresCampana
          campana={campana}
          verOfertas={verOfertas}
          verAsignaciones={verAsignaciones}
        />
      </Diferida>
      <PestanasFicha pestanas={pestanas} />
    </ContenedorPagina>
  )
}
