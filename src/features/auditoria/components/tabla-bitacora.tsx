"use client"

import { PanelRight, ScrollText, ShieldAlert } from "lucide-react"
import { type MouseEvent, useMemo } from "react"

import {
  crearColumnas,
  ID_COLUMNA_ACCIONES,
} from "@/components/data-table/columnas"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import { Button } from "@/components/ui/button"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"

import { estadoTablaBitacora } from "../estado-bitacora"
import { formatearHora } from "../linea-tiempo"
import type { EventoBitacora, OpcionesFiltroBitacora } from "../tipos"
import { useDetalleEvento } from "./contexto-detalle"
import { AvatarActor, IconoAccion, InsigniaOrigen } from "./distintivos"
import { filtrosFacetadosBitacora } from "./filtros-bitacora"

const columna = crearColumnas<EventoBitacora>()

/** Controles dentro de la fila que no deben abrir el panel. */
const CONTROLES =
  "a,button,input,label,select,textarea,[role=checkbox],[role=menuitem]"

function CeldaEvento({
  evento,
  onAbrir,
}: {
  evento: EventoBitacora
  onAbrir: () => void
}) {
  return (
    <div className="flex min-w-0 items-start gap-3" data-evento-id={evento.id}>
      <IconoAccion
        accion={evento.accion}
        tono={evento.tono}
        tamano="sm"
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onAbrir}
            className="truncate rounded-sm text-left font-medium text-foreground underline-offset-4 hover:underline focus-visible:anillo-foco"
          >
            {evento.titulo}
          </button>
          {evento.sensible ? (
            <ShieldAlert
              className="size-3.5 shrink-0 text-warning"
              aria-label="Evento sensible"
            />
          ) : null}
        </span>
        {evento.resumen ? (
          <span className="truncate text-xs text-muted-foreground">
            {evento.resumen}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function CeldaActor({ evento }: { evento: EventoBitacora }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <AvatarActor actor={evento.actor} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate">{evento.actor.nombre}</span>
        <span className="truncate text-xs text-muted-foreground">
          {evento.actor.esSistema
            ? "Automático"
            : (evento.actor.rol ?? "Sin rol")}
        </span>
      </div>
    </div>
  )
}

function CeldaEntidad({ evento }: { evento: EventoBitacora }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate">{evento.nombreEntidad}</span>
      {evento.entidadId ? (
        <span
          className="truncate font-mono text-[0.6875rem] text-muted-foreground"
          title={evento.entidadId}
        >
          {evento.entidadId.length > 13
            ? `${evento.entidadId.slice(0, 8)}…`
            : evento.entidadId}
        </span>
      ) : null}
    </div>
  )
}

function CeldaFecha({ evento }: { evento: EventoBitacora }) {
  return (
    <div className="flex flex-col whitespace-nowrap">
      <time
        dateTime={evento.at}
        title={formatearFechaHora(evento.at)}
        suppressHydrationWarning
      >
        {formatearRelativo(evento.at)}
      </time>
      <span className="text-xs cifras text-muted-foreground">
        {formatearHora(evento.at)}
      </span>
    </div>
  )
}

interface TablaBitacoraProps {
  filas: EventoBitacora[]
  total: number
  opciones: OpcionesFiltroBitacora
}

/**
 * Bitácora en tabla (paginación en el servidor). Un clic en la fila (o en el
 * título, con teclado) abre el panel de detalle con el visor de diferencias.
 */
export function TablaBitacora({ filas, total, opciones }: TablaBitacoraProps) {
  const { abrir } = useDetalleEvento()

  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor((fila) => fila.titulo, {
          id: "evento",
          header: "Evento",
          enableHiding: false,
          meta: {
            titulo: "Evento",
            campoOrden: "accion",
            tipoDato: "otro",
            tarjeta: "titulo",
            claseCelda: "max-w-80 xl:max-w-md",
          },
          cell: ({ row }) => (
            <CeldaEvento
              evento={row.original}
              onAbrir={() => abrir(row.original)}
            />
          ),
        }),
        columna.accessor((fila) => fila.actor.nombre, {
          id: "actor",
          header: "Actor",
          meta: { titulo: "Actor", claseCelda: "max-w-56" },
          cell: ({ row }) => <CeldaActor evento={row.original} />,
        }),
        columna.accessor((fila) => fila.nombreEntidad, {
          id: "entidad",
          header: "Entidad",
          meta: {
            titulo: "Entidad",
            campoOrden: "entidad",
            ocultarBajo: "lg",
            claseCelda: "max-w-44",
          },
          cell: ({ row }) => <CeldaEntidad evento={row.original} />,
        }),
        columna.accessor((fila) => fila.origen, {
          id: "origen",
          header: "Origen",
          meta: { titulo: "Origen", ocultarBajo: "xl", tarjeta: "oculta" },
          // Lo habitual (la app) va en texto discreto; los demás orígenes resaltan.
          cell: ({ row }) =>
            row.original.origen === "APP" ? (
              <span className="text-xs text-muted-foreground">Aplicación</span>
            ) : (
              <InsigniaOrigen origen={row.original.origen} />
            ),
        }),
        columna.accessor((fila) => fila.at, {
          id: "fecha",
          header: "Fecha",
          meta: {
            titulo: "Fecha",
            campoOrden: "fecha",
            tipoDato: "fecha",
            formatoExportacion: "fechaHora",
          },
          cell: ({ row }) => <CeldaFecha evento={row.original} />,
        }),
        columna.display({
          id: ID_COLUMNA_ACCIONES,
          header: () => <span className="sr-only">Detalle</span>,
          meta: { titulo: "Detalle", exportacion: "nunca", alinear: "fin" },
          enableHiding: false,
          cell: ({ row }) => (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Ver detalle del evento ${row.original.id}`}
              title="Ver detalle"
              onClick={() => abrir(row.original)}
            >
              <PanelRight aria-hidden />
            </Button>
          ),
        }),
      ]),
    [abrir]
  )

  const filtros = useMemo(() => filtrosFacetadosBitacora(opciones), [opciones])

  /** Clic en cualquier parte de la fila (o la tarjeta en móvil) abre el detalle. */
  function abrirDesdeFila(evento: MouseEvent<HTMLDivElement>) {
    const destino = evento.target
    if (!(destino instanceof Element) || destino.closest(CONTROLES)) return
    const marca = destino.closest("tr, li")?.querySelector("[data-evento-id]")
    const id = Number(marca?.getAttribute("data-evento-id"))
    const fila = filas.find((candidata) => candidata.id === id)
    if (fila) abrir(fila)
  }

  return (
    // El título de cada fila es un botón (teclado); el clic en la fila es un atajo de ratón.
    <div
      onClick={abrirDesdeFila}
      className="[&_tbody_tr]:cursor-pointer [&_ul>li]:cursor-pointer"
    >
      <TablaDatos
        titulo="Eventos de la bitácora"
        columnas={columnas}
        filas={filas}
        total={total}
        idFila={(fila) => String(fila.id)}
        etiquetaFila={(fila) => fila.titulo}
        estadoTabla={estadoTablaBitacora}
        filtros={filtros}
        placeholderBusqueda="Buscar por correo, id o motivo"
        claveAlmacenamiento="bitacora"
        vacio={{
          icono: ScrollText,
          titulo: "Sin eventos en este periodo",
          descripcion:
            "La bitácora registra cada cambio de la plataforma. Prueba con un periodo más amplio.",
        }}
      />
    </div>
  )
}
