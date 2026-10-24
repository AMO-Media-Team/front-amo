import { CalendarClock, CircleAlert, Wallet } from "lucide-react"

import {
  RejillaResumen,
  TarjetaResumen,
} from "@/features/operacion/components/tarjeta-resumen"
import { instanteDeDia } from "@/features/operacion/formato"
import { formatearFecha, formatearNumero } from "@/lib/format"

import { rutaFacturaAnunciante, rutaFacturasEn } from "../rutas"
import type { ResumenFacturas as Resumen } from "../tipos"

function contarFacturas(cantidad: number): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? "factura" : "facturas"}`
}

/**
 * Lo que la empresa debe, sin los filtros de la tabla: saldo por pagar, lo
 * vencido (enlaza al listado de vencidas) y la factura que vence primero
 * (enlaza a ella).
 */
export function ResumenFacturas({ resumen }: { resumen: Resumen }) {
  const { proximo } = resumen
  return (
    <RejillaResumen etiqueta="Resumen de tus facturas" columnas={3}>
      <TarjetaResumen
        indice={0}
        titulo="Por pagar"
        valor={resumen.porPagar}
        formato="copCompacto"
        icono={Wallet}
        tono="info"
        detalle={
          resumen.facturasPorPagar > 0
            ? `Saldo de ${contarFacturas(resumen.facturasPorPagar)}`
            : "Estás al día: no tienes saldos pendientes"
        }
      />
      <TarjetaResumen
        indice={1}
        titulo="Vencido"
        valor={resumen.vencido}
        formato="copCompacto"
        icono={CircleAlert}
        tono={resumen.vencido > 0 ? "peligro" : "exito"}
        alerta={resumen.vencido > 0}
        href={
          resumen.facturasVencidas > 0 ? rutaFacturasEn("VENCIDA") : undefined
        }
        detalle={
          resumen.facturasVencidas > 0
            ? `${contarFacturas(resumen.facturasVencidas)} con el plazo vencido`
            : "Nada vencido"
        }
      />
      <TarjetaResumen
        indice={2}
        titulo="Próximo vencimiento"
        valor={proximo ? proximo.saldo : null}
        formato="copCompacto"
        icono={CalendarClock}
        tono={proximo && proximo.plazo.tono === "aviso" ? "aviso" : "neutro"}
        href={proximo ? rutaFacturaAnunciante(proximo.id) : undefined}
        detalle={
          proximo
            ? `Factura ${proximo.numero} · ${proximo.plazo.texto.toLocaleLowerCase("es-CO")} (${formatearFecha(
                instanteDeDia(proximo.fechaVencimiento)
              )})${
                proximo.otrasElMismoDia > 0
                  ? ` y ${contarFacturas(proximo.otrasElMismoDia)} más ese día`
                  : ""
              }`
            : "Ninguna factura por vencer"
        }
      />
    </RejillaResumen>
  )
}
