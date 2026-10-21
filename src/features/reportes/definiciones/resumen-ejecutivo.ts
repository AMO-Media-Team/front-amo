/**
 * Resumen ejecutivo (`reporte_resumen_ejecutivo` = las 16 tarjetas de
 * `kpis_admin`, más `serie_gmv`, `mezcla_plataformas` y `top_zonas`).
 * Módulo puro: indicadores, gráficos, hallazgos, tabla y notas.
 */
import {
  CLAVES_KPIS_ADMIN,
  definicionKpi,
} from "@/components/kpi/definiciones-kpi"
import type { FilaKpi } from "@/components/kpi/tipos"
import {
  definirEstadoTabla,
  filtroDeOpciones,
} from "@/components/data-table/estado-url"
import { generarInsights } from "@/features/dashboard/insights/motor"
import type {
  ConfigInsights,
  FilaDesglose,
} from "@/features/dashboard/insights/tipos"
import type { HojaExcel } from "@/lib/export/excel"
import { formatearNumero } from "@/lib/format"

import type { ColumnaReporte } from "../columnas"
import {
  alinearSerie,
  type EspecGrafico,
  etiquetaPeriodo,
  sinValores,
} from "../graficos"
import {
  type IconoIndicador,
  type IndicadorReporte,
  indicadorDesdeFila,
  textoAnteriorIndicador,
  textoValorIndicador,
  textoVariacionIndicador,
  variacionRelativa,
} from "../indicadores"
import type { FacetaReporte } from "../tabla"
import type {
  ContenidoReporte,
  DatosResumen,
  FilaZona,
  NotaDefinicion,
  VistaReporte,
} from "../tipos"
import {
  NOMBRE_PLATAFORMA,
  NOTA_ALCANCE,
  NOTA_GMV,
  NOTA_ZONA_HORARIA,
  notaComparacion,
  notaMuestra,
  PLATAFORMAS,
  tablaExportable,
} from "./comun"

type ClaveAdmin = (typeof CLAVES_KPIS_ADMIN)[number]

/** Las ocho tarjetas de cabecera; las 16 están en la tabla. */
export const KPIS_CABECERA: readonly ClaveAdmin[] = [
  "gmv_verificado",
  "gmv_comprometido",
  "comision",
  "take_rate",
  "negocios_cerrados",
  "tasa_cumplimiento",
  "alcance_total",
  "medios_activos",
]

const ICONOS: Readonly<Partial<Record<ClaveAdmin, IconoIndicador>>> = {
  gmv_verificado: "dinero",
  gmv_comprometido: "dinero",
  comision: "comision",
  take_rate: "porcentaje",
  negocios_cerrados: "negocios",
  tasa_cumplimiento: "escudo",
  alcance_total: "alcance",
  medios_activos: "medios",
}

export const AREAS_KPI = ["dinero", "operacion", "red"] as const
export type AreaKpi = (typeof AREAS_KPI)[number]

export const ETIQUETAS_AREA: Readonly<Record<AreaKpi, string>> = {
  dinero: "Dinero",
  operacion: "Operación",
  red: "Medios y anunciantes",
}

const AREA_DE: Readonly<Record<ClaveAdmin, AreaKpi>> = {
  gmv_comprometido: "dinero",
  gmv_verificado: "dinero",
  comision: "dinero",
  take_rate: "dinero",
  ticket_promedio: "dinero",
  negocios_cerrados: "operacion",
  ofertas_publicadas: "operacion",
  tasa_llenado: "operacion",
  tiempo_medio_llenado_h: "operacion",
  tasa_aceptacion: "operacion",
  tasa_cumplimiento: "operacion",
  alcance_total: "operacion",
  medios_activos: "red",
  medios_nuevos: "red",
  medios_en_riesgo: "red",
  anunciantes_activos: "red",
}

type ValorZona = Pick<FilaZona, "codigo" | "nombre" | "valor" | "participacion">

/**
 * Ranking por zona con el comparativo del reporte. `top_zonas` compara
 * siempre con los N días previos; el reporte, con el periodo alineado
 * (este mes contra los mismos días del anterior, docs/kpis.md §0.1). Por eso
 * el valor anterior sale de una segunda lectura con ese periodo y no de la
 * RPC. Una zona que solo tuvo valor antes entra en cero: explica una caída.
 */
