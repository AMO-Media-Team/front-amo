/**
 * Búsqueda, filtros facetados, orden y paginación de la tabla de detalle de
 * un reporte, en el servidor y en memoria: las RPC de reportes devuelven el
 * conjunto completo (decenas o cientos de filas) y la tabla solo recibe la
 * página pedida en la URL. Módulo puro.
 */
import type { OpcionFiltro } from "@/components/data-table/filtro-facetado"

import type { ColumnaReporte, ValorColumna } from "./columnas"

export interface FacetaReporte<F> {
  /** Parámetro de la URL (no uses `q`, `pagina`, `tamano`, `orden` ni los filtros del reporte). */
  clave: string
  titulo: string
  valor: (fila: F) => string | null
  /** Texto de cada opción; por defecto, el valor. */
  etiqueta?: (valor: string) => string
  /** Orden fijo de las opciones (p. ej. un enum); por defecto, alfabético. */
  orden?: readonly string[]
}

export interface EstadoTablaMemoria {
  q: string
  pagina: number
  tamano: number
  orden: { campo: string; descendente: boolean }
  facetas: Readonly<Record<string, readonly string[]>>
}

export interface PaginaTabla<F> {
  filas: F[]
  /** Filas que cumplen la búsqueda y los filtros (todas las páginas). */
  total: number
}

const comparador = new Intl.Collator("es", {
  sensitivity: "base",
  numeric: true,
})

/** Minúsculas y sin tildes: "Bogotá" coincide con "bogota". */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-CO")
    .trim()
}

function coincideBusqueda<F>(
  fila: F,
  columnas: readonly ColumnaReporte<F>[],
  termino: string
): boolean {
  return columnas.some((columna) => {
    if (!columna.buscable) return false
    const valor = columna.valor(fila)
    return valor !== null && normalizarTexto(String(valor)).includes(termino)
  })
}

function coincideFacetas<F>(
  fila: F,
  facetas: readonly FacetaReporte<F>[],
  seleccion: EstadoTablaMemoria["facetas"]
): boolean {
  return facetas.every((faceta) => {
    const elegidos = seleccion[faceta.clave] ?? []
    if (elegidos.length === 0) return true
    const valor = faceta.valor(fila)
    return valor !== null && elegidos.includes(valor)
  })
}

/** Los vacíos van siempre al final, en cualquier dirección. */
export function compararValores(
  a: ValorColumna,
  b: ValorColumna,
  descendente: boolean
): number {
  const vacioA = a === null || a === ""
  const vacioB = b === null || b === ""
  if (vacioA || vacioB) return vacioA === vacioB ? 0 : vacioA ? 1 : -1
  const signo = descendente ? -1 : 1
  if (typeof a === "number" && typeof b === "number") return (a - b) * signo
  if (typeof a === "boolean" && typeof b === "boolean") {
    return (Number(a) - Number(b)) * signo
  }
  return comparador.compare(String(a), String(b)) * signo
}

export function filtrarFilas<F>(
  filas: readonly F[],
  columnas: readonly ColumnaReporte<F>[],
  facetas: readonly FacetaReporte<F>[],
  estado: Pick<EstadoTablaMemoria, "q" | "facetas">
): F[] {
  const termino = normalizarTexto(estado.q)
  return filas.filter(
    (fila) =>
      (termino === "" || coincideBusqueda(fila, columnas, termino)) &&
      coincideFacetas(fila, facetas, estado.facetas)
  )
}

export function ordenarFilas<F>(
  filas: readonly F[],
  columnas: readonly ColumnaReporte<F>[],
  orden: EstadoTablaMemoria["orden"]
): F[] {
  const columna = columnas.find((c) => c.id === orden.campo)
  if (!columna) return [...filas]
  const clave = columna.valorOrden ?? columna.valor
  // Orden estable: los empates conservan el orden de la RPC.
  return filas
    .map((fila, indice) => ({ fila, indice }))
    .sort(
      (x, y) =>
        compararValores(clave(x.fila), clave(y.fila), orden.descendente) ||
        x.indice - y.indice
    )
    .map(({ fila }) => fila)
}

/**
 * La página pedida; si ya no existe (otro filtro dejó menos filas), la
 * última, igual que las RPC paginadas.
 */
export function paginarFilas<F>(
  filas: readonly F[],
  pagina: number,
  tamano: number
): F[] {
  const paginas = Math.max(1, Math.ceil(filas.length / tamano))
  const actual = Math.min(Math.max(1, pagina), paginas)
  return filas.slice((actual - 1) * tamano, actual * tamano)
}

export function aplicarEstadoTabla<F>(
  filas: readonly F[],
  columnas: readonly ColumnaReporte<F>[],
  facetas: readonly FacetaReporte<F>[],
  estado: EstadoTablaMemoria
): PaginaTabla<F> {
  const filtradas = filtrarFilas(filas, columnas, facetas, estado)
  const ordenadas = ordenarFilas(filtradas, columnas, estado.orden)
  return {
    filas: paginarFilas(ordenadas, estado.pagina, estado.tamano),
    total: filtradas.length,
  }
}

/** Opciones de una faceta con los valores presentes en los datos. */
export function opcionesFaceta<F>(
  filas: readonly F[],
  faceta: FacetaReporte<F>
): OpcionFiltro[] {
  const presentes = new Set<string>()
  for (const fila of filas) {
    const valor = faceta.valor(fila)
    if (valor !== null && valor !== "") presentes.add(valor)
  }
  const valores = faceta.orden
    ? faceta.orden.filter((valor) => presentes.has(valor))
    : [...presentes].sort((a, b) => comparador.compare(a, b))
  return valores.map((valor) => ({
    valor,
    etiqueta: faceta.etiqueta?.(valor) ?? valor,
  }))
}

/** Estado de `definirEstadoTabla(...).cargar()` → estado en memoria. */
export function estadoEnMemoria(
  estado: {
    q: string
    pagina: number
    tamano: number
    orden: { campo: string; descendente: boolean }
  } & Record<string, unknown>,
  claves: readonly string[]
): EstadoTablaMemoria {
  const facetas: Record<string, readonly string[]> = {}
  for (const clave of claves) {
    const valor = estado[clave]
    facetas[clave] = Array.isArray(valor) ? valor.map(String) : []
  }
  return {
    q: estado.q,
    pagina: estado.pagina,
    tamano: estado.tamano,
    orden: estado.orden,
    facetas,
  }
}
