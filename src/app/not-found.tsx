import { House } from "lucide-react"
import type { Metadata } from "next"

import { IlustracionNoEncontrado } from "@/components/feedback/ilustraciones"
import { PantallaEstado } from "@/components/feedback/pantalla-estado"
import { EnlaceBoton } from "@/components/layout/enlace-boton"

export const metadata: Metadata = {
  title: "Página no encontrada",
}

export default function NoEncontrado() {
  return (
    <PantallaEstado>
      <IlustracionNoEncontrado className="h-44 w-auto text-foreground" />
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs font-medium tracking-[0.2em] text-primary uppercase">
          Error 404
        </p>
        <h1 className="text-3xl font-bold sm:text-4xl">
          Esta página no está en el mapa
        </h1>
        <p className="text-muted-foreground">
          Puede que el enlace esté incompleto o que la página se haya movido.
          Revisa la dirección o vuelve al inicio para seguir navegando.
        </p>
      </div>
      <EnlaceBoton size="lg" href="/">
        <House data-icon="inline-start" aria-hidden />
        Ir al inicio
      </EnlaceBoton>
    </PantallaEstado>
  )
}
