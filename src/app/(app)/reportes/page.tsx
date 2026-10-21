import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import {
  CentroReportes,
  PasosReportes,
} from "@/features/reportes/components/centro-reportes"
import { EsqueletoCentroReportes } from "@/features/reportes/components/esqueletos"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Reportes" }

/**
 * Centro de reportes (`reportes.ver`): solo los reportes cuyos permisos
 * tiene la persona, agrupados por tema y con su última exportación.
 */
export default async function PaginaReportes() {
  const usuario = await requerirPermiso("reportes.ver")
  // Sin `reportes.exportar` no se promete una descarga que no se ofrecerá.
  const conExportacion = tieneAlgunPermiso(usuario, ["reportes.exportar"])

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Reportes"
        descripcion={
          conExportacion
            ? "Informes listos para compartir. Cada uno explica qué mide, se puede filtrar y se descarga en Excel o PDF con la marca de AMO."
            : "Informes del negocio para consultar. Cada uno explica qué mide y se puede filtrar por periodo."
        }
      />
      <PasosReportes conExportacion={conExportacion} />
      <LimiteErrorTabla recurso="los reportes">
        <Suspense fallback={<EsqueletoCentroReportes />}>
          <CentroReportes usuario={usuario} />
        </Suspense>
      </LimiteErrorTabla>
    </ContenedorPagina>
  )
}
