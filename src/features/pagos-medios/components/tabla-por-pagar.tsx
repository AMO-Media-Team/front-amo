"use client"

import { Banknote } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import {
  crearColumnas,
  ID_COLUMNA_ACCIONES,
} from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import {
  rutaLiquidacion,
  rutaVistaLiquidaciones,
} from "@/features/liquidaciones/rutas"
import { METODOS_PAGO } from "@/features/operacion/estados"
import {
  formatearFechaCompacta,
  formatearRangoCompacto,
  instanteDeDia,
} from "@/features/operacion/formato"
import { formatearCOP, formatearFechaHora } from "@/lib/format"
import { serializarFecha } from "@/lib/fechas"
import { Constants } from "@/types/database.types"

import {
  ESTADOS_PREPARACION,
  pedidoDeSeleccion,
  PREPARACION,
} from "../preparacion"
import { rutaDispersion } from "../rutas"
import { plural } from "../textos"
import type {
  LiquidacionPorPagar,
  PedidoArchivo,
  ResumenPorPagar as Resumen,
} from "../tipos"
import { estadoTablaPorPagar } from "../vistas"
import { BotonArchivoPagos } from "./boton-archivo-pagos"
import { DialogoArchivoPagos } from "./dialogo-archivo-pagos"
import { Requisito } from "./piezas"
import { RegistrarPagoLiquidacion } from "./registrar-pago-liquidacion"
import { ResumenPorPagar } from "./resumen-por-pagar"

const columna = crearColumnas<LiquidacionPorPagar>()

function periodo(fila: LiquidacionPorPagar): string {
  return formatearRangoCompacto(
    instanteDeDia(fila.periodoInicio),
    instanteDeDia(fila.periodoFin)
  )
}

function textoRequisitos(fila: LiquidacionPorPagar): string {
  return [
    fila.documentoListo
      ? "Documento listo"
      : PREPARACION.sin_documento.etiqueta,
    fila.datosPagoListos
      ? "Datos de pago listos"
      : PREPARACION.sin_datos_pago.etiqueta,
  ].join(" · ")
}

function CeldaMedio({ fila }: { fila: LiquidacionPorPagar }) {
  return (
    <span className="flex min-w-0 flex-col">
      <Link
        href={rutaLiquidacion(fila.id)}
        className="truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
        title={fila.medio}
      >
        {fila.medio}
      </Link>
      <span className="truncate text-xs text-muted-foreground">
        {plural(fila.cantidadAsignaciones, "publicación", "publicaciones")}
        <span className="xl:hidden"> · {periodo(fila)}</span>
      </span>
    </span>
  )
}

function CeldaRequisitos({ fila }: { fila: LiquidacionPorPagar }) {
  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      <Requisito
        cumplido={fila.documentoListo}
        detalle={
          fila.requiereDocumentoSoporte
            ? "Documento soporte"
            : "Factura del medio"
        }
      >
        {fila.documentoListo
          ? "Documento listo"
          : PREPARACION.sin_documento.etiqueta}
      </Requisito>
      <Requisito
        cumplido={fila.datosPagoListos}
        detalle={
          fila.metodoPago ? METODOS_PAGO[fila.metodoPago] : "Sin método de pago"
        }
      >
        {fila.datosPagoListos
          ? "Datos de pago listos"
          : PREPARACION.sin_datos_pago.etiqueta}
      </Requisito>
    </span>
  )
}

function CeldaArchivo({ fila }: { fila: LiquidacionPorPagar }) {
  if (!fila.dispersionId) {
    return <span className="text-muted-foreground">Sin archivo</span>
  }
  return (
    <Link
      href={rutaDispersion(fila.dispersionId)}
      title={
        fila.dispersadaAt ? formatearFechaHora(fila.dispersadaAt) : undefined
      }
      className="whitespace-nowrap text-foreground underline-offset-4 hover:underline focus-visible:underline"
    >
      Archivo del {formatearFechaCompacta(fila.dispersadaAt)}
    </Link>
  )
}

interface PedidoAbierto {
  pedido: PedidoArchivo
  /** Quita la selección de la tabla al terminar (si salió de ella). */
  limpiar?: () => void
}

export interface TablaPorPagarProps {
  filas: LiquidacionPorPagar[]
  total: number
  resumen: Resumen
  puedeVerDatosSensibles: boolean
}

/**
 * «Por pagar» (LIQ-005, LIQ-006): las liquidaciones aprobadas con lo que
 * falta para pagarlas y si ya están en un archivo. Seleccionar filas (o usar
 * «Generar archivo con las N listas») abre el archivo de pagos; cada fila
 * registra su pago con su soporte.
 */
