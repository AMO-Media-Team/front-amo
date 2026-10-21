/**
 * Desempeño de campañas (`reporte_desempeno_campanas` y, para el corte por
 * plataforma, `desempeno_anunciante`). Las razones de cada campaña llegan
 * siempre con su valor; los totales se reconstruyen como cociente de sumas
 * (docs/kpis.md §0.4). Módulo puro.
 */
import {
  definirEstadoTabla,
  filtroDeOpciones,
} from "@/components/data-table/estado-url"
import { definicionKpi } from "@/components/kpi/definiciones-kpi"
import type { HojaExcel } from "@/lib/export/excel"
import { formatearNumero } from "@/lib/format"

import type { ColumnaReporte } from "../columnas"
import { type EspecGrafico, sinValores } from "../graficos"
import { indicador, sumar } from "../indicadores"
import type { FacetaReporte } from "../tabla"
import type {
  ContenidoReporte,
  DatosDesempeno,
  FilaCampana,
  FilaPlataforma,
  NotaDefinicion,
  TotalesDesempeno,
  VistaReporte,
} from "../tipos"
import {
  NOTA_ALCANCE,
  NOTA_ZONA_HORARIA,
  notaComparacion,
  notaMuestra,
  tablaExportable,
} from "./comun"

/**
 * Σ(razón × denominador) / Σ denominador sobre las filas con razón: recupera
 * el cociente de sumas global a partir de las razones por campaña.
 */
export function razonPonderada<T>(
  filas: readonly T[],
  razon: (fila: T) => number | null,
  peso: (fila: T) => number
): { valor: number | null; filas: T[] } {
  const conRazon = filas.filter(
    (fila) => razon(fila) !== null && peso(fila) > 0
  )
  const pesoTotal = sumar(conRazon, peso)
  if (pesoTotal <= 0) return { valor: null, filas: conRazon }
  const ponderado = sumar(conRazon, (fila) => (razon(fila) ?? 0) * peso(fila))
  return { valor: ponderado / pesoTotal, filas: conRazon }
}

export function totalesDesempeno(
  filas: readonly FilaCampana[]
): TotalesDesempeno {
  const cpm = razonPonderada(
    filas,
    (f) => f.cpm,
    (f) => f.impresiones
  )
  const engagement = razonPonderada(
    filas,
    (f) => f.engagement,
    (f) => f.alcance
  )
  const costoAlcance = razonPonderada(
    filas,
    (f) => f.costoPorAlcance,
    (f) => f.alcance
  )
  return {
    campanas: filas.length,
    gmvComprometido: sumar(filas, (f) => f.gmvComprometido),
    gmvVerificado: sumar(filas, (f) => f.gmvVerificado),
    alcance: sumar(filas, (f) => f.alcance),
    impresiones: sumar(filas, (f) => f.impresiones),
    interacciones: sumar(filas, (f) => f.interacciones),
    cpm: cpm.valor,
    engagement: engagement.valor,
    costoPorAlcance: costoAlcance.valor,
    verificadas: sumar(filas, (f) => f.nVerificadas),
  }
}

// ── Tabla ────────────────────────────────────────────────────────────────────

const RESULTADOS = ["con-verificadas", "sin-verificadas"] as const

