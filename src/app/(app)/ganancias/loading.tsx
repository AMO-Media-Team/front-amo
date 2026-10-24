import { EsqueletoTarjetaGrafico } from "@/components/charts/esqueleto-grafico"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import {
  EsqueletoBloque,
  EsqueletoPagos,
  EsqueletoResumenGanancias,
} from "@/features/ganancias/components/esqueletos"

/** Carga de «Ganancias»: encabezado, resumen, pagos, gráfico y bloques laterales. */
export default function CargandoGanancias() {
  return (
    <ContenedorPagina>
      <div className="flex flex-col gap-1.5">
        <Esqueleto className="h-8 w-40" />
        <Esqueleto className="h-4 w-80 max-w-full" />
      </div>
      <EsqueletoResumenGanancias />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Esqueleto className="h-6 w-32" />
            <EsqueletoPagos />
          </div>
          <EsqueletoTarjetaGrafico alto="min-h-64" />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <EsqueletoBloque filas={3} />
          <EsqueletoBloque filas={3} />
        </div>
      </div>
    </ContenedorPagina>
  )
}
