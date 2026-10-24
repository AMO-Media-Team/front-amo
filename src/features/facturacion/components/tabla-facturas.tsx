"use client"

import { Receipt } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { crearColumnas } from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import {
  InsigniaDemo,
  InsigniaEstado,
} from "@/features/operacion/components/distintivos"
import { ESTADOS_FACTURA } from "@/features/operacion/estados"
import {
  formatearFechaCompacta,
  instanteDeDia,
} from "@/features/operacion/formato"
import { formatearCOP } from "@/lib/format"
import { cn } from "@/lib/utils"

import { registrarExportacionFacturas } from "../actions"
import { estadoTablaFacturas, ORDEN_ESTADOS_FACTURA } from "../listado"
import {
  alcanceFactura,
  diaExportable,
  situacionVencimiento,
  tituloFactura,
} from "../presentacion"
import { rutaFactura } from "../rutas"
import type { FacturaFila } from "../tipos"

const columna = crearColumnas<FacturaFila>()

function Dia({ dia }: { dia: string | null }) {
  return dia ? (
    <time dateTime={dia} className="cifras whitespace-nowrap">
      {formatearFechaCompacta(instanteDeDia(dia))}
    </time>
  ) : (
    <span className="text-muted-foreground">—</span>
  )
}

function CeldaFactura({ fila }: { fila: FacturaFila }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="flex items-center gap-2">
        <Link
          href={rutaFactura(fila.id)}
          className={cn(
            "font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline",
            fila.numero ? "cifras" : "italic"
          )}
        >
          {tituloFactura(fila.numero)}
        </Link>
        {fila.esDemo ? <InsigniaDemo /> : null}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {alcanceFactura(fila.campana)}
      </span>
    </div>
  )
}

function CeldaAnunciante({ fila }: { fila: FacturaFila }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-foreground">
        {fila.anunciante ?? "Anunciante no visible"}
      </span>
      {fila.razonSocial && fila.razonSocial !== fila.anunciante ? (
        <span className="truncate text-xs text-muted-foreground">
          {fila.razonSocial}
        </span>
      ) : null}
    </span>
  )
}

function CeldaVencimiento({
  fila,
  ahora,
}: {
  fila: FacturaFila
  ahora: number
}) {
  const situacion = situacionVencimiento(fila, new Date(ahora))
  return (
    <span className="flex flex-col leading-tight">
      <Dia dia={fila.fechaVencimiento} />
      {situacion ? (
        <span
          className={cn(
            "text-[0.6875rem] whitespace-nowrap",
            situacion.tono === "peligro"
              ? "font-medium text-destructive"
              : situacion.tono === "aviso"
                ? "text-warning"
                : "text-muted-foreground"
          )}
        >
          {situacion.texto}
        </span>
      ) : null}
    </span>
  )
}

interface TablaFacturasProps {
  filas: FacturaFila[]
  total: number
  /** Opciones del filtro de anunciante (los que tienen facturas). */
  anunciantes: readonly { id: string; nombre: string }[]
  /** Instante del servidor: el mismo vencimiento en SSR e hidratación. */
  ahora: number
  /** Con `facturas.gestionar`: el estado vacío invita a crear el primer borrador. */
  puedeCrear: boolean
  /**
   * Hay un periodo de emisión en la URL. No es una faceta de la tabla: sin
   * resultados, el vacío lo dice en lugar de «Aún no hay facturas».
   */
  conPeriodo: boolean
}

