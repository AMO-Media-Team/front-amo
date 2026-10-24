import { Calculator } from "lucide-react"
import type { ReactNode } from "react"

import { TarjetaFicha } from "@/features/operacion/components/ficha"
import { formatearCOP, formatearPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

import { ESQUEMAS_FACTURACION } from "../presentacion"
import type { FacturaDetalle } from "../tipos"

function Fila({
  etiqueta,
  valor,
  ayuda,
  resta = false,
  destacada = false,
}: {
  etiqueta: ReactNode
  valor: number
  ayuda?: ReactNode
  /** Se descuenta del total (pagos, notas crédito). */
  resta?: boolean
  destacada?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 py-2.5",
        destacada && "py-3"
      )}
    >
      <dt className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "text-sm",
            destacada ? "font-semibold" : "text-muted-foreground"
          )}
        >
          {etiqueta}
        </span>
        {ayuda ? (
          <span className="text-xs text-pretty text-muted-foreground">
            {ayuda}
          </span>
        ) : null}
      </dt>
      <dd
        className={cn(
          "shrink-0 text-right cifras",
          destacada
            ? "font-heading text-xl font-semibold sm:text-2xl"
            : "text-sm font-medium"
        )}
      >
        {resta && valor > 0 ? (
          <>
            <span aria-hidden>− </span>
            <span className="sr-only">menos </span>
          </>
        ) : null}
        {formatearCOP(valor)}
      </dd>
    </div>
  )
}

/**
 * Totales de la factura como en el documento: subtotal, IVA, ingreso para
 * terceros (mandato), total; lo pagado (con las retenciones que practicó la
 * empresa), las notas crédito y el saldo por pagar.
 */
export function TotalesFactura({
  factura,
  retenciones,
  className,
}: {
  factura: FacturaDetalle
  /** Suma de las retenciones registradas en sus pagos. */
  retenciones: number
  className?: string
}) {
  const esquema = ESQUEMAS_FACTURACION[factura.esquema]
  return (
    <TarjetaFicha
      titulo="Totales"
      icono={Calculator}
      descripcion={`${esquema.etiqueta}: ${esquema.descripcion}`}
      className={className}
    >
      <dl className="flex flex-col divide-y">
        <Fila etiqueta="Subtotal" valor={factura.subtotal} />
        <Fila
          etiqueta={
            factura.porcentajeIva !== null
              ? `IVA (${formatearPorcentaje(factura.porcentajeIva, 0)})`
              : "IVA"
          }
          valor={factura.iva}
        />
        {factura.valorTerceros > 0 ? (
          <Fila
            etiqueta="Ingreso recibido para terceros"
            valor={factura.valorTerceros}
            ayuda="Lo que corresponde a los medios: AMO lo recibe a su nombre y no lleva IVA."
          />
        ) : null}
        <Fila etiqueta="Total" valor={factura.total} destacada />
        <Fila
          etiqueta="Pagado"
          valor={factura.pagado}
          resta
          ayuda={
            retenciones > 0
              ? `Incluye ${formatearCOP(retenciones)} de retenciones que practicaste.`
              : undefined
          }
        />
        {factura.valorNotasCredito > 0 ? (
          <Fila
            etiqueta="Notas crédito"
            valor={factura.valorNotasCredito}
            resta
          />
        ) : null}
        <Fila
          etiqueta={factura.estado === "ANULADA" ? "Saldo" : "Saldo por pagar"}
          valor={factura.saldo}
          destacada
        />
      </dl>
    </TarjetaFicha>
  )
}
