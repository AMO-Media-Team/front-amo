import { CircleAlert, CircleCheck, ListChecks, LockKeyhole } from "lucide-react"
import type { ReactNode } from "react"

import { Nota } from "@/features/documentos-medio/components/avisos"
import { BarraLlenado } from "@/features/operacion/components/distintivos"
import { cn } from "@/lib/utils"

import type { ResumenDocumentos } from "../situacion"
import {
  detallesResumen,
  ID_RESUMEN_DOCUMENTOS,
  tituloResumen,
} from "../textos"

function Icono({ resumen }: { resumen: ResumenDocumentos }) {
  if (resumen.completo) return <CircleCheck aria-hidden className="size-5" />
  if (resumen.porCorregir > 0) {
    return <CircleAlert aria-hidden className="size-5" />
  }
  return <ListChecks aria-hidden className="size-5" />
}

/**
 * Avance de lo que exige la verificación y qué sigue (`siguiente`, que arma la
 * página: enviar a verificación, en revisión…).
 */
export function ResumenDocumentosAnunciante({
  resumen,
  siguiente,
}: {
  resumen: ResumenDocumentos
  siguiente?: ReactNode
}) {
  const fraccion = resumen.total > 0 ? resumen.aprobados / resumen.total : 0
  const detalles = detallesResumen(resumen)
  return (
    <section
      aria-labelledby={ID_RESUMEN_DOCUMENTOS}
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
          <h2
            id={ID_RESUMEN_DOCUMENTOS}
            tabIndex={-1}
            className="rounded-sm text-base font-semibold text-balance"
          >
            {tituloResumen(resumen)}
          </h2>
          <p className="text-xs cifras text-muted-foreground">
            {resumen.aprobados} de {resumen.total}{" "}
            {resumen.total === 1 ? "aprobado" : "aprobados"} para la
            verificación
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
      {siguiente}
    </section>
  )
}

/** Por qué se piden los documentos y cómo se protegen. */
export function NotaPrivacidadEmpresa({ className }: { className?: string }) {
  return (
    <Nota
      icono={LockKeyhole}
      titulo="Tus documentos están protegidos"
      className={className}
    >
      Se guardan en un almacenamiento privado: solo tu equipo y el equipo de
      verificación de AMO pueden abrirlos, con enlaces que caducan en minutos, y
      cada vez que AMO abre uno queda registrado. Los pedimos para confirmar que
      tu empresa existe y facturarle correctamente.
    </Nota>
  )
}
