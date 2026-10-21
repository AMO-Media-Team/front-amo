"use client"

import { Megaphone } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { crearColumnas } from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import {
  formatearCOP,
  formatearCOPCompacto,
  formatearFecha,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { registrarExportacionOperacion } from "../actions"
import { proporcion } from "../calculos"
import {
  ESTADOS_CAMPANA,
  type EstadoCampana,
  ORDEN_PLATAFORMAS,
  PLATAFORMAS,
} from "../estados"
import { estadoTablaCampanas } from "../estado-tablas"
import {
  diasDeVigencia,
  faseVigencia,
  formatearRangoCompacto,
  instanteDeDia,
} from "../formato"
import { rutaAnunciante, rutaCampana } from "../rutas"
import type { CampanaFila, OpcionCatalogo } from "../tipos"
import { BarraLlenado, InsigniaEstado, MarcaPlataforma } from "./distintivos"

const columna = crearColumnas<CampanaFila>()

const ORDEN_ESTADOS: readonly EstadoCampana[] = [
  "ACTIVA",
  "BORRADOR",
  "FINALIZADA",
  "CANCELADA",
]

function CeldaCampana({ fila }: { fila: CampanaFila }) {
  return (
    <div className="flex min-w-0 flex-col">
      <Link
        href={rutaCampana(fila.id)}
        className="truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
      >
        {fila.nombre}
      </Link>
      <span className="truncate text-xs text-muted-foreground">
        {fila.marca}
        <span className="xl:hidden">
          {fila.anunciante ? ` · ${fila.anunciante}` : ""}
        </span>
      </span>
    </div>
  )
}

function textoFase(fila: CampanaFila, hoy: string): string {
  const dias = diasDeVigencia(fila.fechaInicio, fila.fechaFin)
  const duracion = `${formatearNumero(dias)} ${dias === 1 ? "día" : "días"}`
  if (fila.estado !== "ACTIVA") return duracion
  switch (faseVigencia(fila.fechaInicio, fila.fechaFin, hoy)) {
    case "por_iniciar":
      return `${duracion} · aún no inicia`
    case "en_curso":
      return `${duracion} · en curso`
    case "terminada":
      return `${duracion} · vigencia vencida`
  }
}

function CeldaVigencia({ fila, hoy }: { fila: CampanaFila; hoy: string }) {
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
        {textoFase(fila, hoy)}
      </span>
    </span>
  )
}

function CeldaCupos({ fila }: { fila: CampanaFila }) {
  if (fila.cuposTotales === 0) {
    return <span className="text-xs text-muted-foreground">Sin cupos</span>
  }
  const llenado = proporcion(fila.cuposOcupados, fila.cuposTotales)
  return (
    <span
      className="flex w-20 flex-col gap-1 min-[1400px]:w-24"
      title={`${formatearPorcentaje(llenado, 0)} de los cupos tomados`}
    >
      <span className="text-xs cifras">
        <span className="font-medium">
          {formatearNumero(fila.cuposOcupados)}
        </span>
        <span className="text-muted-foreground">
          {" "}
          / {formatearNumero(fila.cuposTotales)}
        </span>
      </span>
      <BarraLlenado
        fraccion={llenado}
        tono={llenado === 1 ? "exito" : "primario"}
      />
    </span>
  )
}