export const columnasDesempeno: readonly ColumnaReporte<FilaCampana>[] = [
  {
    id: "campana",
    detalle: (f) => f.anunciante,
    titulo: "Campaña",
    tipo: "texto",
    valor: (f) => f.campana,
    ordenable: true,
    buscable: true,
    tarjeta: "titulo",
  },
  {
    id: "anunciante",
    ocultaPorDefecto: true,
    titulo: "Anunciante",
    tipo: "texto",
    valor: (f) => f.anunciante,
    ordenable: true,
    buscable: true,
  },
  {
    id: "ofertas",
    titulo: "Ofertas",
    tipo: "entero",
    valor: (f) => f.ofertas,
    ordenable: true,
    ocultaPorDefecto: true,
    enPdf: false,
  },
  {
    id: "cupos",
    ocultaPorDefecto: true,
    titulo: "Cupos",
    tipo: "entero",
    valor: (f) => f.cupos,
    ordenable: true,
    totalizar: true,
  },
  {
    id: "cuposOcupados",
    titulo: "Cupos ocupados",
    tipo: "entero",
    valor: (f) => f.cuposOcupados,
    ordenable: true,
    ocultaPorDefecto: true,
    totalizar: true,
    enPdf: false,
  },
  {
    id: "tasaLlenado",
    titulo: "Llenado",
    tipo: "porcentaje",
    valor: (f) => f.tasaLlenado,
    ordenable: true,
    ocultarBajo: "lg",
  },
  {
    id: "gmvComprometido",
    titulo: "GMV comprometido",
    tipo: "cop",
    valor: (f) => f.gmvComprometido,
    ordenable: true,
    totalizar: true,
  },
  {
    id: "gmvVerificado",
    titulo: "GMV verificado",
    tipo: "cop",
    valor: (f) => f.gmvVerificado,
    ordenable: true,
    totalizar: true,
  },
  {
    id: "alcance",
    titulo: "Alcance",
    tipo: "entero",
    valor: (f) => f.alcance,
    ordenable: true,
    totalizar: true,
    ocultarBajo: "lg",
  },
  {
    id: "impresiones",
    ocultaPorDefecto: true,
    titulo: "Impresiones",
    tipo: "entero",
    valor: (f) => f.impresiones,
    ordenable: true,
    totalizar: true,
  },
  {
    id: "interacciones",
    titulo: "Interacciones",
    tipo: "entero",
    valor: (f) => f.interacciones,
    ordenable: true,
    totalizar: true,
    ocultaPorDefecto: true,
    enPdf: false,
  },
  {
    id: "reproducciones",
    titulo: "Reproducciones",
    tipo: "entero",
    valor: (f) => f.reproducciones,
    ordenable: true,
    totalizar: true,
    ocultaPorDefecto: true,
    enPdf: false,
  },
  {
    id: "clics",
    titulo: "Clics",
    tipo: "entero",
    valor: (f) => f.clics,
    ordenable: true,
    totalizar: true,
    ocultaPorDefecto: true,
    enPdf: false,
  },
  {
    id: "cpm",
    tituloCorto: "CPM",
    titulo: "CPM efectivo",
    tipo: "cop",
    valor: (f) => f.cpm,
    ordenable: true,
  },
  {
    id: "costoPorInteraccion",
    titulo: "Costo por interacción",
    tipo: "cop",
    valor: (f) => f.costoPorInteraccion,
    ordenable: true,
    ocultaPorDefecto: true,
    enPdf: false,
  },
  {
    id: "engagement",
    titulo: "Engagement",
    tipo: "porcentaje",
    valor: (f) => f.engagement,
    ordenable: true,
    ocultarBajo: "xl",
  },
  {
    id: "costoPorAlcance",
    titulo: "Costo por persona alcanzada",
    tipo: "decimal",
    valor: (f) => f.costoPorAlcance,
    ordenable: true,
    ocultaPorDefecto: true,
    enPdf: false,
  },
  {
    id: "tasaCumplimiento",
    titulo: "Cumplimiento",
    tipo: "porcentaje",
    valor: (f) => f.tasaCumplimiento,
    ordenable: true,
    ocultarBajo: "lg",
  },
  {
    id: "nVerificadas",
    tituloCorto: "Muestra (n)",
    titulo: "Verificadas (n)",
    tipo: "entero",
    valor: (f) => f.nVerificadas,
    ordenable: true,
    totalizar: true,
    ocultarBajo: "xl",
  },
]

export const facetasDesempeno: readonly FacetaReporte<FilaCampana>[] = [
  {
    clave: "resultado",
    titulo: "Resultados",
    valor: (f) => (f.nVerificadas > 0 ? "con-verificadas" : "sin-verificadas"),
    etiqueta: (valor) =>
      valor === "con-verificadas"
        ? "Con negocios verificados"
        : "Sin negocios verificados",
    orden: RESULTADOS,
  },
]

export const estadoTablaDesempeno = definirEstadoTabla({
  camposOrden: [
    "campana",
    "anunciante",
    "ofertas",
    "cupos",
    "cuposOcupados",
    "tasaLlenado",
    "gmvComprometido",
    "gmvVerificado",
    "alcance",
    "impresiones",
    "interacciones",
    "reproducciones",
    "clics",
    "cpm",
    "costoPorInteraccion",
    "engagement",
    "costoPorAlcance",
    "tasaCumplimiento",
    "nVerificadas",
  ] as const,
  ordenPorDefecto: { campo: "gmvComprometido", descendente: true },
  filtros: { resultado: filtroDeOpciones(RESULTADOS) },
})

// ── Vista ────────────────────────────────────────────────────────────────────

