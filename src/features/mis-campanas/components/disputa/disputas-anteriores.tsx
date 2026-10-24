import { History } from "lucide-react"

import { InsigniaEstadoDisputa } from "@/features/disputas/components/estado-disputa"
import {
  MOTIVOS,
  quienAbrio,
  situacionDisputa,
} from "@/features/disputas/presentacion"
import type { DisputaDetalle } from "@/features/disputas/tipos"
import { contar, formatearFechaHoraFija } from "@/features/operacion/formato"

import type { PerspectivaParte } from "../../disputa"

/**
 * Las disputas ya cerradas de la asignación (la más reciente arriba): quién
 * la abrió y por qué, cómo terminó en la voz de quien mira y la explicación
 * del equipo AMO. Solo el resumen: la conversación es de la disputa vigente.
 */
export function DisputasAnteriores({
  disputas,
  perspectiva,
}: {
  disputas: readonly DisputaDetalle[]
  perspectiva: PerspectivaParte
}) {
  if (disputas.length === 0) return null
  return (
    <section
      aria-labelledby="titulo-disputas-anteriores"
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5"
    >
      <header className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <History aria-hidden className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2
            id="titulo-disputas-anteriores"
            className="text-[0.9375rem] font-semibold"
          >
            Disputas anteriores
          </h2>
          <p className="text-xs text-muted-foreground">
            {contar(disputas.length, "disputa cerrada", "disputas cerradas")}{" "}
            sobre esta publicación.
          </p>
        </div>
      </header>
      <ol className="flex flex-col gap-2.5">
        {disputas.map((disputa) => {
          const situacion = situacionDisputa(disputa, perspectiva)
          return (
            <li
              key={disputa.id}
              className="flex flex-col gap-1.5 rounded-lg border bg-background/50 px-3.5 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-pretty">
                  {situacion.titulo}
                </p>
                <InsigniaEstadoDisputa
                  estado={disputa.estado}
                  perspectiva={perspectiva}
                  className="h-5 px-2 text-[0.6875rem]"
                />
              </div>
              <p className="text-xs text-pretty text-muted-foreground">
                {quienAbrio(disputa.parte, perspectiva)} el{" "}
                <time dateTime={disputa.creadaAt} className="cifras">
                  {formatearFechaHoraFija(disputa.creadaAt)}
                </time>{" "}
                · Motivo:{" "}
                {MOTIVOS[disputa.motivo].etiqueta.toLocaleLowerCase("es-CO")}
                {disputa.resueltaAt ? (
                  <>
                    {" "}
                    · Cerrada el{" "}
                    <time dateTime={disputa.resueltaAt} className="cifras">
                      {formatearFechaHoraFija(disputa.resueltaAt)}
                    </time>
                  </>
                ) : null}
              </p>
              {disputa.resolucion ? (
                <p className="text-sm text-pretty break-words whitespace-pre-line">
                  <span className="text-muted-foreground">
                    Explicación del equipo AMO:{" "}
                  </span>
                  {disputa.resolucion}
                </p>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
