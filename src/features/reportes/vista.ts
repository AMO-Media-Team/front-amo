/**
 * Lecturas de la vista de un reporte que deciden la presentación (módulo
 * puro): si el periodo no tiene movimientos y qué sugerir entonces.
 */
import type { PresetRango } from "@/lib/fechas"

import type { ReporteCatalogo } from "./catalogo"
import type { VistaReporte } from "./tipos"

/**
 * El periodo no tiene movimientos: ningún indicador distinto de cero y todos
 * los gráficos vacíos. La página lo dice una vez arriba, en lugar de dejar
 * que cada bloque lo repita.
 */
export function sinMovimiento(
  vista: Pick<VistaReporte, "indicadores" | "graficos">
): boolean {
  const indicadoresEnCero = vista.indicadores.every(
    (ind) => ind.valor === null || ind.valor === 0
  )
  const graficosVacios = vista.graficos.every(
    (grafico) => grafico.vacio !== false
  )
  return indicadoresEnCero && graficosVacios
}

export interface TextoVacio {
  titulo: string
  descripcion: string
}

export interface AvisoVacio extends TextoVacio {
  /** Ofrecer "Ver este año": hay un periodo más amplio que probar. */
  ampliarPeriodo: boolean
}

/** Qué decir cuando no hay movimientos (página y documentos exportados). */
export function textoSinMovimiento(
  reporte: Pick<ReporteCatalogo, "filtros">
): TextoVacio {
  if (reporte.filtros.includes("corte")) {
    return {
      titulo: "No hay saldos por cobrar en esta fecha de corte",
      descripcion:
        "Todas las facturas emitidas hasta el corte están pagadas, o todavía no se ha emitido ninguna.",
    }
  }
  return {
    titulo: "Este periodo todavía no tiene movimientos",
    descripcion:
      "Los indicadores, los gráficos y el detalle se llenan en cuanto haya actividad registrada en las fechas elegidas.",
  }
}

/** El aviso de la página: el texto común más el siguiente paso sugerido. */
export function avisoSinMovimiento(
  reporte: Pick<ReporteCatalogo, "filtros">,
  preset: PresetRango
): AvisoVacio {
  const texto = textoSinMovimiento(reporte)
  if (reporte.filtros.includes("corte")) {
    return {
      titulo: texto.titulo,
      descripcion: `${texto.descripcion} Puedes elegir otra fecha de corte.`,
      ampliarPeriodo: false,
    }
  }
  const ampliarPeriodo = preset !== "esteAno"
  return {
    titulo: texto.titulo,
    descripcion: `${texto.descripcion}${ampliarPeriodo ? " Prueba con un periodo más amplio." : ""}`,
    ampliarPeriodo,
  }
}

/**
 * Rejilla de las tarjetas de cabecera (y de su esqueleto de carga). Seis
 * tarjetas van de tres en tres. Ocho van en cuatro columnas solo cuando caben
 * (desde `xl`): en tableta, o en un portátil con la barra lateral abierta,
 * cuatro columnas recortan títulos como «GMV comprometido», así que ahí van
 * de dos en dos.
 */
export function rejillaIndicadores(cantidad: number): {
  columnas: 3 | 4
  className?: string
} {
  return cantidad % 4 === 0
    ? {
        columnas: 4,
        className: "md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4",
      }
    : { columnas: 3 }
}

/**
 * Texto de una tarjeta sin valor. Un reporte a fecha de corte (Cartera) no
 * consulta un periodo: «Sin datos en el periodo» sería falso.
 */
export function textoSinDatosIndicador(
  reporte: Pick<ReporteCatalogo, "filtros">
): string {
  return reporte.filtros.includes("corte")
    ? "Sin datos a la fecha de corte"
    : "Sin datos en el periodo"
}

/**
 * La comparación sin las fechas entre paréntesis, para las tarjetas: las
 * fechas ya se leen en el resumen de filtros ("frente al mes anterior").
 */
export function comparacionBreve(comparacion: string | null): string | null {
  if (comparacion === null) return null
  return comparacion.replace(/\s*\([^)]*\)\s*$/, "").trim() || comparacion
}
