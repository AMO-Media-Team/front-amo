import { HandCoins } from "lucide-react"

import { TarjetaFicha } from "@/features/operacion/components/ficha"
import { instanteDeDia } from "@/features/operacion/formato"
import { formatearCOP, formatearFecha, formatearNumero } from "@/lib/format"

import { etiquetaMedioPago } from "../presentacion"
import type { PagoFactura } from "../tipos"
import { BotonArchivoFactura } from "./boton-archivo-factura"

/**
 * Pagos que AMO registró contra la factura: fecha, valor, retenciones que
 * practicó la empresa, medio de pago, referencia y el soporte para descargar.
 */
export function PagosFactura({
  pagos,
  conSaldo,
}: {
  pagos: readonly PagoFactura[]
  /** La factura aún tiene saldo: el vacío explica cuándo aparecerá el pago. */
  conSaldo: boolean
}) {
  return (
    <TarjetaFicha
      titulo="Pagos"
      icono={HandCoins}
      descripcion={
        pagos.length === 0
          ? undefined
          : pagos.length === 1
            ? "1 pago registrado."
            : `${formatearNumero(pagos.length)} pagos registrados, del más reciente al más antiguo.`
      }
    >
      {pagos.length === 0 ? (
        <p className="text-sm text-pretty text-muted-foreground">
          {conSaldo
            ? "Aún no registramos pagos de esta factura. Cuando AMO reciba tu pago lo verás aquí con su soporte."
            : "Esta factura no tiene pagos registrados."}
        </p>
      ) : (
        <ul
          aria-label="Pagos de la factura"
          className="-my-3 flex flex-col divide-y"
        >
          {pagos.map((pago) => {
            const fecha = formatearFecha(instanteDeDia(pago.fecha), "largo")
            return (
              <li
                key={pago.id}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-heading text-base font-semibold cifras">
                      {formatearCOP(pago.monto)}
                    </span>
                    <time
                      dateTime={pago.fecha}
                      className="text-sm text-muted-foreground"
                    >
                      {fecha}
                    </time>
                  </p>
                  <p className="text-xs text-pretty text-muted-foreground">
                    {etiquetaMedioPago(pago.medioPago)}
                    {pago.referencia ? (
                      <>
                        {" · Referencia "}
                        <span className="cifras break-all">
                          {pago.referencia}
                        </span>
                      </>
                    ) : null}
                  </p>
                  {pago.retenciones > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Más {formatearCOP(pago.retenciones)} de retenciones que
                      practicaste
                    </p>
                  ) : null}
                </div>
                {pago.tieneSoporte ? (
                  <BotonArchivoFactura
                    tipo="pago"
                    id={pago.id}
                    texto="Soporte"
                    nombre={`Descargar el soporte del pago del ${fecha}`}
                    className="w-fit shrink-0"
                  />
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </TarjetaFicha>
  )
}
