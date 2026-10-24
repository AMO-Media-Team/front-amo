import { Banknote, FileText, ListChecks, Receipt } from "lucide-react"
import Link from "next/link"

import { rutaAsignacionMedio } from "@/features/mis-campanas/rutas"
import {
  InsigniaTono,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import {
  CabeceraFicha,
  ListaDatos,
  SinDato,
  TarjetaFicha,
} from "@/features/operacion/components/ficha"
import { formatearCOP, formatearFecha } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  contarPublicaciones,
  detalleRetencion,
  documentoParaMedio,
  estadoParaMedio,
  fechaDia,
  fechaEstimada,
  nombreRetencion,
  PENDIENTE_DIAN,
  textoPeriodo,
} from "../presentacion"
import { RUTA_GANANCIAS } from "../rutas"
import type {
  LineaLiquidacionMedio,
  LiquidacionMedio,
  RetencionAgrupada,
} from "../tipos"
import { BotonDescargaLiquidacion } from "./descarga-liquidacion"

// ── Cabecera ─────────────────────────────────────────────────────────────────

export function CabeceraLiquidacionMedio({
  liquidacion,
  hoy,
}: {
  liquidacion: LiquidacionMedio
  hoy: string
}) {
  const estado = estadoParaMedio(liquidacion)
  const estimada = fechaEstimada(liquidacion, hoy)
  return (
    <CabeceraFicha
      volver={{ href: RUTA_GANANCIAS, titulo: "Ganancias" }}
      antetitulo="Liquidación"
      titulo={textoPeriodo(liquidacion.periodoInicio, liquidacion.periodoFin)}
      subtitulo={`${contarPublicaciones(liquidacion.cantidadAsignaciones)} · generada el ${formatearFecha(liquidacion.creadaAt)}`}
      distintivos={
        <InsigniaTono
          tono={estado.tono}
          etiqueta={estado.etiqueta}
          titulo={estado.descripcion}
        />
      }
      lateral={
        <>
          <span className="text-xs text-muted-foreground">
            {liquidacion.estado === "PAGADA" ? "Recibiste" : "Recibes"} (neto)
          </span>
          <span className="text-2xl font-bold cifras text-foreground">
            {formatearCOP(liquidacion.montoNeto)}
          </span>
          {estimada ? (
            <span className={cn(estimada.atrasada && "text-warning")}>
              {estimada.texto}
            </span>
          ) : null}
        </>
      }
    />
  )
}

// ── Desglose ─────────────────────────────────────────────────────────────────

interface LineaDesglose {
  clave: string
  etiqueta: string
  valor: string
  ayuda?: string
  destacada?: boolean
}

/** Retenciones por tipo cuando las publicaciones no traen el detalle. */
function retencionesDeTotales(liquidacion: LiquidacionMedio): LineaDesglose[] {
  return (
    [
      ["RETEFUENTE", liquidacion.retefuente],
      ["RETEIVA", liquidacion.reteiva],
      ["RETEICA", liquidacion.reteica],
    ] as const
  )
    .filter(([, valor]) => valor > 0)
    .map(([tipo, valor]) => ({
      clave: tipo,
      etiqueta: nombreRetencion(tipo),
      valor: `− ${formatearCOP(valor)}`,
    }))
}

function lineasDesglose(
  liquidacion: LiquidacionMedio,
  retenciones: readonly RetencionAgrupada[]
): LineaDesglose[] {
  const lineas: LineaDesglose[] = []
  if (liquidacion.montoBruto !== null) {
    lineas.push({
      clave: "bruto",
      etiqueta: "Valor de la pauta",
      valor: formatearCOP(liquidacion.montoBruto),
      ayuda: "Lo que pagó el anunciante por tus publicaciones.",
    })
  }
  if (liquidacion.montoComision !== null) {
    lineas.push({
      clave: "comision",
      etiqueta: "Comisión de AMO",
      valor: `− ${formatearCOP(liquidacion.montoComision)}`,
    })
  }
  lineas.push({
    clave: "medio",
    etiqueta: "Tu valor antes de retenciones",
    valor: formatearCOP(liquidacion.montoMedio),
  })
  const detalle = retenciones.map((retencion) => ({
    clave: retencion.clave,
    etiqueta: nombreRetencion(retencion.tipo),
    valor: `− ${formatearCOP(retencion.valor)}`,
    ayuda: `${detalleRetencion(retencion)} · base ${formatearCOP(retencion.base)}`,
  }))
  lineas.push(
    ...(detalle.length > 0 ? detalle : retencionesDeTotales(liquidacion))
  )
  lineas.push({
    clave: "neto",
    etiqueta:
      liquidacion.estado === "PAGADA" ? "Neto que recibiste" : "Neto a recibir",
    valor: formatearCOP(liquidacion.montoNeto),
    destacada: true,
  })
  return lineas
}

