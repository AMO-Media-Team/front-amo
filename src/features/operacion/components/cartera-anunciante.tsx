import { Receipt, Wallet } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import {
  formatearCOP,
  formatearCOPCompacto,
  formatearNumero,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { ETIQUETAS_TRAMO, TRAMOS_CARTERA, type TramoCartera } from "../calculos"
import { ESTADOS_FACTURA } from "../estados"
import { formatearFechaCompacta, instanteDeDia } from "../formato"
import type { CarteraAnunciante as Cartera } from "../tipos"
import { InsigniaEstado } from "./distintivos"
import { TarjetaFicha } from "./ficha"

/** De lo más reciente (tinte suave) a lo más vencido (intenso). */
const CLASES_TRAMO: Readonly<Record<TramoCartera, string>> = {
  "0_30": "bg-info/70",
  "31_60": "bg-warning/60",
  "61_90": "bg-warning",
  "90_mas": "bg-destructive",
}

function Antiguedad({ cartera }: { cartera: Cartera }) {
  const { resumen } = cartera
  return (
    <div className="grid gap-x-10 gap-y-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-center">
      <dl className="grid grid-cols-3 gap-4">
        {(
          [
            ["Facturado", resumen.facturado],
            ["Pagado", resumen.pagado],
            ["Saldo por cobrar", resumen.saldo],
          ] as const
        ).map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
            <dd
              className="truncate font-heading text-lg font-semibold cifras sm:text-xl"
              title={formatearCOP(valor)}
            >
              {formatearCOPCompacto(valor)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <div
          aria-hidden
          className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          {resumen.saldo > 0
            ? TRAMOS_CARTERA.map((tramo) => (
                <span
                  key={tramo}
                  className={CLASES_TRAMO[tramo]}
                  style={{
                    width: `${(resumen.porTramo[tramo] / resumen.saldo) * 100}%`,
                  }}
                />
              ))
            : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          {TRAMOS_CARTERA.map((tramo) => (
            <div key={tramo} className="flex min-w-0 flex-col gap-0.5">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className={cn("size-2 rounded-sm", CLASES_TRAMO[tramo])}
                />
                {ETIQUETAS_TRAMO[tramo]}
              </dt>
              <dd
                className="text-sm font-medium cifras"
                title={formatearCOP(resumen.porTramo[tramo])}
              >
                {formatearCOPCompacto(resumen.porTramo[tramo])}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Antigüedad por días desde el vencimiento (0–30 incluye lo que aún no
          vence).
          {resumen.facturasVencidas > 0
            ? ` ${formatearNumero(resumen.facturasVencidas)} ${
                resumen.facturasVencidas === 1
                  ? "factura vencida"
                  : "facturas vencidas"
              } con saldo.`
            : ""}
        </p>
      </div>
    </div>
  )
}

function ListaFacturas({ cartera }: { cartera: Cartera }) {
  return (
    <div
      role="region"
      tabIndex={0}
      aria-label="Facturas del anunciante (tabla desplazable)"
      className="-m-5 overflow-x-auto rounded-b-xl focus-visible:anillo-foco"
    >
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="sr-only">Facturas del anunciante</caption>
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th scope="col" className="px-5 py-2 font-medium">
              Factura
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Emisión
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Vence
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Total
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Saldo
            </th>
            <th scope="col" className="px-5 py-2 font-medium">
              Estado
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {cartera.facturas.map((factura) => (
            <tr
              key={factura.id}
              className="transition-colors hover:bg-muted/40"
            >
              <td className="px-5 py-2.5">
                <span className="flex flex-col">
                  <span className="font-medium cifras">
                    {factura.numero ?? "Sin número"}
                  </span>
                  <span className="max-w-56 truncate text-xs text-muted-foreground">
                    {factura.campana ?? "—"}
                  </span>
                </span>
              </td>
              <td className="px-3 py-2.5 cifras whitespace-nowrap text-muted-foreground">
                {factura.fechaEmision
                  ? formatearFechaCompacta(instanteDeDia(factura.fechaEmision))
                  : "—"}
              </td>
              <td className="px-3 py-2.5 cifras whitespace-nowrap text-muted-foreground">
                {factura.fechaVencimiento
                  ? formatearFechaCompacta(
                      instanteDeDia(factura.fechaVencimiento)
                    )
                  : "—"}
              </td>
              <td className="px-3 py-2.5 text-right cifras whitespace-nowrap">
                {formatearCOP(factura.total)}
              </td>
              <td
                className={cn(
                  "px-3 py-2.5 text-right font-medium cifras whitespace-nowrap",
                  !factura.saldo && "font-normal text-muted-foreground"
                )}
              >
                {formatearCOP(factura.saldo)}
              </td>
              <td className="px-5 py-2.5">
                <InsigniaEstado
                  catalogo={ESTADOS_FACTURA}
                  estado={factura.estado}
                  className="h-5 px-2 text-[0.6875rem]"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Cartera del anunciante (`facturas.ver`): facturado, pagado y saldo con su
 * antigüedad, y las facturas una por una. Misma regla que el reporte de
 * cartera: borradores y anuladas no cuentan.
 */
export function CarteraAnunciante({ cartera }: { cartera: Cartera }) {
  if (cartera.facturas.length === 0) {
    return (
      <EstadoVacio
        icono={Receipt}
        titulo="Sin facturas"
        descripcion="Cuando se facturen las campañas de este anunciante verás aquí lo facturado, lo pagado y lo que queda por cobrar."
      />
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <TarjetaFicha titulo="Saldo y antigüedad" icono={Wallet}>
        <Antiguedad cartera={cartera} />
      </TarjetaFicha>
      <TarjetaFicha
        titulo="Facturas"
        icono={Receipt}
        descripcion={
          cartera.facturas.length === 1
            ? "1 registrada."
            : `${formatearNumero(cartera.facturas.length)} registradas, de la más reciente a la más antigua.`
        }
      >
        <ListaFacturas cartera={cartera} />
      </TarjetaFicha>
    </div>
  )
}
