import { FileSpreadsheet, Shuffle } from "lucide-react"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import {
  AvisoFicha,
  CabeceraFicha,
} from "@/features/operacion/components/ficha"
import { InsigniaDemo } from "@/features/operacion/components/distintivos"
import { formatearCOP, formatearFechaHora, formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { avanceDispersion } from "../ficha-dispersion"
import { ID_DESTINO_FOCO_PAGOS } from "../foco"
import { rutaVistaPagosMedios } from "../rutas"
import { plural, SIN_NOMBRE_EQUIPO, tituloDispersion } from "../textos"
import type { DetalleDispersion } from "../tipos"
import { BotonDescargarArchivo } from "./boton-descargar-archivo"
import { SeccionLiquidacionesDispersion } from "./secciones"

type ParametrosBusqueda = Promise<Record<string, string | string[] | undefined>>

function Cifra({
  etiqueta,
  valor,
  detalle,
  destacada = false,
}: {
  etiqueta: string
  valor: string
  detalle?: string
  destacada?: boolean
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-xl border bg-card px-3.5 py-3",
        destacada && "border-warning/40 bg-warning/6"
      )}
    >
      <dt className="truncate text-xs font-medium text-muted-foreground">
        {etiqueta}
      </dt>
      <dd className="flex min-w-0 flex-col">
        <span className="font-heading text-xl font-semibold cifras">
          {valor}
        </span>
        {detalle ? (
          <span className="truncate text-xs text-muted-foreground">
            {detalle}
          </span>
        ) : null}
      </dd>
    </div>
  )
}

/**
 * Ficha de un archivo de pagos: cuándo y quién lo generó, su descarga, el
 * avance de los pagos (pagadas y por pagar) y sus liquidaciones, donde se
 * registra el pago de cada una, con su propio soporte, cuando el banco lo
 * confirma (no hay pago en lote: cada medio descarga el soporte de su pago).
 */
export function VistaDispersion({
  detalle,
  puedeVerDatosSensibles,
  searchParams,
}: {
  detalle: DetalleDispersion
  puedeVerDatosSensibles: boolean
  searchParams: ParametrosBusqueda
}) {
  const { dispersion } = detalle
  const avance = avanceDispersion(detalle)
  const quien = dispersion.generadaPor ?? SIN_NOMBRE_EQUIPO

  return (
    <div className="flex flex-col gap-6">
      <CabeceraFicha
        volver={{
          href: rutaVistaPagosMedios("dispersiones"),
          titulo: "Archivos de pagos",
        }}
        antetitulo="Archivo de pagos"
        titulo={tituloDispersion(dispersion.creadaAt)}
        visual={
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary sm:size-16">
            <FileSpreadsheet className="size-7" aria-hidden />
          </span>
        }
        subtitulo={`Generado el ${formatearFechaHora(dispersion.creadaAt)} · ${quien}`}
        distintivos={dispersion.esDemo ? <InsigniaDemo /> : undefined}
        acciones={
          <BotonDescargarArchivo
            dispersionId={dispersion.id}
            creadaAt={dispersion.creadaAt}
            puedeVerDatosSensibles={puedeVerDatosSensibles}
          />
        }
        aviso={
          avance.enOtroArchivo > 0 ? (
            <AvisoFicha
              tono="info"
              icono={Shuffle}
              titulo={`${plural(avance.enOtroArchivo, "liquidación se incluyó", "liquidaciones se incluyeron")} después en otro archivo`}
            >
              Este archivo llevaba{" "}
              {plural(dispersion.cantidad, "liquidación", "liquidaciones")};
              aquí se ven las que siguen en él. Las demás se registran desde su
              archivo más reciente o desde «Por pagar».
            </AvisoFicha>
          ) : undefined
        }
      />

      <dl
        aria-label="Avance de los pagos"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
      >
        <Cifra
          etiqueta="Total del archivo"
          valor={formatearCOP(dispersion.montoTotal)}
          detalle={plural(dispersion.cantidad, "liquidación", "liquidaciones")}
        />
        <Cifra
          etiqueta="Pagadas"
          valor={formatearNumero(avance.pagadas)}
          detalle={formatearCOP(avance.montoPagado)}
        />
        <Cifra
          etiqueta="Por registrar"
          valor={formatearNumero(avance.porPagar)}
          detalle={formatearCOP(avance.montoPorPagar)}
          destacada={avance.porPagar > 0}
        />
        <Cifra
          etiqueta="Anuladas"
          valor={formatearNumero(avance.anuladas)}
          detalle={avance.anuladas > 0 ? "No se pagan" : undefined}
        />
      </dl>

      <section
        aria-labelledby={ID_DESTINO_FOCO_PAGOS}
        className="flex flex-col gap-4"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id={ID_DESTINO_FOCO_PAGOS}
            tabIndex={-1}
            className="text-lg font-semibold outline-none"
          >
            Liquidaciones del archivo
          </h2>
          <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
            Cuando el banco confirme cada transferencia, registra su pago con la
            fecha, la referencia y su propio soporte: el medio puede
            descargarlo, así que no uses la planilla del lote, que trae los
            datos de los demás. La liquidación queda pagada y le avisamos a su
            medio.
          </p>
        </div>
        <LimiteErrorTabla recurso="las liquidaciones del archivo">
          <Suspense fallback={<EsqueletoTablaDatos columnas={5} filtros={1} />}>
            <SeccionLiquidacionesDispersion
              searchParams={searchParams}
              liquidaciones={detalle.liquidaciones}
            />
          </Suspense>
        </LimiteErrorTabla>
      </section>
    </div>
  )
}
