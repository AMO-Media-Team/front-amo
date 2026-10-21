/**
 * Cumplimiento de medios (`reporte_cumplimiento_medios`): por medio, las
 * asignaciones cuyo plazo de publicación venció en el periodo, cuántas se
 * publicaron a tiempo, las vencidas, las disputas y las alertas de métricas.
 * Módulo puro.
 */
import { parseAsArrayOf } from "nuqs/server"

import {
  definirEstadoTabla,
  filtroDeOpciones,
  parseAsBusqueda,
} from "@/components/data-table/estado-url"
import { definicionKpi } from "@/components/kpi/definiciones-kpi"
import type { HojaExcel } from "@/lib/export/excel"

import type { ColumnaReporte } from "../columnas"
import { type EspecGrafico, sinValores } from "../graficos"
import { indicador, razon, sumar } from "../indicadores"
import type { FacetaReporte } from "../tabla"
import type {
  ContenidoReporte,
  DatosCumplimiento,
  FilaCumplimiento,
  NotaDefinicion,
  TotalesCumplimiento,
  VistaReporte,
} from "../tipos"
import {
  definicionPropia,
  NOTA_ZONA_HORARIA,
  notaComparacion,
  notaMuestra,
  tablaExportable,
} from "./comun"

export const SITUACIONES = [
  "con-vencidas",
  "con-alertas",
  "sin-novedad",
] as const
export type Situacion = (typeof SITUACIONES)[number]

export const ETIQUETAS_SITUACION: Readonly<Record<Situacion, string>> = {
  "con-vencidas": "Con vencidas",
  "con-alertas": "Con alertas de métricas",
  "sin-novedad": "Sin novedades",
}

/** Una sola situación por medio: la más grave manda. */
export function situacionMedio(fila: FilaCumplimiento): Situacion {
  if (fila.vencidas > 0) return "con-vencidas"
  if (fila.alertas > 0) return "con-alertas"
  return "sin-novedad"
}

/** "Envigado, Antioquia"; sin repetir cuando municipio y departamento se llaman igual. */
export function ubicacionMedio(fila: FilaCumplimiento): string | null {
  const partes = [fila.municipio, fila.departamento].filter(
    (parte, indice, todas): parte is string =>
      Boolean(parte) && todas.indexOf(parte) === indice
  )
  return partes.length > 0 ? partes.join(", ") : null
}

export function totalesCumplimiento(
  filas: readonly FilaCumplimiento[]
): TotalesCumplimiento {
  return {
    medios: filas.length,
    comprometidas: sumar(filas, (f) => f.comprometidas),
    cumplidas: sumar(filas, (f) => f.cumplidas),
    vencidas: sumar(filas, (f) => f.vencidas),
    enDisputa: sumar(filas, (f) => f.enDisputa),
    alertas: sumar(filas, (f) => f.alertas),
  }
}

// ── Tabla ────────────────────────────────────────────────────────────────────

export const columnasCumplimiento: readonly ColumnaReporte<FilaCumplimiento>[] =
  [
    {
      id: "medio",
      detalle: ubicacionMedio,
      titulo: "Medio",
      tipo: "texto",
      valor: (f) => f.medio,
      ordenable: true,
      buscable: true,
      tarjeta: "titulo",
    },
    {
      id: "departamento",
      ocultaPorDefecto: true,
      titulo: "Departamento",
      tipo: "texto",
      valor: (f) => f.departamento,
      ordenable: true,
      buscable: true,
    },
    {
      id: "municipio",
      ocultaPorDefecto: true,
      titulo: "Municipio",
      tipo: "texto",
      valor: (f) => f.municipio,
      ordenable: true,
      buscable: true,
    },
    {
      id: "nivel",
      titulo: "Nivel",
      tipo: "entero",
      valor: (f) => f.nivel,
      ordenable: true,
      ocultarBajo: "xl",
    },
    {
      id: "comprometidas",
      titulo: "Evaluadas",
      tipo: "entero",
      valor: (f) => f.comprometidas,
      ordenable: true,
      totalizar: true,
    },
    {
      id: "cumplidas",
      titulo: "Cumplidas",
      tipo: "entero",
      valor: (f) => f.cumplidas,
      ordenable: true,
      totalizar: true,
    },
    {
      id: "vencidas",
      titulo: "Vencidas",
      tipo: "entero",
      valor: (f) => f.vencidas,
      ordenable: true,
      totalizar: true,
    },
    {
      id: "canceladas",
      titulo: "Canceladas",
      tipo: "entero",
      valor: (f) => f.canceladas,
      ordenable: true,
      totalizar: true,
      ocultaPorDefecto: true,
    },
    {
      id: "enDisputa",
      titulo: "En disputa",
      tipo: "entero",
      valor: (f) => f.enDisputa,
      ordenable: true,
      totalizar: true,
      ocultarBajo: "xl",
    },
    {
      id: "tasa",
      titulo: "Cumplimiento",
      tipo: "porcentaje",
      valor: (f) => f.tasa,
      ordenable: true,
    },
    {
      id: "alertas",
      tituloCorto: "Alertas",
      titulo: "Alertas de métricas",
      tipo: "entero",
      valor: (f) => f.alertas,
      ordenable: true,
      totalizar: true,
      ocultarBajo: "lg",
    },
    {
      id: "multiplicador",
      tituloCorto: "Multiplicador",
      titulo: "Multiplicador de calidad",
      tipo: "decimal",
      valor: (f) => f.multiplicador,
      ordenable: true,
      ocultarBajo: "xl",
    },
  ]

