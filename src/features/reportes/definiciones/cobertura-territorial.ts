/**
 * Cobertura territorial (`reporte_cobertura_territorial`): medios verificados
 * y activos, pauta y alcance por departamento o, con un departamento elegido,
 * por municipio. Módulo puro.
 */
import {
  definirEstadoTabla,
  filtroDeOpciones,
} from "@/components/data-table/estado-url"
import { definicionKpi } from "@/components/kpi/definiciones-kpi"
import { departamentoPorCodigo } from "@/features/geo/departamentos"
import type { HojaExcel } from "@/lib/export/excel"

import type { ColumnaReporte } from "../columnas"
import type { EspecGrafico } from "../graficos"
import { indicador, razon, sumar, variacionRelativa } from "../indicadores"
import type { FacetaReporte } from "../tabla"
import type {
  ContenidoReporte,
  DatosCobertura,
  FilaCobertura,
  FilaZona,
  NotaDefinicion,
  TotalesCobertura,
  VistaReporte,
} from "../tipos"
import {
  definicionPropia,
  NOTA_ALCANCE,
  NOTA_ZONA_HORARIA,
  notaComparacion,
  tablaExportable,
} from "./comun"

export const ESTADOS_COBERTURA = [
  "sin-medios",
  "sin-actividad",
  "activa",
] as const
export type EstadoCobertura = (typeof ESTADOS_COBERTURA)[number]

export const ETIQUETAS_COBERTURA: Readonly<Record<EstadoCobertura, string>> = {
  "sin-medios": "Sin medios",
  "sin-actividad": "Medios sin actividad",
  activa: "Con actividad",
}

export function estadoCobertura(fila: FilaCobertura): EstadoCobertura {
  if (fila.medios === 0) return "sin-medios"
  return fila.mediosActivos > 0 ? "activa" : "sin-actividad"
}

export function nombreZona(fila: FilaCobertura): string {
  return fila.municipio ?? fila.departamento
}

export function totalesCobertura(
  filas: readonly FilaCobertura[]
): TotalesCobertura {
  return {
    medios: sumar(filas, (f) => f.medios),
    mediosActivos: sumar(filas, (f) => f.mediosActivos),
    asignaciones: sumar(filas, (f) => f.asignaciones),
    gmv: sumar(filas, (f) => f.gmv),
    alcance: sumar(filas, (f) => f.alcance),
    poblacion: sumar(filas, (f) => f.poblacion),
    zonasConMedios: filas.filter((f) => f.medios > 0).length,
    zonas: filas.length,
  }
}

// ── Tabla ────────────────────────────────────────────────────────────────────

export const columnasCobertura: readonly ColumnaReporte<FilaCobertura>[] = [
  {
    id: "zona",
    titulo: "Zona",
    tipo: "texto",
    valor: nombreZona,
    ordenable: true,
    buscable: true,
    tarjeta: "titulo",
  },
  {
    id: "codigo",
    titulo: "Código DANE",
    tipo: "texto",
    valor: (f) => f.codigo,
    buscable: true,
    ocultaPorDefecto: true,
    enPdf: false,
  },
  {
    id: "poblacion",
    ocultaPorDefecto: true,
    titulo: "Población",
    tipo: "entero",
    valor: (f) => f.poblacion,
    ordenable: true,
    tarjeta: "oculta",
  },
  {
    id: "medios",
    tituloCorto: "Medios",
    titulo: "Medios verificados",
    tipo: "entero",
    valor: (f) => f.medios,
    ordenable: true,
    totalizar: true,
  },
  {
    id: "mediosActivos",
    tituloCorto: "Activos",
    titulo: "Medios activos",
    tipo: "entero",
    valor: (f) => f.mediosActivos,
    ordenable: true,
    totalizar: true,
  },
  {
    id: "mediosPor100k",
    tituloCorto: "Por 100 mil hab.",
    titulo: "Medios por 100 mil hab.",
    tipo: "decimal",
    valor: (f) => f.mediosPor100k,
    ordenable: true,
    ocultarBajo: "lg",
  },
  {
    id: "asignaciones",
    titulo: "Asignaciones",
    tipo: "entero",
    valor: (f) => f.asignaciones,
    ordenable: true,
    totalizar: true,
    ocultarBajo: "lg",
  },
  {
    id: "gmv",
    tituloCorto: "GMV",
    titulo: "GMV comprometido",
    tipo: "cop",
    valor: (f) => f.gmv,
    ordenable: true,
    totalizar: true,
  },
  {
    id: "variacionGmv",
    tituloCorto: "Var. GMV",
    titulo: "Variación GMV",
    tipo: "porcentaje",
    valor: (f) => variacionRelativa(f.gmv, f.gmvAnterior),
    ordenable: true,
    ocultarBajo: "xl",
  },
  {
    id: "alcance",
    tituloCorto: "Alcance",
    titulo: "Alcance acumulado",
    tipo: "entero",
    valor: (f) => f.alcance,
    ordenable: true,
    totalizar: true,
    ocultarBajo: "lg",
  },
]

