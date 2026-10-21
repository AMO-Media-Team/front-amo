import type { FilaRanking } from "../agregacion"
import {
  formatearParticipacion,
  formatearValorGeo,
  unidadGeo,
} from "../formato"
import { DEFINICIONES_METRICAS, type MetricaGeo } from "../metricas"

interface ContenidoTooltipProps {
  nombre: string
  fila: FilaRanking | null
  color: string | null
  metrica: MetricaGeo
  por100k: boolean
  totalConDatos: number
  explorable: boolean
}

function textoValor(
  fila: FilaRanking | null,
  metrica: MetricaGeo,
  por100k: boolean
): string {
  if (!fila || fila.valor === null) {
    return !DEFINICIONES_METRICAS[metrica].aditiva && fila?.n
      ? `Muestra insuficiente (n = ${fila.n})`
      : "Sin datos"
  }
  const unidad = unidadGeo(metrica, por100k)
  const valor = formatearValorGeo(fila.valor, metrica, { por100k })
  return unidad ? `${valor} ${unidad}` : valor
}

/** Contenido del tooltip de hover: zona, cifra, puesto y cómo interactuar. */
export function ContenidoTooltip({
  nombre,
  fila,
  color,
  metrica,
  por100k,
  totalConDatos,
  explorable,
}: ContenidoTooltipProps) {
  const conDato = fila?.valor !== null && fila?.valor !== undefined
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-2 text-[0.8125rem] font-semibold">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-[3px] ring-1 ring-foreground/15"
          style={{ backgroundColor: color ?? "transparent" }}
        />
        <span className="truncate">{nombre}</span>
      </p>
      <p
        className={
          conDato
            ? "text-sm font-medium cifras text-foreground"
            : "text-xs text-muted-foreground"
        }
      >
        {textoValor(fila, metrica, por100k)}
      </p>
      {fila?.posicion ? (
        <p className="text-[0.6875rem] cifras text-muted-foreground">
          Puesto {fila.posicion} de {totalConDatos}
          {fila.participacion !== null
            ? ` · ${formatearParticipacion(fila.participacion)} del total`
            : ""}
        </p>
      ) : null}
      <p className="mt-0.5 border-t border-foreground/8 pt-1.5 text-[0.6875rem] text-muted-foreground">
        Clic para ver el detalle
        {explorable ? " · doble clic para explorar" : ""}
      </p>
    </div>
  )
}
