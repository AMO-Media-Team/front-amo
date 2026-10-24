"use client"

import { Ban, BadgeCheck, Wallet } from "lucide-react"
import { useMemo } from "react"

import { crearColumnas } from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"

import {
  ETIQUETAS_SOPORTE,
  situacionSoporte,
  textoDispersion,
} from "../presentacion"
import { rutaLiquidacion } from "../rutas"
import type { FilaLiquidacion } from "../tipos"
import {
  estadoTablaLiquidaciones,
  SOPORTES_PAGO,
  VISTAS,
  type VistaPorEstado,
} from "../vistas"
import {
  CeldaLiquidacion,
  Dia,
  FechaConDistancia,
  InsigniaSoporte,
  Pesos,
} from "./piezas"

const columna = crearColumnas<FilaLiquidacion>()

const FILTROS: readonly FiltroFacetado<"soporte">[] = [
  {
    clave: "soporte",
    titulo: "Documento del pago",
    opciones: SOPORTES_PAGO.map((valor) => ({
      valor,
      etiqueta: ETIQUETAS_SOPORTE[valor],
    })),
  },
]

type VistaCerrada = Exclude<VistaPorEstado, "borrador">

const TITULOS: Readonly<Record<VistaCerrada, string>> = {
  aprobadas: "Liquidaciones aprobadas",
  pagadas: "Liquidaciones pagadas",
  anuladas: "Liquidaciones anuladas",
}

const ICONOS = { aprobadas: BadgeCheck, pagadas: Wallet, anuladas: Ban }

export interface TablaLiquidacionesProps {
  vista: VistaCerrada
  filas: FilaLiquidacion[]
  total: number
  ahora: number
}

/**
 * Aprobadas, pagadas y anuladas: periodo, medio, neto, el documento del pago
 * (documento soporte o factura del medio), el archivo de pagos y la fecha
 * que importa en cada vista. Cada fila abre la ficha.
 */
export function TablaLiquidaciones({
  vista,
  filas,
  total,
  ahora,
}: TablaLiquidacionesProps) {
  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor((fila) => fila.medio ?? "", {
          id: "liquidacion",
          header: "Medio · periodo",
          enableHiding: false,
          meta: {
            titulo: "Medio",
            campoOrden: "periodo",
            tipoDato: "fecha",
            tarjeta: "titulo",
            claseCelda: "max-w-56 xl:max-w-72",
          },
          cell: ({ row }) => <CeldaLiquidacion {...row.original} />,
        }),
        columna.accessor("montoNeto", {
          id: "neto",
          header: "Neto",
          meta: {
            titulo: "Neto",
            campoOrden: "neto",
            tipoDato: "otro",
            alinear: "fin",
          },
          cell: ({ getValue }) => (
            <Pesos valor={getValue()} className="font-medium" />
          ),
        }),
        columna.accessor((fila) => situacionSoporte(fila).etiqueta, {
          id: "soporte",
          header: "Documento del pago",
          meta: { titulo: "Documento del pago" },
          cell: ({ row }) => <InsigniaSoporte fila={row.original} />,
        }),
        ...(vista === "anuladas"
          ? []
          : [
              columna.accessor((fila) => textoDispersion(fila.dispersion), {
                id: "dispersion",
                header: "Archivo de pagos",
                meta: { titulo: "Archivo de pagos", ocultarBajo: "lg" },
                cell: ({ row }) => (
                  <span
                    className={
                      row.original.dispersion ? "" : "text-muted-foreground"
                    }
                  >
                    {textoDispersion(row.original.dispersion)}
                  </span>
                ),
              }),
            ]),
        vista === "aprobadas"
          ? columna.accessor("aprobadaAt", {
              id: "aprobada",
              header: "Aprobada",
              meta: { titulo: "Aprobada", formatoExportacion: "fechaHora" },
              cell: ({ getValue }) => (
                <FechaConDistancia instante={getValue()} ahora={ahora} />
              ),
            })
          : vista === "pagadas"
            ? columna.accessor("fechaPago", {
                id: "pago",
                header: "Pagada",
                meta: {
                  titulo: "Pagada",
                  campoOrden: "pago",
                  tipoDato: "fecha",
                  formatoExportacion: "fecha",
                },
                cell: ({ getValue }) => <Dia dia={getValue()} />,
              })
            : columna.accessor("anuladaAt", {
                id: "anulada",
                header: "Anulada",
                meta: { titulo: "Anulada", formatoExportacion: "fechaHora" },
                cell: ({ getValue }) => (
                  <FechaConDistancia
                    instante={getValue()}
                    ahora={ahora}
                    relativa={false}
                  />
                ),
              }),
      ]),
    [ahora, vista]
  )

  return (
    <TablaDatos
      titulo={TITULOS[vista]}
      columnas={columnas}
      filas={filas}
      total={total}
      idFila={(fila) => fila.id}
      estadoTabla={estadoTablaLiquidaciones}
      filtros={FILTROS}
      placeholderBusqueda="Buscar medio…"
      claveAlmacenamiento={`liquidaciones-${vista}`}
      enlaceFila={(fila) => rutaLiquidacion(fila.id)}
      vacio={{
        icono: ICONOS[vista],
        titulo: VISTAS[vista].vacia,
        descripcion: VISTAS[vista].ayudaVacia,
      }}
    />
  )
}
