import type { Metadata } from "next"
import { Suspense } from "react"

import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { EsqueletoKpis } from "@/components/feedback/esqueletos"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { ProveedorGestionUsuarios } from "@/features/usuarios/components/contexto-gestion"
import { BotonCrearUsuario } from "@/features/usuarios/components/hoja-crear-usuario"
import {
  SeccionMetricasUsuarios,
  SeccionTablaUsuarios,
} from "@/features/usuarios/components/secciones-listado"
import { cargarDatosGestion } from "@/features/usuarios/gestion"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Usuarios" }

/**
 * Listado de usuarios. Patrón de página de datos:
 * 1. `requerirPermiso` (DAL) antes de cualquier consulta.
 * 2. Encabezado inmediato; indicadores y tabla en `<Suspense>` separados, cada
 *    uno con esqueleto fiel y su propio límite de error.
 * 3. La tabla lee su estado de `searchParams` con los mismos parsers que el
 *    cliente (`estadoTablaUsuarios`).
 */
export default async function PaginaUsuarios({
  searchParams,
}: PageProps<"/administracion/usuarios">) {
  const usuario = await requerirPermiso("usuarios.ver")
  const datosGestion = await cargarDatosGestion(usuario)

  return (
    <ProveedorGestionUsuarios datos={datosGestion}>
      <ContenedorPagina>
        <EncabezadoPagina
          titulo="Usuarios"
          descripcion="Invita personas, asigna roles y controla quién puede acceder a AMO."
          acciones={
            tieneAlgunPermiso(usuario, ["usuarios.invitar"]) ? (
              <BotonCrearUsuario />
            ) : null
          }
        />

        <LimiteErrorTabla recurso="el resumen de usuarios">
          <Suspense
            fallback={
              <EsqueletoKpis
                cantidad={5}
                className="grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5"
              />
            }
          >
            <SeccionMetricasUsuarios />
          </Suspense>
        </LimiteErrorTabla>

        <LimiteErrorTabla recurso="los usuarios">
          <Suspense fallback={<EsqueletoTablaDatos columnas={6} filtros={4} />}>
            <SeccionTablaUsuarios searchParams={searchParams} />
          </Suspense>
        </LimiteErrorTabla>
      </ContenedorPagina>
    </ProveedorGestionUsuarios>
  )
}
