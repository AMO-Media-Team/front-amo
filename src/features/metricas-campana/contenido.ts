/**
 * La pestaña «Métricas» como contenido de reporte (módulo puro): indicadores,
 * un gráfico por corte, avisos, la tabla del corte elegido, una hoja por cada
 * corte y las notas. Lo usan la página y la exportación con las mismas
 * definiciones, así lo que se ve y lo que se descarga coinciden (ANU-012).
 */
import { definicionKpi } from "@/components/kpi/definiciones-kpi"
import {
  type FilaDesempeno,
  serieDesempeno,
} from "@/features/dashboard/anunciante/datos"
import { etiquetaPeriodo } from "@/features/dashboard/series"
import { contar, formatearVigencia } from "@/features/operacion/formato"
import type { ColumnaReporte } from "@/features/reportes/columnas"
import {
  NOTA_ALCANCE,
  NOTA_ZONA_HORARIA,
  tablaExportable,
} from "@/features/reportes/definiciones/comun"
import type { EncabezadoDocumento } from "@/features/reportes/exportacion/documento"
import { type EspecGrafico, sinValores } from "@/features/reportes/graficos"
import {
  type IndicadorReporte,
  indicador,
} from "@/features/reportes/indicadores"
import type {
  ContenidoReporte,
  NotaDefinicion,
  VistaReporte,
} from "@/features/reportes/tipos"
import type { HojaExcel } from "@/lib/export/excel"
import type { FiltroDocumento } from "@/lib/export/marca"
import { formatearNumero } from "@/lib/format"

import { hayParciales } from "./calculos"
import { DIMENSION, DIMENSIONES, type Dimension } from "./dimensiones"
import type { DatosMetricasCampana, ResultadosParciales } from "./tipos"

/** Rótulo de las tarjetas: la cifra es de toda la campaña, sin comparativo. */
export const ETIQUETA_CAMPANA = "Toda la campaña"

const SIN_VERIFICADAS = {
  titulo: "Aún no hay negocios verificados",
  descripcion:
    "Los resultados aparecen aquí cuando el equipo AMO verifica la publicación y las métricas de cada medio.",
}

// ── Filas de cada corte ──────────────────────────────────────────────────────

/**
 * Filas del corte listas para mostrar: el corte por fecha se nombra con el
 * día o la semana ("14 oct", "Sem. 12 oct") y va en orden cronológico; los
 * demás conservan el orden de la BD (más inversión primero).
 */
export function filasDeCorte(
  datos: DatosMetricasCampana,
  dimension: Dimension
): FilaDesempeno[] {
  const filas = datos.cortes[dimension]
  if (dimension !== "fecha" || !datos.periodo) return [...filas]
  const { granularidad } = serieDesempeno(
    [],
    datos.periodo.desde,
    datos.periodo.hasta
  )
  const conAnio =
    datos.periodo.desde.slice(0, 4) !== datos.periodo.hasta.slice(0, 4)
  return [...filas]
    .sort((a, b) => a.clave.localeCompare(b.clave))
    .map((fila) => ({
      ...fila,
      nombre: etiquetaPeriodo(fila.clave, granularidad, conAnio),
    }))
}

// ── Tabla ────────────────────────────────────────────────────────────────────

export function columnasCorte(
  dimension: Dimension
): ColumnaReporte<FilaDesempeno>[] {
  return [
    {
      id: "nombre",
      titulo: DIMENSION[dimension].columna,
      tipo: "texto",
      valor: (f) => f.nombre,
    },
    {
      id: "n",
      titulo: "Negocios (n)",
      tipo: "entero",
      valor: (f) => f.n,
      totalizar: true,
    },
    {
      id: "inversion",
      titulo: "Inversión verificada",
      tipo: "cop",
      valor: (f) => f.gmv,
      totalizar: true,
    },
    {
      id: "alcance",
      titulo: "Alcance acumulado",
      tipo: "entero",
      valor: (f) => f.alcance,
      totalizar: true,
    },
    {
      id: "impresiones",
      titulo: "Impresiones",
      tipo: "entero",
      valor: (f) => f.impresiones,
      totalizar: true,
    },
    {
      id: "interacciones",
      titulo: "Interacciones",
      tipo: "entero",
      valor: (f) => f.interacciones,
      totalizar: true,
    },
    {
      id: "reproducciones",
      titulo: "Reproducciones",
      tipo: "entero",
      valor: (f) => f.reproducciones,
      totalizar: true,
      enPdf: false,
    },
    {
      id: "clics",
      titulo: "Clics",
      tipo: "entero",
      valor: (f) => f.clics,
      totalizar: true,
      enPdf: false,
    },
    {
      id: "cpm",
      titulo: "CPM efectivo",
      tipo: "cop",
      valor: (f) => f.cpm,
    },
    {
      id: "costoInteraccion",
      titulo: "Costo por interacción",
      tipo: "cop",
      valor: (f) => f.costoInteraccion,
    },
    {
      id: "engagement",
      titulo: "Engagement",
      tipo: "porcentaje",
      valor: (f) => f.engagement,
    },
    {
      id: "costoAlcance",
      titulo: "Costo por persona alcanzada",
      tipo: "decimal",
      valor: (f) => f.costoAlcance,
    },
  ]
}

