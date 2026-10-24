"use client"

import { Banknote } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import {
  crearColumnas,
  ID_COLUMNA_ACCIONES,
} from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import { rutaLiquidacion } from "@/features/liquidaciones/rutas"
import { InsigniaEstado } from "@/features/operacion/components/distintivos"
import { ESTADOS_LIQUIDACION } from "@/features/operacion/estados"
import {
  formatearRangoCompacto,
  instanteDeDia,
} from "@/features/operacion/formato"
import { formatearCOP, formatearFecha } from "@/lib/format"

import type { LiquidacionDeDispersion } from "../tipos"
import {
  ESTADOS_EN_ARCHIVO,
  estadoTablaLiquidacionesDispersion,
} from "../vistas"
import { RegistrarPagoLiquidacion } from "./registrar-pago-liquidacion"

const columna = crearColumnas<LiquidacionDeDispersion>()

function periodo(fila: LiquidacionDeDispersion): string {
  return formatearRangoCompacto(
    instanteDeDia(fila.periodoInicio),
    instanteDeDia(fila.periodoFin)
  )
}

function CeldaPago({ fila }: { fila: LiquidacionDeDispersion }) {
  if (fila.estado === "PAGADA" && fila.fechaPago) {
    return (
      <span className="flex min-w-0 flex-col">
        <span className="whitespace-nowrap">
          Pagada el {formatearFecha(instanteDeDia(fila.fechaPago))}
        </span>
        {fila.referenciaPago ? (
          <span className="truncate text-xs text-muted-foreground">
            Ref. {fila.referenciaPago}
          </span>
        ) : null}
      </span>
    )
  }
  if (fila.estado === "ANULADA") {
    return <span className="text-muted-foreground">No se paga</span>
  }
  return <span className="text-muted-foreground">Pendiente</span>
}

/**
 * Las liquidaciones de un archivo de pagos con su estado y su pago: las que
 * siguen aprobadas se registran aquí mismo cuando el banco confirma.
 */
export function TablaLiquidacionesDispersion({
  filas,
  total,
}: {
  filas: LiquidacionDeDispersion[]
  total: number
}) {
  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor((fila) => fila.medio, {
          id: "medio",
          header: "Medio",
          enableHiding: false,
          meta: {
            titulo: "Medio",
            campoOrden: "medio",
            tarjeta: "titulo",
            claseCelda: "max-w-60",
          },
          cell: ({ row }) => (
            <span className="flex min-w-0 flex-col">
              <Link
                href={rutaLiquidacion(row.original.id)}
                className="truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
              >
                {row.original.medio}
              </Link>
              <span className="truncate text-xs text-muted-foreground lg:hidden">
                {periodo(row.original)}
              </span>
            </span>
          ),
        }),
        columna.accessor((fila) => periodo(fila), {
          id: "periodo",
          header: "Periodo",
          meta: { titulo: "Periodo", ocultarBajo: "lg" },
          cell: ({ getValue }) => (
            <span className="cifras whitespace-nowrap">{getValue()}</span>
          ),
        }),
        columna.accessor((fila) => fila.montoNeto, {
          id: "neto",
          header: "Neto",
          meta: {
            titulo: "Neto",
            campoOrden: "neto",
            tipoDato: "otro",
            alinear: "fin",
            formatoExportacion: "numero",
          },
          cell: ({ getValue }) => (
            <span className="font-medium cifras whitespace-nowrap">
              {formatearCOP(getValue())}
            </span>
          ),
        }),
        columna.accessor((fila) => ESTADOS_LIQUIDACION[fila.estado].etiqueta, {
          id: "estado",
          header: "Estado",
          meta: { titulo: "Estado", campoOrden: "estado", tipoDato: "otro" },
          cell: ({ row }) => (
            <InsigniaEstado
              catalogo={ESTADOS_LIQUIDACION}
              estado={row.original.estado}
            />
          ),
        }),
        columna.accessor((fila) => fila.fechaPago ?? "", {
          id: "pago",
          header: "Pago",
          meta: { titulo: "Pago", claseCelda: "max-w-56" },
          cell: ({ row }) => <CeldaPago fila={row.original} />,
        }),
        columna.display({
          id: ID_COLUMNA_ACCIONES,
          header: () => <span className="sr-only">Registrar</span>,
          meta: { titulo: "Registrar", exportacion: "nunca", alinear: "fin" },
          cell: ({ row }) =>
            row.original.estado === "APROBADA" ? (
              <RegistrarPagoLiquidacion
                variante="fila"
                liquidacionId={row.original.id}
                medio={row.original.medio}
                montoNeto={row.original.montoNeto}
                fechaMinima={row.original.fechaMinimaPago}
                documentoListo={row.original.documentoListo}
              />
            ) : null,
        }),
      ]),
    []
  )

  const filtros = useMemo<FiltroFacetado<"estado">[]>(
    () => [
      {
        clave: "estado",
        titulo: "Estado",
        opciones: ESTADOS_EN_ARCHIVO.map((estado) => ({
          valor: estado,
          etiqueta: ESTADOS_LIQUIDACION[estado].etiqueta,
        })),
      },
    ],
    []
  )

  return (
    <TablaDatos
      titulo="Liquidaciones del archivo"
      columnas={columnas}
      filas={filas}
      total={total}
      idFila={(fila) => fila.id}
      estadoTabla={estadoTablaLiquidacionesDispersion}
      filtros={filtros}
      placeholderBusqueda="Buscar medio"
      claveAlmacenamiento="finanzas-liquidaciones-archivo"
      vacio={{
        icono: Banknote,
        titulo: "Este archivo ya no tiene liquidaciones",
        descripcion:
          "Las que llevaba se incluyeron después en otro archivo de pagos, o no puedes ver las liquidaciones con tu rol.",
      }}
    />
  )
}
