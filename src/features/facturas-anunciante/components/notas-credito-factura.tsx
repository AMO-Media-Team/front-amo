import { FileMinus } from "lucide-react"

import { InsigniaTono } from "@/features/operacion/components/distintivos"
import { TarjetaFicha } from "@/features/operacion/components/ficha"
import { instanteDeDia } from "@/features/operacion/formato"
import { formatearCOP, formatearFecha, formatearNumero } from "@/lib/format"

import type { NotaCreditoFactura } from "../tipos"
import { BotonArchivoFactura } from "./boton-archivo-factura"

/**
 * Notas crédito de la factura (una expedida no se anula: se corrige así):
 * número, fecha, valor, motivo y su PDF. Solo se muestra si hay alguna.
 */
export function NotasCreditoFactura({
  notas,
}: {
  notas: readonly NotaCreditoFactura[]
}) {
  if (notas.length === 0) return null
  return (
    <TarjetaFicha
      titulo="Notas crédito"
      icono={FileMinus}
      descripcion={
        notas.length === 1
          ? "Rebajan el valor de la factura."
          : `${formatearNumero(notas.length)} notas crédito: rebajan el valor de la factura.`
      }
    >
      <ul
        aria-label="Notas crédito de la factura"
        className="-my-3 flex flex-col divide-y"
      >
        {notas.map((nota) => (
          <li
            key={nota.id}
            className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium cifras">Nota {nota.numero}</span>
                <span className="font-heading font-semibold cifras">
                  <span aria-hidden>− </span>
                  <span className="sr-only">rebaja de </span>
                  {formatearCOP(nota.valor)}
                </span>
                {nota.anulaFactura ? (
                  <InsigniaTono tono="neutro" etiqueta="Anuló la factura" />
                ) : null}
              </p>
              <time
                dateTime={nota.fechaEmision}
                className="text-xs text-muted-foreground"
              >
                Emitida el{" "}
                {formatearFecha(instanteDeDia(nota.fechaEmision), "largo")}
              </time>
              <p className="text-sm text-pretty break-words">{nota.motivo}</p>
            </div>
            <BotonArchivoFactura
              tipo="nota_credito"
              id={nota.id}
              texto="PDF"
              nombre={`Descargar el PDF de la nota crédito ${nota.numero}`}
              className="w-fit shrink-0"
            />
          </li>
        ))}
      </ul>
    </TarjetaFicha>
  )
}
