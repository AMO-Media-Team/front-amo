"use client"

import { Handshake } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { crearColumnas } from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import {
  formatearCOP,
  formatearFechaHora,
  formatearRelativo,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { registrarExportacionOperacion } from "../actions"
import {
  ESTADOS_ASIGNACION,
  type EstadoAsignacion,
  ORDEN_PLATAFORMAS,
  PLATAFORMAS,
} from "../estados"
import { estadoTablaAsignaciones } from "../estado-tablas"
import { formatearFechaCompacta } from "../formato"
import { rutaAsignacion, rutaCampana } from "../rutas"
import type { AsignacionFila, OpcionCatalogo } from "../tipos"
import { InsigniaEstado, MarcaPlataforma } from "./distintivos"

const columna = crearColumnas<AsignacionFila>()

/** Orden de las opciones del filtro de estado: el flujo y luego las salidas. */
const ORDEN_ESTADOS: readonly EstadoAsignacion[] = [
  "ACEPTADA",
  "CONTENIDO_ENTREGADO",
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
  "VERIFICADA",
  "LIQUIDADA",
  "PAGADA",
  "EN_DISPUTA",
  "RECHAZADA",
  "VENCIDA_SIN_PUBLICAR",
  "CANCELADA",
]

/** Estados en los que aún corre la fecha límite de publicación. */
const ESPERAN_PUBLICACION: readonly EstadoAsignacion[] = [
  "ACEPTADA",
  "CONTENIDO_ENTREGADO",
]

const HORAS_URGENCIA = 48
const MS_HORA = 3_600_000

type Urgencia = "vencida" | "proxima" | null

function urgenciaDe(fila: AsignacionFila, ahora: number): Urgencia {
  if (!fila.fechaLimite || !ESPERAN_PUBLICACION.includes(fila.estado))
    return null
  const restante = new Date(fila.fechaLimite).getTime() - ahora
  if (restante < 0) return "vencida"
  return restante <= HORAS_URGENCIA * MS_HORA ? "proxima" : null
}

function CeldaAsignacion({ fila }: { fila: AsignacionFila }) {
  return (
    <div
      className="flex min-w-0 flex-col"
      title={[fila.medio, fila.oferta].filter(Boolean).join("\n") || undefined}
    >
      <Link
        href={rutaAsignacion(fila.id)}
        className="truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
      >
        {fila.medio ?? "Medio sin nombre visible"}
      </Link>
      <span className="truncate text-xs text-muted-foreground">
        {fila.oferta ?? "Oferta"}
      </span>
    </div>
  )
}

function CeldaCampana({
  fila,
  conEnlace,
}: {
  fila: AsignacionFila
  conEnlace: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col">
      {conEnlace ? (
        <Link
          href={rutaCampana(fila.campanaId)}
          className="truncate text-foreground underline-offset-4 hover:underline focus-visible:underline"
        >
          {fila.campana ?? "Campaña"}
        </Link>
      ) : (
        <span className="truncate text-foreground">
          {fila.campana ?? "Campaña"}
        </span>
      )}
      <span className="truncate text-xs text-muted-foreground">
        {fila.anunciante ?? "—"}
      </span>
    </div>
  )
}

function CeldaPlataforma({ fila }: { fila: AsignacionFila }) {
  return (
    <span
      className="flex min-w-0 items-center gap-2"
      title={[PLATAFORMAS[fila.plataforma], fila.formato]
        .filter(Boolean)
        .join(" · ")}
    >
      <MarcaPlataforma plataforma={fila.plataforma} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm">
          {fila.formato ?? PLATAFORMAS[fila.plataforma]}
        </span>
        {fila.franja ? (
          <span className="text-[0.6875rem] text-muted-foreground">
            Franja {fila.franja}
          </span>
        ) : null}
      </span>
    </span>
  )
}

function CeldaEstado({ fila }: { fila: AsignacionFila }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <InsigniaEstado catalogo={ESTADOS_ASIGNACION} estado={fila.estado} />
      {fila.estado === "EN_DISPUTA" && fila.estadoPrevioDisputa ? (
        <span className="pl-1 text-[0.6875rem] text-muted-foreground">
          venía de{" "}
          {ESTADOS_ASIGNACION[
            fila.estadoPrevioDisputa
          ].etiqueta.toLocaleLowerCase("es-CO")}
        </span>
      ) : null}
    </span>
  )
}

function CeldaLimite({ fila, ahora }: { fila: AsignacionFila; ahora: number }) {
  if (!fila.fechaLimite) return <span className="text-muted-foreground">—</span>
  const urgencia = urgenciaDe(fila, ahora)
  return (
    <span
      className="flex flex-col leading-tight"
      title={formatearFechaHora(fila.fechaLimite)}
    >
      <time dateTime={fila.fechaLimite} className="cifras whitespace-nowrap">
        {formatearFechaCompacta(fila.fechaLimite)}
      </time>
      {urgencia ? (
        <span
          suppressHydrationWarning
          className={cn(
            "text-[0.6875rem] font-medium whitespace-nowrap",
            urgencia === "vencida" ? "text-destructive" : "text-warning"
          )}
        >
          {/* En tableta la columna va justa: el color y «hace/en» ya lo dicen. */}
          <span className="md:max-lg:hidden">
            {urgencia === "vencida" ? "Venció " : "Vence "}
          </span>
          {formatearRelativo(fila.fechaLimite, new Date(ahora)).replace(
            /^dentro de /,
            "en "
          )}
        </span>
      ) : null}
    </span>
  )
}

