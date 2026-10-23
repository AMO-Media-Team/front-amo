import { ExternalLink } from "lucide-react"

import { InsigniaEstado } from "@/features/operacion/components/distintivos"
import { formatearFechaHora } from "@/lib/format"

import { nombrePublicacion, REVISION_PARA_MEDIO } from "../presentacion"
import type { PublicacionEjecucion } from "../tipos"
import { CapturaEnviada } from "./captura-enviada"

/**
 * La evidencia registrada, de solo lectura (aprobada, en revisión sin
 * cambios posibles o de una campaña cerrada): enlace, fecha, revisión y
 * captura.
 */
export function ResumenEvidencia({
  publicacion,
  total,
}: {
  publicacion: PublicacionEjecucion
  total: number
}) {
  const nombre = nombrePublicacion(publicacion.numero, total)
  return (
    <section
      aria-label={`Evidencia de ${nombre}`}
      className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Lo que enviaste</h2>
        <InsigniaEstado
          catalogo={REVISION_PARA_MEDIO}
          estado={publicacion.estado}
        />
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted-foreground">Enlace</dt>
        <dd className="min-w-0">
          <a
            href={publicacion.urlPost}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-start gap-1.5 rounded-sm font-medium break-all text-primary underline underline-offset-4 outline-none hover:text-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {publicacion.urlPost}
            <ExternalLink aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span className="sr-only">(se abre en una pestaña nueva)</span>
          </a>
        </dd>
        <dt className="text-muted-foreground">Publicada</dt>
        <dd className="cifras">
          {formatearFechaHora(publicacion.fechaPublicacion)}
        </dd>
        {publicacion.observaciones ? (
          <>
            <dt className="text-muted-foreground">Observaciones</dt>
            <dd>{publicacion.observaciones}</dd>
          </>
        ) : null}
      </dl>
      <CapturaEnviada
        origen={{ tipo: "publicacion", id: publicacion.id }}
        titulo={`Captura de ${nombre}`}
      />
    </section>
  )
}
