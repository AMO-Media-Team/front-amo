/**
 * Cartera (`reporte_cartera`): saldo por cobrar a cada anunciante en una
 * fecha de corte, por antigüedad desde el vencimiento de cada factura
 * (0–30 días incluye lo que aún no vence). Módulo puro.
 */
import {
  definirEstadoTabla,
  filtroDeOpciones,
} from "@/components/data-table/estado-url"
import type { HojaExcel } from "@/lib/export/excel"

import type { ColumnaReporte } from "../columnas"
import { type EspecGrafico } from "../graficos"
import { indicador, razon, sumar } from "../indicadores"
import type { FacetaReporte } from "../tabla"
import type {
  ContenidoReporte,
  DatosCartera,
  FilaCartera,
  NotaDefinicion,
  TotalesCartera,
  VistaReporte,
} from "../tipos"
import { definicionPropia, NOTA_ZONA_HORARIA, tablaExportable } from "./comun"

export const TRAMOS = [
  { id: "0-30", nombre: "0 a 30 días", valor: (f: FilaCartera) => f.saldo0a30 },
  {
    id: "31-60",
    nombre: "31 a 60 días",
    valor: (f: FilaCartera) => f.saldo31a60,
  },
  {
    id: "61-90",
    nombre: "61 a 90 días",
    valor: (f: FilaCartera) => f.saldo61a90,
  },
  {
    id: "90+",
    nombre: "Más de 90 días",
    valor: (f: FilaCartera) => f.saldoMas90,
  },
] as const

export const MORAS = ["al-dia", "vencida", "critica"] as const
export type Mora = (typeof MORAS)[number]

export const ETIQUETAS_MORA: Readonly<Record<Mora, string>> = {
  "al-dia": "Al día (hasta 30 días)",
  vencida: "Vencida (31 a 90 días)",
  critica: "Crítica (más de 90 días)",
}

/** El tramo más antiguo con saldo decide la mora del anunciante. */
export function moraAnunciante(fila: FilaCartera): Mora {
  if (fila.saldoMas90 > 0) return "critica"
  if (fila.saldo31a60 > 0 || fila.saldo61a90 > 0) return "vencida"
  return "al-dia"
}

/** Saldo con más de 30 días desde el vencimiento. */
export function saldoVencido(fila: FilaCartera): number {
  return fila.saldo31a60 + fila.saldo61a90 + fila.saldoMas90
}

export function totalesCartera(filas: readonly FilaCartera[]): TotalesCartera {
  return {
    anunciantes: filas.length,
    facturado: sumar(filas, (f) => f.facturado),
    saldo: sumar(filas, (f) => f.saldo),
    vencido: sumar(filas, saldoVencido),
    saldoMas90: sumar(filas, (f) => f.saldoMas90),
    facturasVencidas: sumar(filas, (f) => f.facturasVencidas),
    porTramo: [
      sumar(filas, (f) => f.saldo0a30),
      sumar(filas, (f) => f.saldo31a60),
      sumar(filas, (f) => f.saldo61a90),
      sumar(filas, (f) => f.saldoMas90),
    ],
  }
}

// ── Tabla ────────────────────────────────────────────────────────────────────

export const columnasCartera: readonly ColumnaReporte<FilaCartera>[] = [
  {
    id: "anunciante",
    titulo: "Anunciante",
    tipo: "texto",
    valor: (f) => f.anunciante,
    ordenable: true,
    buscable: true,
    tarjeta: "titulo",
  },
  {
    id: "facturado",
    ocultaPorDefecto: true,
    titulo: "Facturado",
    tipo: "cop",
    valor: (f) => f.facturado,
    ordenable: true,
    totalizar: true,
  },
  {
    id: "pagado",
    ocultaPorDefecto: true,
    titulo: "Pagado",
    tipo: "cop",
    valor: (f) => f.pagado,
    ordenable: true,
    totalizar: true,
  },
  {
    id: "saldo",
    titulo: "Saldo",
    tipo: "cop",
    valor: (f) => f.saldo,
    ordenable: true,
    totalizar: true,
  },
  {
    id: "saldo0a30",
    titulo: "0–30 días",
    tipo: "cop",
    valor: (f) => f.saldo0a30,
    ordenable: true,
    totalizar: true,
    ocultarBajo: "lg",
  },
  {
    id: "saldo31a60",
    titulo: "31–60 días",
    tipo: "cop",
    valor: (f) => f.saldo31a60,
    ordenable: true,
    totalizar: true,
    ocultarBajo: "lg",
  },
  {
    id: "saldo61a90",
    titulo: "61–90 días",
    tipo: "cop",
    valor: (f) => f.saldo61a90,
    ordenable: true,
    totalizar: true,
    ocultarBajo: "lg",
  },
  {
    id: "saldoMas90",
    tituloCorto: "+90 días",
    titulo: "Más de 90 días",
    tipo: "cop",
    valor: (f) => f.saldoMas90,
    ordenable: true,
    totalizar: true,
  },
  {
    id: "porcentajeVencido",
    ocultarBajo: "xl",
    titulo: "% vencido",
    tipo: "porcentaje",
    valor: (f) => razon(saldoVencido(f), f.saldo),
    ordenable: true,
  },
  {
    id: "facturasVencidas",
    titulo: "Facturas vencidas",
    tipo: "entero",
    valor: (f) => f.facturasVencidas,
    ordenable: true,
    totalizar: true,
  },
]

