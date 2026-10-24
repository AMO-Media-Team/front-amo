import { FileText } from "lucide-react"

import {
  ListaDatos,
  SinDato,
  TarjetaFicha,
} from "@/features/operacion/components/ficha"
import { formatearVigencia, instanteDeDia } from "@/features/operacion/formato"
import { formatearFecha } from "@/lib/format"

import { ESQUEMAS_FACTURACION } from "../presentacion"
import type { FacturaDetalle } from "../tipos"
import { CufeCopiable } from "./cufe-copiable"
import { TextoPlazo } from "./distintivos-factura"

/**
 * Datos de la factura para la contabilidad de la empresa: número, CUFE
 * completo con copiar, emisión, vencimiento con su plazo, periodo de la pauta
 * y la modalidad de facturación.
 */
export function DatosFactura({
  factura,
  className,
}: {
  factura: FacturaDetalle
  className?: string
}) {
  return (
    <TarjetaFicha
      titulo="Datos de la factura"
      icono={FileText}
      className={className}
    >
      <ListaDatos
        className="lg:grid-cols-1 xl:grid-cols-2"
        datos={[
          {
            etiqueta: "Número",
            valor: <span className="font-medium cifras">{factura.numero}</span>,
          },
          {
            etiqueta: "Modalidad",
            valor: ESQUEMAS_FACTURACION[factura.esquema].etiqueta,
          },
          {
            etiqueta: "Emisión",
            valor: (
              <time dateTime={factura.fechaEmision}>
                {formatearFecha(instanteDeDia(factura.fechaEmision), "largo")}
              </time>
            ),
          },
          {
            etiqueta: "Vencimiento",
            valor: factura.fechaVencimiento ? (
              <span className="flex flex-col">
                <time dateTime={factura.fechaVencimiento}>
                  {formatearFecha(
                    instanteDeDia(factura.fechaVencimiento),
                    "largo"
                  )}
                </time>
                {factura.plazo ? (
                  <TextoPlazo plazo={factura.plazo} className="text-xs" />
                ) : null}
              </span>
            ) : (
              <SinDato>Sin fecha de vencimiento</SinDato>
            ),
          },
          {
            etiqueta: "Periodo de la pauta",
            valor:
              factura.periodoDesde && factura.periodoHasta ? (
                formatearVigencia(factura.periodoDesde, factura.periodoHasta)
              ) : (
                <SinDato />
              ),
          },
        ]}
      />
      <div className="mt-5 flex flex-col gap-1.5 border-t pt-4">
        <p className="text-xs font-medium text-muted-foreground">
          CUFE (código único de factura electrónica)
        </p>
        {factura.cufe ? (
          <CufeCopiable cufe={factura.cufe} numero={factura.numero} completo />
        ) : (
          <SinDato>Aún no registrado</SinDato>
        )}
      </div>
    </TarjetaFicha>
  )
}
