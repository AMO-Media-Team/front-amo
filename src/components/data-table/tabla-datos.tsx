"use client"

import {
  functionalUpdate,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  useTable,
} from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  type LucideIcon,
  SearchX,
} from "lucide-react"
import type { ParserMap } from "nuqs"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import {
  type MouseEvent,
  type ReactNode,
  useId,
  useMemo,
  useState,
} from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { BarraHerramientas, type OpcionOrden } from "./barra-herramientas"
import { BarraSeleccion } from "./barra-seleccion"
import {
  caracteristicasTabla,
  type ColumnaTabla,
  crearColumnas,
  type FilaTabla,
  ID_COLUMNA_ACCIONES,
  ID_COLUMNA_SELECCION,
  type MetaColumna,
  type RowData,
} from "./columnas"
import {
  type DefinicionEstadoTabla,
  hayFiltrosActivos,
  type Orden,
  TAMANOS_PAGINA,
} from "./estado-url"
import {
  type DatosExportacion,
  exportarDatos,
  type FormatoColumna,
  type FormatoExportacion,
  type ValorExportable,
} from "./exportar"
import type { FiltroFacetado } from "./filtro-facetado"
import { MenuExportar } from "./menu-exportar"
import { OpcionesVista } from "./opciones-vista"
import { PaginacionTabla } from "./paginacion-tabla"
import {
  type Densidad,
  type PreferenciasTabla,
  usePreferenciasTabla,
} from "./preferencias"
import { useEstadoTabla } from "./use-estado-tabla"
import { VistaTarjetas } from "./vista-tarjetas"

export interface SeleccionTabla<TFila extends RowData> {
  ids: readonly string[]
  filas: readonly TFila[]
  limpiar: () => void
}

export interface VacioTabla {
  titulo: string
  descripcion?: ReactNode
  icono?: LucideIcon
  /** Acción principal cuando aún no hay registros (p. ej. "Crear usuario"). */
  accion?: ReactNode
}

export interface ExportacionTabla {
  /** Base del nombre de archivo y título de la hoja ("Usuarios"). */
  nombre: string
  /** Tras generar el archivo (p. ej. registrar `EXPORTAR` en la bitácora). */
  onExportado?: (resumen: {
    formato: FormatoExportacion
    filas: number
  }) => void
}

export interface TablaDatosProps<
  TFila extends RowData,
  C extends string,
  F extends ParserMap,
> {
  /** Nombre accesible de la tabla (`<caption>`), p. ej. "Usuarios de la plataforma". */
  titulo: string
  /** Columnas de `crearColumnas<TFila>().columns([...])` (estables: módulo o `useMemo`). */
  columnas: readonly ColumnaTabla<TFila>[]
  /** Filas de la página actual, ya filtradas, ordenadas y paginadas por el servidor. */
  filas: readonly TFila[]
  /** Total de filas que cumplen los filtros (todas las páginas). */
  total: number
  idFila: (fila: TFila) => string
  /** Estado en la URL; el mismo objeto que usa la página para consultar. */
  estadoTabla: DefinicionEstadoTabla<C, F>
  filtros?: readonly FiltroFacetado<keyof F & string>[]
  placeholderBusqueda?: string
  /** Clave para recordar densidad y columnas visibles en este navegador. */
  claveAlmacenamiento: string
  /** Destino al hacer clic en una fila (la celda principal debe tener además un enlace, para teclado). */
  enlaceFila?: (fila: TFila) => Route
  /** Nombre de la fila para lectores de pantalla ("Seleccionar Ana Gómez"). */
  etiquetaFila?: (fila: TFila) => string
  /** Acciones masivas; habilita la columna de selección y la barra flotante. */
  accionesMasivas?: (seleccion: SeleccionTabla<TFila>) => ReactNode
  exportacion?: ExportacionTabla
  vacio: VacioTabla
}

