"use client"

import { Megaphone, Plus } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { crearColumnas } from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { BarraLlenado } from "@/features/operacion/components/distintivos"
import { proporcion } from "@/features/operacion/calculos"
import {
  formatearRangoCompacto,
  instanteDeDia,
} from "@/features/operacion/formato"
import {
  formatearCOP,
  formatearCOPCompacto,
  formatearFecha,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { estadoTablaMisCampanas } from "../estado-tabla"
import {
  duracionVigencia,
  ESTADOS_MI_CAMPANA,
  ORDEN_ESTADOS_CAMPANA,
  textoFase,
} from "../presentacion"
import { RUTA_NUEVA_CAMPANA, rutaMiCampana } from "../rutas"
import type { MiCampanaFila } from "../tipos"
import { ConteosOfertas, InsigniaCampana } from "./distintivos-campana"

const columna = crearColumnas<MiCampanaFila>()

function CeldaCampana({ fila }: { fila: MiCampanaFila }) {
  return (
    <div className="flex min-w-0 flex-col">
      <Link
        href={rutaMiCampana(fila.id)}
        className="truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
      >
        {fila.nombre}
      </Link>
      <span className="truncate text-xs text-muted-foreground">
        {fila.marca}
      </span>
    </div>
  )
}

function CeldaVigencia({ fila, hoy }: { fila: MiCampanaFila; hoy: string }) {
  const fase = textoFase(fila, hoy)
  return (
    <span className="flex flex-col leading-tight">
      <span
        className="cifras whitespace-nowrap"
        title={`${formatearFecha(instanteDeDia(fila.fechaInicio), "largo")} al ${formatearFecha(
          instanteDeDia(fila.fechaFin),
          "largo"
        )}`}
      >
        {formatearRangoCompacto(
          instanteDeDia(fila.fechaInicio),
          instanteDeDia(fila.fechaFin)
        )}
      </span>
      <span className="text-[0.6875rem] text-muted-foreground">
        {fase ? fase.texto : duracionVigencia(fila.fechaInicio, fila.fechaFin)}
      </span>
    </span>
  )
}

function CeldaPresupuesto({ fila }: { fila: MiCampanaFila }) {
  const fraccion = proporcion(
    fila.presupuestoComprometido,
    fila.presupuestoTotal
  )
  return (
    <span
      className="flex w-28 flex-col gap-1 min-[1400px]:w-32 md:ml-auto md:items-end"
      title={`${formatearCOP(fila.presupuestoComprometido)} comprometidos de ${formatearCOP(fila.presupuestoTotal)}`}
    >
      <span className="text-xs cifras">
        <span
          className={cn(
            "font-medium",
            !fila.presupuestoComprometido && "text-muted-foreground"
          )}
        >
          {formatearCOPCompacto(fila.presupuestoComprometido)}
        </span>
        <span className="text-muted-foreground">
          {" "}
          / {formatearCOPCompacto(fila.presupuestoTotal)}
        </span>
      </span>
      <BarraLlenado fraccion={fraccion} tono="info" />
    </span>
  )
}

interface TablaMisCampanasProps {
  filas: MiCampanaFila[]
  total: number
  /** Hoy en Bogotá (`YYYY-MM-DD`), del servidor: misma fase en SSR e hidratación. */
  hoy: string
  /** `campanas.gestionar_propias`: el estado vacío ofrece crear la primera. */
  puedeCrear: boolean
}

/**
 * «Mis campañas»: las de la empresa (también las que crearon los compañeros),
 * con estado, vigencia, ofertas por estado y presupuesto comprometido. La
 * búsqueda, el filtro por estado, el orden y la página viven en la URL.
 */
export function TablaMisCampanas({
  filas,
  total,
  hoy,
  puedeCrear,
}: TablaMisCampanasProps) {
  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor("nombre", {
          header: "Campaña",
          enableHiding: false,
          meta: {
            titulo: "Campaña",
            campoOrden: "nombre",
            tarjeta: "titulo",
            claseCelda:
              "max-w-44 lg:max-w-56 min-[1400px]:max-w-72 2xl:max-w-96",
          },
          cell: ({ row }) => <CeldaCampana fila={row.original} />,
        }),
        columna.accessor((fila) => ESTADOS_MI_CAMPANA[fila.estado].etiqueta, {
          id: "estado",
          header: "Estado",
          meta: { titulo: "Estado", campoOrden: "estado", tipoDato: "otro" },
          cell: ({ row }) => <InsigniaCampana estado={row.original.estado} />,
        }),
        columna.accessor((fila) => instanteDeDia(fila.fechaInicio), {
          id: "inicio",
          header: "Vigencia",
          meta: {
            titulo: "Vigencia",
            campoOrden: "inicio",
            tipoDato: "fecha",
            formatoExportacion: "fecha",
          },
          cell: ({ row }) => <CeldaVigencia fila={row.original} hoy={hoy} />,
        }),
        columna.accessor((fila) => instanteDeDia(fila.fechaFin), {
          id: "fin",
          header: "Fin",
          meta: {
            titulo: "Fin",
            campoOrden: "fin",
            tipoDato: "fecha",
            ocultaPorDefecto: true,
            formatoExportacion: "fecha",
          },
          cell: ({ getValue }) => (
            <span className="cifras">{formatearFecha(getValue())}</span>
          ),
        }),
        columna.accessor((fila) => fila.ofertas, {
          id: "ofertas",
          header: "Ofertas",
          meta: {
            titulo: "Ofertas",
            formatoExportacion: "numero",
            claseCelda: "max-w-56 xl:max-w-72",
          },
          cell: ({ row }) => (
            <ConteosOfertas porEstado={row.original.ofertasPorEstado} />
          ),
        }),
        columna.accessor((fila) => fila.presupuestoTotal, {
          id: "presupuesto",
          header: "Presupuesto",
          meta: {
            titulo: "Presupuesto (comprometido / total)",
            campoOrden: "presupuesto",
            tipoDato: "otro",
            alinear: "fin",
            formatoExportacion: "numero",
          },
          cell: ({ row }) => <CeldaPresupuesto fila={row.original} />,
        }),
        columna.accessor((fila) => fila.creadaAt, {
          id: "creado",
          header: "Creada",
          meta: {
            titulo: "Creada",
            campoOrden: "creado",
            tipoDato: "fecha",
            ocultaPorDefecto: true,
            formatoExportacion: "fecha",
          },
          cell: ({ getValue }) => (
            <time
              dateTime={getValue()}
              className="cifras text-muted-foreground"
            >
              {formatearFecha(getValue())}
            </time>
          ),
        }),
      ]),
    [hoy]
  )

  const filtros = useMemo<FiltroFacetado<"estado">[]>(
    () => [
      {
        clave: "estado",
        titulo: "Estado",
        opciones: ORDEN_ESTADOS_CAMPANA.map((estado) => ({
          valor: estado,
          etiqueta: ESTADOS_MI_CAMPANA[estado].etiqueta,
        })),
      },
    ],
    []
  )

  return (
    <TablaDatos
      titulo="Campañas de tu empresa"
      columnas={columnas}
      filas={filas}
      total={total}
      idFila={(fila) => fila.id}
      etiquetaFila={(fila) => fila.nombre}
      estadoTabla={estadoTablaMisCampanas}
      filtros={filtros}
      placeholderBusqueda="Buscar por campaña o marca"
      claveAlmacenamiento="mis-campanas"
      enlaceFila={(fila) => rutaMiCampana(fila.id)}
      vacio={{
        icono: Megaphone,
        titulo: "Aún no tienes campañas",
        descripcion:
          "Crea tu primera campaña con su objetivo, fechas y presupuesto; después arma sus ofertas para que los medios las tomen.",
        accion: puedeCrear ? (
          <EnlaceBoton href={RUTA_NUEVA_CAMPANA}>
            <Plus data-icon="inline-start" aria-hidden />
            Crear campaña
          </EnlaceBoton>
        ) : undefined,
      }}
    />
  )
}
