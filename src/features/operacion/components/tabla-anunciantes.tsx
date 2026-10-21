"use client"

import { Building2 } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { crearColumnas } from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import { banderaEmoji } from "@/features/accesos/catalogo"
import {
  formatearCOP,
  formatearCOPCompacto,
  formatearFecha,
  formatearNumero,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { registrarExportacionOperacion } from "../actions"
import { ESTADOS_ANUNCIANTE, type EstadoAnunciante } from "../estados"
import { estadoTablaAnunciantes } from "../estado-tablas"
import { rutaAnunciante } from "../rutas"
import type { AnuncianteFila, OpcionCatalogo } from "../tipos"
import { InsigniaEstado } from "./distintivos"

const columna = crearColumnas<AnuncianteFila>()

const ORDEN_ESTADOS: readonly EstadoAnunciante[] = [
  "VERIFICADO",
  "PENDIENTE",
  "SUSPENDIDO",
  "RECHAZADO",
]

function CeldaAnunciante({ fila }: { fila: AnuncianteFila }) {
  const mismaRazon =
    fila.razonSocial.localeCompare(fila.nombreComercial, "es", {
      sensitivity: "base",
    }) === 0
  return (
    <div
      className="flex min-w-0 flex-col"
      title={
        mismaRazon
          ? fila.nombreComercial
          : `${fila.nombreComercial}\n${fila.razonSocial}`
      }
    >
      <Link
        href={rutaAnunciante(fila.id)}
        className="truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
      >
        {fila.nombreComercial}
      </Link>
      <span className="truncate text-xs text-muted-foreground">
        {mismaRazon ? (fila.sector ?? "Sin sector") : fila.razonSocial}
      </span>
    </div>
  )
}

function CeldaPais({ fila }: { fila: AnuncianteFila }) {
  const bandera = banderaEmoji(fila.paisIso2)
  return (
    <span className="flex min-w-0 items-center gap-2">
      {bandera ? (
        <span aria-hidden className="text-base leading-none">
          {bandera}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate">{fila.pais}</span>
        {fila.ciudad ? (
          <span className="truncate text-xs text-muted-foreground">
            {fila.ciudad}
          </span>
        ) : null}
      </span>
    </span>
  )
}

function CeldaCampanas({ fila }: { fila: AnuncianteFila }) {
  if (fila.campanas === 0) {
    return <span className="text-xs text-muted-foreground">Sin campañas</span>
  }
  return (
    <span className="flex flex-col leading-tight md:items-end">
      <span className="font-medium cifras">
        {formatearNumero(fila.campanas)}
      </span>
      <span
        className={cn(
          "text-[0.6875rem] cifras",
          fila.campanasActivas > 0 ? "text-success" : "text-muted-foreground"
        )}
      >
        {fila.campanasActivas > 0
          ? `${formatearNumero(fila.campanasActivas)} ${fila.campanasActivas === 1 ? "activa" : "activas"}`
          : "ninguna activa"}
      </span>
    </span>
  )
}

function CeldaCop({ valor }: { valor: number | null }) {
  return (
    <span
      title={formatearCOP(valor)}
      className={cn(
        "font-medium cifras",
        !valor && "font-normal text-muted-foreground"
      )}
    >
      {formatearCOPCompacto(valor)}
    </span>
  )
}

/** Saldo por cobrar; el color de aviso se reserva para lo que ya venció. */
function CeldaCartera({ fila }: { fila: AnuncianteFila }) {
  const vencidas = fila.facturasVencidas ?? 0
  return (
    <span className="flex flex-col leading-tight md:items-end">
      <CeldaCop valor={fila.cartera} />
      {vencidas > 0 ? (
        <span className="text-[0.6875rem] font-medium cifras whitespace-nowrap text-warning">
          {formatearNumero(vencidas)} {vencidas === 1 ? "vencida" : "vencidas"}
        </span>
      ) : null}
    </span>
  )
}

interface TablaAnunciantesProps {
  filas: AnuncianteFila[]
  total: number
  sectores: readonly OpcionCatalogo[]
  paises: readonly { iso2: string; nombre: string }[]
  /** La cartera solo llega a quien ve facturas. */
  conCartera: boolean
}

/** Listado de anunciantes sobre `TablaDatos`: identidad, verificación, campañas y dinero. */
export function TablaAnunciantes({
  filas,
  total,
  sectores,
  paises,
  conCartera,
}: TablaAnunciantesProps) {
  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor("nombreComercial", {
          id: "nombre",
          header: "Anunciante",
          enableHiding: false,
          meta: {
            titulo: "Anunciante",
            campoOrden: "nombre",
            tarjeta: "titulo",
            claseCelda:
              "max-w-40 lg:max-w-48 min-[1400px]:max-w-56 2xl:max-w-80",
          },
          cell: ({ row }) => <CeldaAnunciante fila={row.original} />,
        }),
        columna.accessor("razonSocial", {
          id: "razon_social",
          header: "Razón social",
          meta: {
            titulo: "Razón social",
            campoOrden: "razon_social",
            ocultaPorDefecto: true,
            exportacion: "siempre",
          },
        }),
        columna.accessor((fila) => fila.identificacion ?? "", {
          id: "identificacion",
          header: "NIT",
          meta: {
            titulo: "NIT",
            ocultarBajo: "xl",
          },
          cell: ({ row }) =>
            row.original.identificacion ? (
              <span className="font-mono text-[0.6875rem] tracking-tight whitespace-nowrap text-muted-foreground">
                {row.original.identificacion}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        }),
        columna.accessor((fila) => fila.sector ?? "", {
          id: "sector",
          header: "Sector",
          meta: {
            titulo: "Sector",
            ocultarBajo: "lg",
            claseCelda: "max-w-28 min-[1400px]:max-w-32 2xl:max-w-48",
          },
          cell: ({ getValue }) => (
            <span className="block truncate text-muted-foreground">
              {getValue() || "—"}
            </span>
          ),
        }),
        columna.accessor((fila) => fila.pais, {
          id: "pais",
          header: "País",
          meta: {
            titulo: "País",
            campoOrden: "pais",
            tipoDato: "texto",
            claseCelda: "max-w-32 min-[1400px]:max-w-36 2xl:max-w-48",
          },
          cell: ({ row }) => <CeldaPais fila={row.original} />,
        }),
        columna.accessor((fila) => ESTADOS_ANUNCIANTE[fila.estado].etiqueta, {
          id: "estado",
          header: "Verificación",
          meta: {
            titulo: "Verificación",
            campoOrden: "estado",
            tipoDato: "otro",
          },
          cell: ({ row }) => (
            <InsigniaEstado
              catalogo={ESTADOS_ANUNCIANTE}
              estado={row.original.estado}
            />
          ),
        }),
        columna.accessor((fila) => fila.campanas, {
          id: "campanas",
          header: "Campañas",
          meta: {
            titulo: "Campañas",
            alinear: "fin",
            formatoExportacion: "numero",
          },
          cell: ({ row }) => <CeldaCampanas fila={row.original} />,
        }),
        columna.accessor((fila) => fila.inversion, {
          id: "inversion",
          header: "Inversión",
          meta: {
            titulo: "Inversión comprometida",
            alinear: "fin",
            formatoExportacion: "numero",
          },
          cell: ({ getValue }) => <CeldaCop valor={getValue()} />,
        }),
        ...(conCartera
          ? [
              columna.accessor((fila) => fila.cartera, {
                id: "cartera",
                header: "Cartera",
                meta: {
                  titulo: "Cartera por cobrar",
                  alinear: "fin",
                  formatoExportacion: "numero",
                },
                cell: ({ row }) => <CeldaCartera fila={row.original} />,
              }),
              columna.accessor((fila) => fila.facturasVencidas, {
                id: "vencidas",
                header: "Facturas vencidas",
                meta: {
                  titulo: "Facturas vencidas",
                  alinear: "fin",
                  ocultaPorDefecto: true,
                  exportacion: "siempre",
                  formatoExportacion: "numero",
                },
              }),
            ]
          : []),
        columna.accessor((fila) => fila.creadoAt, {
          id: "creado",
          header: "Registro",
          meta: {
            titulo: "Registro",
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
    [conCartera]
  )

  const filtros = useMemo<FiltroFacetado<"estado" | "sector" | "pais">[]>(
    () => [
      {
        clave: "estado",
        titulo: "Verificación",
        opciones: ORDEN_ESTADOS.map((estado) => ({
          valor: estado,
          etiqueta: ESTADOS_ANUNCIANTE[estado].etiqueta,
        })),
      },
      {
        clave: "sector",
        titulo: "Sector",
        opciones: sectores.map((sector) => ({
          valor: sector.id,
          etiqueta: sector.nombre,
        })),
      },
      {
        clave: "pais",
        titulo: "País",
        opciones: paises.map((pais) => ({
          valor: pais.iso2,
          etiqueta: `${banderaEmoji(pais.iso2) ?? ""} ${pais.nombre}`.trim(),
        })),
      },
    ],
    [sectores, paises]
  )

  return (
    <TablaDatos
      titulo="Anunciantes"
      columnas={columnas}
      filas={filas}
      total={total}
      idFila={(fila) => fila.id}
      etiquetaFila={(fila) => fila.nombreComercial}
      estadoTabla={estadoTablaAnunciantes}
      filtros={filtros}
      placeholderBusqueda="Buscar por nombre o NIT"
      claveAlmacenamiento="operacion-anunciantes"
      enlaceFila={(fila) => rutaAnunciante(fila.id)}
      exportacion={{
        nombre: "Anunciantes AMO",
        onExportado: (resumen) =>
          void registrarExportacionOperacion({
            entidad: "anunciantes",
            ...resumen,
          }),
      }}
      vacio={{
        icono: Building2,
        titulo: "Aún no hay anunciantes",
        descripcion:
          "Las empresas aparecen aquí al registrarse. Desde su ficha verás sus campañas, su inversión y su cartera.",
      }}
    />
  )
}
