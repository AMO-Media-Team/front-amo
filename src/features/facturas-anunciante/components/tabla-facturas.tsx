"use client"

import { CalendarX2, ReceiptText } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import {
  crearColumnas,
  ID_COLUMNA_ACCIONES,
} from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { InsigniaDemo } from "@/features/operacion/components/distintivos"
import {
  formatearFechaCompacta,
  instanteDeDia,
} from "@/features/operacion/formato"
import { formatearCOP, formatearFecha } from "@/lib/format"
import { cn } from "@/lib/utils"

import { estadoTablaFacturas } from "../estado-tabla"
import {
  describirCobertura,
  ESTADOS_FACTURA_ANUNCIANTE,
  ORDEN_ESTADOS_VISIBLES,
} from "../presentacion"
import { RUTA_FACTURAS_ANUNCIANTE, rutaFacturaAnunciante } from "../rutas"
import type { FacturaFila, OpcionCampana } from "../tipos"
import { BotonArchivoFactura } from "./boton-archivo-factura"
import { CufeCopiable } from "./cufe-copiable"
import { InsigniaFactura, TextoPlazo } from "./distintivos-factura"

const columna = crearColumnas<FacturaFila>()

function CeldaFactura({ fila }: { fila: FacturaFila }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="flex min-w-0 items-center gap-2">
        <Link
          href={rutaFacturaAnunciante(fila.id)}
          aria-label={`Factura ${fila.numero}`}
          className="truncate font-medium cifras text-foreground underline-offset-4 hover:underline focus-visible:underline"
        >
          {fila.numero}
        </Link>
        {fila.esDemo ? <InsigniaDemo /> : null}
      </span>
      <span
        className="truncate text-xs text-muted-foreground"
        title={describirCobertura(fila.campana)}
      >
        {describirCobertura(fila.campana)}
      </span>
      {/* En la tabla de tableta la columna «Emisión» se oculta: la fecha va aquí. */}
      <span className="hidden text-xs cifras text-muted-foreground md:block lg:hidden">
        Emitida el {formatearFechaCompacta(instanteDeDia(fila.fechaEmision))}
      </span>
    </div>
  )
}

function CeldaVencimiento({ fila }: { fila: FacturaFila }) {
  if (!fila.fechaVencimiento) {
    return <span className="text-muted-foreground">Sin fecha</span>
  }
  const instante = instanteDeDia(fila.fechaVencimiento)
  return (
    <span className="flex flex-col leading-tight">
      <time
        dateTime={fila.fechaVencimiento}
        title={formatearFecha(instante, "largo")}
        className="cifras whitespace-nowrap"
      >
        {formatearFechaCompacta(instante)}
      </time>
      {fila.plazo ? <TextoPlazo plazo={fila.plazo} /> : null}
    </span>
  )
}

function CeldaPdf({ fila }: { fila: FacturaFila }) {
  if (!fila.tienePdf) {
    return (
      <span className="text-xs whitespace-nowrap text-muted-foreground">
        PDF pendiente
      </span>
    )
  }
  return (
    <BotonArchivoFactura
      tipo="factura"
      id={fila.id}
      texto="PDF"
      nombre={`Descargar el PDF de la factura ${fila.numero}`}
      variante="ghost"
    />
  )
}

interface TablaFacturasProps {
  filas: FacturaFila[]
  total: number
  campanas: readonly OpcionCampana[]
  /** Hay un periodo de emisión en la URL: el vacío lo dice y ofrece quitarlo. */
  conPeriodo: boolean
}

/**
 * Historial de facturas de la empresa (ANU-013): número, emisión,
 * vencimiento con su plazo, total, saldo, estado, CUFE abreviado con copiar y
 * PDF. Búsqueda (número o CUFE), filtros por estado y campaña, orden y página
 * en la URL; en el celular, una tarjeta por factura.
 */