export const facetasCumplimiento: readonly FacetaReporte<FilaCumplimiento>[] = [
  {
    clave: "situacion",
    titulo: "Situación",
    valor: situacionMedio,
    etiqueta: (valor) => ETIQUETAS_SITUACION[valor as Situacion] ?? valor,
    orden: SITUACIONES,
  },
  {
    clave: "zona",
    titulo: "Departamento",
    valor: (f) => f.departamento,
  },
]

export const estadoTablaCumplimiento = definirEstadoTabla({
  camposOrden: [
    "medio",
    "departamento",
    "municipio",
    "nivel",
    "comprometidas",
    "cumplidas",
    "vencidas",
    "canceladas",
    "enDisputa",
    "tasa",
    "alertas",
    "multiplicador",
  ] as const,
  ordenPorDefecto: { campo: "comprometidas", descendente: true },
  filtros: {
    situacion: filtroDeOpciones(SITUACIONES),
    zona: parseAsArrayOf(parseAsBusqueda, ",").withDefault([]),
  },
})

// ── Vista ────────────────────────────────────────────────────────────────────

const DEFINICION_EVALUADAS = definicionPropia(
  "Asignaciones evaluadas",
  "conteo",
  "neutro",
  {
    definicion:
      "Asignaciones aceptadas cuyo plazo de publicación venció en el periodo y ya tienen resultado conocido.",
    calculo:
      "Se excluyen las desistidas a tiempo, las canceladas por causa administrativa o acuerdo y las que esperan validación o una disputa.",
    ancla: "Fecha límite de publicación",
  }
)

const DEFINICION_VENCIDAS = definicionPropia(
  "Vencidas sin publicar",
  "conteo",
  "menor",
  {
    definicion: "Asignaciones cuyo plazo venció sin que el medio publicara.",
    calculo: "Conteo de asignaciones en estado vencida sin publicar.",
    ancla: "Fecha límite de publicación",
  }
)

const DEFINICION_ALERTAS = definicionPropia(
  "Alertas de métricas",
  "conteo",
  "menor",
  {
    definicion:
      "Reportes de métricas que se desvían del histórico del medio o superan el alcance esperable para sus seguidores.",
    calculo: "Conteo de métricas con alerta cargadas en el periodo.",
    ancla: "Fecha de carga de la métrica",
  }
)

const DEFINICION_DISPUTA = definicionPropia("En disputa", "conteo", "menor", {
  definicion: "Asignaciones del periodo con una disputa abierta.",
  calculo: "Conteo de asignaciones en estado en disputa.",
  ancla: "Fecha límite de publicación",
})

