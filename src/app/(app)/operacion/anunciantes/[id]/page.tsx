import {
  FileText,
  Handshake,
  LayoutDashboard,
  Megaphone,
  Receipt,
  UsersRound,
} from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { AccionesAnunciante } from "@/features/gestion-anunciantes/components/acciones-anunciante"
import { SeccionUsuariosAnunciante } from "@/features/gestion-anunciantes/components/usuarios-anunciante"
import { organizacionParaInvitar } from "@/features/gestion-anunciantes/presentacion"
import {
  anuncianteEditable,
  catalogosAnunciante,
} from "@/features/gestion-anunciantes/queries"
import { EsqueletoIndicadores } from "@/features/operacion/components/esqueletos"
import { Diferida, UUID } from "@/features/operacion/components/ficha"
import {
  CabeceraAnunciante,
  SeccionCampanasAnunciante,
  SeccionCarteraAnunciante,
  SeccionIndicadoresAnunciante,
  SeccionResumenAnunciante,
} from "@/features/operacion/components/ficha-anunciante"
import { ListaDocumentos } from "@/features/operacion/components/lista-documentos"
import {
  type PestanaFicha,
  PestanasFicha,
} from "@/features/operacion/components/pestanas-ficha"
import { SeccionActividad } from "@/features/operacion/components/seccion-actividad"
import {
  documentosDelAnunciante,
  obtenerAnunciante,
} from "@/features/operacion/queries/anunciantes"
import { ProveedorGestionUsuarios } from "@/features/usuarios/components/contexto-gestion"
import { cargarDatosGestion } from "@/features/usuarios/gestion"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/operacion/anunciantes/[id]">): Promise<Metadata> {
  await requerirPermiso("anunciantes.ver")
  const { id } = await params
  const anunciante = UUID.test(id) ? await obtenerAnunciante(id) : null
  return { title: anunciante?.nombreComercial ?? "Anunciante" }
}

async function SeccionDocumentos({ anuncianteId }: { anuncianteId: string }) {
  return (
    <ListaDocumentos
      documentos={await documentosDelAnunciante(anuncianteId)}
      descripcion="Solo metadatos de la revisión: los archivos se consultan en el flujo de verificación."
    />
  )
}

/**
 * Ficha de un anunciante: cabecera con su NIT, indicadores y pestañas
 * Resumen, Campañas, Asignaciones, Cartera, Documentos y Usuarios según los
 * permisos del rol. El contacto (dato personal) solo se ofrece con
 * `datos_sensibles.ver` y se revela dejando registro. El equipo AMO edita sus
 * datos (`anunciantes.editar`, incluido el NIT) e invita a su equipo
 * (`usuarios.invitar`).
 */
export default async function PaginaAnunciante({
  params,
}: PageProps<"/operacion/anunciantes/[id]">) {
  const usuario = await requerirPermiso("anunciantes.ver")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const verSensibles = tieneAlgunPermiso(usuario, ["datos_sensibles.ver"])
  const verAsignaciones = tieneAlgunPermiso(usuario, ["asignaciones.ver"])
  const verCartera = tieneAlgunPermiso(usuario, ["facturas.ver"])
  const verCampanas = tieneAlgunPermiso(usuario, ["campanas.ver"])
  const verDocumentos = tieneAlgunPermiso(usuario, ["anunciantes.verificar"])
  const verUsuarios = tieneAlgunPermiso(usuario, ["usuarios.ver"])
  const puedeEditar = tieneAlgunPermiso(usuario, ["anunciantes.editar"])
  const puedeInvitar = tieneAlgunPermiso(usuario, ["usuarios.invitar"])

  const [anunciante, edicion, catalogos, datosGestion] = await Promise.all([
    obtenerAnunciante(id),
    puedeEditar ? anuncianteEditable(id) : null,
    puedeEditar ? catalogosAnunciante() : null,
    puedeInvitar
      ? cargarDatosGestion(usuario, { organizaciones: false })
      : null,
  ])
  if (!anunciante) notFound()

  const invitarA = organizacionParaInvitar(
    datosGestion?.rolesAsignables ?? null,
    anunciante
  )

  const pestanas: PestanaFicha[] = [
    {
      clave: "resumen",
      titulo: "Resumen",
      icono: <LayoutDashboard aria-hidden />,
      contenido: (
        <SeccionResumenAnunciante
          anunciante={anunciante}
          verSensibles={verSensibles}
        />
      ),
    },
  ]
  if (verCampanas) {
    pestanas.push({
      clave: "campanas",
      titulo: "Campañas",
      icono: <Megaphone aria-hidden />,
      contenido: (
        <Diferida recurso="las campañas del anunciante">
          <SeccionCampanasAnunciante anunciante={anunciante} />
        </Diferida>
      ),
    })
  }
  if (verAsignaciones) {
    pestanas.push({
      clave: "asignaciones",
      titulo: "Asignaciones",
      icono: <Handshake aria-hidden />,
      contenido: (
        <Diferida recurso="las asignaciones del anunciante">
          <SeccionActividad dueno="anunciante" id={anunciante.id} />
        </Diferida>
      ),
    })
  }
  if (verCartera) {
    pestanas.push({
      clave: "cartera",
      titulo: "Cartera",
      icono: <Receipt aria-hidden />,
      contenido: (
        <Diferida recurso="la cartera del anunciante">
          <SeccionCarteraAnunciante anuncianteId={anunciante.id} />
        </Diferida>
      ),
    })
  }
  if (verDocumentos) {
    pestanas.push({
      clave: "documentos",
      titulo: "Documentos",
      icono: <FileText aria-hidden />,
      contenido: (
        <Diferida recurso="los documentos del anunciante">
          <SeccionDocumentos anuncianteId={anunciante.id} />
        </Diferida>
      ),
    })
  }
  if (verUsuarios) {
    pestanas.push({
      clave: "usuarios",
      titulo: "Usuarios",
      icono: <UsersRound aria-hidden />,
      contenido: (
        <Diferida recurso="las personas del anunciante">
          <SeccionUsuariosAnunciante
            anuncianteId={anunciante.id}
            invitarA={invitarA}
          />
        </Diferida>
      ),
    })
  }

  const contenido: ReactNode = (
    <ContenedorPagina>
      <CabeceraAnunciante
        anunciante={anunciante}
        acciones={
          <AccionesAnunciante
            edicion={edicion}
            catalogos={catalogos}
            invitarA={invitarA}
          />
        }
      />
      <Diferida
        recurso="los indicadores del anunciante"
        respaldo={<EsqueletoIndicadores cantidad={5} />}
      >
        <SeccionIndicadoresAnunciante
          anunciante={anunciante}
          verCampanas={verCampanas}
          verAsignaciones={verAsignaciones}
          verCartera={verCartera}
        />
      </Diferida>
      <PestanasFicha pestanas={pestanas} />
    </ContenedorPagina>
  )

  // «Invitar usuario» necesita los datos de gestión (roles asignables, correo).
  return datosGestion ? (
    <ProveedorGestionUsuarios datos={datosGestion}>
      {contenido}
    </ProveedorGestionUsuarios>
  ) : (
    contenido
  )
}