/**
 * Por municipio el catálogo no trae población: la columna y la tasa por
 * 100 mil habitantes saldrían vacías en todas las filas, así que no se ofrecen.
 */
const SOLO_POR_DEPARTAMENTO: readonly string[] = ["poblacion", "mediosPor100k"]

const COLUMNAS_POR_MUNICIPIO = columnasCobertura.filter(
  (columna) => !SOLO_POR_DEPARTAMENTO.includes(columna.id)
)

/** Columnas de la tabla (pantalla, Excel y PDF) según el nivel consultado. */
export function columnasCoberturaPara(
  nivel: DatosCobertura["nivel"]
): readonly ColumnaReporte<FilaCobertura>[] {
  return nivel === "municipio" ? COLUMNAS_POR_MUNICIPIO : columnasCobertura
}

export const facetasCobertura: readonly FacetaReporte<FilaCobertura>[] = [
  {
    clave: "cobertura",
    titulo: "Cobertura",
    valor: estadoCobertura,
    etiqueta: (valor) => ETIQUETAS_COBERTURA[valor as EstadoCobertura] ?? valor,
    orden: ESTADOS_COBERTURA,
  },
]

export const estadoTablaCobertura = definirEstadoTabla({
  camposOrden: [
    "zona",
    "poblacion",
    "medios",
    "mediosActivos",
    "mediosPor100k",
    "asignaciones",
    "gmv",
    "variacionGmv",
    "alcance",
  ] as const,
  ordenPorDefecto: { campo: "medios", descendente: true },
  filtros: { cobertura: filtroDeOpciones(ESTADOS_COBERTURA) },
})

// ── Vista ────────────────────────────────────────────────────────────────────

const DEFINICION_MEDIOS = definicionPropia(
  "Medios verificados",
  "conteo",
  "mayor",
  {
    definicion:
      "Medios con verificación vigente al cierre del periodo, ubicados por su municipio.",
    calculo: "Conteo de medios en estado verificado al cierre del periodo.",
    ancla: "Cierre del periodo (foto)",
  }
)

const DEFINICION_COBERTURA = definicionPropia(
  "Zonas con medios",
  "%",
  "mayor",
  {
    definicion:
      "Proporción de departamentos (o municipios del departamento elegido) con al menos un medio verificado.",
    calculo: "Zonas con medios ÷ zonas activas del catálogo.",
    ancla: "Cierre del periodo (foto)",
  }
)

const DEFINICION_ASIGNACIONES = definicionPropia(
  "Asignaciones",
  "conteo",
  "mayor",
  {
    definicion:
      "Negocios aceptados por medios de la zona en el periodo que siguen en pie.",
    calculo: "Conteo de asignaciones aceptadas que aún consumen cupo.",
    ancla: "Fecha de aceptación",
  }
)

