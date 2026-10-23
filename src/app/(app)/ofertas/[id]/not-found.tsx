import { ArrowLeft, Store } from "lucide-react"
import type { Metadata } from "next"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { RUTA_MIS_CAMPANAS } from "@/features/mis-campanas/rutas"
import { RUTA_OFERTAS_MEDIO } from "@/features/marketplace/rutas"

export const metadata: Metadata = { title: "Oferta no disponible" }

/**
 * Una oferta que el medio ya no puede ver: se llenó, venció o se cerró sin
 * que la aceptara, no le está dirigida o el enlace está incompleto.
 */
export default function OfertaNoDisponible() {
  return (
    <ContenedorPagina
      ancho="estrecho"
      className="items-center justify-center text-center"
    >
      <div className="flex flex-col items-center gap-5 rounded-2xl border bg-card/40 px-6 py-12 sm:px-12">
        <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Store aria-hidden className="size-7" />
        </span>
        <div className="flex max-w-md flex-col gap-2">
          <h1 className="text-2xl font-bold">
            Esta oferta ya no está disponible
          </h1>
          <p className="text-sm text-muted-foreground">
            Puede que se haya llenado, que haya cerrado su fecha límite o que no
            esté dirigida a tus cuentas. Si ya la habías aceptado, la encuentras
            en Mis campañas.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <EnlaceBoton size="lg" href={RUTA_OFERTAS_MEDIO}>
            <ArrowLeft data-icon="inline-start" aria-hidden />
            Ver otras ofertas
          </EnlaceBoton>
          <EnlaceBoton size="lg" variant="outline" href={RUTA_MIS_CAMPANAS}>
            Ir a Mis campañas
          </EnlaceBoton>
        </div>
      </div>
    </ContenedorPagina>
  )
}
