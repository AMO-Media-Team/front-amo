"use client"

import { MessagesSquare, Scale } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { crearColumnas } from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import { formatearFechaCompacta } from "@/features/operacion/formato"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"
import { Constants } from "@/types/database.types"

import { registrarExportacionDisputas } from "../actions"
import { estadoTablaDisputas, GRUPOS, GRUPOS_DISPUTA } from "../bandeja"
import {
  efectoResolucion,
  ETIQUETAS_PARTE,
  MOTIVOS,
  ORDEN_MOTIVOS,
  presentacionEstado,
  RESUMEN_EFECTO,
} from "../presentacion"
import { rutaDisputaInterna } from "../rutas"
import type { DisputaFila } from "../tipos"
import { InsigniaEstadoDisputa } from "./estado-disputa"

const columna = crearColumnas<DisputaFila>()

function CeldaDisputa({ fila }: { fila: DisputaFila }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {fila.plataforma ? (
        <MarcaPlataforma plataforma={fila.plataforma} className="shrink-0" />
      ) : null}
      <div
        className="flex min-w-0 flex-col"
        title={
          [fila.medio, fila.oferta].filter(Boolean).join("\n") || undefined
        }
      >
        <Link
          href={rutaDisputaInterna(fila.id)}
          className="truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
        >
          {fila.medio ?? "Asignación no visible"}
        </Link>
        <span className="truncate text-xs text-muted-foreground">
          {fila.oferta ?? "—"}
        </span>
      </div>
    </div>
  )
}

function CeldaMotivo({ fila }: { fila: DisputaFila }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{MOTIVOS[fila.motivo].etiqueta}</span>
      <span className="truncate text-xs text-muted-foreground">
        La abrió: {ETIQUETAS_PARTE[fila.parte].toLocaleLowerCase("es-CO")}
      </span>
    </span>
  )
}

function CeldaCampana({ fila }: { fila: DisputaFila }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-foreground">{fila.campana ?? "—"}</span>
      <span className="truncate text-xs text-muted-foreground">
        {fila.anunciante ?? fila.marca ?? "—"}
      </span>
    </span>
  )
}

function CeldaEstado({ fila }: { fila: DisputaFila }) {
  const efecto = efectoResolucion(fila)
  return (
    <span className="flex flex-col items-start gap-0.5">
      <InsigniaEstadoDisputa estado={fila.estado} perspectiva="interno" />
      {efecto ? (
        <span className="pl-1 text-[0.6875rem] text-muted-foreground">
          {RESUMEN_EFECTO[efecto]}
        </span>
      ) : null}
    </span>
  )
}

function CeldaAbierta({ fila, ahora }: { fila: DisputaFila; ahora: number }) {
  const abierta = fila.estado === "ABIERTA" || fila.estado === "EN_REVISION"
  return (
    <span
      className="flex flex-col leading-tight"
      title={formatearFechaHora(fila.creadaAt)}
    >
      <time dateTime={fila.creadaAt} className="cifras whitespace-nowrap">
        {formatearFechaCompacta(fila.creadaAt)}
      </time>
      {abierta ? (
        <span
          suppressHydrationWarning
          className="text-[0.6875rem] whitespace-nowrap text-muted-foreground"
        >
          {formatearRelativo(fila.creadaAt, new Date(ahora))}
        </span>
      ) : null}
    </span>
  )
}

interface TablaDisputasProps {
  filas: DisputaFila[]
  total: number
  /** Instante del servidor: la misma antigüedad en SSR e hidratación. */
  ahora: number
}

