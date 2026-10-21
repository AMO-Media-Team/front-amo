import { formatearCOP, formatearPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

import { repartoComision } from "../presentacion"
import { decimalesPorcentaje } from "../valores"

/** Monto de ejemplo con el que se explica el reparto. */
export const BRUTO_EJEMPLO = 1_000_000

/**
 * Cómo se reparte una asignación con la comisión dada: barra proporcional y
 * montos de AMO y del medio. Sirve de lectura rápida de lo que implica la
 * cifra (y de vista previa al escribir una excepción).
 */
export function RepartoComision({
  porcentaje,
  bruto = BRUTO_EJEMPLO,
  className,
}: {
  porcentaje: number
  bruto?: number
  className?: string
}) {
  const valido =
    Number.isFinite(porcentaje) && porcentaje >= 0 && porcentaje <= 1
  const fraccion = valido ? porcentaje : 0
  const { comision, medio } = repartoComision(bruto, fraccion)
  const textoPorcentaje = formatearPorcentaje(
    fraccion,
    decimalesPorcentaje(fraccion)
  )
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <p className="text-xs text-muted-foreground">
        En una asignación de{" "}
        <span className="font-medium cifras text-foreground">
          {formatearCOP(bruto)}
        </span>
      </p>
      <div
        role="img"
        aria-label={`AMO recibe ${formatearCOP(comision)} y el medio ${formatearCOP(medio)}`}
        className="flex h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="h-full bg-primary transition-[width] duration-500"
          style={{ width: `${fraccion * 100}%` }}
        />
        <span className="h-full flex-1 bg-success/70" />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="size-2 rounded-full bg-primary" />
            AMO ({textoPorcentaje})
          </dt>
          <dd className="font-semibold cifras">{formatearCOP(comision)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="size-2 rounded-full bg-success/70" />
            Medio
          </dt>
          <dd className="font-semibold cifras">{formatearCOP(medio)}</dd>
        </div>
      </dl>
    </div>
  )
}