function indicadoresCobertura(datos: DatosCobertura) {
  const { totales, anterior } = datos
  return [
    indicador({
      clave: "medios",
      titulo: "Medios verificados",
      actual: totales.medios,
      anterior: anterior.medios,
      unidad: "conteo",
      sentido: "mayor",
      definicion: DEFINICION_MEDIOS,
      icono: "medios",
    }),
    indicador({
      clave: "medios_activos",
      titulo: "Medios activos",
      actual: totales.mediosActivos,
      anterior: anterior.mediosActivos,
      unidad: "conteo",
      sentido: "mayor",
      definicion: definicionKpi("medios_activos"),
      icono: "ingresos",
    }),
    indicador({
      clave: "zonas_con_medios",
      titulo:
        datos.nivel === "municipio"
          ? "Municipios con medios"
          : "Departamentos con medios",
      actual: razon(totales.zonasConMedios, totales.zonas),
      anterior: razon(anterior.zonasConMedios, anterior.zonas),
      unidad: "%",
      sentido: "mayor",
      definicion: DEFINICION_COBERTURA,
      icono: "mapa",
    }),
    indicador({
      clave: "asignaciones",
      titulo: "Asignaciones",
      actual: totales.asignaciones,
      anterior: anterior.asignaciones,
      unidad: "conteo",
      sentido: "mayor",
      definicion: DEFINICION_ASIGNACIONES,
      icono: "negocios",
    }),
    indicador({
      clave: "gmv_comprometido",
      titulo: "GMV comprometido",
      actual: totales.gmv,
      anterior: anterior.gmv,
      unidad: "COP",
      sentido: "mayor",
      definicion: definicionKpi("gmv_comprometido"),
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
  ]
}

function valoresPorDepartamento(
  filas: readonly FilaCobertura[],
  valor: (fila: FilaCobertura) => number
): Record<string, number | null> {
  return Object.fromEntries(
    filas.map((fila) => [fila.departamentoCodigo, valor(fila)])
  )
}

function graficoMapa(datos: DatosCobertura): EspecGrafico {
  const deps = datos.departamentos
  const sinDatos = deps.every(
    (f) => f.medios === 0 && f.gmv === 0 && f.alcance === 0
  )
  return {
    id: "mapa-cobertura",
    tipo: "mapa",
    titulo: "Mapa de cobertura",
    descripcion: datos.departamento
      ? `Todo el país, con ${departamentoPorCodigo(datos.departamento)?.nombre ?? "el departamento elegido"} resaltado.`
      : "Cada departamento según la medida elegida.",
    pie: "Colores por quintiles; rayado = sin datos.",
    ancho: "mitad",
    capas: [
      {
        metrica: "medios",
        etiqueta: "Medios verificados",
        valores: valoresPorDepartamento(deps, (f) => f.medios),
      },
      {
        metrica: "gmv",
        etiqueta: "GMV comprometido",
        valores: valoresPorDepartamento(deps, (f) => f.gmv),
      },
      {
        metrica: "alcance",
        etiqueta: "Alcance",
        valores: valoresPorDepartamento(deps, (f) => f.alcance),
      },
    ],
    destacado: datos.departamento,
    vacio: sinDatos
      ? {
          titulo: "Aún no hay medios ni pauta en el mapa",
          descripcion:
            "Cuando haya medios verificados o negocios en el periodo, cada departamento se colorea según su volumen.",
        }
      : false,
  }
}

/**
 * Nombres del ranking nacional de municipios. `top_zonas` entrega
 * «Medellín (Antioquia)»; el gráfico recorta los nombres largos y dejaría
 * «Santiago de Cali (Val…». El departamento solo se conserva cuando dos
 * municipios del ranking se llaman igual.
 */
export function nombresDeMunicipios(
  zonas: readonly Pick<FilaZona, "codigo" | "nombre">[]
): Map<string, string> {
  const sinDepartamento = (nombre: string) =>
    nombre.replace(/\s*\([^()]*\)\s*$/, "") || nombre
  const veces = new Map<string, number>()
  for (const zona of zonas) {
    const corto = sinDepartamento(zona.nombre)
    veces.set(corto, (veces.get(corto) ?? 0) + 1)
  }
  return new Map(
    zonas.map((zona) => {
      const corto = sinDepartamento(zona.nombre)
      return [zona.codigo, veces.get(corto) === 1 ? corto : zona.nombre]
    })
  )
}

function graficoRankingMedios(datos: DatosCobertura): EspecGrafico {
  const nacional = datos.nivel === "departamento"
  const top = nacional ? datos.topMunicipios : null
  const desdeTop = top !== null
  const nombres = nombresDeMunicipios(top ?? [])
  const zonas = top
    ? top.map((z) => ({
        id: z.codigo,
        nombre: nombres.get(z.codigo) ?? z.nombre,
        valor: z.valor,
      }))
    : datos.filas.map((f) => ({
        id: f.codigo,
        nombre: nombreZona(f),
        valor: f.medios,
      }))
  // Un ranking de «más medios» no lista zonas sin ninguno.
  const elementos = zonas.filter((zona) => zona.valor > 0)
  const titulo =
    desdeTop || !nacional
      ? "Municipios con más medios verificados"
      : "Departamentos con más medios verificados"
  return {
    id: "ranking-medios",
    tipo: "ranking",
    titulo,
    descripcion: datos.departamento
      ? `Municipios de ${departamentoPorCodigo(datos.departamento)?.nombre ?? "el departamento"}.`
      : "Todo el país.",
    ancho: "mitad",
    elementos,
    formato: "numero",
    nombreValor: "Medios verificados",
    nombreCategoria: desdeTop || !nacional ? "Municipio" : "Departamento",
    limite: 10,
    vacio:
      elementos.length === 0
        ? {
            titulo: "Aún no hay medios verificados",
            descripcion:
              "Cuando se verifiquen medios en esta zona, aparecerán aquí ordenados.",
          }
        : false,
  }
}

const TOPE_ACTIVIDAD = 12

function graficoActividad(datos: DatosCobertura): EspecGrafico {
  const zonas = [...datos.filas]
    .filter((f) => f.medios > 0)
    .sort((a, b) => b.medios - a.medios)
    .slice(0, TOPE_ACTIVIDAD)
  return {
    id: "actividad-medios",
    tipo: "apiladas",
    titulo: "Medios activos e inactivos por zona",
    descripcion:
      "De los medios verificados de cada zona, cuántos aceptaron o publicaron algo en el periodo.",
    ancho: "completo",
    // Horizontal: cada zona conserva su nombre aunque sea largo.
    orientacion: "horizontal",
    categorias: zonas.map(nombreZona),
    series: [
      {
        id: "activos",
        nombre: "Activos",
        valores: zonas.map((f) => f.mediosActivos),
      },
      {
        id: "inactivos",
        nombre: "Sin actividad",
        valores: zonas.map((f) => Math.max(0, f.medios - f.mediosActivos)),
      },
    ],
    formato: "numero",
    nombreCategoria: datos.nivel === "municipio" ? "Municipio" : "Departamento",
    vacio:
      zonas.length === 0
        ? { titulo: "Sin medios verificados en esta zona" }
        : false,
  }
}

export function vistaCobertura(datos: DatosCobertura): VistaReporte {
  const avisos =
    datos.nivel === "municipio"
      ? [
          "Por municipio no hay población en el catálogo: la tasa de medios por 100 mil habitantes solo se calcula por departamento (la trae la hoja «Departamentos» del Excel).",
        ]
      : []
  return {
    indicadores: indicadoresCobertura(datos),
    graficos: [
      graficoMapa(datos),
      graficoRankingMedios(datos),
      graficoActividad(datos),
    ],
    hallazgos: [],
    avisos,
  }
}

// ── Exportación ──────────────────────────────────────────────────────────────

function hojasCobertura(datos: DatosCobertura): HojaExcel[] {
  if (datos.nivel === "departamento") return []
  return [
    {
      nombre: "Departamentos",
      titulo: "Contexto nacional por departamento",
      columnas: [
        { titulo: "Departamento" },
        { titulo: "Población", formato: "numero", totalizar: true },
        { titulo: "Medios verificados", formato: "numero", totalizar: true },
        { titulo: "Medios por 100 mil hab.", formato: "decimal" },
        { titulo: "GMV comprometido", formato: "cop", totalizar: true },
      ],
      filas: datos.departamentos.map((f) => [
        f.departamento,
        f.poblacion,
        f.medios,
        f.mediosPor100k,
        f.gmv,
      ]),
    },
  ]
}

export const NOTAS_COBERTURA: readonly NotaDefinicion[] = [
  {
    termino: "Medios verificados",
    explicacion:
      "Medios con verificación vigente al cierre del periodo (una foto, no crece con la duración del rango). Cada medio cuenta en el municipio y el departamento registrados en su ficha.",
  },
  {
    termino: "Medios activos",
    explicacion:
      "Medios verificados que aceptaron una oferta o publicaron en el periodo. La diferencia con los verificados muestra inventario sin uso.",
  },
  {
    termino: "Medios por 100 mil habitantes",
    explicacion:
      "Medios verificados por cada 100.000 habitantes según la proyección de población del DANE. Permite comparar departamentos de tamaños muy distintos.",
  },
  {
    termino: "GMV comprometido y asignaciones",
    explicacion:
      "Negocios aceptados en el periodo que siguen en pie, ubicados en el municipio del medio que publica (no del anunciante).",
  },
  NOTA_ALCANCE,
  notaComparacion(),
  NOTA_ZONA_HORARIA,
]

export function contenidoCobertura(datos: DatosCobertura): ContenidoReporte {
  return {
    vista: vistaCobertura(datos),
    tabla: tablaExportable(
      datos.nivel === "municipio"
        ? "Cobertura por municipio"
        : "Cobertura por departamento",
      columnasCoberturaPara(datos.nivel),
      [...datos.filas].sort((a, b) => b.medios - a.medios)
    ),
    hojas: hojasCobertura(datos),
    notas: NOTAS_COBERTURA,
  }
}
