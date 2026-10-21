import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import {
  EsqueletoMetricasAccesos,
  EsqueletoOrigenAccesos,
  EsqueletoRegistroAccesos,
  EsqueletoSeguridadAccesos,
} from "@/features/accesos/components/esqueletos"
import { ExportarAccesos } from "@/features/accesos/components/exportar-accesos"
import {
  SeccionMetricasAccesos,
  SeccionOrigenAccesos,
  SeccionRegistroAccesos,
  SeccionSeguridadAccesos,
} from "@/features/accesos/components/secciones"
import { LIMITE_EXPORTACION } from "@/features/accesos/queries"
import { SelectorPeriodo } from "@/features/auditoria/components/selector-periodo"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Accesos" }

/**
 * Registro de accesos (`accesos.ver`): indicadores del periodo, alertas de
 * seguridad, actividad día × hora, origen geográfico y el registro completo.
 * El periodo y los filtros viven en la URL (mismo selector que Auditoría);
 * cada bloque carga en paralelo con su esqueleto y su límite de error.
 */
export default async function PaginaAccesos({
  searchParams,
}: PageProps<"/administracion/accesos">) {
  const usuario = await requerirPermiso("accesos.ver")
  const puedeExportar = tieneAlgunPermiso(usuario, ["accesos.exportar"])

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Accesos"
        descripcion="Quién entra a AMO, desde dónde y con qué dispositivo; intentos fallidos, bloqueos y alertas de seguridad."
        acciones={
          <>
            <SelectorPeriodo />
            {puedeExportar ? (
              <ExportarAccesos limite={LIMITE_EXPORTACION} />
            ) : null}
          </>
        }
      />

      <LimiteErrorTabla recurso="el resumen de accesos">
        <Suspense fallback={<EsqueletoMetricasAccesos />}>
          <SeccionMetricasAccesos searchParams={searchParams} />
        </Suspense>
      </LimiteErrorTabla>

      <LimiteErrorTabla recurso="las alertas y la actividad">
        <Suspense fallback={<EsqueletoSeguridadAccesos />}>
          <SeccionSeguridadAccesos
            searchParams={searchParams}
            usuario={usuario}
          />
        </Suspense>
      </LimiteErrorTabla>

      <LimiteErrorTabla recurso="el origen de los ingresos">
        <Suspense fallback={<EsqueletoOrigenAccesos />}>
          <SeccionOrigenAccesos searchParams={searchParams} usuario={usuario} />
        </Suspense>
      </LimiteErrorTabla>

      <LimiteErrorTabla recurso="el registro de accesos">
        <Suspense fallback={<EsqueletoRegistroAccesos />}>
          <SeccionRegistroAccesos
            searchParams={searchParams}
            usuario={usuario}
          />
        </Suspense>
      </LimiteErrorTabla>
    </ContenedorPagina>
  )
}
