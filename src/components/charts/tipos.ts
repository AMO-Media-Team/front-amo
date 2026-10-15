/**
 * Tipos compartidos por los gráficos, sin dependencias de Chart.js en tiempo de
 * ejecución (los usan también la tarjeta, la tabla alternativa y las exportaciones).
 */

/** Tabla alternativa accesible de un gráfico: celdas ya formateadas. */
export interface TablaGrafico {
  columnas: readonly ColumnaTablaGrafico[]
  filas: readonly (readonly string[])[]
}

export interface ColumnaTablaGrafico {
  titulo: string
  /** Alinea a la derecha y usa cifras tabulares. */
  numerica?: boolean
}

/** Lo que cada gráfico publica para su tarjeta: resumen aria y datos. */
export interface DatosAccesibles {
  resumen: string
  tabla: TablaGrafico
}

/**
 * Lo mínimo que la tarjeta y la navegación por teclado necesitan de una
 * instancia de Chart.js (cualquier tipo de gráfico lo cumple).
 */
export interface InstanciaGrafico {
  canvas: HTMLCanvasElement
  data: { datasets: readonly unknown[]; labels?: readonly unknown[] }
  isDatasetVisible(indice: number): boolean
  setActiveElements(elementos: { datasetIndex: number; index: number }[]): void
  getActiveElements(): readonly { datasetIndex: number; index: number }[]
  tooltip?: {
    setActiveElements(
      elementos: { datasetIndex: number; index: number }[],
      posicion: { x: number; y: number }
    ): void
  }
  update(modo?: "none"): void
  toBase64Image(tipo?: string, calidad?: number): string
}

/** Una serie de valores con identidad estable (el color sigue a la entidad). */
export interface Serie {
  /** Identificador estable: el color y la visibilidad se asocian a él. */
  id: string
  nombre: string
  valores: readonly (number | null)[]
}

/** Cómo se dibuja la muestra de una serie: imita su marca en el gráfico. */
export type MarcaSerie = "linea" | "discontinua" | "bloque"

/** Entrada de leyenda (HTML en pantalla; dibujada en las imágenes exportadas). */
export interface ElementoLeyenda {
  id: string
  nombre: string
  color: string
  marca: MarcaSerie
  /** Valor opcional a la derecha (dona: participación). */
  valor?: string
}