export function TablaFacturas({
  filas,
  total,
  campanas,
  conPeriodo,
}: TablaFacturasProps) {
  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor("numero", {
          header: "Factura",
          enableHiding: false,
          meta: {
            titulo: "Factura",
            tarjeta: "titulo",
            claseCelda: "max-w-48 lg:max-w-64 xl:max-w-72",
          },
          cell: ({ row }) => <CeldaFactura fila={row.original} />,
        }),
        columna.accessor(
          (fila) => ESTADOS_FACTURA_ANUNCIANTE[fila.estado].etiqueta,
          {
            id: "estado",
            header: "Estado",
            meta: { titulo: "Estado" },
            cell: ({ row }) => <InsigniaFactura estado={row.original.estado} />,
          }
        ),
        columna.accessor((fila) => instanteDeDia(fila.fechaEmision), {
          id: "emision",
          header: "Emisión",
          meta: {
            titulo: "Emisión",
            campoOrden: "emision",
            tipoDato: "fecha",
            ocultarBajo: "lg",
          },
          cell: ({ row, getValue }) => (
            <time
              dateTime={row.original.fechaEmision}
              title={formatearFecha(getValue(), "largo")}
              className="cifras whitespace-nowrap text-muted-foreground"
            >
              {formatearFechaCompacta(getValue())}
            </time>
          ),
        }),
        columna.accessor((fila) => fila.fechaVencimiento ?? "", {
          id: "vencimiento",
          header: "Vencimiento",
          meta: {
            titulo: "Vencimiento",
            campoOrden: "vencimiento",
            tipoDato: "fecha",
          },
          cell: ({ row }) => <CeldaVencimiento fila={row.original} />,
        }),
        columna.accessor("total", {
          header: "Total",
          meta: {
            titulo: "Total",
            campoOrden: "total",
            tipoDato: "otro",
            alinear: "fin",
          },
          cell: ({ getValue }) => (
            <span className="cifras whitespace-nowrap">
              {formatearCOP(getValue())}
            </span>
          ),
        }),
        columna.accessor("saldo", {
          header: "Saldo",
          meta: {
            titulo: "Saldo",
            campoOrden: "saldo",
            tipoDato: "otro",
            alinear: "fin",
          },
          cell: ({ getValue }) => (
            <span
              className={cn(
                "cifras whitespace-nowrap",
                getValue() > 0 ? "font-semibold" : "text-muted-foreground"
              )}
            >
              {formatearCOP(getValue())}
            </span>
          ),
        }),
        columna.accessor((fila) => fila.cufe ?? "", {
          id: "cufe",
          header: "CUFE",
          meta: { titulo: "CUFE", ocultarBajo: "xl", claseCelda: "max-w-48" },
          cell: ({ row }) =>
            row.original.cufe ? (
              <CufeCopiable
                cufe={row.original.cufe}
                numero={row.original.numero}
              />
            ) : (
              <span className="text-xs text-muted-foreground">Sin CUFE</span>
            ),
        }),
        columna.display({
          id: ID_COLUMNA_ACCIONES,
          header: () => <span className="sr-only">PDF</span>,
          enableHiding: false,
          meta: { titulo: "PDF", exportacion: "nunca", alinear: "fin" },
          cell: ({ row }) => <CeldaPdf fila={row.original} />,
        }),
      ]),
    []
  )

  const filtros = useMemo<FiltroFacetado<"estado" | "campana">[]>(
    () => [
      {
        clave: "estado",
        titulo: "Estado",
        opciones: ORDEN_ESTADOS_VISIBLES.map((estado) => ({
          valor: estado,
          etiqueta: ESTADOS_FACTURA_ANUNCIANTE[estado].etiqueta,
        })),
      },
      ...(campanas.length > 0
        ? [
            {
              clave: "campana" as const,
              titulo: "Campaña",
              opciones: campanas.map((campana) => ({
                valor: campana.id,
                etiqueta: campana.nombre,
              })),
            },
          ]
        : []),
    ],
    [campanas]
  )

  return (
    <TablaDatos
      titulo="Facturas de tu empresa"
      columnas={columnas}
      filas={filas}
      total={total}
      idFila={(fila) => fila.id}
      etiquetaFila={(fila) => `Factura ${fila.numero}`}
      estadoTabla={estadoTablaFacturas}
      filtros={filtros}
      placeholderBusqueda="Buscar por número o CUFE"
      claveAlmacenamiento="facturas-anunciante"
      enlaceFila={(fila) => rutaFacturaAnunciante(fila.id)}
      vacio={
        conPeriodo
          ? {
              icono: CalendarX2,
              titulo: "No hay facturas emitidas en esas fechas",
              descripcion:
                "Prueba con otro periodo o mira todo el historial de tu empresa.",
              accion: (
                <EnlaceBoton href={RUTA_FACTURAS_ANUNCIANTE} variant="outline">
                  Ver todo el historial
                </EnlaceBoton>
              ),
            }
          : {
              icono: ReceiptText,
              titulo: "Aún no tienes facturas",
              descripcion:
                "Cuando AMO facture la pauta que verificó en tus campañas, verás aquí cada factura con su estado, saldo, vencimiento, CUFE y PDF.",
            }
      }
    />
  )
}
