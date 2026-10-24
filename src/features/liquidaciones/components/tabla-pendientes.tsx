"use client"

import { HandCoins, Inbox } from "lucide-react"
import { useMemo, useState } from "react"

import {
  crearColumnas,
  ID_COLUMNA_ACCIONES,
} from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import { Button } from "@/components/ui/button"
import { EnlaceFicha } from "@/features/operacion/components/ficha"
import { rutaMedio } from "@/features/operacion/rutas"

import type { PeriodoCorte } from "../periodo"
import {
  AYUDA_SOPORTE,
  ETIQUETAS_ALERTA,
  ETIQUETAS_SOPORTE,
  soporteDe,
} from "../presentacion"
import type { FilaPendiente } from "../tipos"
import {
  ALERTAS_PENDIENTE,
  alertasDe,
  estadoTablaPendientes,
  SOPORTES_PAGO,
  VISTAS,
} from "../vistas"
import { DialogoLiquidarMedio } from "./dialogo-liquidar-medio"
import { FechaConDistancia, InsigniaAlerta, Pesos } from "./piezas"

const columna = crearColumnas<FilaPendiente>()

const FILTROS: readonly FiltroFacetado<"soporte" | "alerta">[] = [
  {
    clave: "soporte",
    titulo: "Documento del pago",
    opciones: SOPORTES_PAGO.map((valor) => ({
      valor,
      etiqueta: ETIQUETAS_SOPORTE[valor],
    })),
  },
  {
    clave: "alerta",
    titulo: "Avisos",
    opciones: ALERTAS_PENDIENTE.map((valor) => ({
      valor,
      etiqueta: ETIQUETAS_ALERTA[valor],
    })),
  },
]

export interface TablaPendientesProps {
  filas: FilaPendiente[]
  total: number
  /** Instante del servidor: la misma antigüedad en SSR e hidratación. */
  ahora: number
  /** Con `liquidaciones.generar`: el periodo sugerido para «Liquidar»; sin él, no se ofrece. */
  sugerido: PeriodoCorte | null
  hoy: string
  /** `medios.ver`: el nombre enlaza a la ficha del medio. */
  verMedios: boolean
}

/**
 * «Por liquidar» (LIQ-001): un medio por fila con sus verificadas sin
 * liquidar, el valor estimado (antes de retenciones), desde cuándo esperan,
 * si factura o lleva documento soporte y los avisos que frenarán su pago.
 * «Liquidar» genera la de ese medio.
 */
export function TablaPendientes({
  filas,
  total,
  ahora,
  sugerido,
  hoy,
  verMedios,
}: TablaPendientesProps) {
  const [elegido, setElegido] = useState<FilaPendiente | null>(null)

  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor("medio", {
          header: "Medio",
          enableHiding: false,
          meta: {
            titulo: "Medio",
            campoOrden: "medio",
            tarjeta: "titulo",
            claseCelda: "max-w-56 xl:max-w-72",
          },
          cell: ({ row }) => (
            <span className="flex min-w-0 flex-col">
              <EnlaceFicha
                href={rutaMedio(row.original.medioId)}
                permitido={verMedios}
                className="truncate font-medium text-foreground"
              >
                {row.original.medio}
              </EnlaceFicha>
              <span className="truncate text-xs text-muted-foreground">
                {row.original.municipio ?? "Sin municipio"}
              </span>
            </span>
          ),
        }),
        columna.accessor("asignaciones", {
          header: "Asignaciones",
          meta: {
            titulo: "Asignaciones",
            campoOrden: "asignaciones",
            tipoDato: "otro",
            alinear: "fin",
          },
          cell: ({ getValue }) => <span className="cifras">{getValue()}</span>,
        }),
        columna.accessor("montoMedio", {
          id: "valor",
          header: () => (
            <span title="Estimado antes de retenciones">Valor estimado</span>
          ),
          meta: {
            titulo: "Valor estimado",
            campoOrden: "valor",
            tipoDato: "otro",
            alinear: "fin",
          },
          cell: ({ getValue }) => <Pesos valor={getValue()} />,
        }),
        columna.accessor("primeraVerificada", {
          id: "desde",
          header: "Esperan desde",
          meta: {
            titulo: "Esperan desde",
            campoOrden: "desde",
            tipoDato: "fecha",
            formatoExportacion: "fechaHora",
          },
          cell: ({ getValue }) => (
            <FechaConDistancia instante={getValue()} ahora={ahora} />
          ),
        }),
        columna.accessor(
          (fila) => ETIQUETAS_SOPORTE[soporteDe(fila.requiereDocumentoSoporte)],
          {
            id: "soporte",
            header: "Documento del pago",
            meta: { titulo: "Documento del pago", ocultarBajo: "lg" },
            cell: ({ row }) => {
              const soporte = soporteDe(row.original.requiereDocumentoSoporte)
              return (
                <span title={AYUDA_SOPORTE[soporte]}>
                  {ETIQUETAS_SOPORTE[soporte]}
                </span>
              )
            },
          }
        ),
        columna.accessor(
          (fila) =>
            alertasDe(fila)
              .map((alerta) => ETIQUETAS_ALERTA[alerta])
              .join(", "),
          {
            id: "avisos",
            header: "Avisos",
            meta: { titulo: "Avisos" },
            cell: ({ row }) => {
              const alertas = alertasDe(row.original)
              if (alertas.length === 0) {
                return <span className="text-muted-foreground">Al día</span>
              }
              return (
                <span className="flex flex-wrap gap-1.5">
                  {alertas.map((alerta) => (
                    <InsigniaAlerta key={alerta} alerta={alerta} />
                  ))}
                </span>
              )
            },
          }
        ),
        ...(sugerido
          ? [
              columna.display({
                id: ID_COLUMNA_ACCIONES,
                header: () => <span className="sr-only">Acciones</span>,
                meta: {
                  titulo: "Acciones",
                  exportacion: "nunca",
                  alinear: "fin",
                },
                cell: ({ row }) => (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Liquidar ${row.original.medio}`}
                    onClick={() => setElegido(row.original)}
                  >
                    <HandCoins data-icon="inline-start" aria-hidden />
                    Liquidar
                  </Button>
                ),
              }),
            ]
          : []),
      ]),
    [ahora, sugerido, verMedios]
  )

  return (
    <>
      <TablaDatos
        titulo="Medios por liquidar"
        columnas={columnas}
        filas={filas}
        total={total}
        idFila={(fila) => fila.medioId}
        estadoTabla={estadoTablaPendientes}
        filtros={FILTROS}
        placeholderBusqueda="Buscar medio…"
        claveAlmacenamiento="liquidaciones-pendientes"
        vacio={{
          icono: Inbox,
          titulo: VISTAS.pendientes.vacia,
          descripcion: VISTAS.pendientes.ayudaVacia,
        }}
      />
      {sugerido ? (
        <DialogoLiquidarMedio
          medio={elegido}
          sugerido={sugerido}
          hoy={hoy}
          onCerrar={() => setElegido(null)}
        />
      ) : null}
    </>
  )
}