const FILAS_ANIMADAS = 12
const ESPACIADO: Record<Densidad, string> = {
  compacta: "py-1.5",
  normal: "py-2.5",
  comoda: "py-4",
}
const SIN_FILAS: readonly never[] = []
const OCULTAR_BAJO = { lg: "max-lg:hidden", xl: "max-xl:hidden" } as const
const SUFIJOS_ORDEN = {
  texto: ["A → Z", "Z → A"],
  fecha: ["más antiguos primero", "más recientes primero"],
  otro: ["ascendente", "descendente"],
} as const

function idColumna<TFila extends RowData>(
  columna: ColumnaTabla<TFila>
): string | undefined {
  if (columna.id) return columna.id
  return "accessorKey" in columna ? String(columna.accessorKey) : undefined
}

/** Clic en un control dentro de la fila: no debe navegar. */
function esClicEnControl(evento: MouseEvent<HTMLElement>): boolean {
  const destino = evento.target
  return (
    destino instanceof Element &&
    destino.closest(
      "a,button,input,label,select,textarea,[role=checkbox],[role=menuitem],[data-no-navegar]"
    ) !== null
  )
}

function valorExportable(
  valor: unknown,
  formato?: FormatoColumna
): ValorExportable {
  if (
    typeof valor === "string" &&
    (formato === "fecha" || formato === "fechaHora")
  ) {
    const fecha = new Date(valor)
    return Number.isNaN(fecha.getTime()) ? valor : fecha
  }
  if (
    valor === null ||
    valor === undefined ||
    valor instanceof Date ||
    ["string", "number", "boolean"].includes(typeof valor)
  ) {
    return valor as ValorExportable
  }
  return String(valor)
}

function describirOrden(orden: Orden, titulo: string | undefined): string {
  if (!titulo) return ""
  return `, ordenada por ${titulo.toLocaleLowerCase("es-CO")} en orden ${
    orden.descendente ? "descendente" : "ascendente"
  }`
}

function IconoOrden({ direccion }: { direccion: false | "asc" | "desc" }) {
  if (direccion === "asc") return <ArrowUp aria-hidden />
  if (direccion === "desc") return <ArrowDown aria-hidden />
  return <ChevronsUpDown aria-hidden className="opacity-40" />
}

/**
 * Casilla de selección que TablaDatos antepone cuando hay acciones masivas.
 * Es estable (no depende de props): la etiqueta de cada fila llega por la
 * meta de la tabla, así las columnas no se recalculan en cada render.
 */
function columnaSeleccion<TFila extends RowData>(): ColumnaTabla<TFila> {
  return crearColumnas<TFila>().display({
    id: ID_COLUMNA_SELECCION,
    meta: { titulo: "Selección", tarjeta: "oculta", exportacion: "nunca" },
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Seleccionar todas las filas de esta página"
        // El Checkbox de ui muestra siempre ✓: en estado mixto se pinta un guion.
        className="data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground data-indeterminate:before:h-0.5 data-indeterminate:before:w-2 data-indeterminate:before:rounded-full data-indeterminate:before:bg-current [&[data-indeterminate]_svg]:hidden"
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={
          table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
        }
        onCheckedChange={(valor) => table.toggleAllPageRowsSelected(valor)}
      />
    ),
    cell: ({ row, table }) => (
      <Checkbox
        aria-label={`Seleccionar ${table.options.meta?.etiquetaFila(row.original) ?? row.id}`}
        checked={row.getIsSelected()}
        onCheckedChange={(valor) => row.toggleSelected(valor)}
      />
    ),
  })
}

