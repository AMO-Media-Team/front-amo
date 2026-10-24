import {
  BadgeCheck,
  ChartColumnBig,
  FileImage,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  type AccesoValidacion,
  type ColaValidacion,
  COLAS,
  COLAS_VALIDACION,
  colasVisibles,
  rutaCola,
} from "../colas"
import { contadoresValidacion } from "../queries"
import type { ContadoresValidacion } from "../tipos"

const ICONOS: Readonly<Record<ColaValidacion, LucideIcon>> = {
  evidencias: FileImage,
  metricas: ChartColumnBig,
  verificar: BadgeCheck,
}

interface Contador {
  cantidad: number | null
  /** Dato secundario («2 con alerta», «5 listas»). */
  detalle: string | null
  /** El detalle pide atención (alertas). */
  destacado: boolean
}

function contadorDe(
  cola: ColaValidacion,
  contadores: ContadoresValidacion
): Contador {
  switch (cola) {
    case "evidencias":
      return {
        cantidad: contadores.evidencias,
        detalle: null,
        destacado: false,
      }
    case "metricas": {
      const alertas = contadores.metricasConAlerta ?? 0
      return {
        cantidad: contadores.metricas,
        detalle:
          alertas > 0
            ? `${formatearNumero(alertas)} con alerta`
            : contadores.metricas
              ? "sin alertas"
              : null,
        destacado: alertas > 0,
      }
    }
    case "verificar": {
      const listas = contadores.verificarListas ?? 0
      return {
        cantidad: contadores.verificar,
        detalle: contadores.verificar
          ? `${formatearNumero(listas)} ${listas === 1 ? "lista" : "listas"}`
          : null,
        destacado: false,
      }
    }
  }
}

function textoPendientes({ cantidad, detalle }: Contador): string {
  if (cantidad === null) return "sin acceso"
  if (cantidad === 0) return "nada pendiente"
  const base = `${formatearNumero(cantidad)} ${cantidad === 1 ? "pendiente" : "pendientes"}`
  return detalle ? `${base}, ${detalle}` : base
}

function EnlaceCola({
  cola,
  activa,
  contador,
}: {
  cola: ColaValidacion
  activa: boolean
  contador: Contador
}) {
  const Icono = ICONOS[cola]
  const { titulo, descripcion } = COLAS[cola]
  const { cantidad, detalle, destacado } = contador
  return (
    <Link
      href={rutaCola(cola)}
      scroll={false}
      aria-current={activa ? "page" : undefined}
      aria-label={`${titulo}: ${textoPendientes(contador)}`}
      title={descripcion}
      className={cn(
        "group flex min-h-16 items-center gap-3 rounded-xl border bg-card px-3.5 py-3 transition-colors outline-none hover:bg-muted/60 focus-visible:anillo-foco sm:min-h-24 sm:flex-col sm:items-start sm:gap-2 sm:px-4",
        activa &&
          "border-primary/50 bg-primary/6 ring-1 ring-primary/30 hover:bg-primary/10"
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:w-full sm:flex-none">
        <span
          className={cn(
            "flex min-w-0 items-center gap-2 text-sm font-medium",
            activa ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <Icono
            aria-hidden
            className={cn("size-4 shrink-0", activa && "text-primary")}
          />
          <span className="truncate">{titulo}</span>
        </span>
        {detalle ? (
          <span
            aria-hidden
            className={cn(
              "truncate pl-6 text-xs",
              destacado ? "font-medium text-warning" : "text-muted-foreground"
            )}
          >
            {detalle}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "ml-auto shrink-0 text-2xl leading-none font-semibold cifras sm:ml-0 sm:text-[1.75rem]",
          cantidad === null || cantidad === 0
            ? "text-muted-foreground"
            : "text-foreground"
        )}
      >
        {cantidad === null ? "—" : formatearNumero(cantidad)}
      </span>
    </Link>
  )
}

/** Una fila en escritorio; en el teléfono, una debajo de otra. */
function clasesRejilla(cantidad: number): string {
  return cn(
    "grid grid-cols-1 gap-2 sm:gap-3",
    cantidad >= 3
      ? "sm:grid-cols-3"
      : cantidad === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-1"
  )
}

/**
 * Colas de la validación con lo pendiente en cada una. Son enlaces (la cola
 * activa va en la URL y la marca `aria-current`): se comparten, sobreviven al
 * recargar y funcionan sin JavaScript.
 */
export async function NavegacionValidacion({
  activa,
  acceso,
}: {
  activa: ColaValidacion
  acceso: AccesoValidacion
}) {
  const contadores = await contadoresValidacion(acceso)
  const colas = colasVisibles(acceso)
  return (
    <nav aria-label="Colas de validación">
      <ul className={clasesRejilla(colas.length)}>
        {colas.map((cola) => (
          <li key={cola} className="min-w-0">
            <EnlaceCola
              cola={cola}
              activa={cola === activa}
              contador={contadorDe(cola, contadores)}
            />
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Mientras llegan los contadores; sin `acceso` (p. ej. `loading.tsx`), todas. */
export function EsqueletoNavegacionValidacion({
  acceso,
}: {
  acceso?: AccesoValidacion
}) {
  const colas = acceso ? colasVisibles(acceso) : COLAS_VALIDACION
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando las colas…</span>
      <div aria-hidden className={clasesRejilla(colas.length)}>
        {colas.map((cola) => (
          <Esqueleto key={cola} className="h-16 rounded-xl sm:h-24" />
        ))}
      </div>
    </div>
  )
}
