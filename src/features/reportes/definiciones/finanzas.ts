/**
 * Finanzas (`reporte_finanzas` por anunciante, sector y mes): GMV, comisión,
 * take rate, lo pagado a los medios, lo facturado, lo recaudado y la cartera
 * al cierre. Módulo puro.
 */
import { definirEstadoTabla } from "@/components/data-table/estado-url"
import { definicionKpi } from "@/components/kpi/definiciones-kpi"
import type { HojaExcel } from "@/lib/export/excel"

import type { ColumnaReporte } from "../columnas"
import { type Agrupacion, ETIQUETAS_AGRUPACION } from "../filtros"
import { type EspecGrafico, sinValores } from "../graficos"
import { indicador, razon, sumar } from "../indicadores"
import type { FacetaReporte } from "../tabla"
import type {
  ContenidoReporte,
  DatosFinanzas,
  FilaFinanzas,
  NotaDefinicion,
  TotalesFinanzas,
  VistaReporte,
} from "../tipos"
import {
  definicionPropia,
  NOTA_GMV,
  NOTA_ZONA_HORARIA,
  notaComparacion,
  tablaExportable,
} from "./comun"

export function totalesFinanzas(
  filas: readonly FilaFinanzas[]
): TotalesFinanzas {
  const gmvVerificado = sumar(filas, (f) => f.gmvVerificado)
  const comision = sumar(filas, (f) => f.comision)
  return {
    gmvComprometido: sumar(filas, (f) => f.gmvComprometido),
    gmvVerificado,
    comision,
    takeRate: razon(comision, gmvVerificado),
    pagadoMedios: sumar(filas, (f) => f.pagadoMedios),
    facturado: sumar(filas, (f) => f.facturado),
    recaudado: sumar(filas, (f) => f.recaudado),
    cartera: sumar(filas, (f) => f.cartera),
  }
}

// ── Tabla ────────────────────────────────────────────────────────────────────

export function columnasFinanzas(
  agrupacion: Agrupacion
): readonly ColumnaReporte<FilaFinanzas>[] {
  return [
    {
      id: "grupo",
      titulo: ETIQUETAS_AGRUPACION[agrupacion],
      tipo: "texto",
      valor: (f) => f.grupo,
      // Los meses se ordenan por calendario ("2026-01"), no por su nombre.
      valorOrden: agrupacion === "mes" ? (f) => f.id : undefined,
      ordenable: true,
      buscable: true,
      tarjeta: "titulo",
    },
    {
      id: "gmvComprometido",
      titulo: "GMV comprometido",
      tipo: "cop",
      valor: (f) => f.gmvComprometido,
      ordenable: true,
      totalizar: true,
      ocultarBajo: "xl",
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
      id: "comision",
      titulo: "Comisión",
      tipo: "cop",
      valor: (f) => f.comision,
      ordenable: true,
      totalizar: true,
    },
    {
      id: "takeRate",
      titulo: "Take rate",
      tipo: "porcentaje",
      valor: (f) => f.takeRate,
      ordenable: true,
      ocultarBajo: "lg",
    },
    {
      id: "facturado",
      titulo: "Facturado",
      tipo: "cop",
      valor: (f) => f.facturado,
      ordenable: true,
      totalizar: true,
    },
    {
      id: "recaudado",
      titulo: "Recaudado",
      tipo: "cop",
      valor: (f) => f.recaudado,
      ordenable: true,
      totalizar: true,
      ocultarBajo: "lg",
    },
    {
      id: "cartera",
      tituloCorto: "Cartera",
      titulo:
        agrupacion === "mes"
          ? "Cartera al cierre del mes"
          : "Cartera al cierre",
      tipo: "cop",
      valor: (f) => f.cartera,
      ordenable: true,
      // Por mes, cada fila es un corte distinto: sumarlas no tiene sentido.
      totalizar: agrupacion !== "mes",
    },
    {
      id: "pagadoMedios",
      ocultaPorDefecto: true,
      titulo: "Pagado a medios",
      tipo: "cop",
      valor: (f) => f.pagadoMedios,
      ordenable: true,
      totalizar: true,
    },
  ]
}

export const facetasFinanzas: readonly FacetaReporte<FilaFinanzas>[] = []

export const estadoTablaFinanzas = definirEstadoTabla({
  camposOrden: [
    "grupo",
    "gmvComprometido",
    "gmvVerificado",
    "comision",
    "takeRate",
    "facturado",
    "recaudado",
    "cartera",
    "pagadoMedios",
  ] as const,
  ordenPorDefecto: { campo: "gmvVerificado", descendente: true },
  filtros: {},
})

// ── Vista ────────────────────────────────────────────────────────────────────

const DEFINICION_FACTURADO = definicionPropia("Facturado", "COP", "mayor", {
  definicion:
    "Total de las facturas emitidas en el periodo (sin borradores ni anuladas).",
  calculo: "Suma del total de cada factura emitida.",
  ancla: "Fecha de emisión",
})

