/**
 * Estado de una tabla server-driven en la URL (nuqs): búsqueda, filtros
 * facetados, orden, página y tamaño de página. Módulo puro (sin `"use client"`):
 * la página lo usa en el servidor con `cargar(searchParams)` y la tabla en el
 * cliente con `useEstadoTabla`, con los MISMOS parsers. Así la URL es la única
 * fuente de verdad y cualquier vista se puede compartir o recargar.
 *
 * @example
 * ```ts
 * // features/<dominio>/estado-tabla.ts
 * export const estadoTablaMedios = definirEstadoTabla({
 *   camposOrden: ["nombre", "creado"],
 *   ordenPorDefecto: { campo: "creado", descendente: true },
 *   filtros: { estado: filtroDeOpciones(["PENDIENTE", "VERIFICADO"]) },
 * })
 * // page.tsx (servidor)
 * const estado = await estadoTablaMedios.cargar(props.searchParams)
 * ```
 */
import {
  createLoader,
  createParser,
  createSerializer,
  type inferParserType,
  parseAsArrayOf,
  parseAsNumberLiteral,
  parseAsStringLiteral,
  type ParserMap,
} from "nuqs/server"

/** Tamaños de página ofrecidos en el selector. */
export const TAMANOS_PAGINA = [10, 20, 50, 100] as const
export type TamanoPagina = (typeof TAMANOS_PAGINA)[number]

const TAMANO_POR_DEFECTO: TamanoPagina = 20
const LONGITUD_MAXIMA_BUSQUEDA = 100
const SEPARADOR_LISTA = ","
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface Orden<C extends string = string> {
  campo: C
  descendente: boolean
}

/** Texto libre: sin espacios sobrantes y con longitud acotada (la URL es entrada del usuario). */
export const parseAsBusqueda = createParser<string>({
  parse: (valor) => valor.trim().slice(0, LONGITUD_MAXIMA_BUSQUEDA),
  serialize: (valor) => valor,
})

/** Página 1-based; cualquier valor que no sea un entero positivo se ignora. */
export const parseAsPagina = createParser<number>({
  parse: (valor) => (/^[1-9]\d{0,6}$/.test(valor) ? Number(valor) : null),
  serialize: (valor) => String(valor),
})

/** `campo.asc` / `campo.desc`, solo con campos de la lista blanca. */
export function parseAsOrden<const C extends string>(campos: readonly C[]) {
  const esCampo = (valor: string): valor is C =>
    (campos as readonly string[]).includes(valor)

  return createParser<Orden<C>>({
    parse(valor) {
      const [campo, direccion, ...resto] = valor.split(".")
      if (resto.length > 0 || !campo || !esCampo(campo)) return null
      if (direccion !== "asc" && direccion !== "desc") return null
      return { campo, descendente: direccion === "desc" }
    },
    serialize: ({ campo, descendente }) =>
      `${campo}.${descendente ? "desc" : "asc"}`,
    eq: (a, b) => a.campo === b.campo && a.descendente === b.descendente,
  })
}

/** Filtro facetado sobre una lista cerrada de valores (p. ej. un enum de la BD). */
export function filtroDeOpciones<const V extends string>(
  valores: readonly V[]
) {
  return parseAsArrayOf(
    parseAsStringLiteral(valores),
    SEPARADOR_LISTA
  ).withDefault([])
}

const parseAsUuid = createParser<string>({
  parse: (valor) => (UUID.test(valor) ? valor.toLowerCase() : null),
  serialize: (valor) => valor,
})

/** Filtro facetado por identificadores dinámicos (p. ej. roles de la BD). */
export function filtroDeIds() {
  return parseAsArrayOf(parseAsUuid, SEPARADOR_LISTA).withDefault([])
}

export interface ConfiguracionEstadoTabla<
  C extends string,
  F extends ParserMap,
> {
  /** Campos por los que el servidor sabe ordenar (lista blanca). */
  camposOrden: readonly C[]
  ordenPorDefecto: Orden<C>
  tamanoPorDefecto?: TamanoPagina
  /**
   * Filtros facetados (`filtroDeOpciones`, `filtroDeIds`). Sus claves son los
   * nombres de los parámetros en la URL: no uses `q`, `pagina`, `tamano` ni `orden`.
   */
  filtros: F
}

function parsersBase<C extends string>(
  camposOrden: readonly C[],
  ordenPorDefecto: Orden<C>,
  tamanoPorDefecto: TamanoPagina
) {
  return {
    q: parseAsBusqueda.withDefault(""),
    pagina: parseAsPagina.withDefault(1),
    tamano: parseAsNumberLiteral(TAMANOS_PAGINA).withDefault(tamanoPorDefecto),
    orden: parseAsOrden(camposOrden).withDefault(ordenPorDefecto),
  }
}

type ParsersBase<C extends string> = ReturnType<typeof parsersBase<C>>

/** Todo lo que una tabla necesita para leer y escribir su estado en la URL. */
export interface DefinicionEstadoTabla<C extends string, F extends ParserMap> {
  parsers: ParsersBase<C> & F
  clavesFiltro: readonly (keyof F & string)[]
  camposOrden: readonly C[]
  ordenPorDefecto: Orden<C>
  /** Servidor: `await definicion.cargar(props.searchParams)`. */
  cargar: ReturnType<typeof createLoader<ParsersBase<C> & F>>
  /** Construye un `?query` con el estado (enlaces, redirecciones, pruebas). */
  serializar: ReturnType<typeof createSerializer<ParsersBase<C> & F>>
}

export type EstadoTabla<D> =
  D extends DefinicionEstadoTabla<infer C, infer F>
    ? inferParserType<ParsersBase<C> & F>
    : never

export function definirEstadoTabla<const C extends string, F extends ParserMap>(
  configuracion: ConfiguracionEstadoTabla<C, F>
): DefinicionEstadoTabla<C, F> {
  const parsers = {
    ...parsersBase(
      configuracion.camposOrden,
      configuracion.ordenPorDefecto,
      configuracion.tamanoPorDefecto ?? TAMANO_POR_DEFECTO
    ),
    ...configuracion.filtros,
  }
  return {
    parsers,
    clavesFiltro: Object.keys(configuracion.filtros) as (keyof F & string)[],
    camposOrden: configuracion.camposOrden,
    ordenPorDefecto: configuracion.ordenPorDefecto,
    cargar: createLoader(parsers),
    serializar: createSerializer(parsers),
  }
}

// ── Cálculos de paginación (compartidos por consultas y tabla) ──────────────

/** Filas a saltar para una página 1-based. */
export function desplazamiento(pagina: number, tamano: number): number {
  return (Math.max(1, pagina) - 1) * tamano
}

export function totalPaginas(total: number, tamano: number): number {
  return Math.max(1, Math.ceil(total / tamano))
}

/** Posiciones 1-based de la primera y la última fila visibles ("21–40 de 57"). */
export function rangoVisible(
  pagina: number,
  tamano: number,
  total: number
): { desde: number; hasta: number } {
  if (total === 0) return { desde: 0, hasta: 0 }
  const paginaReal = Math.min(pagina, totalPaginas(total, tamano))
  const desde = desplazamiento(paginaReal, tamano) + 1
  return { desde, hasta: Math.min(total, desde + tamano - 1) }
}

/** ¿La vista está acotada por búsqueda o filtros? (decide el mensaje del estado vacío). */
export function hayFiltrosActivos(
  busqueda: string,
  valoresFiltros: readonly (readonly string[])[]
): boolean {
  return (
    busqueda.trim() !== "" ||
    valoresFiltros.some((valores) => valores.length > 0)
  )
}
