import type { Route } from "next"
import { ArrowRight, CircleAlert, CircleCheck, ListChecks } from "lucide-react"
import { useId } from "react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { BarraLlenado } from "@/features/operacion/components/distintivos"
import { formatearFecha } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { ResumenDocumentos as Resumen } from "../situacion"
import {
  detallesResumen,
  type SiguientePaso,
  tituloResumen,
} from "../textos"
import type { NivelVerificacion } from "../tipos"
import { Nota } from "./avisos"

/** Hub del medio (paquete MM): desde ahí se envía el perfil a verificación. */
const RUTA_MI_MEDIO = "/mi-medio" as Route

function Icono({ resumen }: { resumen: Resumen }) {
  if (resumen.completo) {
    return <CircleCheck aria-hidden className="size-5" />
  }
  if (resumen.porCorregir > 0) {
    return <CircleAlert aria-hidden className="size-5" />
  }
  return <ListChecks aria-hidden className="size-5" />
}

function Siguiente({ paso }: { paso: SiguientePaso }) {
  if (!paso) return null
  if (paso.tipo === "en-cola") {
    return (
      <Nota tono="info" titulo="Tu perfil está en revisión">
        Lo enviaste el {formatearFecha(paso.desde)}. Te avisaremos cuando el
        equipo AMO termine; si te pide algo, lo verás aquí.
      </Nota>
    )
  }
  return (
    <Nota tono="info" titulo="Ya puedes enviar tu perfil a verificación">
      <p>Hazlo desde Mi medio cuando tengas listo lo demás.</p>
      <EnlaceBoton
        href={RUTA_MI_MEDIO}
        variant="outline"
        size="sm"
        className="mt-2"
      >
        Ir a Mi medio
        <ArrowRight data-icon="inline-end" aria-hidden />
      </EnlaceBoton>
    </Nota>
  )
}

/** Avance de los documentos del nivel elegido y qué sigue. */
export function ResumenDocumentos({
  resumen,
  nivel,
  siguiente,
}: {
  resumen: Resumen
  nivel: NivelVerificacion
  siguiente: SiguientePaso
}) {
  const id = useId()
  const fraccion = resumen.total > 0 ? resumen.aprobados / resumen.total : 0
  const detalles = detallesResumen(resumen)
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            resumen.completo
              ? "bg-success/12 text-success"
              : resumen.porCorregir > 0
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary"
          )}
        >
          <Icono resumen={resumen} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={id} className="text-base font-semibold text-balance">
            {tituloResumen(resumen)}
          </h2>
          <p className="text-xs cifras text-muted-foreground">
            {resumen.aprobados} de {resumen.total} aprobados para el nivel{" "}
            {nivel}
          </p>
        </div>
      </div>
      <BarraLlenado
        fraccion={fraccion}
        tono={resumen.completo ? "exito" : "primario"}
      />
      {detalles.length > 0 ? (
        <ul aria-label="Detalle" className="flex flex-wrap gap-1.5">
          {detalles.map((detalle) => (
            <li
              key={detalle}
              className="rounded-full bg-muted px-2.5 py-0.5 text-xs cifras text-muted-foreground"
            >
              {detalle}
            </li>
          ))}
        </ul>
      ) : null}
      <Siguiente paso={siguiente} />
    </section>
  )
}