function indicadoresDesempeno(datos: DatosDesempeno) {
  const { totales, anterior } = datos
  const nMinimo = datos.contexto.nMinimo
  // De un solo anunciante las razones son exactas: se informan y se comparan
  // siempre; el agregado de varios exige la muestra mínima en ambos periodos.
  const entidad = datos.unAnunciante
  const anteriorSiAlcanza = (valor: number | null) =>
    entidad || anterior.verificadas >= nMinimo ? valor : null
  return [
    indicador({
      clave: "gmv_comprometido",
      titulo: "GMV comprometido",
      actual: totales.gmvComprometido,
      anterior: anterior.gmvComprometido,
      unidad: "COP",
      sentido: "mayor",
      definicion: definicionKpi("gmv_comprometido"),
      icono: "dinero",
    }),
    indicador({
      clave: "gmv_verificado",
      titulo: "GMV verificado",
      actual: totales.gmvVerificado,
      anterior: anterior.gmvVerificado,
      unidad: "COP",
      sentido: "mayor",
      definicion: definicionKpi("gmv_verificado"),
      icono: "dinero",
    }),
    indicador({
      clave: "alcance_total",
      titulo: "Alcance acumulado",
      actual: totales.alcance,
      anterior: anterior.alcance,
      unidad: "personas",
      sentido: "mayor",
      definicion: definicionKpi("alcance_total"),
      icono: "alcance",
    }),
    indicador({
      clave: "impresiones",
      titulo: "Impresiones",
      actual: totales.impresiones,
      anterior: anterior.impresiones,
      unidad: "conteo",
      sentido: "mayor",
      definicion: definicionKpi("impresiones"),
      icono: "campanas",
    }),
    indicador({
      clave: "cpm_efectivo",
      titulo: "CPM efectivo",
      actual: totales.cpm,
      anterior: anteriorSiAlcanza(anterior.cpm),
      unidad: "COP",
      sentido: "menor",
      definicion: definicionKpi("cpm_efectivo"),
      n: totales.verificadas,
      nMinimo,
      entidad,
      icono: "porcentaje",
    }),
    indicador({
      clave: "engagement",
      titulo: "Engagement",
      actual: totales.engagement,
      anterior: anteriorSiAlcanza(anterior.engagement),
      unidad: "%",
      sentido: "mayor",
      definicion: definicionKpi("engagement"),
      n: totales.verificadas,
      nMinimo,
      entidad,
      icono: "usuarios",
    }),
  ]
}

function graficoTopCampanas(datos: DatosDesempeno): EspecGrafico {
  const elementos = datos.filas
    .filter((f) => f.gmvVerificado > 0)
    .map((f) => ({ id: f.id, nombre: f.campana, valor: f.gmvVerificado }))
  return {
    id: "campanas-gmv",
    tipo: "ranking",
    titulo: "Campañas con más GMV verificado",
    descripcion: "Inversión de las campañas en negocios cumplidos.",
    ancho: "mitad",
    elementos,
    formato: "cop",
    nombreValor: "GMV verificado",
    nombreCategoria: "Campaña",
    limite: 10,
    agruparResto: true,
    vacio:
      elementos.length === 0
        ? {
            titulo: "Aún no hay negocios verificados",
            descripcion:
              "Las campañas aparecen aquí cuando se validan las métricas de sus publicaciones.",
          }
        : false,
  }
}

const TOPE_CUPOS = 10

function graficoCupos(datos: DatosDesempeno): EspecGrafico {
  const campanas = [...datos.filas]
    .filter((f) => f.cupos > 0)
    .sort((a, b) => b.cupos - a.cupos)
    .slice(0, TOPE_CUPOS)
  return {
    id: "cupos",
    tipo: "apiladas",
    titulo: "Cupos ocupados y libres",
    descripcion: "Estado actual de los cupos de las campañas con más cupos.",
    ancho: "mitad",
    orientacion: "horizontal",
    categorias: campanas.map((f) => f.campana),
    series: [
      {
        id: "ocupados",
        nombre: "Ocupados",
        valores: campanas.map((f) => f.cuposOcupados),
      },
      {
        id: "libres",
        nombre: "Libres",
        valores: campanas.map((f) => Math.max(0, f.cupos - f.cuposOcupados)),
      },
    ],
    formato: "numero",
    nombreCategoria: "Campaña",
    vacio: campanas.length === 0 ? { titulo: "Sin ofertas publicadas" } : false,
  }
}

