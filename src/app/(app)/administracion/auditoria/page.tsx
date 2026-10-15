import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import {
  EsqueletoMetricasBitacora,
  EsqueletoRegistrosBitacora,
} from "@/features/auditoria/components/esqueletos"
import { ExportarBitacora } from "@/features/auditoria/components/exportar-bitacora"
import {
  SeccionMetricasBitacora,
  SeccionRegistrosBitacora,
} from "@/features/auditoria/components/secciones"
import { SelectorPeriodo } from "@/features/auditoria/components/selector-periodo"
import { LIMITE_EXPORTACION } from "@/features/auditoria/queries"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Auditoría" }

/**
 * Bitácora de auditoría (`auditoria.ver`). El periodo, la vista, los filtros
 * y el evento abierto viven en la URL: cualquier vista se puede compartir.
 * Indicadores y registros cargan en paralelo, cada uno con su esqueleto y su
 * propio límite de error.
 */
export default async function PaginaAuditoria({
  searchParams,
}: PageProps<"/administracion/auditoria">) {
  const usuario = await requerirPermiso("auditoria.ver")
  const puedeExportar = tieneAlgunPermiso(usuario, ["auditoria.exportar"])

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Auditoría"
        descripcion="Bitácora inmutable de la plataforma: quién cambió qué, cuándo y desde dónde."
        acciones={
          <>
            <SelectorPeriodo />
            {puedeExportar ? (
              <ExportarBitacora limite={LIMITE_EXPORTACION} />
            ) : null}
          </>
        }
      />

      <LimiteErrorTabla recurso="el resumen de la bitácora">
        <Suspense fallback={<EsqueletoMetricasBitacora />}>
          <SeccionMetricasBitacora searchParams={searchParams} />
        </Suspense>
      </LimiteErrorTabla>

      <LimiteErrorTabla recurso="la bitácora">
        <Suspense fallback={<EsqueletoRegistrosBitacora />}>
          <SeccionRegistrosBitacora
            searchParams={searchParams}
            usuario={usuario}
          />
        </Suspense>
      </LimiteErrorTabla>
    </ContenedorPagina>
  )
}
