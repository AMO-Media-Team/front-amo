/**
 * Definición de columnas para `TablaDatos` (TanStack Table v9). Este módulo y
 * el resto de `components/data-table` son los ÚNICOS que importan
 * `@tanstack/react-table` (regla de ESLint): los módulos de dominio declaran
 * sus columnas con `crearColumnas<Fila>()` y no conocen la librería.
 *
 * @example
 * ```tsx
 * const columna = crearColumnas<UsuarioFila>()
 * export const columnasUsuarios = columna.columns([
 *   columna.accessor("nombre", {
 *     header: "Nombre",
 *     meta: { titulo: "Nombre", campoOrden: "nombre", tarjeta: "titulo" },
 *     cell: ({ row }) => <CeldaUsuario usuario={row.original} />,
 *   }),
 * ])
 * ```
 */
import {
  type Cell,
  type ColumnDef,
  columnVisibilityFeature,
  createColumnHelper,
  metaHelper,
  type Row,
  type RowData,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table"

import type { FormatoColumna } from "./exportar"

/** Papel de la columna en la vista de tarjetas (< 768 px). */
export type PapelTarjeta = "titulo" | "detalle" | "oculta"

export interface MetaColumna {
  /** Nombre legible: menú de columnas, tarjetas, exportación y lectores de pantalla. */
  titulo: string
  /**
   * Campo de orden en la URL (lista blanca de `definirEstadoTabla`). Sin él,
   * la cabecera no ofrece ordenar: el orden siempre lo hace el servidor.
   */
  campoOrden?: string
  alinear?: "inicio" | "fin"
  /** Por defecto "detalle" (fila etiqueta: valor). */
  tarjeta?: PapelTarjeta
  /**
   * Presencia en CSV/Excel: "visible" (por defecto) solo si la columna se
   * muestra; "siempre" aunque esté oculta (p. ej. el correo); "nunca" para
   * columnas de interfaz (selección, acciones). El valor es el del accessor.
   */
  exportacion?: "visible" | "siempre" | "nunca"
  /** Con "fecha" o "fechaHora", un texto ISO se exporta como fecha real. */
  formatoExportacion?: FormatoColumna
  /** La columna empieza oculta; la persona puede mostrarla. */
  ocultaPorDefecto?: boolean
  /** Clases extra de la celda (ancho, truncado…). */
  claseCelda?: string
  /**
   * Oculta la columna (solo en pantalla) por debajo de ese ancho, para que la
   * tabla quepa sin desplazamiento horizontal en tabletas.
   */
  ocultarBajo?: "lg" | "xl"
  /** Tipo del campo de orden: da nombre a las opciones del selector de orden en móvil. */
  tipoDato?: "texto" | "fecha" | "otro"
}

/** Datos de la tabla que leen las columnas internas (casilla de selección). */
export interface MetaTabla {
  /** Nombre de la fila para lectores de pantalla ("Seleccionar Ana Gómez"). */
  etiquetaFila: (fila: unknown) => string
}

/** Funcionalidades registradas: orden, paginación y selección manuales + visibilidad. */
export const caracteristicasTabla = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  columnMeta: metaHelper<MetaColumna>(),
  tableMeta: metaHelper<MetaTabla>(),
})

export type CaracteristicasTabla = typeof caracteristicasTabla

/** Definición de columna tipada para una fila de dominio. */
export type ColumnaTabla<TFila extends RowData> = ColumnDef<
  CaracteristicasTabla,
  TFila
>

export type FilaTabla<TFila extends RowData> = Row<CaracteristicasTabla, TFila>
export type CeldaTabla<TFila extends RowData> = Cell<
  CaracteristicasTabla,
  TFila,
  unknown
>

/**
 * Ayudante de columnas (`accessor`, `display`, `columns`) para una fila de
 * dominio. Declara la fila con `type` (no `interface`): TanStack exige que sea
 * asignable a `Record<string, any>`.
 */
export function crearColumnas<TFila extends RowData>() {
  return createColumnHelper<CaracteristicasTabla, TFila>()
}

export type { RowData }

/** Id reservado de la columna de acciones por fila (se ancla a la derecha y va arriba en tarjetas). */
export const ID_COLUMNA_ACCIONES = "acciones"
/** Id reservado de la casilla de selección (la agrega `TablaDatos`). */
export const ID_COLUMNA_SELECCION = "seleccion"
