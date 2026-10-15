"use client"

import { RadioTower, Star } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { crearColumnas } from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import { DEPARTAMENTOS } from "@/lib/geo/diccionarios/departamentos"
import {
  formatearCOP,
  formatearCOPCompacto,
  formatearFecha,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { registrarExportacionOperacion } from "../actions"
import {
  ESTADOS_MEDIO,
  etiquetaNivel,
  ORDEN_PLATAFORMAS,
  PLATAFORMAS,
  TIPOS_MEDIO,
} from "../estados"
import { estadoTablaMedios, NIVELES_VERIFICACION } from "../estado-tablas"
import {
  contar,
  formatearCalificacion,
  formatearHandle,
  unirUbicacion,
} from "../formato"
import { rutaMedio } from "../rutas"
import type { MedioFila, OpcionCatalogo } from "../tipos"
import { ChipCuenta, InsigniaEstado, InsigniaNivel } from "./distintivos"

const columna = crearColumnas<MedioFila>()

/** Cuentas visibles en la celda antes de resumir ("+2"). */
const CUENTAS_VISIBLES = 3

function ubicacion(fila: MedioFila): string {
  return unirUbicacion(fila.municipio, fila.departamento) ?? "—"
}

/** Texto de las cuentas para CSV/Excel: "Instagram @x 58.200 (F3)". */
function cuentasTexto(fila: MedioFila): string {
  return fila.cuentas
    .map(
      (cuenta) =>
        `${PLATAFORMAS[cuenta.plataforma]} ${formatearHandle(cuenta.handle)} ${formatearNumero(cuenta.seguidores)}${
          cuenta.franja ? ` (${cuenta.franja})` : ""
        }`
    )
    .join("; ")
}

function CeldaMedio({ fila }: { fila: MedioFila }) {
  // La ubicación va primero: si la celda recorta, se pierde el tipo y no el municipio.
  const detalle = [
    unirUbicacion(fila.municipio, fila.departamento),
    TIPOS_MEDIO[fila.tipo],
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <div className="flex min-w-0 flex-col" title={`${fila.nombre}\n${detalle}`}>
      <Link
        href={rutaMedio(fila.id)}
        className="truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
      >
        {fila.nombre}
      </Link>
      <span className="truncate text-xs text-muted-foreground">{detalle}</span>
    </div>
  )
}

function CeldaCuentas({ fila }: { fila: MedioFila }) {
  if (fila.cuentas.length === 0) {
    return <span className="text-xs text-muted-foreground">Sin cuentas</span>
  }
  const visibles = fila.cuentas.slice(0, CUENTAS_VISIBLES)
  const resto = fila.cuentas.length - visibles.length
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visibles.map((cuenta) => (
        <ChipCuenta key={cuenta.id} cuenta={cuenta} />
      ))}
      {resto > 0 ? (
        <span className="text-xs text-muted-foreground">+{resto}</span>
      ) : null}
    </div>
  )
}

function CeldaCumplimiento({ fila }: { fila: MedioFila }) {
  if (fila.tasaCumplimiento === null) {
    return <span className="text-xs text-muted-foreground">Sin historial</span>
  }
  const bajo = fila.tasaCumplimiento < 0.8
  return (
    <span
      className="flex flex-col leading-tight md:items-end"
      title={`${contar(fila.nCumplimiento, "asignación", "asignaciones")} con desenlace`}
    >
      <span className={cn("font-medium cifras", bajo && "text-warning")}>
        {formatearPorcentaje(fila.tasaCumplimiento, 0)}
      </span>
      <span className="text-[0.6875rem] cifras text-muted-foreground">
        n = {formatearNumero(fila.nCumplimiento)}
      </span>
    </span>
  )
}

interface TablaMediosProps {
  filas: MedioFila[]
  total: number
  categorias: readonly OpcionCatalogo[]
  /** El GMV solo llega a quien ve asignaciones. */
  conGmv: boolean
  /** La señal "en riesgo" solo existe para quien ve el panel administrativo. */
  conSegmentoRiesgo: boolean
}

