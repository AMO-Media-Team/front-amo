import "server-only"

import { CircleCheck, Hourglass, Receipt, UsersRound } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { RejillaKpi } from "@/components/kpi/rejilla-kpi"
import {
  ETIQUETAS_TRAMO,
  TRAMOS_CARTERA,
  type TramoCartera,
} from "@/features/operacion/calculos"
import {
  EnlaceFicha,
  TarjetaFicha,
} from "@/features/operacion/components/ficha"
import { rutaAnunciante } from "@/features/operacion/rutas"
import {
  formatearCOP,
  formatearCOPCompacto,
  formatearNumero,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { proporcionesTramos, totalesCartera } from "../cartera"
import { rutaFacturasFiltradas } from "../listado"
import { formatearDia, tituloFactura } from "../presentacion"
import { carteraAlCorte, facturasVencidasAlCorte } from "../queries"
import { rutaFactura } from "../rutas"
import type { FilaCartera } from "../tipos"
import { TarjetaKpiFacturas } from "./tarjeta-kpi-facturas"

/** De lo más reciente (tinte suave) a lo más vencido (intenso), como en la ficha del anunciante. */
const CLASES_TRAMO: Readonly<Record<TramoCartera, string>> = {
  "0_30": "bg-info/70",
  "31_60": "bg-warning/60",
  "61_90": "bg-warning",
  "90_mas": "bg-destructive",
}

/** Facturas vencidas que se muestran; el resto, en el listado filtrado. */
const VENCIDAS_VISIBLES = 50

function BarraTramos({
  saldo,
  porTramo,
  className,
}: {
  saldo: number
  porTramo: Readonly<Record<TramoCartera, number>>
  className?: string
}) {
  const proporciones = proporcionesTramos({ saldo, porTramo })
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-2 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      {saldo > 0
        ? TRAMOS_CARTERA.map((tramo) => (
            <span
              key={tramo}
              className={CLASES_TRAMO[tramo]}
              style={{ width: `${proporciones[tramo] * 100}%` }}
            />
          ))
        : null}
    </div>
  )
}