// ── Indicadores ──────────────────────────────────────────────────────────────

/** Las sumas del consolidado (alcance, impresiones, interacciones…). */
export function indicadoresResultados(
  datos: DatosMetricasCampana
): IndicadorReporte[] {
  const { totales } = datos
  const suma = (
    clave: string,
    titulo: string,
    actual: number,
    unidad: "COP" | "personas" | "conteo",
    icono: IndicadorReporte["icono"]
  ) =>
    indicador({
      clave,
      titulo,
      actual,
      unidad,
      sentido: clave === "inversion_verificada" ? "neutro" : "mayor",
      definicion: definicionKpi(clave),
      icono,
      sinComparativo: ETIQUETA_CAMPANA,
    })
  return [
    suma(
      "inversion_verificada",
      "Inversión verificada",
      totales.inversion,
      "COP",
      "dinero"
    ),
    suma(
      "alcance_total",
      "Alcance acumulado",
      totales.alcance,
      "personas",
      "alcance"
    ),
    suma(
      "impresiones",
      "Impresiones",
      totales.impresiones,
      "conteo",
      "campanas"
    ),
    suma(
      "interacciones",
      "Interacciones",
      totales.interacciones,
      "conteo",
      "usuarios"
    ),
    suma(
      "reproducciones",
      "Reproducciones",
      totales.reproducciones,
      "conteo",
      "medios"
    ),
    suma("clics", "Clics en el enlace", totales.clics, "conteo", "negocios"),
  ]
}

/**
 * Las métricas derivadas. Son cifras exactas de una sola campaña: se informan
 * siempre, con su n al lado cuando la muestra es pequeña (docs/kpis.md §0.4).
 */
export function indicadoresEficiencia(
  datos: DatosMetricasCampana
): IndicadorReporte[] {
  const { totales, nMinimo } = datos
  const razon = (
    clave: string,
    titulo: string,
    actual: number | null,
    unidad: "COP" | "%",
    icono: IndicadorReporte["icono"]
  ) =>
    indicador({
      clave,
      titulo,
      actual,
      unidad,
      sentido: unidad === "%" ? "mayor" : "menor",
      definicion: definicionKpi(clave),
      n: totales.verificadas,
      nMinimo,
      entidad: true,
      icono,
      sinComparativo: ETIQUETA_CAMPANA,
    })
  return [
    razon("cpm_efectivo", "CPM efectivo", totales.cpm, "COP", "comision"),
    razon(
      "costo_por_interaccion",
      "Costo por interacción",
      totales.costoInteraccion,
      "COP",
      "pago"
    ),
    razon("engagement", "Engagement", totales.engagement, "%", "usuarios"),
    razon(
      "costo_por_alcance",
      "Costo por persona alcanzada",
      totales.costoAlcance,
      "COP",
      "alcance"
    ),
  ]
}

// ── Gráficos ─────────────────────────────────────────────────────────────────

const TOPE_RANKING = 10

function vacioSi(sinDatos: boolean): EspecGrafico["vacio"] {
  return sinDatos ? SIN_VERIFICADAS : false
}