/**
 * Tabla de datos server-driven (TanStack Table v9 + nuqs). El servidor filtra,
 * ordena y pagina según la URL; esta tabla solo pinta la página recibida y
 * escribe en la URL los cambios de la persona. Incluye barra de búsqueda y
 * filtros, columnas visibles y densidad (recordadas en el navegador),
 * selección con acciones masivas, exportación CSV/Excel de la vista, estados
 * vacíos y de carga, cabecera fija, entrada escalonada de filas y vista de
 * tarjetas en móvil.
 *
 * Para la carga inicial usa `<Suspense fallback={<EsqueletoTablaDatos />}>` y
 * para los fallos `<LimiteErrorTabla recurso="…">` alrededor del componente
 * de servidor que consulta.
 *
 * @example
 * ```tsx
 * <TablaDatos
 *   titulo="Usuarios de la plataforma"
 *   columnas={columnasUsuarios}
 *   filas={pagina.filas}
 *   total={pagina.total}
 *   idFila={(u) => u.id}
 *   estadoTabla={estadoTablaUsuarios}
 *   filtros={[{ clave: "estado", titulo: "Estado", opciones }]}
 *   claveAlmacenamiento="usuarios"
 *   enlaceFila={(u) => `/administracion/usuarios/${u.id}` as Route}
 *   vacio={{ titulo: "Aún no hay usuarios" }}
 * />
 * ```
 */
export function TablaDatos<
  TFila extends RowData,
  C extends string,
  F extends ParserMap,