export function zonasComparadas(
  actuales: readonly ValorZona[],
  anteriores: readonly ValorZona[]
): FilaZona[] {
  const previo = new Map(anteriores.map((zona) => [zona.codigo, zona.valor]))
  const presentes = new Set(actuales.map((zona) => zona.codigo))
  const delPeriodo = actuales.map((zona): FilaZona => {
    const valorAnterior = previo.get(zona.codigo) ?? 0
    return {
      codigo: zona.codigo,
      nombre: zona.nombre,
      valor: zona.valor,
      participacion: zona.participacion,
      valorAnterior,
      variacion: variacionRelativa(zona.valor, valorAnterior),
    }
  })
  const soloAntes = anteriores
    .filter((zona) => zona.valor !== 0 && !presentes.has(zona.codigo))
    .map((zona): FilaZona => ({
      codigo: zona.codigo,
      nombre: zona.nombre,
      valor: 0,
      participacion: 0,
      valorAnterior: zona.valor,
      variacion: variacionRelativa(0, zona.valor),
    }))
  return [...delPeriodo, ...soloAntes]
}

function ordenarPorCatalogo(kpis: readonly FilaKpi[]): FilaKpi[] {
  const posicion = (clave: string) => {
    const indice = (CLAVES_KPIS_ADMIN as readonly string[]).indexOf(clave)
    return indice === -1 ? CLAVES_KPIS_ADMIN.length : indice
  }
  return [...kpis].sort((a, b) => posicion(a.kpi) - posicion(b.kpi))
}

// ── Tabla: los 16 indicadores con su comparativo ─────────────────────────────

export type FilaIndicadorResumen = {
  clave: string
  orden: number
  area: AreaKpi
  indicador: string
  valor: string
  anterior: string
  variacion: string
  n: number | null
  queMide: string
}

export function filasResumen(datos: DatosResumen): FilaIndicadorResumen[] {
  return ordenarPorCatalogo(datos.kpis).map((fila, indice) => {
    const ind = indicadorDesdeFila(fila, datos.contexto.nMinimo)
    return {
      clave: fila.kpi,
      orden: indice + 1,
      area: AREA_DE[fila.kpi as ClaveAdmin] ?? "operacion",
      indicador: ind.titulo,
      // La muestra va en su propia columna: aquí no se repite.
      valor: textoValorIndicador(ind, { conMuestra: false }),
      anterior: textoAnteriorIndicador(ind),
      variacion: textoVariacionIndicador(ind),
      n: ind.definicion?.exigeMuestra ? ind.n : null,
      queMide: ind.definicion?.definicion ?? "",
    }
  })
}

export const columnasResumen: readonly ColumnaReporte<FilaIndicadorResumen>[] =
  [
    {
      id: "orden",
      titulo: "N.º",
      tipo: "entero",
      valor: (f) => f.orden,
      ordenable: true,
      ocultaPorDefecto: true,
      enPdf: false,
    },
    {
      id: "indicador",
      titulo: "Indicador",
      tipo: "texto",
      valor: (f) => f.indicador,
      ordenable: true,
      buscable: true,
      tarjeta: "titulo",
    },
    {
      id: "area",
      titulo: "Área",
      tipo: "texto",
      valor: (f) => ETIQUETAS_AREA[f.area],
      ordenable: true,
      ocultarBajo: "xl",
      // En el PDF vertical el ancho es para las cifras y la definición.
      enPdf: false,
    },
    {
      id: "valor",
      cifras: true,
      titulo: "Periodo actual",
      tipo: "texto",
      valor: (f) => f.valor,
    },
    {
      id: "anterior",
      cifras: true,
      titulo: "Periodo anterior",
      tipo: "texto",
      valor: (f) => f.anterior,
    },
    {
      id: "variacion",
      cifras: true,
      titulo: "Variación",
      tipo: "texto",
      valor: (f) => f.variacion,
    },
    {
      id: "n",
      titulo: "Muestra (n)",
      tipo: "entero",
      valor: (f) => f.n,
      ocultarBajo: "lg",
    },
    {
      id: "queMide",
      titulo: "Qué mide",
      tipo: "texto",
      valor: (f) => f.queMide,
      buscable: true,
      envolver: true,
      ocultarBajo: "xl",
      tarjeta: "oculta",
    },
  ]

export const facetasResumen: readonly FacetaReporte<FilaIndicadorResumen>[] = [
  {
    clave: "area",
    titulo: "Área",
    valor: (f) => f.area,
    etiqueta: (valor) => ETIQUETAS_AREA[valor as AreaKpi] ?? valor,
    orden: AREAS_KPI,
  },
]

export const estadoTablaResumen = definirEstadoTabla({
  camposOrden: ["orden", "indicador", "area"] as const,
  ordenPorDefecto: { campo: "orden", descendente: false },
  filtros: { area: filtroDeOpciones(AREAS_KPI) },
})

// ── Vista ────────────────────────────────────────────────────────────────────

