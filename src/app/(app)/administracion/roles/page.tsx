import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { actorParaRoles } from "@/features/roles/actor"
import {
  BotonCrearRol,
  ProveedorHojaRol,
} from "@/features/roles/components/hoja-rol"
import {
  EsqueletoListadoRoles,
  SeccionListadoRoles,
} from "@/features/roles/components/secciones-listado"
import { listarRoles } from "@/features/roles/queries"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Roles y permisos" }

/**
 * Listado de roles. `requerirPermiso` (DAL) antes de cualquier consulta; el
 * encabezado se pinta de inmediato y los roles llegan en streaming. La misma
 * promesa alimenta el listado y la hoja de "copiar de" (sin consultar dos veces).
 */
export default async function PaginaRoles() {
  const usuario = await requerirPermiso("roles.ver")
  const actor = actorParaRoles(usuario)
  const roles = listarRoles(actor.puedeVerUsuarios)

  return (
    <ProveedorHojaRol actor={actor} roles={roles}>
      <ContenedorPagina>
        <EncabezadoPagina
          titulo="Roles y permisos"
          descripcion="Define qué puede ver y hacer cada tipo de usuario. Cada permiso se valida también en la base de datos."
          acciones={actor.puedeGestionar ? <BotonCrearRol /> : null}
        />
        <LimiteErrorTabla recurso="los roles">
          <Suspense fallback={<EsqueletoListadoRoles />}>
            <SeccionListadoRoles roles={roles} actor={actor} />
          </Suspense>
        </LimiteErrorTabla>
      </ContenedorPagina>
    </ProveedorHojaRol>
  )
}