/** Bandeja de disputas del equipo AMO (ADM-012). */
export function TablaDisputas({ filas, total, ahora }: TablaDisputasProps) {
  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor((fila) => fila.medio ?? "", {
          id: "disputa",
          header: "Medio · oferta",
          enableHiding: false,
          meta: {
            titulo: "Medio",
            tarjeta: "titulo",
            claseCelda: "max-w-48 min-[1400px]:max-w-60 2xl:max-w-72",
          },
          cell: ({ row }) => <CeldaDisputa fila={row.original} />,
        }),
        columna.accessor((fila) => fila.oferta ?? "", {
          id: "oferta",
          header: "Oferta",
          meta: {
            titulo: "Oferta",
            ocultaPorDefecto: true,
            exportacion: "siempre",
          },
        }),
        columna.accessor((fila) => MOTIVOS[fila.motivo].etiqueta, {
          id: "motivo",
          header: "Motivo",
          meta: { titulo: "Motivo", claseCelda: "max-w-36" },
          cell: ({ row }) => <CeldaMotivo fila={row.original} />,
        }),
        columna.accessor((fila) => ETIQUETAS_PARTE[fila.parte], {
          id: "parte",
          header: "La abrió",
          meta: {
            titulo: "La abrió",
            ocultaPorDefecto: true,
            exportacion: "siempre",
          },
        }),
        columna.accessor((fila) => fila.campana ?? "", {
          id: "campana",
          header: "Campaña",
          meta: {
            titulo: "Campaña",
            ocultarBajo: "lg",
            claseCelda: "max-w-32 min-[1400px]:max-w-44 2xl:max-w-56",
          },
          cell: ({ row }) => <CeldaCampana fila={row.original} />,
        }),
        columna.accessor((fila) => fila.anunciante ?? "", {
          id: "anunciante",
          header: "Anunciante",
          meta: {
            titulo: "Anunciante",
            ocultaPorDefecto: true,
            exportacion: "siempre",
          },
        }),
        columna.accessor(
          (fila) => presentacionEstado(fila.estado, "interno").etiqueta,
          {
            id: "estado",
            header: "Estado",
            meta: { titulo: "Estado", campoOrden: "estado", tipoDato: "otro" },
            cell: ({ row }) => <CeldaEstado fila={row.original} />,
          }
        ),
        columna.accessor((fila) => fila.mensajes, {
          id: "mensajes",
          header: "Mensajes",
          meta: {
            titulo: "Mensajes",
            alinear: "fin",
            ocultarBajo: "xl",
            formatoExportacion: "numero",
          },
          cell: ({ getValue }) => (
            <span className="inline-flex items-center gap-1.5 cifras text-muted-foreground">
              <MessagesSquare aria-hidden className="size-3.5" />
              {getValue().toLocaleString("es-CO")}
            </span>
          ),
        }),
        columna.accessor((fila) => fila.creadaAt, {
          id: "abierta",
          header: "Abierta",
          meta: {
            titulo: "Abierta",
            campoOrden: "abierta",
            tipoDato: "fecha",
            formatoExportacion: "fechaHora",
          },
          cell: ({ row }) => <CeldaAbierta fila={row.original} ahora={ahora} />,
        }),
        columna.accessor((fila) => fila.resueltaAt ?? "", {
          id: "resuelta",
          header: "Cerrada",
          meta: {
            titulo: "Cerrada",
            campoOrden: "resuelta",
            tipoDato: "fecha",
            ocultarBajo: "xl",
            formatoExportacion: "fechaHora",
          },
          cell: ({ getValue }) =>
            getValue() ? (
              <time
                dateTime={getValue()}
                title={formatearFechaHora(getValue())}
                className="cifras whitespace-nowrap text-muted-foreground"
              >
                {formatearFechaCompacta(getValue())}
              </time>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        }),
      ]),
    [ahora]
  )

  const filtros = useMemo<FiltroFacetado<"estado" | "motivo" | "parte">[]>(
    () => [
      {
        clave: "estado",
        titulo: "Estado",
        opciones: GRUPOS_DISPUTA.map((grupo) => ({
          valor: grupo,
          etiqueta: GRUPOS[grupo].etiqueta,
        })),
      },
      {
        clave: "motivo",
        titulo: "Motivo",
        opciones: ORDEN_MOTIVOS.map((motivo) => ({
          valor: motivo,
          etiqueta: MOTIVOS[motivo].etiqueta,
        })),
      },
      {
        clave: "parte",
        titulo: "La abrió",
        opciones: Constants.public.Enums.disputa_parte.map((parte) => ({
          valor: parte,
          etiqueta: ETIQUETAS_PARTE[parte],
        })),
      },
    ],
    []
  )

  return (
    <TablaDatos
      titulo="Disputas"
      columnas={columnas}
      filas={filas}
      total={total}
      idFila={(fila) => fila.id}
      etiquetaFila={(fila) =>
        `Disputa de ${fila.medio ?? "un medio"} · ${MOTIVOS[fila.motivo].etiqueta}`
      }
      estadoTabla={estadoTablaDisputas}
      filtros={filtros}
      placeholderBusqueda="Buscar medio, campaña, marca u oferta"
      claveAlmacenamiento="operacion-disputas"
      enlaceFila={(fila) => rutaDisputaInterna(fila.id)}
      exportacion={{
        nombre: "Disputas AMO",
        onExportado: (resumen) => void registrarExportacionDisputas(resumen),
      }}
      vacio={{
        icono: Scale,
        titulo: "No hay disputas",
        descripcion:
          "Cuando un medio, un anunciante o el equipo abran una disputa sobre una asignación, aparecerá aquí con su conversación.",
      }}
    />
  )
}