/** Listado de medios sobre `TablaDatos`: identidad, verificación, cuentas y desempeño. */
export function TablaMedios({
  filas,
  total,
  categorias,
  conGmv,
  conSegmentoRiesgo,
}: TablaMediosProps) {
  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor("nombre", {
          header: "Medio",
          enableHiding: false,
          meta: {
            titulo: "Medio",
            campoOrden: "nombre",
            tarjeta: "titulo",
            claseCelda:
              "max-w-44 lg:max-w-48 min-[1400px]:max-w-56 2xl:max-w-72",
          },
          cell: ({ row }) => <CeldaMedio fila={row.original} />,
        }),
        columna.accessor((fila) => TIPOS_MEDIO[fila.tipo], {
          id: "tipo",
          header: "Tipo",
          meta: {
            titulo: "Tipo",
            ocultaPorDefecto: true,
            exportacion: "siempre",
          },
        }),
        columna.accessor((fila) => ubicacion(fila), {
          id: "ubicacion",
          header: "Ubicación",
          // Ya va bajo el nombre del medio: la columna queda para exportar u ordenar la vista.
          meta: {
            titulo: "Ubicación",
            ocultaPorDefecto: true,
            exportacion: "siempre",
            claseCelda: "max-w-48",
          },
          cell: ({ getValue }) => (
            <span className="block truncate text-muted-foreground">
              {getValue()}
            </span>
          ),
        }),
        columna.accessor((fila) => ESTADOS_MEDIO[fila.estado].etiqueta, {
          id: "estado",
          header: "Estado",
          meta: { titulo: "Estado", campoOrden: "estado", tipoDato: "otro" },
          cell: ({ row }) => (
            <InsigniaEstado
              catalogo={ESTADOS_MEDIO}
              estado={row.original.estado}
            />
          ),
        }),
        columna.accessor((fila) => fila.nivel, {
          id: "nivel",
          header: "Nivel",
          meta: { titulo: "Nivel", campoOrden: "nivel", tipoDato: "otro" },
          cell: ({ row }) => (
            <InsigniaNivel nivel={row.original.nivel} compacta />
          ),
        }),
        columna.accessor((fila) => cuentasTexto(fila), {
          id: "cuentas",
          header: "Cuentas sociales",
          meta: {
            titulo: "Cuentas sociales",
            claseCelda: "min-w-44 2xl:min-w-64",
          },
          cell: ({ row }) => <CeldaCuentas fila={row.original} />,
        }),
        columna.accessor((fila) => fila.tasaCumplimiento, {
          id: "cumplimiento",
          header: "Cumplimiento",
          meta: {
            titulo: "Cumplimiento",
            campoOrden: "cumplimiento",
            tipoDato: "otro",
            alinear: "fin",
            ocultarBajo: "lg",
            formatoExportacion: "numero",
          },
          cell: ({ row }) => <CeldaCumplimiento fila={row.original} />,
        }),
        columna.accessor((fila) => fila.calificacion, {
          id: "calificacion",
          header: "Calificación",
          meta: {
            titulo: "Calificación",
            campoOrden: "calificacion",
            tipoDato: "otro",
            alinear: "fin",
            ocultarBajo: "xl",
            formatoExportacion: "numero",
          },
          cell: ({ getValue }) =>
            getValue() === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="inline-flex items-center gap-1 cifras">
                <Star
                  aria-hidden
                  className="size-3.5 fill-warning text-warning"
                />
                {formatearCalificacion(getValue())}
              </span>
            ),
        }),
        ...(conGmv
          ? [
              columna.accessor((fila) => fila.gmvVerificado, {
                id: "gmv",
                header: "GMV verificado",
                meta: {
                  titulo: "GMV verificado",
                  alinear: "fin",
                  formatoExportacion: "numero",
                },
                cell: ({ getValue }) => (
                  <span
                    className={cn(
                      "font-medium cifras",
                      !getValue() && "text-muted-foreground"
                    )}
                    title={formatearCOP(getValue())}
                  >
                    {formatearCOPCompacto(getValue())}
                  </span>
                ),
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
    [conGmv]
  )

  const filtros = useMemo<
    FiltroFacetado<
      | "estado"
      | "nivel"
      | "departamento"
      | "plataforma"
      | "categoria"
      | "tipo"
      | "segmento"
    >[]
  >(
    () => [
      {
        clave: "estado",
        titulo: "Estado",
        opciones: (
          ["VERIFICADO", "PENDIENTE", "SUSPENDIDO", "RECHAZADO"] as const
        ).map((estado) => ({
          valor: estado,
          etiqueta: ESTADOS_MEDIO[estado].etiqueta,
        })),
      },
      {
        clave: "nivel",
        titulo: "Nivel",
        opciones: NIVELES_VERIFICACION.map((nivel) => ({
          valor: nivel,
          etiqueta: etiquetaNivel(Number(nivel)),
        })),
      },
      {
        clave: "departamento",
        titulo: "Departamento",
        opciones: [...DEPARTAMENTOS]
          .sort((a, b) => a.nombreCorto.localeCompare(b.nombreCorto, "es"))
          .map((departamento) => ({
            valor: departamento.codigo,
            etiqueta: departamento.nombreCorto,
          })),
      },
      {
        clave: "plataforma",
        titulo: "Plataforma",
        opciones: ORDEN_PLATAFORMAS.map((plataforma) => ({
          valor: plataforma,
          etiqueta: PLATAFORMAS[plataforma],
        })),
      },
      {
        clave: "categoria",
        titulo: "Categoría",
        opciones: categorias.map((categoria) => ({
          valor: categoria.id,
          etiqueta: categoria.nombre,
        })),
      },
      {
        clave: "tipo",
        titulo: "Tipo",
        opciones: (
          Object.keys(TIPOS_MEDIO) as (keyof typeof TIPOS_MEDIO)[]
        ).map((tipo) => ({ valor: tipo, etiqueta: TIPOS_MEDIO[tipo] })),
      },
      ...(conSegmentoRiesgo
        ? [
            {
              clave: "segmento" as const,
              titulo: "Señales",
              opciones: [
                { valor: "en_riesgo", etiqueta: "En riesgo de abandono" },
              ],
            },
          ]
        : []),
    ],
    [categorias, conSegmentoRiesgo]
  )

  return (
    <TablaDatos
      titulo="Medios de la red"
      columnas={columnas}
      filas={filas}
      total={total}
      idFila={(fila) => fila.id}
      etiquetaFila={(fila) => fila.nombre}
      estadoTabla={estadoTablaMedios}
      filtros={filtros}
      placeholderBusqueda="Buscar medio por nombre"
      claveAlmacenamiento="operacion-medios"
      enlaceFila={(fila) => rutaMedio(fila.id)}
      exportacion={{
        nombre: "Medios AMO",
        onExportado: (resumen) =>
          void registrarExportacionOperacion({ entidad: "medios", ...resumen }),
      }}
      vacio={{
        icono: RadioTower,
        titulo: "Aún no hay medios en la red",
        descripcion:
          "Los medios aparecen aquí al registrarse. Desde su ficha verás sus cuentas, su verificación y su desempeño.",
      }}
    />
  )
}
