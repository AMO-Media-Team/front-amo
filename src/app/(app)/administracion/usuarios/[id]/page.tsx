import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { type ReactNode, Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { CabeceraUsuario } from "@/features/usuarios/components/cabecera-usuario"
import { ProveedorGestionUsuarios } from "@/features/usuarios/components/contexto-gestion"
import type { UsuarioAcciones } from "@/features/usuarios/components/dialogos-accion-usuario"
import { MenuAccionesUsuario } from "@/features/usuarios/components/menu-acciones-usuario"
import { PestanasUsuario } from "@/features/usuarios/components/pestanas-usuario"
import { SeccionActividad } from "@/features/usuarios/components/seccion-actividad"
import { SeccionPermisos } from "@/features/usuarios/components/seccion-permisos"
import { SeccionResumen } from "@/features/usuarios/components/seccion-resumen"
import { SeccionSeguridad } from "@/features/usuarios/components/seccion-seguridad"
import { cargarDatosGestion } from "@/features/usuarios/gestion"
import { obtenerFichaUsuario, rolesVisibles } from "@/features/usuarios/queries"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Ficha de usuario" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function EsqueletoPestana() {
  return (
    <div role="status" aria-busy="true" className="grid gap-4 lg:grid-cols-2">
      <span className="sr-only">Cargando…</span>
      <Esqueleto className="h-56 rounded-xl" />
      <Esqueleto className="h-56 rounded-xl" />
      <Esqueleto className="h-40 rounded-xl lg:col-span-2" />
    </div>
  )
}

/** Envuelve una pestaña que consulta: esqueleto mientras carga y error aislado. */
function Diferida({
  recurso,
  children,
}: {
  recurso: string
  children: ReactNode
}) {
  return (
    <LimiteErrorTabla recurso={recurso}>
      <Suspense fallback={<EsqueletoPestana />}>{children}</Suspense>
    </LimiteErrorTabla>
  )
}

/**
 * Ficha de un usuario: cabecera con acciones y pestañas Resumen, Seguridad,
 * Actividad y Permisos. La cabecera y el resumen llegan con la página; el
 * resto se transmite en streaming, cada pestaña con su esqueleto.
 */
export default async function PaginaUsuario({
  params,
  searchParams,
}: PageProps<"/administracion/usuarios/[id]">) {
  const actor = await requerirPermiso("usuarios.ver")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const [ficha, datosGestion, roles, { editar }] = await Promise.all([
    obtenerFichaUsuario(id),
    cargarDatosGestion(actor),
    rolesVisibles(),
    searchParams,
  ])
  if (!ficha) notFound()

  const { usuario, seguridad } = ficha
  const organizacion = [
    ...datosGestion.organizaciones.anunciantes,
    ...datosGestion.organizaciones.medios,
  ].find((org) => org.id === (usuario.anuncianteId ?? usuario.medioId))
  const exigeMfa = roles.some(
    (rol) => rol.id === usuario.rol?.id && rol.requiereMfa
  )
  const acciones: UsuarioAcciones = {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    estado: usuario.estado,
    rolId: usuario.rol?.id ?? null,
    mfaActivo: usuario.mfaActivo,
    debeCambiarPassword: usuario.debeCambiarPassword,
  }

  return (
    <ProveedorGestionUsuarios datos={datosGestion}>
      <ContenedorPagina>
        <CabeceraUsuario
          usuario={usuario}
          esActor={usuario.id === actor.id}
          exigeMfa={exigeMfa}
          acciones={
            <MenuAccionesUsuario
              variante="ficha"
              usuario={acciones}
              detalle={usuario}
              editarAlAbrir={editar === "1"}
            />
          }
        />
        <PestanasUsuario
          paneles={{
            resumen: (
              <SeccionResumen
                usuario={usuario}
                organizacion={organizacion?.nombre ?? null}
              />
            ),
            seguridad: (
              <Diferida recurso="la seguridad de la cuenta">
                <SeccionSeguridad
                  usuario={usuario}
                  seguridad={seguridad}
                  acciones={acciones}
                  exigeMfa={exigeMfa}
                  puedeVerAccesos={tieneAlgunPermiso(actor, ["accesos.ver"])}
                />
              </Diferida>
            ),
            actividad: (
              <Diferida recurso="la actividad">
                <SeccionActividad
                  usuarioId={usuario.id}
                  puedeVerAuditoria={tieneAlgunPermiso(actor, [
                    "auditoria.ver",
                  ])}
                />
              </Diferida>
            ),
            permisos: (
              <Diferida recurso="los permisos">
                <SeccionPermisos
                  rol={usuario.rol}
                  puedeVerRol={
                    tieneAlgunPermiso(actor, ["roles.ver"]) ||
                    usuario.rol?.id === actor.rol.id
                  }
                />
              </Diferida>
            ),
          }}
        />
      </ContenedorPagina>
    </ProveedorGestionUsuarios>
  )
}