/**
 * Desglose (MED-015): valor de la pauta y comisión solo si la configuración
 * deja verlos, el valor del medio, cada retención con su tarifa, base y
 * municipio, y el neto.
 */
export function DesgloseLiquidacion({
  liquidacion,
  retenciones,
}: {
  liquidacion: LiquidacionMedio
  retenciones: readonly RetencionAgrupada[]
}) {
  return (
    <TarjetaFicha
      titulo="Desglose"
      icono={Receipt}
      descripcion="De lo que vale tu pauta a lo que llega a tu cuenta."
    >
      <dl className="flex flex-col divide-y rounded-xl border">
        {lineasDesglose(liquidacion, retenciones).map((linea) => (
          <div
            key={linea.clave}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 px-3 py-2.5",
              linea.destacada && "bg-primary/6"
            )}
          >
            <dt
              className={cn(
                "text-sm",
                linea.destacada ? "font-semibold" : "text-muted-foreground"
              )}
            >
              {linea.etiqueta}
            </dt>
            <dd
              className={cn(
                "text-right text-sm cifras whitespace-nowrap",
                linea.destacada && "font-semibold"
              )}
            >
              {linea.valor}
            </dd>
            {linea.ayuda ? (
              <dd className="col-span-2 text-xs text-pretty text-muted-foreground">
                {linea.ayuda}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </TarjetaFicha>
  )
}

// ── Pago ─────────────────────────────────────────────────────────────────────

/** Pago: fecha, referencia y soporte (MED-015 c1) o, mientras tanto, cuándo se espera. */
export function PagoLiquidacion({
  liquidacion,
  hoy,
}: {
  liquidacion: LiquidacionMedio
  hoy: string
}) {
  const periodo = textoPeriodo(
    liquidacion.periodoInicio,
    liquidacion.periodoFin
  )
  const estimada = fechaEstimada(liquidacion, hoy)
  const pagada = liquidacion.estado === "PAGADA"
  const datos = pagada
    ? [
        { etiqueta: "Fecha de pago", valor: fechaDia(liquidacion.fechaPago) },
        {
          etiqueta: "Referencia",
          valor: liquidacion.referenciaPago ? (
            <span className="cifras break-all">
              {liquidacion.referenciaPago}
            </span>
          ) : (
            <SinDato />
          ),
        },
      ]
    : [
        {
          etiqueta: "Estado",
          valor: estadoParaMedio(liquidacion).descripcion,
        },
        ...(liquidacion.enviadaBancoAt
          ? [
              {
                etiqueta: "Orden de pago al banco",
                valor: formatearFecha(liquidacion.enviadaBancoAt),
              },
            ]
          : []),
        ...(estimada
          ? [
              {
                etiqueta: "Pago previsto",
                valor: (
                  <span className={cn(estimada.atrasada && "text-warning")}>
                    {estimada.atrasada
                      ? `Hasta el ${fechaDia(liquidacion.fechaPagoEstimada)}: va con retraso`
                      : `Hasta el ${fechaDia(liquidacion.fechaPagoEstimada)}`}
                  </span>
                ),
              },
            ]
          : []),
      ]
  return (
    <TarjetaFicha
      titulo="Pago"
      icono={Banknote}
      descripcion={
        pagada
          ? "Ya te pagamos. Guarda el soporte por si tu banco o tu contador lo piden."
          : "Te avisaremos cuando hagamos el pago."
      }
    >
      <div className="flex flex-col gap-4">
        <ListaDatos datos={datos} />
        {pagada ? (
          liquidacion.conSoportePago ? (
            <BotonDescargaLiquidacion
              liquidacionId={liquidacion.id}
              archivo="soporte_pago"
              contexto={`del periodo ${periodo}`}
              className="w-full sm:w-fit"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              El soporte de este pago no está disponible.
            </p>
          )
        ) : null}
      </div>
    </TarjetaFicha>
  )
}

// ── Documento soporte ────────────────────────────────────────────────────────

/**
 * Documento soporte del pago (el medio no factura): número, fecha y CUDS o
 * «Pendiente de transmisión a la DIAN», con su PDF.
 */
export function DocumentoSoporteLiquidacion({
  liquidacion,
}: {
  liquidacion: LiquidacionMedio
}) {
  const documento = documentoParaMedio(liquidacion)
  const periodo = textoPeriodo(
    liquidacion.periodoInicio,
    liquidacion.periodoFin
  )
  return (
    <TarjetaFicha
      titulo="Documento soporte"
      icono={FileText}
      descripcion="Como no estás obligado a facturar, AMO emite este documento ante la DIAN por cada pago."
    >
      {documento.tipo === "documento" ? (
        <div className="flex flex-col gap-4">
          <ListaDatos
            datos={[
              {
                etiqueta: "Número",
                valor: <span className="cifras">{documento.numero}</span>,
              },
              {
                etiqueta: "Fecha de emisión",
                valor: fechaDia(documento.fecha),
              },
              {
                etiqueta: "CUDS",
                valor: documento.cuds ? (
                  <span className="font-mono text-xs break-all">
                    {documento.cuds}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {PENDIENTE_DIAN}
                  </span>
                ),
                ayuda: documento.cuds
                  ? "Código único con que la DIAN identifica el documento."
                  : undefined,
              },
            ]}
          />
          {documento.descargable ? (
            <BotonDescargaLiquidacion
              liquidacionId={liquidacion.id}
              archivo="documento_soporte"
              contexto={`del periodo ${periodo}`}
              className="w-full sm:w-fit"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Estamos generando el PDF; vuelve en unos minutos.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-pretty text-muted-foreground">
          {liquidacion.estado === "BORRADOR"
            ? "Lo emitimos cuando aprobemos esta liquidación. Te aparecerá aquí."
            : "Lo estamos preparando. Te aparecerá aquí apenas se emita."}
        </p>
      )}
    </TarjetaFicha>
  )
}

// ── Publicaciones ────────────────────────────────────────────────────────────

/** Las publicaciones liquidadas, con lo que vale cada una y su neto. */
export function PublicacionesLiquidacion({
  lineas,
  enlazarCampanas,
}: {
  lineas: readonly LineaLiquidacionMedio[]
  enlazarCampanas: boolean
}) {
  return (
    <TarjetaFicha
      titulo="Publicaciones"
      icono={ListChecks}
      descripcion="Lo que se liquidó en este periodo."
    >
      {lineas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No encontramos las publicaciones de esta liquidación.
        </p>
      ) : (
        <ul
          aria-label="Publicaciones liquidadas"
          className="flex flex-col divide-y"
        >
          {lineas.map((linea) => (
            <li
              key={linea.asignacionId}
              className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                {enlazarCampanas ? (
                  <Link
                    href={rutaAsignacionMedio(linea.asignacionId)}
                    className="text-sm font-medium break-words underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {linea.oferta}
                  </Link>
                ) : (
                  <span className="text-sm font-medium break-words">
                    {linea.oferta}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {[
                    linea.marca,
                    linea.anunciante !== linea.marca ? linea.anunciante : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <MarcaPlataforma plataforma={linea.plataforma} />
                  {[
                    linea.formato,
                    linea.publicadaAt
                      ? `publicada el ${formatearFecha(linea.publicadaAt)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <span className="shrink-0 text-right text-sm font-semibold cifras">
                {formatearCOP(linea.montoMedio)}
                {linea.montoRetenciones > 0 ? (
                  <span className="block text-[0.6875rem] font-normal text-muted-foreground">
                    neto {formatearCOP(linea.montoNeto)}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </TarjetaFicha>
  )
}
