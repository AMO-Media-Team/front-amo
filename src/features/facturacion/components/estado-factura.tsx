import {
  Ban,
  CircleCheck,
  FilePen,
  Hourglass,
  type LucideIcon,
  Receipt,
  TriangleAlert,
} from "lucide-react"

import type { Tono } from "@/features/operacion/estados"
import { AvisoEstadoFicha } from "@/features/operacion/components/ficha"
import { formatearCOP, formatearFecha } from "@/lib/format"

import { MENSAJES_FACTURACION } from "../errores"
import { ID_ESTADO_FACTURA } from "../foco"
import { situacionVencimiento } from "../presentacion"
import type { FichaFactura, NotaCreditoFactura } from "../tipos"

interface Aviso {
  tono: Tono
  icono: LucideIcon
  titulo: string
  texto: string
}

/** Qué significa el estado de la factura y qué toca hacer (módulo de presentación). */
export function avisoDeFactura(
  factura: Pick<
    FichaFactura,
    | "estado"
    | "numero"
    | "saldo"
    | "fechaVencimiento"
    | "pagadaAt"
    | "valorNotasCredito"
  >,
  {
    desactualizada,
    notaQueAnula,
    ahora,
  }: {
    /** Borrador con alguna asignación que ya no está verificada. */
    desactualizada: boolean
    notaQueAnula: NotaCreditoFactura | null
    ahora: Date
  }
): Aviso {
  const vencimiento = situacionVencimiento(factura, ahora)
  switch (factura.estado) {
    case "BORRADOR":
      return desactualizada
        ? {
            tono: "peligro",
            icono: TriangleAlert,
            titulo: "Borrador desactualizado",
            texto: MENSAJES_FACTURACION.borradorDesactualizado,
          }
        : {
            tono: "info",
            icono: FilePen,
            titulo: "Borrador: falta expedirla",
            texto:
              "Descarga el archivo de carga, expide la factura en el software de facturación de AMO y registra aquí su número, CUFE y PDF. El anunciante no la ve hasta entonces.",
          }
    case "EMITIDA":
      return {
        tono: vencimiento?.tono === "aviso" ? "aviso" : "info",
        icono: Receipt,
        titulo: `Emitida · por cobrar ${formatearCOP(factura.saldo)}`,
        texto: vencimiento
          ? `${vencimiento.texto}. Registra cada pago con su soporte cuando llegue.`
          : "Registra cada pago con su soporte cuando llegue.",
      }
    case "PAGADA_PARCIAL":
      return {
        tono: vencimiento?.vencida ? "peligro" : "aviso",
        icono: Hourglass,
        titulo: `Pago parcial · saldo ${formatearCOP(factura.saldo)}`,
        texto: vencimiento
          ? `${vencimiento.texto}. Falta el resto del pago.`
          : "Falta el resto del pago.",
      }
    case "VENCIDA":
      return {
        tono: "peligro",
        icono: TriangleAlert,
        titulo: `Vencida · saldo ${formatearCOP(factura.saldo)}`,
        texto: `${vencimiento?.texto ?? "Pasó su fecha de vencimiento"}. Aparece en la cartera vencida hasta que se pague o se corrija con una nota crédito.`,
      }
    case "PAGADA":
      return {
        tono: "exito",
        icono: CircleCheck,
        titulo: "Pagada",
        texto: factura.pagadaAt
          ? `Sin saldo pendiente desde el ${formatearFecha(factura.pagadaAt, "largo")}.`
          : "Sin saldo pendiente.",
      }
    case "ANULADA":
      return factura.numero
        ? {
            tono: "neutro",
            icono: Ban,
            titulo: notaQueAnula
              ? `Anulada con la nota crédito ${notaQueAnula.numero}`
              : "Anulada con nota crédito",
            texto:
              "Salió de la cartera. Sus asignaciones quedaron libres para facturarse de nuevo.",
          }
        : {
            tono: "neutro",
            icono: Ban,
            titulo: "Borrador anulado",
            texto:
              "No se expidió. Sus asignaciones quedaron libres para otro borrador.",
          }
  }
}

/**
 * Aviso del estado de la factura: región con nombre y enfocable, que recibe
 * el foco tras registrar algo (el botón que abrió el diálogo puede ya no
 * existir) y así anuncia el estado nuevo.
 */
export function EstadoFactura({
  factura,
  desactualizada,
  notaQueAnula,
  ahora,
}: {
  factura: FichaFactura
  desactualizada: boolean
  notaQueAnula: NotaCreditoFactura | null
  ahora: Date
}) {
  const aviso = avisoDeFactura(factura, { desactualizada, notaQueAnula, ahora })
  return (
    <AvisoEstadoFicha
      id={ID_ESTADO_FACTURA}
      tono={aviso.tono}
      icono={aviso.icono}
      titulo={aviso.titulo}
    >
      {aviso.texto}
    </AvisoEstadoFicha>
  )
}
