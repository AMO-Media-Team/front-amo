import {
  CalendarRange,
  CircleCheck,
  CircleSlash,
  Megaphone,
  ReceiptText,
  TriangleAlert,
} from "lucide-react"

import { rutaMiCampana } from "@/features/campanas/rutas"
import { InsigniaDemo } from "@/features/operacion/components/distintivos"
import {
  AvisoEstadoFicha,
  CabeceraFicha,
  EnlaceFicha,
  Monograma,
} from "@/features/operacion/components/ficha"
import { formatearVigencia, instanteDeDia } from "@/features/operacion/formato"
import { formatearCOP, formatearFecha } from "@/lib/format"

import { describirCobertura } from "../presentacion"
import { RUTA_FACTURAS_ANUNCIANTE } from "../rutas"
import type { FacturaDetalle, NotaCreditoFactura } from "../tipos"
import { BotonArchivoFactura } from "./boton-archivo-factura"
import { InsigniaFactura, TextoPlazo } from "./distintivos-factura"

/** `id` del aviso de estado (región con nombre). */
export const ID_AVISO_FACTURA = "aviso-factura"

function fechaDia(dia: string, estilo: "medio" | "largo" = "largo"): string {
  return formatearFecha(instanteDeDia(dia), estilo)
}

/** Lo que la empresa necesita saber del estado, en su voz. */
function AvisoEstado({
  factura,
  notaQueAnula,
}: {
  factura: FacturaDetalle
  notaQueAnula: NotaCreditoFactura | null
}) {
  if (factura.estado === "VENCIDA") {
    return (
      <AvisoEstadoFicha
        id={ID_AVISO_FACTURA}
        tono="peligro"
        icono={TriangleAlert}
        titulo={`Factura vencida: quedan ${formatearCOP(factura.saldo)} por pagar`}
      >
        {factura.fechaVencimiento
          ? `Venció el ${fechaDia(factura.fechaVencimiento)}. `
          : ""}
        Si ya la pagaste, la verás al día cuando AMO registre tu pago.
      </AvisoEstadoFicha>
    )
  }
  if (factura.estado === "ANULADA") {
    return (
      <AvisoEstadoFicha
        id={ID_AVISO_FACTURA}
        tono="neutro"
        icono={CircleSlash}
        titulo="Factura anulada: no tienes que pagarla"
      >
        {notaQueAnula
          ? `AMO la anuló con la nota crédito ${notaQueAnula.numero} del ${fechaDia(notaQueAnula.fechaEmision)}.`
          : "AMO la anuló con una nota crédito."}{" "}
        La pauta que cubría puede incluirse en una factura nueva.
      </AvisoEstadoFicha>
    )
  }
  if (factura.estado === "PAGADA") {
    return (
      <AvisoEstadoFicha
        id={ID_AVISO_FACTURA}
        tono="exito"
        icono={CircleCheck}
        titulo="Factura pagada"
      >
        {factura.pagadaAt
          ? `Quedó sin saldo el ${formatearFecha(factura.pagadaAt, "largo")}.`
          : "No tiene saldo pendiente."}
      </AvisoEstadoFicha>
    )
  }
  return null
}

/**
 * Cabecera de la factura: número, a qué campaña corresponde (o que es
 * consolidada) y el periodo de la pauta, su estado con el plazo, la descarga
 * del PDF y las fechas de emisión y vencimiento. Debajo, el aviso del estado
 * (vencida, anulada o pagada).
 */
export function CabeceraFactura({
  factura,
  notaQueAnula,
  verCampanas,
}: {
  factura: FacturaDetalle
  notaQueAnula: NotaCreditoFactura | null
  /** `campanas.gestionar_propias`: la campaña enlaza a su ficha. */
  verCampanas: boolean
}) {
  const periodo =
    factura.periodoDesde && factura.periodoHasta
      ? formatearVigencia(factura.periodoDesde, factura.periodoHasta)
      : null
  return (
    <CabeceraFicha
      volver={{ href: RUTA_FACTURAS_ANUNCIANTE, titulo: "Facturas" }}
      antetitulo="Factura electrónica de venta"
      titulo={`Factura ${factura.numero}`}
      visual={<Monograma icono={ReceiptText} />}
      subtitulo={
        <span className="flex flex-col gap-1">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Megaphone aria-hidden className="size-3.5 shrink-0" />
            {factura.campana?.nombre ? (
              <EnlaceFicha
                href={rutaMiCampana(factura.campana.id)}
                permitido={verCampanas}
                className="truncate"
              >
                {factura.campana.nombre}
              </EnlaceFicha>
            ) : (
              <span className="truncate">
                {factura.campana
                  ? describirCobertura(factura.campana)
                  : "Consolidada: cubre la pauta de varias campañas"}
              </span>
            )}
          </span>
          {periodo ? (
            <span className="inline-flex items-center gap-1.5 cifras">
              <CalendarRange aria-hidden className="size-3.5 shrink-0" />
              Pauta verificada: {periodo}
            </span>
          ) : null}
        </span>
      }
      distintivos={
        <>
          <InsigniaFactura estado={factura.estado} />
          {factura.plazo ? (
            <TextoPlazo plazo={factura.plazo} className="text-xs" />
          ) : null}
          {factura.esDemo ? <InsigniaDemo /> : null}
        </>
      }
      acciones={
        factura.tienePdf ? (
          <BotonArchivoFactura
            tipo="factura"
            id={factura.id}
            texto="Descargar PDF"
            nombre={`Descargar PDF de la factura ${factura.numero}`}
            tamano="default"
            className="max-sm:w-full"
          />
        ) : (
          <span className="text-xs text-muted-foreground">
            El PDF aún no está disponible.
          </span>
        )
      }
      lateral={
        <>
          <span>
            Emitida el{" "}
            <time dateTime={factura.fechaEmision}>
              {fechaDia(factura.fechaEmision, "medio")}
            </time>
          </span>
          {factura.fechaVencimiento ? (
            <span>
              Vence el{" "}
              <time dateTime={factura.fechaVencimiento}>
                {fechaDia(factura.fechaVencimiento, "medio")}
              </time>
            </span>
          ) : null}
        </>
      }
      aviso={<AvisoEstado factura={factura} notaQueAnula={notaQueAnula} />}
    />
  )
}
