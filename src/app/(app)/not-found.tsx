import { House } from "lucide-react"
import type { Metadata } from "next"

import { IlustracionNoEncontrado } from "@/components/feedback/ilustraciones"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { RUTA_INICIO } from "@/lib/auth/navegacion"

export const metadata: Metadata = { title: "No encontrado" }

/** `notFound()` dentro del AppShell (p. ej. un registro que no existe o no es visible). */
export default function NoEncontradoAplicacion() {
  return (
    <ContenedorPagina
      ancho="estrecho"
      className="items-center justify-center text-center"
    >
      <div className="flex flex-col items-center gap-6 rounded-2xl border bg-card/40 px-6 py-12 sm:px-12">
        <IlustracionNoEncontrado className="h-36 w-auto text-foreground" />
        <div className="flex max-w-md flex-col gap-2">
          <p className="font-mono text-xs font-medium tracking-[0.2em] text-primary uppercase">
            Error 404
          </p>
          <h1 className="text-2xl font-bold">No encontramos lo que buscas</h1>
          <p className="text-sm text-muted-foreground">
            Puede que el registro ya no exista, que el enlace esté incompleto o
            que no esté disponible para tu cuenta.
          </p>
        </div>
        <EnlaceBoton size="lg" href={RUTA_INICIO}>
          <House data-icon="inline-start" aria-hidden />
          Ir al inicio
        </EnlaceBoton>
      </div>
    </ContenedorPagina>
  )
}
