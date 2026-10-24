"use client"

import { FileSpreadsheet } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import {
  crearColumnas,
  ID_COLUMNA_ACCIONES,
} from "@/components/data-table/columnas"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { InsigniaDemo } from "@/features/operacion/components/distintivos"
import { formatearFechaHoraFija } from "@/features/operacion/formato"
import { formatearCOP, formatearNumero } from "@/lib/format"

import { rutaDispersion, rutaVistaPagosMedios } from "../rutas"
import { SIN_NOMBRE_EQUIPO } from "../textos"
import type { DispersionFila } from "../tipos"
import { estadoTablaDispersiones } from "../vistas"
import { BotonDescargarArchivo } from "./boton-descargar-archivo"

const columna = crearColumnas<DispersionFila>()

function CeldaFecha({ fila }: { fila: DispersionFila }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <Link
        href={rutaDispersion(fila.id)}
        className="font-medium whitespace-nowrap text-foreground underline-offset-4 hover:underline focus-visible:underline"
      >
        {formatearFechaHoraFija(fila.creadaAt)}
      </Link>
      {fila.esDemo ? <InsigniaDemo /> : null}
    </span>
  )
}

/**
 * Historial de archivos de pagos (dispersiones): cuándo se generó cada uno,
 * cuántas liquidaciones llevó, por cuánto y quién lo generó. La fila abre su
 * ficha (las liquidaciones y sus pagos); el botón lo descarga otra vez.
 */
export function TablaDispersiones({
  filas,
  total,
  puedeVerDatosSensibles,
}: {
  filas: DispersionFila[]
  total: number
  puedeVerDatosSensibles: boolean
}) {
  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor((fila) => fila.creadaAt, {
          id: "fecha",
          header: "Generado",
          enableHiding: false,
          meta: {
            titulo: "Generado",
            campoOrden: "fecha",
            tipoDato: "fecha",
            tarjeta: "titulo",
            formatoExportacion: "fechaHora",
          },
          cell: ({ row }) => <CeldaFecha fila={row.original} />,
        }),
        columna.accessor((fila) => fila.cantidad, {
          id: "cantidad",
          header: "Liquidaciones",
          meta: {
            titulo: "Liquidaciones",
            campoOrden: "cantidad",
            tipoDato: "otro",
            alinear: "fin",
            formatoExportacion: "numero",
          },
          cell: ({ getValue }) => (
            <span className="cifras">{formatearNumero(getValue())}</span>
          ),
        }),
        columna.accessor((fila) => fila.montoTotal, {
          id: "total",
          header: "Total",
          meta: {
            titulo: "Total",
            campoOrden: "total",
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
        columna.accessor((fila) => fila.generadaPor ?? SIN_NOMBRE_EQUIPO, {
          id: "generadaPor",
          header: "Lo generó",
          meta: { titulo: "Lo generó", claseCelda: "max-w-48" },
          cell: ({ getValue, row }) => (
            <span
              className={
                row.original.generadaPor
                  ? "truncate"
                  : "truncate text-muted-foreground"
              }
            >
              {getValue()}
            </span>
          ),
        }),
        columna.display({
          id: ID_COLUMNA_ACCIONES,
          header: () => <span className="sr-only">Descarga</span>,
          meta: { titulo: "Descarga", exportacion: "nunca", alinear: "fin" },
          cell: ({ row }) => (
            <BotonDescargarArchivo
              compacto
              dispersionId={row.original.id}
              creadaAt={row.original.creadaAt}
              puedeVerDatosSensibles={puedeVerDatosSensibles}
            />
          ),
        }),
      ]),
    [puedeVerDatosSensibles]
  )

  return (
    <TablaDatos
      titulo="Archivos de pagos generados"
      columnas={columnas}
      filas={filas}
      total={total}
      idFila={(fila) => fila.id}
      estadoTabla={estadoTablaDispersiones}
      placeholderBusqueda="Buscar por medio"
      claveAlmacenamiento="finanzas-dispersiones"
      enlaceFila={(fila) => rutaDispersion(fila.id)}
      vacio={{
        icono: FileSpreadsheet,
        titulo: "Aún no hay archivos de pagos",
        descripcion:
          "Cuando generes el archivo para el banco desde «Por pagar», quedará aquí con sus liquidaciones para descargarlo otra vez.",
        accion: (
          <EnlaceBoton
            href={rutaVistaPagosMedios("por-pagar")}
            variant="outline"
          >
            Ir a Por pagar
          </EnlaceBoton>
        ),
      }}
    />
  )
}