export const facetasCartera: readonly FacetaReporte<FilaCartera>[] = [
  {
    clave: "mora",
    titulo: "Mora",
    valor: moraAnunciante,
    etiqueta: (valor) => ETIQUETAS_MORA[valor as Mora] ?? valor,
    orden: MORAS,
  },
]

export const estadoTablaCartera = definirEstadoTabla({
  camposOrden: [
    "anunciante",
    "facturado",
    "pagado",
    "saldo",
    "saldo0a30",
    "saldo31a60",
    "saldo61a90",
    "saldoMas90",
    "porcentajeVencido",
    "facturasVencidas",
  ] as const,
  ordenPorDefecto: { campo: "saldo", descendente: true },
  filtros: { mora: filtroDeOpciones(MORAS) },
})

// ── Vista ────────────────────────────────────────────────────────────────────

const ANCLA_CORTE = "Fecha de corte (foto)"

const DEFINICION_SALDO = definicionPropia("Saldo por cobrar", "COP", "menor", {
  definicion:
    "Lo que los anunciantes deben en la fecha de corte por facturas emitidas hasta ese día.",
  calculo: "Total de cada factura menos los pagos registrados hasta el corte.",
  ancla: ANCLA_CORTE,
})

const DEFINICION_VENCIDO = definicionPropia(
  "Vencido más de 30 días",
  "COP",
  "menor",
  {
    definicion:
      "Saldo de facturas que vencieron hace más de 30 días: requiere gestión de cobro.",
    calculo: "Suma de los tramos 31–60, 61–90 y más de 90 días.",
    ancla: ANCLA_CORTE,
  }
)

const DEFINICION_90 = definicionPropia("Más de 90 días", "COP", "menor", {
  definicion:
    "Saldo con más de 90 días de vencido: el de mayor riesgo de no pago.",
  calculo: "Suma del tramo de más de 90 días.",
  ancla: ANCLA_CORTE,
})

const DEFINICION_AL_DIA = definicionPropia("Saldo al día", "%", "mayor", {
  definicion:
    "Proporción del saldo que aún no vence o venció hace 30 días o menos.",
  calculo: "Tramo 0–30 días ÷ saldo total.",
  ancla: ANCLA_CORTE,
})

const DEFINICION_FACTURAS = definicionPropia(
  "Facturas vencidas",
  "conteo",
  "menor",
  {
    definicion: "Facturas con saldo cuya fecha de vencimiento ya pasó.",
    calculo: "Conteo de facturas con saldo y vencimiento anterior al corte.",
    ancla: ANCLA_CORTE,
  }
)

const DEFINICION_DEUDORES = definicionPropia(
  "Anunciantes con saldo",
  "conteo",
  "neutro",
  {
    definicion: "Anunciantes con al menos una factura con saldo pendiente.",
    calculo: "Conteo de anunciantes con saldo mayor que cero.",
    ancla: ANCLA_CORTE,
  }
)

function indicadoresCartera(datos: DatosCartera) {
  const { totales, anterior } = datos
  return [
    indicador({
      clave: "saldo",
      titulo: "Saldo por cobrar",
      actual: totales.saldo,
      anterior: anterior.saldo,
      unidad: "COP",
      sentido: "menor",
      definicion: DEFINICION_SALDO,
      icono: "factura",
    }),
    indicador({
      clave: "vencido",
      titulo: "Vencido más de 30 días",
      actual: totales.vencido,
      anterior: anterior.vencido,
      unidad: "COP",
      sentido: "menor",
      definicion: DEFINICION_VENCIDO,
      icono: "reloj",
    }),
    indicador({
      clave: "mas_90",
      titulo: "Más de 90 días",
      actual: totales.saldoMas90,
      anterior: anterior.saldoMas90,
      unidad: "COP",
      sentido: "menor",
      definicion: DEFINICION_90,
      icono: "alerta",
    }),
    indicador({
      clave: "al_dia",
      titulo: "Saldo al día",
      actual: razon(totales.porTramo[0], totales.saldo),
      anterior: razon(anterior.porTramo[0], anterior.saldo),
      unidad: "%",
      sentido: "mayor",
      definicion: DEFINICION_AL_DIA,
      icono: "escudo",
    }),
    indicador({
      clave: "facturas_vencidas",
      titulo: "Facturas vencidas",
      actual: totales.facturasVencidas,
      anterior: anterior.facturasVencidas,
      unidad: "conteo",
      sentido: "menor",
      definicion: DEFINICION_FACTURAS,
      icono: "fallos",
    }),
    indicador({
      clave: "anunciantes",
      titulo: "Anunciantes con saldo",
      actual: totales.anunciantes,
      anterior: anterior.anunciantes,
      unidad: "conteo",
      sentido: "neutro",
      definicion: DEFINICION_DEUDORES,
      icono: "anunciantes",
    }),
  ]
}

