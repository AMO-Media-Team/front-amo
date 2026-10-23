import { InsigniaEstado } from "@/features/operacion/components/distintivos"
import { formatearFechaHora, formatearNumero } from "@/lib/format"

import { camposMetricas } from "../campos-metricas"
import { cifrasDe } from "../coherencia"
import { describirPeriodo, REVISION_PARA_MEDIO } from "../presentacion"
import type { MetricaEjecucion, Plataforma } from "../tipos"
import { CapturaEnviada } from "./captura-enviada"

const SUFIJOS = { entero: "", segundos: " s", porcentaje: " %" } as const

/** Un corte ya cargado, de solo lectura (aprobado o de una campaña cerrada). */
export function ResumenMetrica({
  metrica,
  plataforma,
  formato,
  titulo,
}: {
  metrica: MetricaEjecucion
  plataforma: Plataforma
  formato: string | null
  /** «Métricas de 24 horas». */
  titulo: string
}) {
  const definiciones = camposMetricas(plataforma, formato)
  const { interacciones } = cifrasDe(metrica.valores)
  return (
    <section
      aria-label={titulo}
      className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Lo que enviaste</h2>
        <InsigniaEstado
          catalogo={REVISION_PARA_MEDIO}
          estado={metrica.estado}
        />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        {definiciones.map((definicion) => {
          const valor = metrica.valores[definicion.clave]
          return (
            <div key={definicion.clave} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">
                {definicion.etiqueta}
              </dt>
              <dd className="font-medium cifras">
                {valor === null
                  ? "—"
                  : `${formatearNumero(valor, definicion.tipo === "entero" ? 0 : 2)}${SUFIJOS[definicion.tipo]}`}
              </dd>
            </div>
          )
        })}
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Interacciones</dt>
          <dd className="font-medium cifras">
            {formatearNumero(interacciones)}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        {metrica.periodoDesde && metrica.periodoHasta
          ? `${describirPeriodo(metrica.periodoDesde, metrica.periodoHasta)}. `
          : ""}
        Captura del {formatearFechaHora(metrica.fechaCorte)}.
      </p>
      <CapturaEnviada
        origen={{ tipo: "metrica", id: metrica.id }}
        titulo={`Captura · ${titulo}`}
      />
    </section>
  )
}
