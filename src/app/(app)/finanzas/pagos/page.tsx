import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import {
  EsqueletoDispersiones,
  EsqueletoPorPagar,
} from "@/features/pagos-medios/components/esqueletos"
import {
  EsqueletoNavegacionPagos,
  NavegacionPagos,
} from "@/features/pagos-medios/components/navegacion-pagos"
import {
  SeccionDispersiones,
  SeccionPorPagar,
} from "@/features/pagos-medios/components/secciones"
import { ID_DESTINO_FOCO_PAGOS } from "@/features/pagos-medios/foco"
import { cargarVistaPagos, VISTAS } from "@/features/pagos-medios/vistas"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Pagos a medios" }

/**
 * Pagos a medios (LIQ-005, LIQ-006): las liquidaciones aprobadas con lo que
 * les falta para pagarlas, el archivo de pagos para el banco (revela los
 * datos bancarios: exige además «Ver datos sensibles») y el registro de cada
 * pago con su soporte; y el historial de archivos generados. La vista va en
 * la URL (`?vista=por-pagar|dispersiones`) con la búsqueda, los filtros, el
 * orden y la página de su tabla.
 */
export default async function PaginaPagosMedios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const usuario = await requerirPermiso("liquidaciones.registrar_pago")
  const { vista } = await cargarVistaPagos(searchParams)
  const puedeVerDatosSensibles = tieneAlgunPermiso(usuario, [
    "datos_sensibles.ver",
  ])
  const { titulo, descripcion } = VISTAS[vista]

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Pagos a medios"
        descripcion="Genera el archivo de pagos para el banco con las liquidaciones aprobadas y registra cada pago con su soporte cuando el banco lo confirme."
      />
      <LimiteErrorTabla recurso="las vistas de pagos">
        <Suspense fallback={<EsqueletoNavegacionPagos activa={vista} />}>
          <NavegacionPagos activa={vista} />
        </Suspense>
      </LimiteErrorTabla>
      <section
        aria-labelledby={ID_DESTINO_FOCO_PAGOS}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <h2
            id={ID_DESTINO_FOCO_PAGOS}
            tabIndex={-1}
            className="text-lg font-semibold outline-none"
          >
            {titulo}
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            {descripcion}
          </p>
        </div>
        {vista === "por-pagar" ? (
          <LimiteErrorTabla recurso="las liquidaciones por pagar">
            <Suspense fallback={<EsqueletoPorPagar />}>
              <SeccionPorPagar
                searchParams={searchParams}
                puedeVerDatosSensibles={puedeVerDatosSensibles}
              />
            </Suspense>
          </LimiteErrorTabla>
        ) : (
          <LimiteErrorTabla recurso="los archivos de pagos">
            <Suspense fallback={<EsqueletoDispersiones />}>
              <SeccionDispersiones
                searchParams={searchParams}
                puedeVerDatosSensibles={puedeVerDatosSensibles}
              />
            </Suspense>
          </LimiteErrorTabla>
        )}
      </section>
    </ContenedorPagina>
  )
}
