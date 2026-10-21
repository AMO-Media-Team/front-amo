import { House, ShieldAlert } from "lucide-react"
import type { Metadata } from "next"

import { IlustracionAnillos } from "@/components/feedback/ilustraciones"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { RUTA_INICIO } from "@/lib/auth/navegacion"

export const metadata: Metadata = { title: "Sin permiso" }

/** 403 dentro del AppShell (`forbidden()` desde el DAL: `requerirPermiso`). */
export default function SinPermiso() {
  return (
    <ContenedorPagina
      ancho="estrecho"
      className="items-center justify-center text-center"
    >
      <div className="flex flex-col items-center gap-6 rounded-2xl border bg-card/40 px-6 py-12 sm:px-12">
        <div className="relative grid size-28 place-items-center text-warning">
          <IlustracionAnillos className="absolute inset-0 size-full" />
          <span className="relative grid size-12 place-items-center rounded-2xl bg-card shadow-glow ring-1 ring-border">
            <ShieldAlert className="size-6" aria-hidden />
          </span>
        </div>
        <div className="flex max-w-md flex-col gap-2">
          <p className="font-mono text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            Error 403
          </p>
          <h1 className="text-2xl font-bold">
            No tienes permiso para ver esta sección
          </h1>
          <p className="text-sm text-muted-foreground">
            Tu rol no incluye acceso a esta parte de AMO. Si lo necesitas para
            tu trabajo, pídeselo a un administrador.
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
