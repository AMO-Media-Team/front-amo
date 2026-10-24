import { FileSpreadsheet, Lock } from "lucide-react"
import type { Metadata, Route } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { Esqueleto, EsqueletoKpis } from "@/components/feedback/esqueletos"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import {
  SeccionCartera,
  SeccionVencidas,
} from "@/features/facturacion/components/cartera"
import { SelectorCorteCartera } from "@/features/facturacion/components/selector-corte-cartera"
import {
  cargarCorteCartera,
  corteEfectivo,
} from "@/features/facturacion/listado"
import { hoyEnBogota } from "@/features/facturacion/schemas"
import { rutaReporte } from "@/features/reportes/catalogo"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Cartera" }

/**
 * Cartera de los anunciantes a una fecha de corte (LIQ-008, ADM-004): saldo
 * por cobrar por edades (`reporte_cartera`, exige `reportes.finanzas`), el
 * saldo de cada anunciante con enlace a su cartera y las facturas vencidas
 * con enlace a su ficha. Para exportar, el reporte de cartera.
 */
export default async function PaginaCartera({
  searchParams,
}: PageProps<"/finanzas/cartera">) {
  const usuario = await requerirPermiso("facturas.ver")
  const hoy = hoyEnBogota()
  const { corte: pedido } = await cargarCorteCartera(searchParams)
  const corte = corteEfectivo(pedido, hoy)
  const conReporte = tieneAlgunPermiso(usuario, ["reportes.finanzas"])
  const exportar =
    conReporte && tieneAlgunPermiso(usuario, ["reportes.ver"])
      ? (`${rutaReporte("cartera")}${corte === hoy ? "" : `?corte=${corte}`}` as Route)
      : null

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Cartera"
        descripcion="Lo que los anunciantes deben a AMO a la fecha de corte: saldo por edades, por anunciante y las facturas vencidas."
        acciones={
          <>
            <SelectorCorteCartera />
            {exportar ? (
              <EnlaceBoton variant="outline" href={exportar}>
                <FileSpreadsheet data-icon="inline-start" aria-hidden />
                Exportar en Reportes
              </EnlaceBoton>
            ) : null}
          </>
        }
      />
      {conReporte ? (
        <LimiteErrorTabla recurso="la cartera">
          <Suspense
            key={`cartera-${corte}`}
            fallback={
              <div
                role="status"
                aria-busy="true"
                className="flex flex-col gap-4"
              >
                <span className="sr-only">Cargando la cartera…</span>
                <EsqueletoKpis cantidad={4} />
                <Esqueleto className="h-40 rounded-xl" />
              </div>
            }
          >
            <SeccionCartera
              corte={corte}
              verAnunciantes={tieneAlgunPermiso(usuario, ["anunciantes.ver"])}
            />
          </Suspense>
        </LimiteErrorTabla>
      ) : (
        <EstadoVacio
          icono={Lock}
          titulo="La cartera por edades exige otro permiso"
          descripcion="Ver los saldos por anunciante y por edades exige el permiso Reportes de finanzas. Abajo están las facturas vencidas, que sí puedes consultar."
        />
      )}
      <LimiteErrorTabla recurso="las facturas vencidas">
        <Suspense
          key={`vencidas-${corte}`}
          fallback={<Esqueleto className="h-64 rounded-xl" />}
        >
          <SeccionVencidas corte={corte} esHoy={corte === hoy} />
        </Suspense>
      </LimiteErrorTabla>
    </ContenedorPagina>
  )
}