function indicadoresCabecera(datos: DatosResumen): IndicadorReporte[] {
  const porClave = new Map(datos.kpis.map((fila) => [fila.kpi, fila]))
  return KPIS_CABECERA.flatMap((clave) => {
    const fila = porClave.get(clave)
    return fila
      ? [
          indicadorDesdeFila(
            fila,
            datos.contexto.nMinimo,
            ICONOS[clave] ?? null
          ),
        ]
      : []
  })
}

function graficoTendencia(datos: DatosResumen): EspecGrafico {
  const actual = datos.serie.map((p) => p.gmvVerificado)
  const anterior = alinearSerie(
    datos.serieAnterior.map((p) => p.gmvVerificado),
    actual.length
  )
  return {
    id: "tendencia-gmv",
    tipo: "tendencia",
    titulo: "GMV verificado en el tiempo",
    descripcion:
      "Valor de los negocios cumplidos en cada tramo del periodo, frente al periodo anterior (línea discontinua).",
    pie: "Ancla: fecha de verificación de las métricas.",
    ancho: "completo",
    etiquetas: datos.serie.map((p) =>
      etiquetaPeriodo(p.periodo, datos.granularidad)
    ),
    series: [
      { id: "gmv_verificado", nombre: "GMV verificado", valores: actual },
    ],
    anterior: { nombre: "Periodo anterior", valores: anterior },
    formato: "cop",
    vacio:
      sinValores(actual) && sinValores(anterior)
        ? {
            titulo: "Aún no hay negocios verificados",
            descripcion:
              "Cuando se validen las métricas de las primeras asignaciones, verás aquí su evolución.",
          }
        : false,
  }
}

function graficoPlataformas(datos: DatosResumen): EspecGrafico {
  const segmentos = PLATAFORMAS.map((plataforma) => ({
    id: plataforma,
    nombre: NOMBRE_PLATAFORMA[plataforma],
    valor: datos.mezcla
      .filter((fila) => fila.plataforma === plataforma)
      .reduce((total, fila) => total + fila.gmv, 0),
  }))
  return {
    id: "gmv-plataforma",
    tipo: "dona",
    titulo: "GMV verificado por plataforma",
    descripcion: "Participación de cada red social en los negocios cumplidos.",
    ancho: "mitad",
    segmentos,
    formato: "cop",
    etiquetaTotal: "GMV verificado",
    nombreCategoria: "Plataforma",
    vacio: sinValores(segmentos.map((s) => s.valor))
      ? { titulo: "Sin negocios verificados en el periodo" }
      : false,
  }
}

function graficoZonas(datos: DatosResumen): EspecGrafico | null {
  if (!datos.zonas) return null
  // Las zonas que solo vendieron en el periodo anterior no entran al ranking.
  const elementos = datos.zonas
    .filter((zona) => zona.valor > 0)
    .map((zona) => ({
      id: zona.codigo,
      nombre: zona.nombre,
      valor: zona.valor,
    }))
  return {
    id: "gmv-departamentos",
    tipo: "ranking",
    titulo: "Departamentos con más GMV comprometido",
    descripcion:
      "Negocios aceptados en el periodo, según el departamento del medio.",
    ancho: "mitad",
    elementos,
    formato: "cop",
    nombreValor: "GMV comprometido",
    nombreCategoria: "Departamento",
    limite: 10,
    vacio: sinValores(elementos.map((e) => e.valor))
      ? { titulo: "Sin negocios aceptados en el periodo" }
      : false,
  }
}

function desgloseDepartamentos(datos: DatosResumen): FilaDesglose[] {
  return (datos.zonas ?? []).map((zona) => ({
    clave: zona.codigo,
    nombre: zona.nombre,
    valor: zona.valor,
    valorAnterior: zona.valorAnterior ?? 0,
  }))
}

export function vistaResumen(datos: DatosResumen): VistaReporte {
  const graficos = [
    graficoTendencia(datos),
    graficoPlataformas(datos),
    graficoZonas(datos),
  ].filter((grafico): grafico is EspecGrafico => grafico !== null)

  const periodo = datos.contexto.periodo ?? undefined
  const hallazgos = generarInsights({
    periodo,
    // Las reglas que usan "ahora" (antigüedad de métricas) no reciben datos aquí.
    ahora: new Date(`${periodo?.hasta ?? "1970-01-01"}T12:00:00Z`),
    kpis: datos.kpis,
    desgloses: datos.zonas
      ? { gmv_comprometido: { departamento: desgloseDepartamentos(datos) } }
      : undefined,
    mezclaPlataformas: datos.mezcla.map((fila) => ({
      plataforma: fila.plataforma,
      formatoClave: fila.formatoClave,
      formatoNombre: fila.formatoNombre,
      asignaciones: fila.asignaciones,
      gmv: fila.gmv,
      cpmEfectivo: fila.cpm,
    })),
    config: datos.config,
  })

  return {
    indicadores: indicadoresCabecera(datos),
    graficos,
    hallazgos,
    avisos: [],
  }
}