const DEFINICION_RECAUDADO = definicionPropia("Recaudado", "COP", "mayor", {
  definicion: "Pagos recibidos de los anunciantes en el periodo.",
  calculo: "Suma de los pagos registrados.",
  ancla: "Fecha de pago",
})

const DEFINICION_CARTERA = definicionPropia(
  "Cartera al cierre",
  "COP",
  "menor",
  {
    definicion:
      "Saldo pendiente de las facturas emitidas hasta el último día del periodo.",
    calculo: "Total facturado menos lo pagado, por factura, al cierre.",
    ancla: "Último día del periodo (foto)",
  }
)

const DEFINICION_PAGADO = definicionPropia("Pagado a medios", "COP", "neutro", {
  definicion:
    "Valor neto transferido a los medios por asignaciones pagadas en el periodo.",
  calculo:
    "Suma del neto (después de retenciones) de las asignaciones pagadas.",
  ancla: "Fecha de pago",
})

function indicadoresFinanzas(datos: DatosFinanzas) {
  const { totales, anterior } = datos
  return [
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
      clave: "comision",
      titulo: "Comisión generada",
      actual: totales.comision,
      anterior: anterior.comision,
      unidad: "COP",
      sentido: "mayor",
      definicion: definicionKpi("comision"),
      icono: "comision",
    }),
    indicador({
      clave: "take_rate",
      titulo: "Take rate",
      actual: totales.takeRate,
      anterior: anterior.takeRate,
      unidad: "%",
      sentido: "neutro",
      definicion: definicionKpi("take_rate"),
      icono: "porcentaje",
    }),
    indicador({
      clave: "gmv_comprometido",
      titulo: "GMV comprometido",
      actual: totales.gmvComprometido,
      anterior: anterior.gmvComprometido,
      unidad: "COP",
      sentido: "mayor",
      definicion: definicionKpi("gmv_comprometido"),
      icono: "negocios",
    }),
    indicador({
      clave: "facturado",
      titulo: "Facturado",
      actual: totales.facturado,
      anterior: anterior.facturado,
      unidad: "COP",
      sentido: "mayor",
      definicion: DEFINICION_FACTURADO,
      icono: "factura",
    }),
    indicador({
      clave: "recaudado",
      titulo: "Recaudado",
      actual: totales.recaudado,
      anterior: anterior.recaudado,
      unidad: "COP",
      sentido: "mayor",
      definicion: DEFINICION_RECAUDADO,
      icono: "recaudo",
    }),
    indicador({
      clave: "cartera",
      titulo: "Cartera al cierre",
      actual: totales.cartera,
      anterior: anterior.cartera,
      unidad: "COP",
      sentido: "menor",
      definicion: DEFINICION_CARTERA,
      icono: "reloj",
    }),
    indicador({
      clave: "pagado_medios",
      titulo: "Pagado a medios",
      actual: totales.pagadoMedios,
      anterior: anterior.pagadoMedios,
      unidad: "COP",
      sentido: "neutro",
      definicion: DEFINICION_PAGADO,
      icono: "pago",
    }),
  ]
}

function graficoMensual(datos: DatosFinanzas): EspecGrafico {
  const meses = datos.porMes
  return {
    id: "gmv-mes",
    tipo: "combo",
    titulo: "GMV verificado y take rate por mes",
    descripcion:
      "Arriba, el GMV verificado de cada mes; abajo, la proporción que quedó como comisión.",
    pie: datos.sector
      ? "La serie mensual incluye todos los sectores."
      : undefined,
    ancho: "completo",
    etiquetas: meses.map((f) => f.grupo),
    barras: {
      id: "gmv_verificado",
      nombre: "GMV verificado",
      valores: meses.map((f) => f.gmvVerificado),
      formato: "cop",
    },
    linea: {
      id: "take_rate",
      nombre: "Take rate",
      valores: meses.map((f) => f.takeRate),
      formato: "porcentaje",
    },
    vacio: sinValores(meses.map((f) => f.gmvVerificado))
      ? {
          titulo: "Aún no hay GMV verificado",
          descripcion:
            "Cuando se verifiquen negocios en el periodo, verás aquí su evolución mensual.",
        }
      : false,
  }
}

const comparador = new Intl.Collator("es", { sensitivity: "base" })

function graficoSectores(datos: DatosFinanzas): EspecGrafico {
  // Orden alfabético estable: el color sigue al sector entre periodos.
  const segmentos = [...datos.porSector]
    .sort((a, b) => comparador.compare(a.grupo, b.grupo))
    .map((f) => ({ id: f.id, nombre: f.grupo, valor: f.gmvVerificado }))
  return {
    id: "gmv-sector",
    tipo: "dona",
    titulo: "GMV verificado por sector",
    descripcion: "La industria de cada anunciante.",
    ancho: "mitad",
    segmentos,
    formato: "cop",
    etiquetaTotal: "GMV verificado",
    nombreCategoria: "Sector",
    vacio: sinValores(segmentos.map((s) => s.valor))
      ? { titulo: "Sin GMV verificado en el periodo" }
      : false,
  }
}

