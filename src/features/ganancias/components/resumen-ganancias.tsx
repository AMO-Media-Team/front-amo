import { CalendarClock } from "lucide-react"

import { formatoMonto } from "@/features/dashboard/medio/datos"
import { formatearCOP, formatearCOPCompacto } from "@/lib/format"
import { cn } from "@/lib/utils"

import { contarPublicaciones, fechaDia, textoRegla } from "../presentacion"
import type { ResumenGanancias as Resumen } from "../tipos"

/** Pesos exactos; abreviado solo desde cien millones (no cabe a 390 px). */
function dinero(valor: number): string {
  return formatoMonto(valor) === "cop"
    ? formatearCOP(valor)
    : formatearCOPCompacto(valor)
}

function Monto({
  etiqueta,
  valor,
  rotulo,
  detalle,
  destacado = false,
}: {
  etiqueta: string
  valor: number
  /** Lo que es la cifra («Estimado antes de retenciones», «Neto recibido»…). */
  rotulo: string
  detalle?: string | null
  destacado?: boolean
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-xl border bg-card p-3 sm:p-4",
        destacado && "border-primary/30 bg-primary/5"
      )}
    >
      <dt className="text-xs font-medium text-muted-foreground">{etiqueta}</dt>
      <dd
        className="font-heading text-lg leading-tight font-semibold cifras tracking-tight sm:text-xl"
        title={formatearCOP(valor)}
      >
        {dinero(valor)}
      </dd>
      <dd className="text-[0.6875rem] leading-snug text-muted-foreground">
        {rotulo}
      </dd>
      {detalle ? (
        <dd className="text-[0.6875rem] leading-snug text-muted-foreground">
          {detalle}
        </dd>
      ) : null}
    </div>
  )
}

/**
 * Resumen de ganancias (MED-015): lo ganado este mes como cifra principal, y
 * lo por liquidar (rotulado «Estimado antes de retenciones», c2), lo por
 * pagar, lo pagado y las retenciones; al pie, la regla de pago con la fecha
 * del próximo.
 */
export function ResumenGanancias({ resumen }: { resumen: Resumen }) {
  const regla = textoRegla(resumen.periodicidad, resumen.diasPago)
  return (
    <section
      aria-labelledby="resumen-ganancias"
      className="relative isolate flex flex-col gap-4 overflow-hidden rounded-2xl border bg-card p-4 sm:p-6"
    >
      {/* Aurora de marca, tenue: jerarquía de la cifra principal. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full bg-aurora opacity-20 blur-3xl dark:opacity-25"
      />
      <h2 id="resumen-ganancias" className="sr-only">
        Resumen de tus ganancias
      </h2>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">
          Ganado este mes
        </p>
        <p
          className="font-heading text-4xl leading-none font-bold cifras tracking-tight sm:text-5xl"
          title={formatearCOP(resumen.ganadoMes)}
        >
          {dinero(resumen.ganadoMes)}
        </p>
        <p className="text-xs text-muted-foreground">
          Antes de retenciones · se suma al verificarse cada publicación
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Monto
          etiqueta="Por liquidar"
          valor={resumen.porLiquidar}
          rotulo="Estimado antes de retenciones"
          detalle={
            resumen.asignacionesPorLiquidar > 0
              ? `${contarPublicaciones(resumen.asignacionesPorLiquidar)} verificadas`
              : null
          }
        />
        <Monto
          etiqueta="Por pagar"
          valor={resumen.porPagar}
          rotulo="Neto, ya liquidado"
          detalle={
            resumen.proximoPagoEstimado
              ? `Próximo pago hasta el ${fechaDia(resumen.proximoPagoEstimado)}`
              : null
          }
          destacado={resumen.porPagar > 0}
        />
        <Monto
          etiqueta="Pagado a la fecha"
          valor={resumen.pagadoHistorico}
          rotulo="Neto recibido, después de retenciones"
        />
        <Monto
          etiqueta="Retenciones practicadas"
          valor={resumen.retencionesHistoricas}
          rotulo="Descontadas de tus pagos"
        />
      </dl>
      <p className="flex items-start gap-2 text-sm text-pretty text-muted-foreground">
        <CalendarClock
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-primary"
        />
        <span>
          {regla}
          {resumen.diasPago !== null && resumen.diasPago > 0
            ? " El plazo se cuenta desde el cierre de cada periodo."
            : null}
        </span>
      </p>
    </section>
  )
}