export function graficoDeCorte(
  datos: DatosMetricasCampana,
  dimension: Dimension
): EspecGrafico {
  const filas = filasDeCorte(datos, dimension)
  switch (dimension) {
    case "plataforma": {
      const segmentos = filas.map((f) => ({
        id: f.clave,
        nombre: f.nombre,
        valor: f.alcance,
      }))
      return {
        id: "corte-plataforma",
        tipo: "dona",
        titulo: "Alcance acumulado por plataforma",
        descripcion:
          "Personas alcanzadas en cada red (en TikTok, espectadores únicos).",
        ancho: "mitad",
        segmentos,
        formato: "numero",
        etiquetaTotal: "Alcance acumulado",
        nombreCategoria: "Plataforma",
        vacio: vacioSi(sinValores(segmentos.map((s) => s.valor))),
      }
    }
    case "medio":
    case "municipio": {
      const elementos = filas
        .filter((f) => f.alcance > 0)
        .map((f) => ({ id: f.clave, nombre: f.nombre, valor: f.alcance }))
      return {
        id: `corte-${dimension}`,
        tipo: "ranking",
        titulo:
          dimension === "medio"
            ? "Medios con más alcance"
            : "Municipios con más alcance",
        descripcion: "Alcance acumulado de sus publicaciones verificadas.",
        ancho: "mitad",
        elementos,
        formato: "numero",
        nombreValor: "Alcance acumulado",
        nombreCategoria: DIMENSION[dimension].columna,
        limite: TOPE_RANKING,
        agruparResto: true,
        vacio: vacioSi(elementos.length === 0),
      }
    }
    case "fecha": {
      const serie = datos.periodo
        ? serieDesempeno(
            datos.cortes.fecha,
            datos.periodo.desde,
            datos.periodo.hasta
          )
        : {
            granularidad: "dia" as const,
            etiquetas: [],
            inversion: [],
            alcance: [],
          }
      return {
        id: "corte-fecha",
        tipo: "combo",
        titulo:
          serie.granularidad === "dia"
            ? "Inversión y alcance por día de verificación"
            : "Inversión y alcance por semana de verificación",
        descripcion:
          "Barras: inversión verificada. Línea: alcance acumulado de esos negocios.",
        ancho: "completo",
        etiquetas: serie.etiquetas,
        barras: {
          id: "inversion",
          nombre: "Inversión verificada",
          valores: serie.inversion,
          formato: "cop",
        },
        linea: {
          id: "alcance",
          nombre: "Alcance acumulado",
          valores: serie.alcance,
          formato: "numero",
        },
        vacio: vacioSi(sinValores(serie.inversion)),
      }
    }
  }
}

// ── Avisos y notas ───────────────────────────────────────────────────────────

/**
 * Qué falta por verificar, en palabras: el consolidado solo incluye lo
 * cumplido. Vacío si no hay nada pendiente.
 */
export function avisoParciales(
  verificadas: number,
  parciales: ResultadosParciales
): string | null {
  if (!hayParciales(parciales)) return null
  const { conCortes, enEjecucion } = parciales
  const incluidos =
    verificadas > 0
      ? `Resultados parciales: el consolidado incluye solo ${contar(verificadas, "negocio verificado", "negocios verificados")}.`
      : "Resultados parciales: todavía no hay negocios verificados."
  const conCortesTexto =
    conCortes > 0
      ? `${contar(conCortes, "negocio", "negocios")} ${conCortes === 1 ? "ya tiene" : "ya tienen"} cortes aprobados (${formatearNumero(parciales.alcance)} personas alcanzadas hasta ahora)`
      : null
  const verbo = enEjecucion === 1 ? "sigue" : "siguen"
  const enEjecucionTexto =
    enEjecucion > 0
      ? conCortesTexto
        ? `${formatearNumero(enEjecucion)} ${verbo} en ejecución`
        : `${contar(enEjecucion, "negocio", "negocios")} ${verbo} en ejecución`
      : null
  const pendientes = [conCortesTexto, enEjecucionTexto]
    .filter(Boolean)
    .join(" y ")
  const cierre =
    conCortes + enEjecucion === 1
      ? "se suma cuando el equipo AMO lo verifique"
      : "se suman cuando el equipo AMO los verifique"
  return `${incluidos} ${verificadas > 0 ? "Además, " : ""}${pendientes}; ${cierre}.`
}

export function notasMetricas(nMinimo: number): NotaDefinicion[] {
  const desde = (clave: string, termino?: string): NotaDefinicion[] => {
    const definicion = definicionKpi(clave)
    return definicion
      ? [
          {
            termino: termino ?? definicion.nombre,
            explicacion: `${definicion.definicion} ${definicion.calculo}`,
          },
        ]
      : []
  }
  return [
    {
      termino: "Negocios incluidos",
      explicacion:
        "Solo las asignaciones cumplidas de la campaña: el equipo AMO validó su publicación y aprobó sus métricas. De cada publicación cuenta su último corte aprobado (7 días, 72 horas o 24 horas).",
    },
    {
      termino: "Resultados parciales",
      explicacion:
        "Los negocios que aún no se verifican no entran al consolidado. Sus cortes aprobados se ven uno a uno en la pestaña «Seguimiento».",
    },
    NOTA_ALCANCE,
    ...desde("cpm_efectivo"),
    ...desde("costo_por_interaccion"),
    ...desde("engagement"),
    ...desde("costo_por_alcance", "Costo por persona alcanzada"),
    {
      termino: "Tamaño de muestra (n)",
      explicacion: `Cada fila dice sobre cuántos negocios se calculó. Son cifras exactas de tu campaña; con menos de ${formatearNumero(nMinimo)} negocios, una sola publicación puede mover mucho una razón.`,
    },
    {
      termino: "Totales",
      explicacion:
        "El CPM, el costo por interacción, el engagement y el costo por persona se calculan como cociente de sumas de todos los negocios, nunca como promedio de las razones.",
    },
    {
      termino: "Municipio y fecha",
      explicacion:
        "El municipio es el del medio que publicó. La fecha es la de verificación de cada negocio: por día si las verificaciones caben en un mes; si no, por semana.",
    },
    NOTA_ZONA_HORARIA,
  ]
}