function graficoAnunciantes(datos: DatosFinanzas): EspecGrafico {
  const elementos = datos.porAnunciante
    .filter((f) => f.gmvVerificado > 0)
    .map((f) => ({ id: f.id, nombre: f.grupo, valor: f.gmvVerificado }))
  return {
    id: "gmv-anunciante",
    tipo: "ranking",
    titulo: "Anunciantes con más GMV verificado",
    descripcion: datos.sector ? `Sector ${datos.sector}.` : undefined,
    ancho: "mitad",
    elementos,
    formato: "cop",
    nombreValor: "GMV verificado",
    nombreCategoria: "Anunciante",
    limite: 10,
    agruparResto: true,
    vacio:
      elementos.length === 0
        ? { titulo: "Sin GMV verificado en el periodo" }
        : false,
  }
}

function graficoCobro(datos: DatosFinanzas): EspecGrafico {
  const meses = datos.porMes
  return {
    id: "facturado-recaudado",
    tipo: "apiladas",
    titulo: "Facturado y recaudado por mes",
    descripcion: "Lo que se emitió en facturas frente a lo que entró en pagos.",
    pie: datos.sector
      ? "La serie mensual incluye todos los sectores."
      : undefined,
    ancho: "completo",
    categorias: meses.map((f) => f.grupo),
    series: [
      {
        id: "facturado",
        nombre: "Facturado",
        valores: meses.map((f) => f.facturado),
      },
      {
        id: "recaudado",
        nombre: "Recaudado",
        valores: meses.map((f) => f.recaudado),
      },
    ],
    formato: "cop",
    nombreCategoria: "Mes",
    vacio: sinValores(meses.flatMap((f) => [f.facturado, f.recaudado]))
      ? { titulo: "Sin facturas ni pagos en el periodo" }
      : false,
  }
}

export function vistaFinanzas(datos: DatosFinanzas): VistaReporte {
  const avisos =
    datos.sector && datos.agrupacion === "mes"
      ? [
          "El detalle por mes incluye todos los sectores; el filtro de sector se aplica a los indicadores y al detalle por anunciante.",
        ]
      : []
  return {
    indicadores: indicadoresFinanzas(datos),
    graficos: [
      graficoMensual(datos),
      graficoSectores(datos),
      graficoAnunciantes(datos),
      graficoCobro(datos),
    ],
    hallazgos: [],
    avisos,
  }
}

// ── Exportación ──────────────────────────────────────────────────────────────

function hojaFinanzas(
  nombre: string,
  agrupacion: Agrupacion,
  filas: readonly FilaFinanzas[]
): HojaExcel {
  const tabla = tablaExportable(nombre, columnasFinanzas(agrupacion), filas)
  return { nombre, columnas: tabla.columnas, filas: tabla.filas }
}

function hojasFinanzas(datos: DatosFinanzas): HojaExcel[] {
  const hojas: [string, Agrupacion, FilaFinanzas[]][] = [
    ["Por mes", "mes", datos.porMes],
    ["Por sector", "sector", datos.porSector],
    ["Por anunciante", "anunciante", datos.porAnunciante],
  ]
  return hojas
    .filter(([, agrupacion]) => agrupacion !== datos.agrupacion)
    .map(([nombre, agrupacion, filas]) =>
      hojaFinanzas(nombre, agrupacion, filas)
    )
}

export const NOTAS_FINANZAS: readonly NotaDefinicion[] = [
  NOTA_GMV,
  {
    termino: "Comisión y take rate",
    explicacion:
      "La comisión es el ingreso de la plataforma sobre el GMV verificado, con el porcentaje congelado al aceptar cada negocio. El take rate es comisión ÷ GMV verificado: si baja, pesan más las excepciones de comisión.",
  },
  {
    termino: "Facturado y recaudado",
    explicacion:
      "Facturado: total de las facturas emitidas en el periodo (sin borradores ni anuladas). Recaudado: pagos recibidos de los anunciantes en el periodo, por fecha de pago.",
  },
  {
    termino: "Cartera al cierre",
    explicacion:
      "Saldo pendiente de las facturas al último día del periodo (o de cada mes, en el detalle mensual). Es una foto: no se suma entre meses.",
  },
  {
    termino: "Pagado a medios",
    explicacion:
      "Valor neto (después de retenciones) transferido a los medios por las asignaciones pagadas en el periodo.",
  },
  {
    termino: "Sector",
    explicacion:
      "La industria registrada en la ficha de cada anunciante. Con un sector elegido, los indicadores y el detalle por anunciante se limitan a ese sector.",
  },
  notaComparacion(),
  NOTA_ZONA_HORARIA,
]

export function contenidoFinanzas(datos: DatosFinanzas): ContenidoReporte {
  return {
    vista: vistaFinanzas(datos),
    tabla: tablaExportable(
      `Detalle por ${ETIQUETAS_AGRUPACION[datos.agrupacion].toLocaleLowerCase("es-CO")}`,
      columnasFinanzas(datos.agrupacion),
      datos.filas
    ),
    hojas: hojasFinanzas(datos),
    notas: NOTAS_FINANZAS,
  }
}