interface TablaAsignacionesProps {
  filas: AsignacionFila[]
  total: number
  campanas: readonly OpcionCatalogo[]
  medios: readonly OpcionCatalogo[]
  anunciantes: readonly OpcionCatalogo[]
  /** Instante del servidor: misma urgencia en SSR e hidratación. */
  ahora: number
  /** `campanas.ver`: la campaña de cada fila enlaza a su ficha. */
  conEnlaceCampana?: boolean
}

/** Listado de asignaciones (negocios entre una oferta y un medio). */
export function TablaAsignaciones({
  filas,
  total,
  campanas,
  medios,
  anunciantes,
  ahora,
  conEnlaceCampana = true,
}: TablaAsignacionesProps) {
  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor((fila) => fila.medio ?? "", {
          id: "medio",
          header: "Medio · oferta",
          enableHiding: false,
          meta: {
            titulo: "Medio",
            tarjeta: "titulo",
            claseCelda: "max-w-40 min-[1400px]:max-w-52 2xl:max-w-64",
          },
          cell: ({ row }) => <CeldaAsignacion fila={row.original} />,
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
        columna.accessor((fila) => fila.campana ?? "", {
          id: "campana",
          header: "Campaña",
          meta: {
            titulo: "Campaña",
            ocultarBajo: "lg",
            claseCelda: "max-w-28 min-[1400px]:max-w-36 2xl:max-w-48",
          },
          cell: ({ row }) => (
            <CeldaCampana fila={row.original} conEnlace={conEnlaceCampana} />
          ),
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
        columna.accessor((fila) => PLATAFORMAS[fila.plataforma], {
          id: "plataforma",
          header: "Formato",
          meta: {
            titulo: "Plataforma y formato",
            claseCelda:
              "max-w-28 lg:max-w-32 min-[1400px]:max-w-36 2xl:max-w-40",
          },
          cell: ({ row }) => <CeldaPlataforma fila={row.original} />,
        }),
        columna.accessor((fila) => ESTADOS_ASIGNACION[fila.estado].etiqueta, {
          id: "estado",
          header: "Estado",
          meta: { titulo: "Estado", campoOrden: "estado", tipoDato: "otro" },
          cell: ({ row }) => <CeldaEstado fila={row.original} />,
        }),
        columna.accessor((fila) => fila.montoBruto, {
          id: "monto",
          header: "Monto bruto",
          meta: {
            titulo: "Monto bruto",
            campoOrden: "monto",
            tipoDato: "otro",
            alinear: "fin",
            formatoExportacion: "numero",
          },
          // Monto exacto: en una columna de dinero se comparan magnitudes de un vistazo.
          cell: ({ getValue }) => (
            <span
              className={cn(
                "font-medium cifras whitespace-nowrap",
                getValue() === null && "font-normal text-muted-foreground"
              )}
            >
              {formatearCOP(getValue())}
            </span>
          ),
        }),
        columna.accessor((fila) => fila.creadaAt, {
          id: "creado",
          header: "Creada",
          meta: {
            titulo: "Creada",
            campoOrden: "creado",
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
        columna.accessor((fila) => fila.fechaLimite ?? "", {
          id: "limite",
          header: "Límite",
          meta: {
            titulo: "Límite para publicar",
            campoOrden: "limite",
            tipoDato: "fecha",
            formatoExportacion: "fechaHora",
          },
          cell: ({ row }) => <CeldaLimite fila={row.original} ahora={ahora} />,
        }),
      ]),
    [ahora, conEnlaceCampana]
  )

  const filtros = useMemo<
    FiltroFacetado<
      "estado" | "plataforma" | "campana" | "medio" | "anunciante" | "alerta"
    >[]
  >(
    () => [
      {
        clave: "estado",
        titulo: "Estado",
        opciones: ORDEN_ESTADOS.map((estado) => ({
          valor: estado,
          etiqueta: ESTADOS_ASIGNACION[estado].etiqueta,
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
        clave: "campana",
        titulo: "Campaña",
        opciones: campanas.map((campana) => ({
          valor: campana.id,
          etiqueta: campana.nombre,
        })),
      },
      {
        clave: "medio",
        titulo: "Medio",
        opciones: medios.map((medio) => ({
          valor: medio.id,
          etiqueta: medio.nombre,
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
        clave: "alerta",
        titulo: "Alertas",
        opciones: [
          { valor: "metricas", etiqueta: "Métricas con alerta por validar" },
        ],
      },
    ],
    [campanas, medios, anunciantes]
  )

  return (
    <TablaDatos
      titulo="Asignaciones"
      columnas={columnas}
      filas={filas}
      total={total}
      idFila={(fila) => fila.id}
      etiquetaFila={(fila) =>
        `${fila.medio ?? "Medio"} · ${fila.oferta ?? "oferta"}`
      }
      estadoTabla={estadoTablaAsignaciones}
      filtros={filtros}
      placeholderBusqueda="Buscar medio, campaña o marca"
      claveAlmacenamiento="operacion-asignaciones"
      enlaceFila={(fila) => rutaAsignacion(fila.id)}
      exportacion={{
        nombre: "Asignaciones AMO",
        onExportado: (resumen) =>
          void registrarExportacionOperacion({
            entidad: "asignaciones",
            ...resumen,
          }),
      }}
      vacio={{
        icono: Handshake,
        titulo: "Aún no hay asignaciones",
        descripcion:
          "Cuando un medio acepte un cupo de una oferta publicada, el negocio aparecerá aquí con su estado, su evidencia y sus métricas.",
      }}
    />
  )
}