/** Listado de facturas al anunciante (LIQ-008). */
export function TablaFacturas({
  filas,
  total,
  anunciantes,
  ahora,
  puedeCrear,
  conPeriodo,
}: TablaFacturasProps) {
  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor((fila) => fila.numero ?? "Borrador", {
          id: "factura",
          header: "Factura",
          enableHiding: false,
          meta: {
            titulo: "Factura",
            tarjeta: "titulo",
            claseCelda: "max-w-44",
          },
          cell: ({ row }) => <CeldaFactura fila={row.original} />,
        }),
        columna.accessor((fila) => alcanceFactura(fila.campana), {
          id: "campana",
          header: "Campaña",
          meta: {
            titulo: "Campaña",
            ocultaPorDefecto: true,
            exportacion: "siempre",
          },
        }),
        columna.accessor((fila) => fila.anunciante ?? "", {
          id: "anunciante",
          header: "Anunciante",
          meta: {
            titulo: "Anunciante",
            claseCelda: "max-w-48 2xl:max-w-64",
          },
          cell: ({ row }) => <CeldaAnunciante fila={row.original} />,
        }),
        // Exportadas como instante (mediodía en Bogotá), no como `date` crudo.
        columna.accessor((fila) => diaExportable(fila.fechaEmision), {
          id: "emision",
          header: "Emisión",
          meta: {
            titulo: "Emisión",
            campoOrden: "emision",
            tipoDato: "fecha",
            formatoExportacion: "fecha",
          },
          cell: ({ row }) => <Dia dia={row.original.fechaEmision} />,
        }),
        columna.accessor((fila) => diaExportable(fila.fechaVencimiento), {
          id: "vencimiento",
          header: "Vencimiento",
          meta: {
            titulo: "Vencimiento",
            campoOrden: "vencimiento",
            tipoDato: "fecha",
            formatoExportacion: "fecha",
          },
          cell: ({ row }) => (
            <CeldaVencimiento fila={row.original} ahora={ahora} />
          ),
        }),
        columna.accessor((fila) => fila.total, {
          id: "total",
          header: "Total",
          meta: {
            titulo: "Total",
            campoOrden: "total",
            alinear: "fin",
            tipoDato: "otro",
            formatoExportacion: "numero",
            ocultarBajo: "lg",
          },
          cell: ({ getValue }) => (
            <span className="cifras whitespace-nowrap">
              {formatearCOP(getValue())}
            </span>
          ),
        }),
        columna.accessor((fila) => fila.saldo, {
          id: "saldo",
          header: "Saldo",
          meta: {
            titulo: "Saldo",
            campoOrden: "saldo",
            alinear: "fin",
            tipoDato: "otro",
            formatoExportacion: "numero",
          },
          cell: ({ row }) => (
            <span
              className={cn(
                "cifras whitespace-nowrap",
                row.original.saldo > 0 ? "font-medium" : "text-muted-foreground"
              )}
            >
              {formatearCOP(row.original.saldo)}
            </span>
          ),
        }),
        columna.accessor((fila) => ESTADOS_FACTURA[fila.estado].etiqueta, {
          id: "estado",
          header: "Estado",
          meta: { titulo: "Estado" },
          cell: ({ row }) => (
            <InsigniaEstado
              catalogo={ESTADOS_FACTURA}
              estado={row.original.estado}
            />
          ),
        }),
      ]),
    [ahora]
  )

  const filtros = useMemo<FiltroFacetado<"estado" | "anunciante">[]>(
    () => [
      {
        clave: "estado",
        titulo: "Estado",
        opciones: ORDEN_ESTADOS_FACTURA.map((estado) => ({
          valor: estado,
          etiqueta: ESTADOS_FACTURA[estado].etiqueta,
        })),
      },
      ...(anunciantes.length > 0
        ? [
            {
              clave: "anunciante" as const,
              titulo: "Anunciante",
              opciones: anunciantes.map((anunciante) => ({
                valor: anunciante.id,
                etiqueta: anunciante.nombre,
              })),
            },
          ]
        : []),
    ],
    [anunciantes]
  )

  return (
    <TablaDatos
      titulo="Facturas al anunciante"
      columnas={columnas}
      filas={filas}
      total={total}
      idFila={(fila) => fila.id}
      etiquetaFila={(fila) =>
        `${tituloFactura(fila.numero)} de ${fila.anunciante ?? "un anunciante"}`
      }
      estadoTabla={estadoTablaFacturas}
      filtros={filtros}
      placeholderBusqueda="Buscar número o anunciante"
      claveAlmacenamiento="finanzas-facturas"
      enlaceFila={(fila) => rutaFactura(fila.id)}
      exportacion={{
        nombre: "Facturas AMO",
        onExportado: (resumen) => void registrarExportacionFacturas(resumen),
      }}
      vacio={
        conPeriodo
          ? {
              icono: Receipt,
              titulo: "Ninguna factura emitida en ese periodo",
              descripcion:
                "Prueba con otras fechas o elige «Todas las fechas». Los borradores no tienen fecha de emisión: con un periodo no aparecen.",
            }
          : {
              icono: Receipt,
              titulo: "Aún no hay facturas",
              descripcion: puedeCrear
                ? "Genera el primer borrador con «Nueva factura» desde lo verificado sin facturar."
                : "Cuando Finanzas genere el primer borrador desde lo verificado sin facturar, aparecerá aquí.",
            }
      }
    />
  )
}