// ── Contenido completo ───────────────────────────────────────────────────────

export function vistaMetricas(datos: DatosMetricasCampana): VistaReporte {
  const aviso = avisoParciales(datos.totales.verificadas, datos.parciales)
  return {
    indicadores: [
      ...indicadoresResultados(datos),
      ...indicadoresEficiencia(datos),
    ],
    graficos: [
      graficoDeCorte(datos, "fecha"),
      graficoDeCorte(datos, "plataforma"),
      graficoDeCorte(datos, "medio"),
      graficoDeCorte(datos, "municipio"),
    ],
    hallazgos: [],
    avisos: aviso ? [aviso] : [],
  }
}

function hojaCorte(
  datos: DatosMetricasCampana,
  dimension: Dimension
): HojaExcel {
  const tabla = tablaExportable(
    `Por ${DIMENSION[dimension].titulo.toLocaleLowerCase("es-CO")}`,
    columnasCorte(dimension),
    filasDeCorte(datos, dimension)
  )
  return {
    nombre: `Por ${DIMENSION[dimension].titulo.toLocaleLowerCase("es-CO")}`,
    titulo: `Resultados por ${DIMENSION[dimension].columna.toLocaleLowerCase("es-CO")}`,
    descripcion: DIMENSION[dimension].descripcion,
    columnas: tabla.columnas,
    filas: tabla.filas,
  }
}

/**
 * Todo lo que necesita un documento: la tabla de detalle es la del corte
 * elegido y el Excel suma una hoja por cada uno de los otros cortes.
 */
export function contenidoMetricas(
  datos: DatosMetricasCampana,
  dimension: Dimension
): ContenidoReporte {
  return {
    vista: vistaMetricas(datos),
    tabla: tablaExportable(
      `Resultados por ${DIMENSION[dimension].columna.toLocaleLowerCase("es-CO")}`,
      columnasCorte(dimension),
      filasDeCorte(datos, dimension),
      DIMENSION[dimension].descripcion
    ),
    hojas: DIMENSIONES.filter((otra) => otra !== dimension).map((otra) =>
      hojaCorte(datos, otra)
    ),
    notas: notasMetricas(datos.nMinimo),
  }
}

/** Filtros en palabras (portada del PDF y del Excel). */
export function filtrosDocumento(
  datos: DatosMetricasCampana,
  dimension: Dimension
): FiltroDocumento[] {
  const { campana } = datos
  return [
    { etiqueta: "Campaña", valor: campana.nombre },
    { etiqueta: "Marca", valor: campana.marca },
    {
      etiqueta: "Vigencia",
      valor: formatearVigencia(campana.fechaInicio, campana.fechaFin),
    },
    { etiqueta: "Corte", valor: DIMENSION[dimension].titulo },
    {
      etiqueta: "Negocios",
      valor: `Solo verificados (${formatearNumero(datos.totales.verificadas)})`,
    },
  ]
}

export const TITULO_DOCUMENTO = "Métricas de campaña"

export const PROPOSITO_DOCUMENTO =
  "Resultados verificados de la campaña: alcance, impresiones, interacciones, reproducciones y clics, con su costo por resultado."

/** Encabezado de los documentos de marca (portada, filtros y sello). */
export function encabezadoMetricas(
  datos: DatosMetricasCampana,
  dimension: Dimension,
  generadoPor: string,
  fecha: Date
): EncabezadoDocumento {
  return {
    reporte: {
      titulo: TITULO_DOCUMENTO,
      proposito: PROPOSITO_DOCUMENTO,
      orientacionPdf: "horizontal",
      filtros: [],
    },
    contexto: {
      filtros: filtrosDocumento(datos, dimension),
      comparacion: null,
      nMinimo: datos.nMinimo,
      periodo: datos.periodo,
    },
    generadoPor,
    fecha,
  }
}