const VACIO_CARTERA = {
  titulo: "Sin saldos pendientes al corte",
  descripcion:
    "Todas las facturas emitidas hasta esta fecha están pagadas, o aún no hay facturas.",
}

function graficoAntiguedad(datos: DatosCartera): EspecGrafico {
  return {
    id: "antiguedad",
    tipo: "dona",
    titulo: "Antigüedad del saldo",
    descripcion: "Días transcurridos desde el vencimiento de cada factura.",
    ancho: "mitad",
    segmentos: TRAMOS.map((tramo, i) => ({
      id: tramo.id,
      nombre: tramo.nombre,
      valor: datos.totales.porTramo[i],
    })),
    formato: "cop",
    etiquetaTotal: "Saldo",
    nombreCategoria: "Antigüedad",
    vacio: datos.totales.saldo <= 0 ? VACIO_CARTERA : false,
  }
}

const TOPE_ANUNCIANTES = 10

function graficoPorAnunciante(datos: DatosCartera): EspecGrafico {
  const mayores = [...datos.filas]
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, TOPE_ANUNCIANTES)
  return {
    id: "saldo-anunciante",
    tipo: "apiladas",
    titulo: "Anunciantes con más saldo",
    descripcion: "Saldo de cada anunciante repartido por antigüedad.",
    ancho: "mitad",
    orientacion: "horizontal",
    categorias: mayores.map((f) => f.anunciante),
    series: TRAMOS.map((tramo) => ({
      id: tramo.id,
      nombre: tramo.nombre,
      valores: mayores.map((f) => tramo.valor(f)),
    })),
    formato: "cop",
    nombreCategoria: "Anunciante",
    vacio: mayores.length === 0 ? VACIO_CARTERA : false,
  }
}

export function vistaCartera(datos: DatosCartera): VistaReporte {
  return {
    indicadores: indicadoresCartera(datos),
    graficos: [graficoAntiguedad(datos), graficoPorAnunciante(datos)],
    hallazgos: [],
    avisos: [],
  }
}

// ── Exportación ──────────────────────────────────────────────────────────────

function hojasCartera(datos: DatosCartera): HojaExcel[] {
  return [
    {
      nombre: "Antigüedad",
      titulo: "Saldo por antigüedad",
      columnas: [
        { titulo: "Antigüedad" },
        { titulo: "Saldo", formato: "cop", totalizar: true },
        {
          titulo: "Saldo en el corte anterior",
          formato: "cop",
          totalizar: true,
        },
      ],
      filas: TRAMOS.map((tramo, i) => [
        tramo.nombre,
        datos.totales.porTramo[i],
        datos.anterior.porTramo[i],
      ]),
    },
  ]
}

export const NOTAS_CARTERA: readonly NotaDefinicion[] = [
  {
    termino: "Saldo por cobrar",
    explicacion:
      "Para cada factura emitida hasta la fecha de corte (sin borradores ni anuladas), su total menos los pagos registrados hasta ese día. Solo aparecen anunciantes con saldo.",
  },
  {
    termino: "Antigüedad",
    explicacion:
      "Días entre la fecha de vencimiento de la factura y el corte. El tramo de 0 a 30 días incluye las facturas que aún no vencen.",
  },
  {
    termino: "Facturas vencidas",
    explicacion:
      "Facturas con saldo cuya fecha de vencimiento es anterior al corte, sin importar cuántos días lleven vencidas.",
  },
  {
    termino: "Comparativo",
    explicacion:
      "Cada variación compara el corte elegido con el mismo día del mes anterior; un cierre de mes, con el cierre del mes anterior.",
  },
  NOTA_ZONA_HORARIA,
]

export function contenidoCartera(datos: DatosCartera): ContenidoReporte {
  return {
    vista: vistaCartera(datos),
    tabla: tablaExportable(
      "Cartera por anunciante",
      columnasCartera,
      datos.filas
    ),
    hojas: hojasCartera(datos),
    notas: NOTAS_CARTERA,
  }
}