function indicadoresCumplimiento(datos: DatosCumplimiento) {
  const { totales, anterior } = datos
  const nMinimo = datos.contexto.nMinimo
  return [
    indicador({
      clave: "tasa_cumplimiento",
      titulo: "Tasa de cumplimiento",
      actual: razon(totales.cumplidas, totales.comprometidas),
      anterior:
        anterior.comprometidas >= nMinimo
          ? razon(anterior.cumplidas, anterior.comprometidas)
          : null,
      unidad: "%",
      sentido: "mayor",
      definicion: definicionKpi("tasa_cumplimiento"),
      n: totales.comprometidas,
      nMinimo,
      icono: "escudo",
    }),
    indicador({
      clave: "evaluadas",
      titulo: "Asignaciones evaluadas",
      actual: totales.comprometidas,
      anterior: anterior.comprometidas,
      unidad: "conteo",
      sentido: "neutro",
      definicion: DEFINICION_EVALUADAS,
      icono: "negocios",
    }),
    indicador({
      clave: "cumplidas",
      titulo: "Publicadas a tiempo",
      actual: totales.cumplidas,
      anterior: anterior.cumplidas,
      unidad: "conteo",
      sentido: "mayor",
      definicion: definicionKpi("tasa_cumplimiento"),
      icono: "campanas",
    }),
    indicador({
      clave: "vencidas",
      titulo: "Vencidas sin publicar",
      actual: totales.vencidas,
      anterior: anterior.vencidas,
      unidad: "conteo",
      sentido: "menor",
      definicion: DEFINICION_VENCIDAS,
      icono: "reloj",
    }),
    indicador({
      clave: "en_disputa",
      titulo: "En disputa",
      actual: totales.enDisputa,
      anterior: anterior.enDisputa,
      unidad: "conteo",
      sentido: "menor",
      definicion: DEFINICION_DISPUTA,
      icono: "alerta",
    }),
    indicador({
      clave: "alertas",
      titulo: "Alertas de métricas",
      actual: totales.alertas,
      anterior: anterior.alertas,
      unidad: "conteo",
      sentido: "menor",
      definicion: DEFINICION_ALERTAS,
      icono: "fallos",
    }),
  ]
}

function graficoResultado(datos: DatosCumplimiento): EspecGrafico {
  const { totales } = datos
  const otras = Math.max(
    0,
    totales.comprometidas - totales.cumplidas - totales.vencidas
  )
  const segmentos = [
    {
      id: "cumplidas",
      nombre: "Publicadas a tiempo",
      valor: totales.cumplidas,
    },
    {
      id: "vencidas",
      nombre: "Vencidas sin publicar",
      valor: totales.vencidas,
    },
    { id: "otras", nombre: "Otras incumplidas", valor: otras },
  ]
  return {
    id: "resultado",
    tipo: "dona",
    titulo: "Resultado de las asignaciones evaluadas",
    descripcion:
      "«Otras incumplidas»: publicadas fuera de plazo o canceladas por incumplimiento.",
    ancho: "mitad",
    segmentos,
    formato: "numero",
    etiquetaTotal: "Evaluadas",
    nombreCategoria: "Resultado",
    vacio:
      totales.comprometidas === 0
        ? {
            titulo: "Ningún plazo de publicación venció en el periodo",
            descripcion:
              "La tasa se calcula cuando vencen los plazos de las asignaciones aceptadas.",
          }
        : false,
  }
}

const TOPE_ZONAS = 10

function graficoPorZona(datos: DatosCumplimiento): EspecGrafico {
  const porMunicipio = datos.departamento !== null
  const grupos = new Map<string, { cumplidas: number; comprometidas: number }>()
  for (const fila of datos.filas) {
    const zona =
      (porMunicipio ? fila.municipio : fila.departamento) ?? "Sin ubicación"
    const acumulado = grupos.get(zona) ?? { cumplidas: 0, comprometidas: 0 }
    acumulado.cumplidas += fila.cumplidas
    acumulado.comprometidas += fila.comprometidas
    grupos.set(zona, acumulado)
  }
  const zonas = [...grupos.entries()]
    .filter(([, g]) => g.comprometidas > 0)
    .sort(([, a], [, b]) => b.comprometidas - a.comprometidas)
    .slice(0, TOPE_ZONAS)
  return {
    id: "por-zona",
    tipo: "apiladas",
    titulo: porMunicipio
      ? "Cumplidas e incumplidas por municipio"
      : "Cumplidas e incumplidas por departamento",
    descripcion:
      "Zonas con más asignaciones evaluadas, según la ubicación del medio.",
    ancho: "mitad",
    orientacion: "horizontal",
    categorias: zonas.map(([zona]) => zona),
    series: [
      {
        id: "cumplidas",
        nombre: "Publicadas a tiempo",
        valores: zonas.map(([, g]) => g.cumplidas),
      },
      {
        id: "incumplidas",
        nombre: "Incumplidas",
        valores: zonas.map(([, g]) => g.comprometidas - g.cumplidas),
      },
    ],
    formato: "numero",
    nombreCategoria: porMunicipio ? "Municipio" : "Departamento",
    vacio:
      zonas.length === 0 ? { titulo: "Sin asignaciones evaluadas" } : false,
  }
}