>({
  titulo,
  columnas,
  filas,
  total,
  idFila,
  estadoTabla,
  filtros = SIN_FILAS,
  placeholderBusqueda = "Buscar…",
  claveAlmacenamiento,
  enlaceFila,
  etiquetaFila,
  accionesMasivas,
  exportacion,
  vacio,
}: TablaDatosProps<TFila, C, F>) {
  const router = useRouter()
  const idResumen = useId()
  const control = useEstadoTabla(estadoTabla)
  const { estado, cargando } = control

  // ── Preferencias (densidad y columnas) ─────────────────────────────────────
  const preferenciasPorDefecto = useMemo<PreferenciasTabla>(
    () => ({
      densidad: "normal",
      visibilidad: Object.fromEntries(
        columnas.flatMap((columna) => {
          const id = idColumna(columna)
          return id && columna.meta?.ocultaPorDefecto ? [[id, false]] : []
        })
      ),
    }),
    [columnas]
  )
  const [preferencias, guardarPreferencias] = usePreferenciasTabla(
    claveAlmacenamiento,
    preferenciasPorDefecto
  )

  // ── Selección: se reinicia al cambiar de página, filtros u orden ───────────
  const [seleccion, setSeleccion] = useState<RowSelectionState>({})
  const claveVista = JSON.stringify(estado)
  const [vistaSeleccion, setVistaSeleccion] = useState(claveVista)
  if (vistaSeleccion !== claveVista) {
    setVistaSeleccion(claveVista)
    setSeleccion({})
  }

  // ── Orden: campo de la URL ↔ id de columna ─────────────────────────────────
  const columnasOrdenables = useMemo(
    () =>
      columnas.flatMap((columna) => {
        const id = idColumna(columna)
        const campo = columna.meta?.campoOrden
        return id && campo
          ? [
              {
                id,
                campo,
                titulo: columna.meta?.titulo ?? id,
                tipoDato: columna.meta?.tipoDato ?? "texto",
              },
            ]
          : []
      }),
    [columnas]
  )
  const esCampoOrden = (campo: string): campo is C =>
    (estadoTabla.camposOrden as readonly string[]).includes(campo)

  function ordenarPor(campo: string, descendente: boolean) {
    if (esCampoOrden(campo)) control.ordenar({ campo, descendente })
  }

  const ordenActual = columnasOrdenables.find(
    (columna) => columna.campo === estado.orden.campo
  )
  const sorting = useMemo<SortingState>(
    () =>
      ordenActual
        ? [{ id: ordenActual.id, desc: estado.orden.descendente }]
        : [],
    [ordenActual, estado.orden.descendente]
  )
  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: estado.pagina - 1, pageSize: estado.tamano }),
    [estado.pagina, estado.tamano]
  )

  const conSeleccion = accionesMasivas !== undefined
  const columnasTabla = useMemo(
    () => (conSeleccion ? [columnaSeleccion<TFila>(), ...columnas] : columnas),
    [conSeleccion, columnas]
  )

  const tabla = useTable({
    features: caracteristicasTabla,
    columns: columnasTabla,
    data: filas,
    getRowId: (fila) => idFila(fila),
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
    enableMultiSort: false,
    enableSortingRemoval: false,
    state: {
      sorting,
      pagination,
      columnVisibility: preferencias.visibilidad,
      rowSelection: seleccion,
    },
    onSortingChange: (actualizar) => {
      const [primero] = functionalUpdate(actualizar, sorting)
      const columna = columnasOrdenables.find((c) => c.id === primero?.id)
      if (primero && columna) ordenarPor(columna.campo, primero.desc)
    },
    onPaginationChange: (actualizar) => {
      const siguiente = functionalUpdate(actualizar, pagination)
      if (siguiente.pageSize !== pagination.pageSize) {
        const tamano = TAMANOS_PAGINA.find((t) => t === siguiente.pageSize)
        if (tamano) control.cambiarTamano(tamano)
      } else {
        control.irAPagina(siguiente.pageIndex + 1)
      }
    },
    onColumnVisibilityChange: (actualizar) =>
      guardarPreferencias({
        visibilidad: functionalUpdate(actualizar, preferencias.visibilidad),
      }),
    onRowSelectionChange: setSeleccion,
    meta: {
      etiquetaFila: (fila) => (etiquetaFila ?? idFila)(fila as TFila),
    },
  })

  const filasPagina = tabla.getRowModel().rows
  const filasSeleccionadas = tabla.getSelectedRowModel().rows
  const filtrosActivos = hayFiltrosActivos(
    estado.q,
    estadoTabla.clavesFiltro.map(control.valoresFiltro)
  )

  // ── Acciones ───────────────────────────────────────────────────────────────
  function alternarOrden(campo: string) {
    const mismoCampo = estado.orden.campo === campo
    ordenarPor(campo, mismoCampo ? !estado.orden.descendente : false)
  }

  function navegarAFila(
    fila: FilaTabla<TFila>,
    evento: MouseEvent<HTMLElement>
  ) {
    if (!enlaceFila || esClicEnControl(evento)) return
    const destino = enlaceFila(fila.original)
    if (evento.metaKey || evento.ctrlKey)
      window.open(destino, "_blank", "noopener")
    else router.push(destino)
  }

  function datosExportacion(): DatosExportacion {
    const columnasExportadas = tabla.getAllLeafColumns().filter((columna) => {
      const presencia = columna.columnDef.meta?.exportacion ?? "visible"
      return (
        presencia === "siempre" ||
        (presencia === "visible" && columna.getIsVisible())
      )
    })
    const origen =
      filasSeleccionadas.length > 0 ? filasSeleccionadas : filasPagina
    return {
      titulo: exportacion?.nombre ?? titulo,
      columnas: columnasExportadas.map((columna) => ({
        titulo: columna.columnDef.meta?.titulo ?? columna.id,
        formato: columna.columnDef.meta?.formatoExportacion,
      })),
      filas: origen.map((fila) =>
        columnasExportadas.map((columna) =>
          valorExportable(
            fila.getValue(columna.id),
            columna.columnDef.meta?.formatoExportacion
          )
        )
      ),
    }
  }

  async function exportar(formato: FormatoExportacion) {
    const datos = datosExportacion()
    await exportarDatos(datos, formato, exportacion?.nombre ?? titulo)
    exportacion?.onExportado?.({ formato, filas: datos.filas.length })
  }

  const opcionesOrdenMovil: OpcionOrden[] = columnasOrdenables.flatMap(
    ({ campo, titulo: nombre, tipoDato }) => {
      const [ascendente, descendente] = SUFIJOS_ORDEN[tipoDato]
      return [
        { valor: `${campo}.asc`, etiqueta: `${nombre}: ${ascendente}` },
        { valor: `${campo}.desc`, etiqueta: `${nombre}: ${descendente}` },
      ]
    }
  )

  const columnasOcultables = tabla
    .getAllLeafColumns()
    .filter(
      (columna) => columna.getCanHide() && columna.id !== ID_COLUMNA_ACCIONES
    )
    .map((columna) => ({
      id: columna.id,
      titulo: columna.columnDef.meta?.titulo ?? columna.id,
      visible: columna.getIsVisible(),
    }))

  const resumen = `${formatearNumero(total)} ${total === 1 ? "resultado" : "resultados"}${describirOrden(
    estado.orden,
    ordenActual?.titulo
  )}`
  const espaciado = ESPACIADO[preferencias.densidad]
  const sinFilas = total === 0 || filasPagina.length === 0

  return (
    <section aria-label={titulo} className="relative flex flex-col gap-3">
      <BarraHerramientas
        busqueda={estado.q}
        placeholderBusqueda={placeholderBusqueda}
        onBuscar={control.buscar}
        filtros={filtros}
        valoresFiltro={control.valoresFiltro}
        onFiltrar={control.filtrar}
        filtrosActivos={filtrosActivos}
        onLimpiar={control.limpiarFiltros}
        ordenMovil={{
          valor: `${estado.orden.campo}.${estado.orden.descendente ? "desc" : "asc"}`,
          opciones: opcionesOrdenMovil,
          onCambiar: (valor) => {
            const [campo, direccion] = valor.split(".")
            ordenarPor(campo, direccion === "desc")
          },
        }}
      >
        <OpcionesVista
          columnas={columnasOcultables}
          onAlternarColumna={(id, visible) =>
            tabla.getColumn(id)?.toggleVisibility(visible)
          }
          densidad={preferencias.densidad}
          onCambiarDensidad={(densidad) => guardarPreferencias({ densidad })}
        />
        {exportacion ? (
          <MenuExportar
            cantidad={
              filasSeleccionadas.length > 0
                ? filasSeleccionadas.length
                : filasPagina.length
            }
            alcance={filasSeleccionadas.length > 0 ? "seleccion" : "pagina"}
            onExportar={exportar}
          />
        ) : null}
      </BarraHerramientas>

      <p id={idResumen} className="sr-only" aria-live="polite">
        {cargando ? "Actualizando resultados…" : resumen}
      </p>

      {sinFilas && !cargando ? (
        filtrosActivos ? (
          <EstadoVacio
            icono={SearchX}
            titulo="Sin resultados"
            descripcion="Ningún registro coincide con la búsqueda o los filtros. Prueba con otros términos."
            className="flex-none py-14"
          >
            <Button variant="outline" onClick={control.limpiarFiltros}>
              Limpiar filtros
            </Button>
          </EstadoVacio>
        ) : (
          <EstadoVacio
            icono={vacio.icono}
            titulo={vacio.titulo}
            descripcion={vacio.descripcion}
            className="flex-none py-14"
          >
            {vacio.accion}
          </EstadoVacio>
        )
      ) : (
        <>
          <div className="relative overflow-hidden rounded-xl border bg-card max-md:hidden">
            <BarraCarga activa={cargando} />
            {/* Altura acotada al viewport: la cabecera queda fija mientras se recorren las filas. */}
            <div className="max-h-[calc(100dvh-9rem)] overflow-auto overscroll-x-contain">
              <table
                data-slot="table"
                aria-busy={cargando}
                aria-describedby={idResumen}
                className="w-full caption-bottom text-sm"
              >
                <caption className="sr-only">{titulo}</caption>
                <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card/95 [&_th]:backdrop-blur-sm [&_tr]:border-b-0">
                  {tabla.getHeaderGroups().map((grupo) => (
                    <TableRow key={grupo.id} className="hover:bg-transparent">
                      {grupo.headers.map((cabecera) => {
                        const meta: MetaColumna | undefined =
                          cabecera.column.columnDef.meta
                        const campo = meta?.campoOrden
                        const direccion = campo
                          ? cabecera.column.getIsSorted()
                          : false
                        return (
                          <TableHead
                            key={cabecera.id}
                            scope="col"
                            aria-sort={
                              campo
                                ? direccion === "asc"
                                  ? "ascending"
                                  : direccion === "desc"
                                    ? "descending"
                                    : "none"
                                : undefined
                            }
                            className={cn(
                              "h-11 px-3 text-xs font-medium text-muted-foreground shadow-[inset_0_-1px_0_var(--border)] first:pl-4 last:pr-4",
                              cabecera.column.id === ID_COLUMNA_SELECCION &&
                                "w-10",
                              cabecera.column.id === ID_COLUMNA_ACCIONES &&
                                "w-12",
                              meta?.ocultarBajo &&
                                OCULTAR_BAJO[meta.ocultarBajo],
                              meta?.alinear === "fin" && "text-right"
                            )}
                          >
                            {cabecera.isPlaceholder ? null : campo ? (
                              <button
                                type="button"
                                onClick={() => alternarOrden(campo)}
                                className={cn(
                                  "-ml-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground focus-visible:anillo-foco [&_svg]:size-3.5",
                                  direccion && "text-foreground",
                                  meta?.alinear === "fin" &&
                                    "-mr-1.5 ml-auto flex-row-reverse"
                                )}
                              >
                                <tabla.FlexRender header={cabecera} />
                                <IconoOrden direccion={direccion} />
                              </button>
                            ) : (
                              <tabla.FlexRender header={cabecera} />
                            )}
                          </TableHead>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody
                  className={cn("transition-opacity", cargando && "opacity-60")}
                >
                  {filasPagina.map((fila, indice) => (
                    <TableRow
                      key={fila.id}
                      data-state={fila.getIsSelected() ? "selected" : undefined}
                      onClick={(evento) => navegarAFila(fila, evento)}
                      style={{
                        animationDelay: `${Math.min(indice, FILAS_ANIMADAS) * 25}ms`,
                      }}
                      className={cn(
                        "animate-aparecer-arriba motion-reduce:animate-none",
                        "data-[state=selected]:bg-primary/6 dark:data-[state=selected]:bg-primary/10",
                        enlaceFila && "cursor-pointer"
                      )}
                    >
                      {fila.getVisibleCells().map((celda) => {
                        const meta = celda.column.columnDef.meta
                        return (
                          <TableCell
                            key={celda.id}
                            className={cn(
                              "px-3 first:pl-4 last:pr-4",
                              espaciado,
                              meta?.alinear === "fin" && "text-right",
                              meta?.ocultarBajo &&
                                OCULTAR_BAJO[meta.ocultarBajo],
                              meta?.claseCelda
                            )}
                          >
                            <tabla.FlexRender cell={celda} />
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>
          </div>

          <div className="relative md:hidden">
            <BarraCarga activa={cargando} />
            <VistaTarjetas
              filas={filasPagina}
              cargando={cargando}
              onClickFila={enlaceFila ? navegarAFila : undefined}
            />
          </div>
        </>
      )}

      {total > 0 ? (
        <PaginacionTabla
          pagina={estado.pagina}
          tamano={estado.tamano}
          total={total}
          onPagina={(pagina) => tabla.setPageIndex(pagina - 1)}
          onTamano={(tamano) => tabla.setPageSize(tamano)}
        />
      ) : null}

      {accionesMasivas ? (
        <BarraSeleccion
          cantidad={filasSeleccionadas.length}
          onLimpiar={() => tabla.resetRowSelection(true)}
        >
          {accionesMasivas({
            ids: filasSeleccionadas.map((fila) => fila.id),
            filas: filasSeleccionadas.map((fila) => fila.original),
            limpiar: () => tabla.resetRowSelection(true),
          })}
        </BarraSeleccion>
      ) : null}
    </section>
  )
}

/** Barra de progreso indeterminada mientras el servidor responde. */
function BarraCarga({ activa }: { activa: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden rounded-t-xl opacity-0 transition-opacity",
        activa && "opacity-100"
      )}
    >
      <div className="h-full w-full animate-brillo-shimmer bg-[linear-gradient(90deg,transparent_0%,var(--primary)_50%,transparent_100%)] bg-size-[200%_100%] bg-no-repeat motion-reduce:animate-none motion-reduce:bg-primary/60" />
    </div>
  )
}