function CeldaPresupuesto({ fila }: { fila: CampanaFila }) {
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

interface TablaCampanasProps {
  filas: CampanaFila[]
  total: number
  anunciantes: readonly OpcionCatalogo[]
  /** Hoy en Bogotá (`YYYY-MM-DD`), del servidor: misma fase en SSR e hidratación. */
  hoy: string
}

/** Listado de campañas: vigencia, ofertas por plataforma, cupos y presupuesto. */
export function TablaCampanas({
  filas,
  total,
  anunciantes,
  hoy,
}: TablaCampanasProps) {
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
              "max-w-40 lg:max-w-48 min-[1400px]:max-w-56 2xl:max-w-80",
          },
          cell: ({ row }) => <CeldaCampana fila={row.original} />,
        }),
        columna.accessor("marca", {
          header: "Marca",
          meta: {
            titulo: "Marca",
            ocultaPorDefecto: true,
            exportacion: "siempre",
          },
        }),
        columna.accessor((fila) => fila.anunciante ?? "", {
          id: "anunciante",
          header: "Anunciante",
          meta: {
            titulo: "Anunciante",
            ocultarBajo: "xl",
            claseCelda: "max-w-32 min-[1400px]:max-w-36 2xl:max-w-56",
          },
          cell: ({ row }) =>
            row.original.anunciante ? (
              <Link
                href={rutaAnunciante(row.original.anuncianteId)}
                className="block truncate text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {row.original.anunciante}
              </Link>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        }),
        columna.accessor((fila) => ESTADOS_CAMPANA[fila.estado].etiqueta, {
          id: "estado",
          header: "Estado",
          meta: { titulo: "Estado", campoOrden: "estado", tipoDato: "otro" },
          cell: ({ row }) => (
            <InsigniaEstado
              catalogo={ESTADOS_CAMPANA}
              estado={row.original.estado}
            />
          ),
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
        columna.accessor(
          (fila) => fila.plataformas.map((p) => PLATAFORMAS[p]).join(", "),
          {
            id: "plataformas",
            header: "Plataformas",
            meta: { titulo: "Plataformas", ocultarBajo: "lg" },
            cell: ({ row }) =>
              row.original.plataformas.length > 0 ? (
                <span className="flex items-center gap-1">
                  {row.original.plataformas.map((plataforma) => (
                    <MarcaPlataforma key={plataforma} plataforma={plataforma} />
                  ))}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Sin ofertas
                </span>
              ),
          }
        ),
        columna.accessor((fila) => fila.cuposOcupados, {
          id: "cupos",
          header: "Cupos",
          meta: { titulo: "Cupos ocupados", formatoExportacion: "numero" },
          cell: ({ row }) => <CeldaCupos fila={row.original} />,
        }),
        columna.accessor((fila) => fila.presupuestoComprometido, {
          id: "comprometido",
          header: "Presupuesto",
          meta: {
            titulo: "Presupuesto comprometido",
            campoOrden: "comprometido",
            tipoDato: "otro",
            alinear: "fin",
            formatoExportacion: "numero",
          },
          cell: ({ row }) => <CeldaPresupuesto fila={row.original} />,
        }),
        columna.accessor((fila) => fila.presupuestoTotal, {
          id: "presupuesto",
          header: "Presupuesto total",
          meta: {
            titulo: "Presupuesto total",
            campoOrden: "presupuesto",
            tipoDato: "otro",
            alinear: "fin",
            ocultaPorDefecto: true,
            formatoExportacion: "numero",
          },
          cell: ({ getValue }) => (
            <span className="cifras">{formatearCOP(getValue())}</span>
          ),
        }),
        columna.accessor((fila) => fila.ofertas, {
          id: "ofertas",
          header: "Ofertas",
          meta: {
            titulo: "Ofertas",
            alinear: "fin",
            ocultaPorDefecto: true,
            formatoExportacion: "numero",
          },
          cell: ({ getValue }) => (
            <span className="cifras">{formatearNumero(getValue())}</span>
          ),
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

  const filtros = useMemo<
    FiltroFacetado<"estado" | "anunciante" | "plataforma">[]
  >(
    () => [
      {
        clave: "estado",
        titulo: "Estado",
        opciones: ORDEN_ESTADOS.map((estado) => ({
          valor: estado,
          etiqueta: ESTADOS_CAMPANA[estado].etiqueta,
        })),
      },
      {
        clave: "anunciante",
        titulo: "Anunciante",
        opciones: anunciantes.map((anunciante) => ({
          valor: anunciante.id,
          etiqueta: anunciante.nombre,
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
    ],
    [anunciantes]
  )

  return (
    <TablaDatos
      titulo="Campañas"
      columnas={columnas}
      filas={filas}
      total={total}
      idFila={(fila) => fila.id}
      etiquetaFila={(fila) => fila.nombre}
      estadoTabla={estadoTablaCampanas}
      filtros={filtros}
      placeholderBusqueda="Buscar por campaña o marca"
      claveAlmacenamiento="operacion-campanas"
      enlaceFila={(fila) => rutaCampana(fila.id)}
      exportacion={{
        nombre: "Campañas AMO",
        onExportado: (resumen) =>
          void registrarExportacionOperacion({
            entidad: "campanas",
            ...resumen,
          }),
      }}
      vacio={{
        icono: Megaphone,
        titulo: "Aún no hay campañas",
        descripcion:
          "Las campañas que creen los anunciantes aparecerán aquí con sus ofertas, sus cupos y su presupuesto comprometido.",
      }}
    />
  )
}