function graficoRanking(
  datos: DatosCumplimiento,
  {
    id,
    titulo,
    nombreValor,
    valor,
    vacio,
  }: {
    id: string
    titulo: string
    nombreValor: string
    valor: (fila: FilaCumplimiento) => number
    vacio: string
  }
): EspecGrafico {
  const elementos = datos.filas
    .filter((f) => valor(f) > 0)
    .map((f) => ({ id: f.id, nombre: f.medio, valor: valor(f) }))
  return {
    id,
    tipo: "ranking",
    titulo,
    ancho: "mitad",
    elementos,
    formato: "numero",
    nombreValor,
    nombreCategoria: "Medio",
    limite: 10,
    vacio: sinValores(elementos.map((e) => e.valor))
      ? { titulo: vacio }
      : false,
  }
}

export function vistaCumplimiento(datos: DatosCumplimiento): VistaReporte {
  return {
    indicadores: indicadoresCumplimiento(datos),
    graficos: [
      graficoResultado(datos),
      graficoPorZona(datos),
      graficoRanking(datos, {
        id: "vencidas",
        titulo: "Medios con más asignaciones vencidas",
        nombreValor: "Vencidas",
        valor: (f) => f.vencidas,
        vacio: "Ningún medio dejó vencer asignaciones",
      }),
      graficoRanking(datos, {
        id: "alertas",
        titulo: "Medios con más alertas de métricas",
        nombreValor: "Alertas",
        valor: (f) => f.alertas,
        vacio: "Sin alertas de métricas en el periodo",
      }),
    ],
    hallazgos: [],
    avisos: [],
  }
}

// ── Exportación ──────────────────────────────────────────────────────────────

function hojasCumplimiento(datos: DatosCumplimiento): HojaExcel[] {
  const { totales } = datos
  return [
    {
      nombre: "Resumen",
      titulo: "Resultado de las asignaciones evaluadas",
      columnas: [
        { titulo: "Resultado" },
        { titulo: "Asignaciones", formato: "numero", totalizar: true },
      ],
      filas: [
        ["Publicadas a tiempo", totales.cumplidas],
        ["Vencidas sin publicar", totales.vencidas],
        [
          "Otras incumplidas",
          Math.max(
            0,
            totales.comprometidas - totales.cumplidas - totales.vencidas
          ),
        ],
      ],
    },
  ]
}

export function notasCumplimiento(nMinimo: number): NotaDefinicion[] {
  return [
    {
      termino: "Tasa de cumplimiento",
      explicacion:
        "De las asignaciones aceptadas cuyo plazo de publicación venció en el periodo, cuántas se publicaron a tiempo con la evidencia validada por el equipo. Meta: 90 % o más.",
    },
    {
      termino: "Evaluadas",
      explicacion:
        "No cuentan las asignaciones a las que el medio renunció a tiempo, las canceladas por causa administrativa o de común acuerdo, ni las que aún esperan validación de la evidencia o la resolución de una disputa.",
    },
    {
      termino: "Vencidas, canceladas y en disputa",
      explicacion:
        "Estado actual de las asignaciones del periodo. Una cancelada por incumplimiento o fraude cuenta como incumplida.",
    },
    {
      termino: "Alertas de métricas",
      explicacion:
        "Métricas cargadas en el periodo que se desvían mucho del histórico del medio o superan el alcance esperable para sus seguidores. No son fraude por sí mismas: piden revisión.",
    },
    {
      termino: "Multiplicador de calidad",
      explicacion:
        "Promedio del multiplicador de las cuentas verificadas del medio. Ajusta su precio según su desempeño histórico: 1,00 es el precio base; menos de 1, un precio menor; más de 1, uno mayor.",
    },
    notaMuestra(nMinimo),
    notaComparacion(),
    NOTA_ZONA_HORARIA,
  ]
}

export function contenidoCumplimiento(
  datos: DatosCumplimiento
): ContenidoReporte {
  return {
    vista: vistaCumplimiento(datos),
    tabla: tablaExportable(
      "Cumplimiento por medio",
      columnasCumplimiento,
      datos.filas
    ),
    hojas: hojasCumplimiento(datos),
    notas: notasCumplimiento(datos.contexto.nMinimo),
  }
}
