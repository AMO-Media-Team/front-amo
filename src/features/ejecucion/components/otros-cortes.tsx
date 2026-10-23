import { ChevronRight } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import { InsigniaEstado } from "@/features/operacion/components/distintivos"
import { formatearNumero } from "@/lib/format"

import { cifrasDe } from "../coherencia"
import { NOMBRES_CORTE, ORDEN_CORTE, esCorteFijo } from "../cortes"
import { describirPeriodo, REVISION_PARA_MEDIO } from "../presentacion"
import type { MetricaEjecucion, Plataforma } from "../tipos"

function orden(metrica: MetricaEjecucion): number {
  return esCorteFijo(metrica.corte) ? ORDEN_CORTE[metrica.corte] : 9
}

function nombreDe(metrica: MetricaEjecucion): string {
  if (metrica.corte !== "PERSONALIZADO")
    return NOMBRES_CORTE[metrica.corte].largo
  return metrica.periodoDesde && metrica.periodoHasta
    ? `Personalizado · ${describirPeriodo(metrica.periodoDesde, metrica.periodoHasta).toLowerCase()}`
    : "Personalizado"
}

/**
 * Los otros cortes de la publicación con las cifras con que se comparan
 * (INT-005): así el medio entiende por qué un corte no cuadra.
 */
export function OtrosCortes({
  metricas,
  plataforma,
  ruta,
}: {
  metricas: readonly MetricaEjecucion[]
  plataforma: Plataforma
  ruta: (metrica: MetricaEjecucion) => Route
}) {
  if (metricas.length === 0) return null
  const tiktok = plataforma === "TIKTOK"
  const nombres = tiktok
    ? { alcance: "Espectadores", impresiones: "Reproducciones" }
    : { alcance: "Alcance", impresiones: "Impresiones" }
  const ordenadas = [...metricas].sort((a, b) => orden(a) - orden(b))
  return (
    <section aria-labelledby="otros-cortes" className="flex flex-col gap-3">
      <h2 id="otros-cortes" className="text-base font-semibold">
        Lo que ya cargaste de esta publicación
      </h2>
      <ul className="flex flex-col gap-2">
        {ordenadas.map((metrica) => {
          const cifras = cifrasDe(metrica.valores)
          return (
            <li key={metrica.id}>
              <Link
                href={ruta(metrica)}
                className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {nombreDe(metrica)}
                    </span>
                    <InsigniaEstado
                      catalogo={REVISION_PARA_MEDIO}
                      estado={metrica.estado}
                    />
                  </div>
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex gap-1">
                      <dt>{nombres.alcance}:</dt>
                      <dd className="cifras text-foreground">
                        {formatearNumero(cifras.alcance)}
                      </dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>{nombres.impresiones}:</dt>
                      <dd className="cifras text-foreground">
                        {formatearNumero(cifras.impresiones)}
                      </dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Interacciones:</dt>
                      <dd className="cifras text-foreground">
                        {formatearNumero(cifras.interacciones)}
                      </dd>
                    </div>
                  </dl>
                </div>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
