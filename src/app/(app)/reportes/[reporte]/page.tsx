import type { Metadata } from "next"
import { forbidden, notFound } from "next/navigation"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import {
  esSlugReporte,
  GRUPOS_REPORTE,
  puedeExportarReporte,
  puedeVerReporte,
  REPORTES,
} from "@/features/reportes/catalogo"
import { CuerpoReporte } from "@/features/reportes/components/cuerpo-reporte"
import {
  EsqueletoCuerpoReporte,
  EsqueletoFiltrosReporte,
} from "@/features/reportes/components/esqueletos"
import { ExportarReporte } from "@/features/reportes/components/exportar-reporte"
import { FiltrosReporte } from "@/features/reportes/components/filtros-reporte"
import { requerirPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/reportes/[reporte]">): Promise<Metadata> {
  const { reporte } = await params
  return {
    title: esSlugReporte(reporte) ? REPORTES[reporte].titulo : "Reportes",
  }
}

/**
 * Un reporte (`/reportes/finanzas?periodo=esteTrimestre`): filtros en la URL,
 * indicadores con comparativo, gráficos, detalle y notas, con exportación a
 * Excel y PDF. Exige `reportes.ver` y todos los permisos del reporte (los
 * mismos que su RPC); un slug desconocido es un 404.
 */
export default async function PaginaReporte({
  params,
  searchParams,
}: PageProps<"/reportes/[reporte]">) {
  const usuario = await requerirPermiso("reportes.ver")
  const { reporte: slug } = await params
  if (!esSlugReporte(slug)) notFound()
  const reporte = REPORTES[slug]
  if (!puedeVerReporte(usuario, reporte)) forbidden()

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        antetitulo={GRUPOS_REPORTE[reporte.grupo].titulo}
        titulo={reporte.titulo}
        descripcion={reporte.proposito}
        acciones={
          puedeExportarReporte(usuario, reporte) ? (
            <ExportarReporte reporte={slug} />
          ) : null
        }
      />
      <Suspense
        fallback={<EsqueletoFiltrosReporte cantidad={reporte.filtros.length} />}
      >
        <FiltrosReporte reporte={slug} usuario={usuario} />
      </Suspense>
      <LimiteErrorTabla recurso="el reporte">
        <Suspense
          fallback={
            <EsqueletoCuerpoReporte indicadores={reporte.indicadores} />
          }
        >
          <CuerpoReporte
            reporte={slug}
            usuario={usuario}
            searchParams={searchParams}
          />
        </Suspense>
      </LimiteErrorTabla>
    </ContenedorPagina>
  )
}