// ── Exportación ──────────────────────────────────────────────────────────────

function hojasResumen(datos: DatosResumen): HojaExcel[] {
  const hojas: HojaExcel[] = [
    {
      nombre: "Evolución",
      titulo: "GMV, comisión y negocios en el tiempo",
      descripcion: `Un tramo por ${datos.granularidad === "dia" ? "día" : datos.granularidad}. Ancla: aceptación (comprometido) y verificación (verificado, comisión, negocios).`,
      columnas: [
        { titulo: "Inicio del tramo", formato: "texto" },
        { titulo: "GMV comprometido", formato: "cop", totalizar: true },
        { titulo: "GMV verificado", formato: "cop", totalizar: true },
        { titulo: "Comisión", formato: "cop", totalizar: true },
        { titulo: "Negocios cerrados", formato: "numero", totalizar: true },
        {
          titulo: "GMV verificado (periodo anterior)",
          formato: "cop",
          totalizar: true,
        },
      ],
      filas: datos.serie.map((punto, i) => [
        punto.periodo,
        punto.gmvComprometido,
        punto.gmvVerificado,
        punto.comision,
        punto.negocios,
        datos.serieAnterior[i]?.gmvVerificado ?? null,
      ]),
    },
    {
      nombre: "Plataformas y formatos",
      titulo: "Negocios verificados por plataforma y formato",
      descripcion:
        "El CPM solo se informa con muestra suficiente de asignaciones con impresiones.",
      columnas: [
        { titulo: "Plataforma" },
        { titulo: "Formato" },
        { titulo: "Asignaciones", formato: "numero", totalizar: true },
        { titulo: "GMV verificado", formato: "cop", totalizar: true },
        { titulo: "Participación", formato: "porcentaje" },
        { titulo: "Alcance acumulado", formato: "numero", totalizar: true },
        { titulo: "CPM efectivo", formato: "cop" },
      ],
      filas: datos.mezcla.map((fila) => [
        NOMBRE_PLATAFORMA[fila.plataforma],
        fila.formatoNombre,
        fila.asignaciones,
        fila.gmv,
        fila.participacion,
        fila.alcance,
        fila.cpm,
      ]),
    },
  ]
  if (datos.zonas) {
    hojas.push({
      nombre: "Departamentos",
      titulo: "GMV comprometido por departamento",
      descripcion:
        "Departamentos con negocios aceptados en el periodo o en el de comparación, según la ubicación del medio.",
      columnas: [
        { titulo: "Departamento" },
        { titulo: "GMV comprometido", formato: "cop" },
        { titulo: "Participación", formato: "porcentaje" },
        { titulo: "Periodo anterior", formato: "cop" },
        { titulo: "Variación", formato: "porcentaje" },
      ],
      filas: datos.zonas.map((zona) => [
        zona.nombre,
        zona.valor,
        zona.participacion,
        zona.valorAnterior,
        zona.variacion,
      ]),
    })
  }
  return hojas
}

export function notasResumen(
  nMinimo: number,
  config: Pick<ConfigInsights, "diasActividad" | "diasRiesgoSinAceptar">
): NotaDefinicion[] {
  const tasas = (
    [
      "take_rate",
      "tasa_llenado",
      "tasa_aceptacion",
      "tasa_cumplimiento",
    ] as const
  )
    .map((clave) => definicionKpi(clave))
    .flatMap((definicion) =>
      definicion
        ? [
            {
              termino: definicion.nombre,
              explicacion: `${definicion.definicion} ${definicion.calculo}${definicion.nota ? ` ${definicion.nota}` : ""}`,
            },
          ]
        : []
    )
  return [
    NOTA_GMV,
    ...tasas,
    NOTA_ALCANCE,
    {
      termino: "Medios en riesgo",
      explicacion: `Medios verificados que estuvieron activos en los últimos ${formatearNumero(config.diasActividad)} días pero no aceptan ofertas desde hace más de ${formatearNumero(config.diasRiesgoSinAceptar)}, contados al cierre del periodo.`,
    },
    notaComparacion(),
    notaMuestra(nMinimo),
    NOTA_ZONA_HORARIA,
  ]
}

export function contenidoResumen(datos: DatosResumen): ContenidoReporte {
  return {
    vista: vistaResumen(datos),
    tabla: tablaExportable(
      "Indicadores del periodo",
      columnasResumen,
      filasResumen(datos),
      "Los 16 indicadores del tablero con su valor en el periodo anterior y la variación."
    ),
    hojas: hojasResumen(datos),
    notas: notasResumen(datos.contexto.nMinimo, datos.config),
  }
}
