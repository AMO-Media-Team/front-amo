"use client"

import { FileLock2 } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { crearColumnas } from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import { formatearFechaCompacta } from "@/features/operacion/formato"
import { TIPOS_ROL_ETIQUETA } from "@/features/usuarios/presentacion"
import { formatearFechaHora } from "@/lib/format"

import { registrarExportacionSolicitudes } from "../actions"
import { estadoTablaSolicitudes } from "../bandeja"
import {
  ESTADOS_INTERNO,
  formatearDia,
  ORDEN_TIPOS,
  PRESENTACION_SEMAFORO,
  SEMAFOROS,
  situacionPlazo,
  esSemaforo,
  textoRadicado,
  TIPOS,
} from "../presentacion"
import { rutaSolicitudAdmin } from "../rutas"
import { ESTADOS_SOLICITUD, type SolicitudFila } from "../tipos"
import { InsigniaEstadoSolicitud, InsigniaPlazo } from "./estado-solicitud"

const columna = crearColumnas<SolicitudFila>()

function CeldaSolicitud({ fila }: { fila: SolicitudFila }) {
  return (
    <div className="flex min-w-0 flex-col">
      <Link
        href={rutaSolicitudAdmin(fila.id)}
        className="truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
      >
        {textoRadicado(fila.numero)} · {TIPOS[fila.tipo].etiqueta}
      </Link>
      <span className="truncate text-xs text-muted-foreground">
        {fila.titular ?? "Titular suprimido"}
        {fila.organizacion ? ` · ${fila.organizacion}` : ""}
      </span>
    </div>
  )
}

function CeldaVence({ fila, hoy }: { fila: SolicitudFila; hoy: string }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <time dateTime={fila.plazoVence} className="cifras whitespace-nowrap">
        {formatearDia(fila.plazoVence)}
      </time>
      <InsigniaPlazo solicitud={fila} hoy={hoy} />
      {fila.prorrogada ? (
        <span className="text-[0.6875rem] text-muted-foreground">
          Prorrogada
        </span>
      ) : null}
    </span>
  )
}

function textoSemaforo(fila: SolicitudFila, hoy: string): string {
  const situacion = situacionPlazo(fila, hoy)
  return esSemaforo(situacion) ? PRESENTACION_SEMAFORO[situacion].etiqueta : ""
}

interface TablaSolicitudesProps {
  filas: SolicitudFila[]
  total: number
  /** Día de Bogotá del servidor ('YYYY-MM-DD'): el mismo semáforo en SSR e hidratación. */
  hoy: string
}

/** Bandeja de solicitudes de titulares de datos del equipo AMO (CTA-007). */
export function TablaSolicitudes({ filas, total, hoy }: TablaSolicitudesProps) {
  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor((fila) => fila.numero, {
          id: "numero",
          header: "Solicitud",
          enableHiding: false,
          meta: {
            titulo: "Radicado",
            tarjeta: "titulo",
            campoOrden: "numero",
            tipoDato: "otro",
            formatoExportacion: "numero",
            claseCelda: "max-w-72 min-[1400px]:max-w-96",
          },
          cell: ({ row }) => <CeldaSolicitud fila={row.original} />,
        }),
        columna.accessor((fila) => TIPOS[fila.tipo].etiqueta, {
          id: "tipo",
          header: "Tipo",
          meta: {
            titulo: "Tipo",
            ocultaPorDefecto: true,
            exportacion: "siempre",
          },
        }),
        columna.accessor((fila) => fila.titular ?? "", {
          id: "titular",
          header: "Titular",
          meta: {
            titulo: "Titular",
            ocultaPorDefecto: true,
            exportacion: "siempre",
          },
        }),
        columna.accessor((fila) => TIPOS_ROL_ETIQUETA[fila.rolTipo], {
          id: "rol",
          header: "Rol del titular",
          meta: { titulo: "Rol del titular", ocultarBajo: "lg" },
        }),
        columna.accessor((fila) => fila.organizacion ?? "", {
          id: "organizacion",
          header: "Organización",
          meta: {
            titulo: "Organización",
            ocultaPorDefecto: true,
            exportacion: "siempre",
          },
        }),
        columna.accessor((fila) => fila.recibidaAt, {
          id: "recibida",
          header: "Recibida",
          meta: {
            titulo: "Recibida",
            campoOrden: "recibida",
            tipoDato: "fecha",
            ocultarBajo: "xl",
            formatoExportacion: "fechaHora",
          },
          cell: ({ getValue }) => (
            <time
              dateTime={getValue()}
              title={formatearFechaHora(getValue())}
              className="cifras whitespace-nowrap text-muted-foreground"
            >
              {formatearFechaCompacta(getValue())}
            </time>
          ),
        }),
        columna.accessor((fila) => fila.plazoVence, {
          id: "vence",
          header: "Vence",
          meta: {
            titulo: "Vence",
            campoOrden: "vence",
            tipoDato: "fecha",
            formatoExportacion: "fecha",
          },
          cell: ({ row }) => <CeldaVence fila={row.original} hoy={hoy} />,
        }),
        columna.accessor((fila) => textoSemaforo(fila, hoy), {
          id: "semaforo",
          header: "Plazo",
          meta: {
            titulo: "Plazo",
            ocultaPorDefecto: true,
            exportacion: "siempre",
          },
        }),
        columna.accessor((fila) => ESTADOS_INTERNO[fila.estado].etiqueta, {
          id: "estado",
          header: "Estado",
          meta: { titulo: "Estado", campoOrden: "estado", tipoDato: "otro" },
          cell: ({ row }) => (
            <InsigniaEstadoSolicitud
              estado={row.original.estado}
              perspectiva="interno"
            />
          ),
        }),
      ]),
    [hoy]
  )

  const filtros = useMemo<FiltroFacetado<"estado" | "tipo" | "vence">[]>(
    () => [
      {
        clave: "estado",
        titulo: "Estado",
        opciones: ESTADOS_SOLICITUD.map((estado) => ({
          valor: estado,
          etiqueta: ESTADOS_INTERNO[estado].etiqueta,
        })),
      },
      {
        clave: "tipo",
        titulo: "Tipo",
        opciones: ORDEN_TIPOS.map((tipo) => ({
          valor: tipo,
          etiqueta: TIPOS[tipo].etiqueta,
        })),
      },
      {
        clave: "vence",
        titulo: "Plazo",
        opciones: SEMAFOROS.map((semaforo) => ({
          valor: semaforo,
          etiqueta: PRESENTACION_SEMAFORO[semaforo].etiqueta,
        })),
      },
    ],
    []
  )

  return (
    <TablaDatos
      titulo="Solicitudes de titulares de datos"
      columnas={columnas}
      filas={filas}
      total={total}
      idFila={(fila) => fila.id}
      etiquetaFila={(fila) =>
        `Solicitud ${textoRadicado(fila.numero)} · ${TIPOS[fila.tipo].etiqueta}`
      }
      estadoTabla={estadoTablaSolicitudes}
      filtros={filtros}
      placeholderBusqueda="Buscar radicado o titular"
      claveAlmacenamiento="administracion-privacidad"
      enlaceFila={(fila) => rutaSolicitudAdmin(fila.id)}
      exportacion={{
        nombre: "Solicitudes de titulares AMO",
        onExportado: (resumen) => void registrarExportacionSolicitudes(resumen),
      }}
      vacio={{
        icono: FileLock2,
        titulo: "No hay solicitudes",
        descripcion:
          "Cuando un medio o un anunciante consulte, corrija o pida suprimir sus datos personales, la solicitud aparecerá aquí con su plazo legal.",
      }}
    />
  )
}
