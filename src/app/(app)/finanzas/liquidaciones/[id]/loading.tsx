import { Esqueleto } from "@/components/feedback/esqueletos"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"

/** Carga de la ficha de una liquidación: cabecera, aviso, montos, pago y asignaciones. */
export default function CargandoLiquidacion() {
  return (
    <ContenedorPagina>
      <div role="status" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">Cargando la liquidación…</span>
        <div aria-hidden className="flex flex-col gap-4">
          <Esqueleto className="h-8 w-40" />
          <Esqueleto className="h-36 rounded-2xl" />
          <Esqueleto className="h-20 rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Esqueleto className="h-80 rounded-xl" />
            <Esqueleto className="h-56 rounded-xl" />
          </div>
          <Esqueleto className="h-40 rounded-xl" />
        </div>
      </div>
    </ContenedorPagina>
  )
}