function graficosPlataforma(
  porPlataforma: readonly FilaPlataforma[],
  nMinimo: number
): EspecGrafico[] {
  const segmentos = porPlataforma.map((f) => ({
    id: f.plataforma,
    nombre: f.nombre,
    valor: f.gmv,
  }))
  const comparables = porPlataforma.filter(
    (f) => f.cpm !== null && f.n >= nMinimo
  )
  const excluidas = porPlataforma.filter((f) => f.cpm !== null && f.n < nMinimo)
  return [
    {
      id: "plataforma-gmv",
      tipo: "dona",
      titulo: "GMV verificado por plataforma",
      ancho: "mitad",
      segmentos,
      formato: "cop",
      etiquetaTotal: "GMV verificado",
      nombreCategoria: "Plataforma",
      vacio: sinValores(segmentos.map((s) => s.valor))
        ? { titulo: "Sin negocios verificados en el periodo" }
        : false,
    },
    {
      id: "plataforma-cpm",
      tipo: "apiladas",
      titulo: "CPM efectivo por plataforma",
      descripcion:
        "Costo por cada mil impresiones: menor es más eficiente. TikTok usa reproducciones.",
      pie:
        excluidas.length > 0
          ? `Sin comparar por muestra pequeña: ${excluidas.map((f) => `${f.nombre} (n = ${formatearNumero(f.n)})`).join(", ")}.`
          : undefined,
      ancho: "mitad",
      categorias: comparables.map((f) => f.nombre),
      series: [
        {
          id: "cpm",
          nombre: "CPM efectivo",
          valores: comparables.map((f) => f.cpm),
        },
      ],
      formato: "cop",
      nombreCategoria: "Plataforma",
      vacio:
        comparables.length === 0
          ? {
              titulo: "Muestra insuficiente para comparar",
              descripcion: `Cada plataforma necesita al menos ${formatearNumero(nMinimo)} negocios verificados con impresiones.`,
            }
          : false,
    },
  ]
}

export function vistaDesempeno(datos: DatosDesempeno): VistaReporte {
  const avisos = datos.porPlataforma
    ? []
    : [
        "El corte por plataforma no admite el filtro de anunciante, así que no se muestra mientras ese filtro esté activo.",
      ]
  return {
    indicadores: indicadoresDesempeno(datos),
    graficos: [
      graficoTopCampanas(datos),
      graficoCupos(datos),
      ...(datos.porPlataforma
        ? graficosPlataforma(datos.porPlataforma, datos.contexto.nMinimo)
        : []),
    ],
    hallazgos: [],
    avisos,
  }
}

// ── Exportación ──────────────────────────────────────────────────────────────

function hojasDesempeno(datos: DatosDesempeno): HojaExcel[] {
  if (!datos.porPlataforma) return []
  return [
    {
      nombre: "Por plataforma",
      titulo: "Negocios verificados por plataforma",
      columnas: [
        { titulo: "Plataforma" },
        { titulo: "Asignaciones", formato: "numero", totalizar: true },
        { titulo: "GMV verificado", formato: "cop", totalizar: true },
        { titulo: "Alcance", formato: "numero", totalizar: true },
        { titulo: "Impresiones", formato: "numero", totalizar: true },
        { titulo: "CPM efectivo", formato: "cop" },
        { titulo: "Engagement", formato: "porcentaje" },
      ],
      filas: datos.porPlataforma.map((f) => [
        f.nombre,
        f.asignaciones,
        f.gmv,
        f.alcance,
        f.impresiones,
        f.cpm,
        f.engagement,
      ]),
    },
  ]
}

export function notasDesempeno(nMinimo: number): NotaDefinicion[] {
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
      termino: "Campañas incluidas",
      explicacion:
        "Campañas (no borradores) cuyas fechas se cruzan con el periodo. GMV comprometido por fecha de aceptación; GMV verificado y resultados por fecha de verificación de las métricas.",
    },
    ...desde("tasa_llenado", "Llenado"),
    ...desde("cpm_efectivo"),
    ...desde("costo_por_interaccion"),
    ...desde("engagement"),
    ...desde("costo_por_alcance", "Costo por persona alcanzada"),
    NOTA_ALCANCE,
    {
      termino: "Totales",
      explicacion:
        "Los totales de CPM, engagement y costo por persona se calculan como cociente de sumas de todas las campañas, nunca como promedio de sus razones.",
    },
    notaMuestra(nMinimo),
    notaComparacion(),
    NOTA_ZONA_HORARIA,
  ]
}

export function contenidoDesempeno(datos: DatosDesempeno): ContenidoReporte {
  return {
    vista: vistaDesempeno(datos),
    tabla: tablaExportable(
      "Desempeño por campaña",
      columnasDesempeno,
      datos.filas
    ),
    hojas: hojasDesempeno(datos),
    notas: notasDesempeno(datos.contexto.nMinimo),
  }
}
