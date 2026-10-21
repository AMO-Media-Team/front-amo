import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { type ReactNode, Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { actorParaRoles } from "@/features/roles/actor"
import { CabeceraRol } from "@/features/roles/components/cabecera-rol"
import { ProveedorHojaRol } from "@/features/roles/components/hoja-rol"
import { MatrizPermisos } from "@/features/roles/components/matriz-permisos"
import { PestanasRol } from "@/features/roles/components/pestanas-rol"
import { SeccionHistorialRol } from "@/features/roles/components/seccion-historial-rol"
import { SeccionUsuariosRol } from "@/features/roles/components/seccion-usuarios-rol"
import { listarRoles, obtenerRol } from "@/features/roles/queries"
import { motivoSoloLectura } from "@/features/roles/reglas"
import { requerirPermiso } from "@/lib/auth/dal"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({
  params,
}: PageProps<"/administracion/roles/[id]">): Promise<Metadata> {
  const { id } = await params
  if (!UUID.test(id)) return { title: "Rol" }
  const actor = actorParaRoles(await requerirPermiso("roles.ver"))
  // Misma consulta (cacheada) que la página: la RLS decide si es visible.
  const rol = await obtenerRol(id, actor.puedeVerUsuarios)
  return { title: rol ? `Rol ${rol.nombre}` : "Rol" }
}

function EsqueletoPestana() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-3 rounded-xl border bg-card p-5"
    >
      <span className="sr-only">Cargando…</span>
      <Esqueleto className="h-5 w-48" />
      {Array.from({ length: 5 }, (_, indice) => (
        <div key={indice} className="flex items-center gap-3 py-1.5">
          <Esqueleto className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Esqueleto className="h-3.5 w-1/3" />
            <Esqueleto className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Pestaña que consulta: esqueleto mientras carga y error aislado. */
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
 * Ficha de un rol: cabecera con acciones y pestañas Permisos (matriz
 * editable), Usuarios con este rol e Historial (bitácora). La cabecera y la
 * matriz llegan con la página; usuarios e historial se transmiten aparte.
 */
export default async function PaginaRol({
  params,
}: PageProps<"/administracion/roles/[id]">) {
  const usuario = await requerirPermiso("roles.ver")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const actor = actorParaRoles(usuario)
  const rol = await obtenerRol(id, actor.puedeVerUsuarios)
  if (!rol) notFound()
  // Los roles de "copiar de" solo hacen falta si puede abrir la hoja.
  const rolesHoja = actor.puedeGestionar
    ? listarRoles(actor.puedeVerUsuarios)
    : Promise.resolve([])

  return (
    <ProveedorHojaRol actor={actor} roles={rolesHoja}>
      <ContenedorPagina>
        <CabeceraRol
          rol={rol}
          actor={actor}
          esPropio={rol.id === actor.rolId}
        />
        <PestanasRol
          cantidades={{ permisos: rol.permisos.length, usuarios: rol.usuarios }}
          paneles={{
            permisos: (
              <MatrizPermisos
                rol={rol}
                actor={actor}
                motivo={motivoSoloLectura(rol, actor)}
              />
            ),
            usuarios: (
              <Diferida recurso="los usuarios del rol">
                <SeccionUsuariosRol
                  rol={rol}
                  puedeVerUsuarios={actor.puedeVerUsuarios}
                />
              </Diferida>
            ),
            historial: (
              <Diferida recurso="el historial">
                <SeccionHistorialRol
                  rolId={rol.id}
                  puedeVerAuditoria={actor.puedeVerAuditoria}
                />
              </Diferida>
            ),
          }}
        />
      </ContenedorPagina>
    </ProveedorHojaRol>
  )
}
