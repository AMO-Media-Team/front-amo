"use client"

import { BadgeCheck, FilePen } from "lucide-react"
import { useMemo, useState } from "react"

import { BarraSeleccion } from "@/components/data-table/barra-seleccion"
import {
  crearColumnas,
  ID_COLUMNA_SELECCION,
} from "@/components/data-table/columnas"
import type { FiltroFacetado } from "@/components/data-table/filtro-facetado"
import { TablaDatos } from "@/components/data-table/tabla-datos"
import { Button } from "@/components/ui/button"

import { ETIQUETAS_ALERTA, ETIQUETAS_SOPORTE } from "../presentacion"
import { rutaLiquidacion } from "../rutas"
import type { FilaLiquidacion, PoliticaSegSocial } from "../tipos"
import { estadoTablaLiquidaciones, SOPORTES_PAGO, VISTAS } from "../vistas"
import { DialogoAprobar } from "./dialogo-aprobar"
import {
  CeldaLiquidacion,
  FechaConDistancia,
  InsigniaAlerta,
  Pesos,
} from "./piezas"
import {
  CasillaBorrador,
  CasillaTodas,
  ProveedorSeleccion,
} from "./seleccion-borradores"

const columna = crearColumnas<FilaLiquidacion>()

const FILTROS: readonly FiltroFacetado<"soporte">[] = [
  {
    clave: "soporte",
    titulo: "Documento del pago",
    opciones: SOPORTES_PAGO.map((valor) => ({
      valor,
      etiqueta: ETIQUETAS_SOPORTE[valor],
    })),
  },
]

export interface TablaBorradoresProps {
  filas: FilaLiquidacion[]
  total: number
  ahora: number
  /** `liquidaciones.aprobar`: selección y «Aprobar». */
  puedeAprobar: boolean
  superadmin: boolean
  politica: PoliticaSegSocial
}

/**
 * «Por aprobar» (LIQ-003): las liquidaciones en borrador. Con permiso de
 * aprobar se eligen varias y se aprueban de una vez; las que generó quien
 * mira salen sin casilla activa y dicen por qué (D17).
 */
export function TablaBorradores({
  filas,
  total,
  ahora,
  puedeAprobar,
  superadmin,
  politica,
}: TablaBorradoresProps) {
  const [aprobando, setAprobando] = useState(false)

  const columnas = useMemo(
    () =>
      columna.columns([
        ...(puedeAprobar
          ? [
              columna.display({
                id: ID_COLUMNA_SELECCION,
                enableHiding: false,
                header: () => <CasillaTodas />,
                meta: {
                  titulo: "Selección",
                  tarjeta: "oculta",
                  exportacion: "nunca",
                },
                cell: ({ row }) => <CasillaBorrador fila={row.original} />,
              }),
            ]
          : []),
        columna.accessor((fila) => fila.medio ?? "", {
          id: "liquidacion",
          header: "Medio · periodo",
          enableHiding: false,
          meta: {
            titulo: "Medio",
            campoOrden: "periodo",
            tipoDato: "fecha",
            tarjeta: "titulo",
            claseCelda: "max-w-56 xl:max-w-72",
          },
          cell: ({ row }) => <CeldaLiquidacion {...row.original} />,
        }),
        columna.accessor("asignaciones", {
          header: "Asignaciones",
          meta: { titulo: "Asignaciones", alinear: "fin", ocultarBajo: "xl" },
          cell: ({ getValue }) => <span className="cifras">{getValue()}</span>,
        }),
        columna.accessor("montoMedio", {
          header: "Valor del medio",
          meta: { titulo: "Valor del medio", alinear: "fin" },
          cell: ({ getValue }) => <Pesos valor={getValue()} />,
        }),
        columna.accessor("montoRetenciones", {
          header: "Retenciones",
          meta: { titulo: "Retenciones", alinear: "fin", ocultarBajo: "lg" },
          cell: ({ getValue }) => <Pesos valor={getValue()} />,
        }),
        columna.accessor("montoNeto", {
          id: "neto",
          header: "Neto a pagar",
          meta: {
            titulo: "Neto a pagar",
            campoOrden: "neto",
            tipoDato: "otro",
            alinear: "fin",
          },
          cell: ({ getValue }) => (
            <Pesos valor={getValue()} className="font-medium" />
          ),
        }),
        columna.accessor(
          (fila) => (fila.alertaSegSocial ? ETIQUETAS_ALERTA.SEG_SOCIAL : ""),
          {
            id: "avisos",
            header: "Avisos",
            meta: { titulo: "Avisos" },
            cell: ({ row }) =>
              row.original.alertaSegSocial ? (
                <InsigniaAlerta alerta="SEG_SOCIAL" />
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          }
        ),
        columna.accessor("creadaAt", {
          id: "generada",
          header: "Generada",
          meta: {
            titulo: "Generada",
            campoOrden: "generada",
            tipoDato: "fecha",
            formatoExportacion: "fechaHora",
          },
          cell: ({ row }) => (
            <span className="flex flex-col gap-0.5">
              <FechaConDistancia
                instante={row.original.creadaAt}
                ahora={ahora}
                relativa={false}
              />
              {row.original.generadaPorMi ? (
                <span className="text-[0.6875rem] text-muted-foreground">
                  Por ti
                </span>
              ) : null}
            </span>
          ),
        }),
      ]),
    [ahora, puedeAprobar]
  )

  return (
    <ProveedorSeleccion filas={filas} superadmin={superadmin}>
      {(seleccion) => (
        <>
          <TablaDatos
            titulo="Liquidaciones por aprobar"
            columnas={columnas}
            filas={filas}
            total={total}
            idFila={(fila) => fila.id}
            estadoTabla={estadoTablaLiquidaciones}
            filtros={FILTROS}
            placeholderBusqueda="Buscar medio…"
            claveAlmacenamiento="liquidaciones-borrador"
            enlaceFila={(fila) => rutaLiquidacion(fila.id)}
            vacio={{
              icono: FilePen,
              titulo: VISTAS.borrador.vacia,
              descripcion: VISTAS.borrador.ayudaVacia,
            }}
          />
          {puedeAprobar ? (
            <>
              <BarraSeleccion
                cantidad={seleccion.marcadas.length}
                onLimpiar={seleccion.limpiar}
              >
                <Button size="sm" onClick={() => setAprobando(true)}>
                  <BadgeCheck data-icon="inline-start" aria-hidden />
                  Aprobar
                </Button>
              </BarraSeleccion>
              <DialogoAprobar
                abierto={aprobando}
                onAbiertoChange={setAprobando}
                filas={seleccion.marcadas}
                politica={politica}
                onAprobadas={seleccion.limpiar}
              />
            </>
          ) : null}
        </>
      )}
    </ProveedorSeleccion>
  )
}