function Tramos({
  porTramo,
  compacto = false,
}: {
  porTramo: Readonly<Record<TramoCartera, number>>
  compacto?: boolean
}) {
  return (
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
            className={cn(
              "cifras",
              compacto ? "text-sm" : "text-sm font-medium",
              porTramo[tramo] === 0 && "text-muted-foreground"
            )}
            title={formatearCOP(porTramo[tramo])}
          >
            {compacto
              ? formatearCOPCompacto(porTramo[tramo])
              : formatearCOP(porTramo[tramo])}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function ListaAnunciantes({
  filas,
  verAnunciantes,
}: {
  filas: readonly FilaCartera[]
  verAnunciantes: boolean
}) {
  return (
    <ul aria-label="Saldo por anunciante" className="-mx-5 -my-2 divide-y">
      {filas.map((fila) => (
        <li key={fila.anuncianteId} className="flex flex-col gap-3 px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="flex min-w-0 flex-col gap-0.5">
              <EnlaceFicha
                href={
                  `${rutaAnunciante(fila.anuncianteId)}?pestana=cartera` as Route
                }
                permitido={verAnunciantes}
                className="truncate font-medium"
              >
                {fila.anunciante}
              </EnlaceFicha>
              <span className="text-xs text-muted-foreground">
                Facturado {formatearCOP(fila.facturado)} · pagado{" "}
                {formatearCOP(fila.pagado)}
                {fila.facturasVencidas > 0
                  ? ` · ${formatearNumero(fila.facturasVencidas)} ${
                      fila.facturasVencidas === 1 ? "vencida" : "vencidas"
                    }`
                  : ""}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="text-base font-semibold cifras">
                {formatearCOP(fila.saldo)}
              </span>
              <Link
                href={rutaFacturasFiltradas({ anunciante: fila.anuncianteId })}
                className="text-xs text-muted-foreground underline-offset-4 hover:underline focus-visible:underline"
              >
                Ver sus facturas
                <span className="sr-only"> de {fila.anunciante}</span>
              </Link>
            </div>
          </div>
          <BarraTramos saldo={fila.saldo} porTramo={fila.porTramo} />
          <Tramos porTramo={fila.porTramo} compacto />
        </li>
      ))}
    </ul>
  )
}

/**
 * Cartera a la fecha de corte (`reporte_cartera`): totales, antigüedad del
 * saldo con los tramos de la operación y el saldo de cada anunciante, con
 * enlace a su cartera y a sus facturas.
 */
export async function SeccionCartera({
  corte,
  verAnunciantes,
}: {
  corte: string
  verAnunciantes: boolean
}) {
  const filas = await carteraAlCorte(corte)
  const totales = totalesCartera(filas)
  const alCorte = `Al ${formatearDia(corte, "medio")}`

  return (
    <div className="flex flex-col gap-4">
      <RejillaKpi etiqueta="Totales de la cartera" columnas={4}>
        <TarjetaKpiFacturas
          titulo="Saldo por cobrar"
          valor={totales.saldo}
          unidad="COP"
          icono="saldo"
          sinComparativo={alCorte}
          indice={0}
        />
        <TarjetaKpiFacturas
          titulo="Más de 30 días"
          valor={totales.masDe30}
          unidad="COP"
          icono="antiguedad"
          sinComparativo="Desde el vencimiento"
          indice={1}
        />
        <TarjetaKpiFacturas
          titulo="Facturas vencidas"
          valor={totales.facturasVencidas}
          unidad="conteo"
          icono="vencido"
          sinComparativo={alCorte}
          indice={2}
        />
        <TarjetaKpiFacturas
          titulo="Anunciantes con saldo"
          valor={totales.anunciantes}
          unidad="conteo"
          icono="anunciantes"
          sinComparativo={alCorte}
          indice={3}
        />
      </RejillaKpi>

      {filas.length === 0 ? (
        <EstadoVacio
          icono={CircleCheck}
          titulo="Sin saldo por cobrar"
          descripcion="A esa fecha ningún anunciante tenía facturas expedidas con saldo pendiente."
        />
      ) : (
        <>
          <TarjetaFicha
            titulo="Antigüedad del saldo"
            icono={Hourglass}
            descripcion="Por días desde el vencimiento; 0–30 incluye lo que aún no vence."
          >
            <div className="flex flex-col gap-3">
              <BarraTramos
                saldo={totales.saldo}
                porTramo={totales.porTramo}
                className="h-3"
              />
              <Tramos porTramo={totales.porTramo} />
            </div>
          </TarjetaFicha>
          <TarjetaFicha
            titulo="Por anunciante"
            icono={UsersRound}
            descripcion="De mayor a menor saldo. Abre su cartera para ver cada factura."
          >
            <ListaAnunciantes filas={filas} verAnunciantes={verAnunciantes} />
          </TarjetaFicha>
        </>
      )}
    </div>
  )
}

/**
 * Facturas con saldo vencido a la fecha de corte, de la más atrasada a la
 * menos, con enlace a su ficha.
 */
export async function SeccionVencidas({
  corte,
  esHoy,
}: {
  corte: string
  /** El listado filtrado por VENCIDA muestra las de hoy: solo se ofrece con el corte de hoy. */
  esHoy: boolean
}) {
  const vencidas = await facturasVencidasAlCorte(corte)
  const visibles = vencidas.slice(0, VENCIDAS_VISIBLES)
  const restantes = vencidas.length - visibles.length
  return (
    <TarjetaFicha
      titulo="Facturas vencidas"
      icono={Receipt}
      descripcion={
        vencidas.length === 0
          ? undefined
          : `${formatearNumero(vencidas.length)} con saldo vencido al ${formatearDia(corte, "medio")}.`
      }
      acciones={
        vencidas.length > 0 && esHoy ? (
          <EnlaceBoton
            variant="outline"
            size="sm"
            href={rutaFacturasFiltradas({ estado: ["VENCIDA"] })}
          >
            Ver en el listado
          </EnlaceBoton>
        ) : null
      }
    >
      {vencidas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ninguna factura tenía saldo vencido a esa fecha.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <ul aria-label="Facturas vencidas" className="-mx-5 -my-2 divide-y">
            {visibles.map((factura) => (
              <li
                key={factura.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3"
              >
                <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
                  <Link
                    href={rutaFactura(factura.id)}
                    className="font-medium cifras underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {tituloFactura(factura.numero)}
                    <span className="sr-only">
                      {" "}
                      de {factura.anunciante ?? "un anunciante"}
                    </span>
                  </Link>
                  <span className="truncate text-xs text-muted-foreground">
                    {factura.anunciante ?? "Anunciante no visible"} · venció el{" "}
                    {formatearDia(factura.fechaVencimiento)}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="text-sm font-semibold cifras">
                    {formatearCOP(factura.saldo)}
                  </span>
                  <span
                    className={cn(
                      "text-xs cifras",
                      factura.diasMora > 90
                        ? "font-medium text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {factura.diasMora === 1
                      ? "1 día de mora"
                      : `${formatearNumero(factura.diasMora)} días de mora`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {restantes > 0 ? (
            <p className="text-xs text-muted-foreground">
              Y {formatearNumero(restantes)} más, de menor mora.
            </p>
          ) : null}
        </div>
      )}
    </TarjetaFicha>
  )
}
