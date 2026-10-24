import { BarChart3, Handshake, Megaphone, Plus } from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { AccionesCampana } from "@/features/campanas/components/acciones-campana"
import { situacionEmpresa } from "@/features/campanas/queries"
import {
  accionesCampana,
  puedeCrearOfertas,
  puedeEditarCampana,
} from "@/features/campanas/reglas"
import {
  type ModoGestion,
  rutasGestion,
} from "@/features/campanas/rutas-gestion"
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
import type { UsuarioSesion } from "@/lib/auth/tipos"
import type { CampanaDetalle } from "@/features/operacion/tipos"

export async function generateMetadata({
  params,
}: PageProps<"/operacion/campanas/[id]">): Promise<Metadata> {
  await requerirPermiso("campanas.ver")
  const { id } = await params
  const campana = UUID.test(id) ? await obtenerCampana(id) : null
  return { title: campana?.nombre ?? "Campaña" }
}

/**
 * Lo que el equipo AMO puede hacer con la campaña por cuenta de su anunciante
 * (ADM-014): nueva oferta, editar, activar (explicado si la empresa no está
 * verificada), cancelar con motivo y archivar. Sin `campanas.gestionar` ni
 * los permisos de las ofertas asistidas no hay nada. La BD decide.
 */
async function gestionDeCampana(
  usuario: UsuarioSesion,
  campana: CampanaDetalle
) {
  const tipoActor = usuario.rol.tipo
  const gestionaCampanas =
    tipoActor === "ADMIN" && tieneAlgunPermiso(usuario, ["campanas.gestionar"])
  const puedeEditar = puedeEditarCampana(
    campana.estado,
    tipoActor,
    usuario.permisos
  )
  const puedeCrear = puedeCrearOfertas(
    campana.estado,
    tipoActor,
    usuario.permisos
  )
  if (!gestionaCampanas && !puedeCrear) return null
  // La verificación de la empresa solo se lee si se puede (`anunciantes.ver`);
  // si no, activar no se anticipa y lo decide la BD.
  const empresa =
    gestionaCampanas && tieneAlgunPermiso(usuario, ["anunciantes.ver"])
      ? await situacionEmpresa(campana.anuncianteId)
      : null
  const gestion: ModoGestion = {
    modo: "asistido",
    anuncianteId: campana.anuncianteId,
    anunciante: campana.anunciante ?? empresa?.nombre ?? "el anunciante",
  }
  const acciones = gestionaCampanas
    ? accionesCampana({
        estado: campana.estado,
        tipoActor,
        permisos: usuario.permisos,
        estadoEmpresa: empresa?.estado ?? null,
      })
    : []
  return {
    gestion,
    acciones,
    puedeEditar,
    nuevaOferta: puedeCrear
      ? rutasGestion(gestion).asistente(campana.id)
      : null,
  }
}

/**
 * Ficha de una campaña: presupuesto y compromiso, ofertas con sus cupos por
 * franja, asignaciones y desempeño verificado según los permisos. Con la
 * gestión asistida (ADM-014), las acciones por cuenta del anunciante en la
 * cabecera y la insignia de las campañas que creó el equipo AMO.
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
  const gestion = await gestionDeCampana(usuario, campana)

  const pestanas: PestanaFicha[] = [
    {
      clave: "ofertas",
      titulo: "Ofertas",
      icono: <Megaphone aria-hidden />,
      contenido: verOfertas ? (
        <Diferida recurso="las ofertas de la campaña">
          <SeccionOfertasCampana
            campanaId={campana.id}
            nuevaOferta={gestion?.nuevaOferta ?? null}
          />
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
        gestionAsistida={campana.gestionAsistida}
        acciones={
          gestion ? (
            <div className="flex flex-wrap items-start gap-2 lg:justify-end">
              {gestion.nuevaOferta ? (
                <EnlaceBoton href={gestion.nuevaOferta}>
                  <Plus data-icon="inline-start" aria-hidden />
                  Nueva oferta
                </EnlaceBoton>
              ) : null}
              <AccionesCampana
                campana={{
                  id: campana.id,
                  nombre: campana.nombre,
                  estado: campana.estado,
                }}
                acciones={gestion.acciones}
                puedeEditar={gestion.puedeEditar}
                gestion={gestion.gestion}
              />
            </div>
          ) : null
        }
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