export function TablaPorPagar({
  filas,
  total,
  resumen,
  puedeVerDatosSensibles,
}: TablaPorPagarProps) {
  const [abierto, setAbierto] = useState<PedidoAbierto | null>(null)

  const columnas = useMemo(
    () =>
      columna.columns([
        columna.accessor((fila) => fila.medio, {
          id: "medio",
          header: "Medio",
          enableHiding: false,
          meta: {
            titulo: "Medio",
            campoOrden: "medio",
            tarjeta: "titulo",
            claseCelda: "max-w-56 2xl:max-w-72",
          },
          cell: ({ row }) => <CeldaMedio fila={row.original} />,
        }),
        columna.accessor((fila) => periodo(fila), {
          id: "periodo",
          header: "Periodo",
          meta: {
            titulo: "Periodo",
            campoOrden: "periodo",
            tipoDato: "fecha",
            ocultarBajo: "xl",
          },
          cell: ({ getValue }) => (
            <span className="cifras whitespace-nowrap">{getValue()}</span>
          ),
        }),
        columna.accessor((fila) => fila.montoNeto, {
          id: "neto",
          header: "Neto a pagar",
          meta: {
            titulo: "Neto a pagar",
            campoOrden: "neto",
            tipoDato: "otro",
            alinear: "fin",
            formatoExportacion: "numero",
          },
          cell: ({ getValue }) => (
            <span className="font-medium cifras whitespace-nowrap">
              {formatearCOP(getValue())}
            </span>
          ),
        }),
        columna.accessor((fila) => textoRequisitos(fila), {
          id: "requisitos",
          header: "Para pagar",
          meta: { titulo: "Para pagar", claseCelda: "min-w-44 max-w-64" },
          cell: ({ row }) => <CeldaRequisitos fila={row.original} />,
        }),
        columna.accessor((fila) => fila.dispersadaAt ?? "", {
          id: "archivo",
          header: "Archivo de pagos",
          meta: { titulo: "Archivo de pagos", ocultarBajo: "lg" },
          cell: ({ row }) => <CeldaArchivo fila={row.original} />,
        }),
        columna.accessor((fila) => fila.aprobadaAt ?? "", {
          id: "aprobada",
          header: "Aprobada",
          meta: {
            titulo: "Aprobada",
            campoOrden: "aprobada",
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
        columna.display({
          id: ID_COLUMNA_ACCIONES,
          header: () => <span className="sr-only">Pago</span>,
          meta: { titulo: "Pago", exportacion: "nunca", alinear: "fin" },
          cell: ({ row }) => (
            <RegistrarPagoLiquidacion
              variante="fila"
              liquidacionId={row.original.id}
              medio={row.original.medio}
              montoNeto={row.original.montoNeto}
              fechaMinima={fechaMinimaDeFila(row.original)}
              documentoListo={row.original.documentoListo}
            />
          ),
        }),
      ]),
    []
  )

  const filtros = useMemo<FiltroFacetado<"preparacion" | "metodo">[]>(
    () => [
      {
        clave: "preparacion",
        titulo: "Situación",
        opciones: ESTADOS_PREPARACION.map((estado) => ({
          valor: estado,
          etiqueta: PREPARACION[estado].etiqueta,
        })),
      },
      {
        clave: "metodo",
        titulo: "Método de pago",
        opciones: Constants.public.Enums.metodo_pago.map((metodo) => ({
          valor: metodo,
          etiqueta: METODOS_PAGO[metodo],
        })),
      },
    ],
    []
  )

  return (
    <>
      <ResumenPorPagar
        resumen={resumen}
        puedeVerDatosSensibles={puedeVerDatosSensibles}
        onGenerarListas={() => setAbierto({ pedido: resumen.archivoListas })}
      />
      <TablaDatos
        titulo="Liquidaciones por pagar"
        columnas={columnas}
        filas={filas}
        total={total}
        idFila={(fila) => fila.id}
        etiquetaFila={(fila) => `${fila.medio}, ${periodo(fila)}`}
        estadoTabla={estadoTablaPorPagar}
        filtros={filtros}
        placeholderBusqueda="Buscar medio"
        claveAlmacenamiento="finanzas-por-pagar"
        accionesMasivas={({ filas: elegidas, limpiar }) => (
          <BotonArchivoPagos
            puedeVerDatosSensibles={puedeVerDatosSensibles}
            onClick={() =>
              setAbierto({ pedido: pedidoDeSeleccion(elegidas), limpiar })
            }
          />
        )}
        vacio={{
          icono: Banknote,
          titulo: "No hay liquidaciones por pagar",
          descripcion:
            "Cuando se apruebe una liquidación, aparecerá aquí para incluirla en el archivo del banco y registrar su pago.",
          accion: (
            <EnlaceBoton
              href={rutaVistaLiquidaciones("borrador")}
              variant="outline"
            >
              Ver liquidaciones por aprobar
            </EnlaceBoton>
          ),
        }}
      />
      <DialogoArchivoPagos
        pedido={abierto?.pedido ?? null}
        onCerrar={(generado) => {
          if (generado) abierto?.limpiar?.()
          setAbierto(null)
        }}
      />
    </>
  )
}

/** El pago va entre el día en que se generó la liquidación y hoy (como lo exige la BD). */
function fechaMinimaDeFila(fila: LiquidacionPorPagar): string {
  return serializarFecha(new Date(fila.creadaAt))
}
