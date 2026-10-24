import { useId } from "react"

import {
  camposMetricas,
  type DefinicionCampo,
} from "@/features/ejecucion/campos-metricas"
import type { ValoresMetricas } from "@/features/ejecucion/tipos"
import type { Plataforma } from "@/features/operacion/estados"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

function valorDe(definicion: DefinicionCampo, valor: number | null): string {
  if (valor === null) return "—"
  switch (definicion.tipo) {
    case "segundos":
      return `${formatearNumero(valor, 1)} s`
    case "porcentaje":
      return `${formatearNumero(valor, 1)} %`
    default:
      return formatearNumero(valor)
  }
}

/**
 * Las cifras que cargó el medio con los nombres de su plataforma (EP §9),
 * para compararlas con la captura: alcance e impresiones (o reproducciones y
 * espectadores únicos en TikTok) primero y la suma de interacciones.
 */
export function CifrasMetrica({
  plataforma,
  formato,
  valores,
  interacciones,
  destacadas = [],
  className,
}: {
  plataforma: Plataforma
  /** Clave del formato de la oferta (`REEL`…). */
  formato: string | null
  valores: ValoresMetricas
  interacciones: number | null
  /** Cifras que la alerta señala (se resaltan). */
  destacadas?: readonly string[]
  className?: string
}) {
  const idTitulo = useId()
  const definiciones = camposMetricas(plataforma, formato)
  return (
    <section
      aria-labelledby={idTitulo}
      className={cn("@container flex flex-col gap-3", className)}
    >
      <h3 id={idTitulo} className="text-sm font-semibold">
        Cifras reportadas
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-muted/20 p-3.5 @md:grid-cols-3">
        {definiciones.map((definicion) => (
          <div key={definicion.clave} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">
              {definicion.etiqueta}
            </dt>
            <dd
              className={cn(
                "text-[0.9375rem] font-semibold cifras",
                destacadas.includes(definicion.clave) && "text-warning"
              )}
            >
              {valorDe(definicion, valores[definicion.clave])}
            </dd>
          </div>
        ))}
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Interacciones</dt>
          <dd className="text-[0.9375rem] font-semibold cifras">
            {interacciones === null ? "—" : formatearNumero(interacciones)}
          </dd>
        </div>
      </dl>
    </section>
  )
}
