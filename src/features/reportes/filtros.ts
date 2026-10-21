/**
 * Filtros de los reportes en la URL (nuqs). Módulo puro: la página los lee en
 * el servidor con `cargarFiltros(searchParams)`, la barra de filtros los
 * escribe en el cliente y la exportación los valida con los MISMOS parsers.
 *
 *   /reportes/finanzas?periodo=esteTrimestre&agrupacion=sector
 *   /reportes/cumplimiento-medios?desde=2026-09-01&hasta=2026-09-30&departamento=05
 *   /reportes/cartera?corte=2026-08-31
 *
 * El periodo usa el contrato compartido con Auditoría y Accesos (`periodo`,
 * `desde`, `hasta`); así los enlaces de los insights abren el reporte filtrado.
 */
import { tz } from "@date-fns/tz"
import { endOfMonth, isLastDayOfMonth, subDays, subMonths } from "date-fns"
import {
  createLoader,
  createParser,
  createSerializer,
  type inferParserType,
  parseAsStringLiteral,
} from "nuqs/server"
import { z } from "zod"

import {
  etiquetaComparacion,
  etiquetaRango,
  parsersPeriodo,
  rangoDeValores,
} from "@/features/auditoria/periodo"
import { departamentoPorCodigo } from "@/features/geo/departamentos"
import {
  parseAsCodigoDepartamento,
  parseAsDia,
} from "@/features/geo/estado-url"
import {
  diasEnRango,
  inicioDelDia,
  parsearFecha,
  periodoAnterior,
  PRESETS_RANGO,
  rangoDesdePreset,
  type RangoFechas,
  serializarFecha,
  ZONA,
} from "@/lib/fechas"
import { formatearFecha } from "@/lib/format"
import type { FiltroDocumento } from "@/lib/export/marca"

import type { FiltroReporte, ReporteCatalogo } from "./catalogo"
import type { ContextoDatos } from "./tipos"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const parseAsUuid = createParser<string>({
  parse: (valor) => (UUID.test(valor) ? valor.toLowerCase() : null),
  serialize: (valor) => valor,
})

export const AGRUPACIONES = ["anunciante", "sector", "mes"] as const
export type Agrupacion = (typeof AGRUPACIONES)[number]

export const ETIQUETAS_AGRUPACION: Readonly<Record<Agrupacion, string>> = {
  anunciante: "Anunciante",
  sector: "Sector",
  mes: "Mes",
}

export const parsersFiltros = {
  ...parsersPeriodo,
  departamento: parseAsCodigoDepartamento,
  anunciante: parseAsUuid,
  sector: parseAsUuid,
  agrupacion: parseAsStringLiteral(AGRUPACIONES).withDefault("anunciante"),
  corte: parseAsDia,
}

export type ValoresFiltros = inferParserType<typeof parsersFiltros>

const cargarValores = createLoader(parsersFiltros)

/** `?periodo=esteAno&departamento=05` a partir de los valores (enlaces que conservan filtros). */
export const serializarFiltros = createSerializer(parsersFiltros)

/** Filtros ya resueltos (fechas de Bogotá) con los que consultan los reportes. */
export interface FiltrosReporte {
  rango: RangoFechas
  /** Periodo de comparación alineado (docs/kpis.md §0.1). */
  anterior: RangoFechas
  departamento: string | null
  anunciante: string | null
  sector: string | null
  agrupacion: Agrupacion
  /** Fecha de corte de la cartera (por defecto, hoy). */
  corte: Date
  /** Mismo día (o cierre) del mes anterior: comparativo de la cartera. */
  corteAnterior: Date
}

const enBogota = { in: tz(ZONA) }

/**
 * Mismo día del mes anterior (o su último día, si ese mes es más corto). Un
 * cierre de mes se compara con el cierre anterior: 30 de sept → 31 de ago.
 */
export function mesAntes(fecha: Date): Date {
  const anterior = subMonths(fecha, 1, enBogota)
  return inicioDelDia(
    isLastDayOfMonth(fecha, enBogota)
      ? endOfMonth(anterior, enBogota)
      : anterior
  )
}

/** Un corte en el futuro no tiene sentido: se limita a hoy. */
export function resolverCorte(texto: string | null, ahora: Date): Date {
  const hoy = inicioDelDia(ahora)
  const elegido = parsearFecha(texto)
  return elegido && elegido.getTime() <= hoy.getTime() ? elegido : hoy
}

export const CORTES_SUGERIDOS = [
  "hoy",
  "finMes",
  "finTrimestre",
  "finAno",
] as const
export type CorteSugerido = (typeof CORTES_SUGERIDOS)[number]

export const ETIQUETAS_CORTE: Readonly<Record<CorteSugerido, string>> = {
  hoy: "Hoy",
  finMes: "Cierre del mes anterior",
  finTrimestre: "Cierre del trimestre anterior",
  finAno: "Cierre del año anterior",
}

/** Fechas de corte habituales de la cartera (cierres contables), en Bogotá. */
export function fechaCorteSugerido(corte: CorteSugerido, ahora: Date): Date {
  const diaAntesDe = (preset: "esteTrimestre" | "esteAno") =>
    inicioDelDia(subDays(rangoDesdePreset(preset, ahora).desde, 1, enBogota))
  switch (corte) {
    case "hoy":
      return inicioDelDia(ahora)
    case "finMes":
      return rangoDesdePreset("mesAnterior", ahora).hasta
    case "finTrimestre":
      return diaAntesDe("esteTrimestre")
    case "finAno":
      return diaAntesDe("esteAno")
  }
}

export function filtrosDesdeValores(
  valores: ValoresFiltros,
  ahora: Date = new Date()
): FiltrosReporte {
  const rango = rangoDeValores(valores, ahora)
  const corte = resolverCorte(valores.corte, ahora)
  return {
    rango,
    anterior: periodoAnterior(rango),
    departamento: valores.departamento,
    anunciante: valores.anunciante,
    sector: valores.sector,
    agrupacion: valores.agrupacion,
    corte,
    corteAnterior: mesAntes(corte),
  }
}

/**
 * Deja solo los filtros que aplican (`filtrosPara` del catálogo). La URL
 * puede traer de más —un enlace de otro reporte, o `?anunciante=` abierto por
 * un anunciante—: lo que no aplica se descarta antes de consultar, para que
 * el resumen, la portada de los documentos y la bitácora digan lo consultado.
 */
export function limitarFiltros(
  aplicables: readonly FiltroReporte[],
  filtros: FiltrosReporte
): FiltrosReporte {
  const usa = (filtro: FiltroReporte) => aplicables.includes(filtro)
  return {
    ...filtros,
    departamento: usa("departamento") ? filtros.departamento : null,
    anunciante: usa("anunciante") ? filtros.anunciante : null,
    sector: usa("sector") ? filtros.sector : null,
  }
}

/**
 * Filtros de una exportación para la bitácora: solo los que aplican, con las
 * fechas ya resueltas (un «últimos 30 días» de hoy no es el de mañana). Los
 * anunciantes y sectores van por su id, nunca por su nombre.
 */
export function filtrosParaBitacora(
  aplicables: readonly FiltroReporte[],
  filtros: FiltrosReporte
): Record<string, string> {
  const usa = (filtro: FiltroReporte) => aplicables.includes(filtro)
  const registro: Record<string, string> = {}
  if (usa("periodo")) {
    registro.periodo = filtros.rango.preset
    registro.desde = serializarFecha(filtros.rango.desde)
    registro.hasta = serializarFecha(filtros.rango.hasta)
  }
  if (usa("corte")) registro.corte = serializarFecha(filtros.corte)
  if (usa("departamento") && filtros.departamento) {
    registro.departamento = filtros.departamento
  }
  if (usa("anunciante") && filtros.anunciante) {
    registro.anunciante = filtros.anunciante
  }
  if (usa("sector") && filtros.sector) registro.sector = filtros.sector
  if (usa("agrupacion")) registro.agrupacion = filtros.agrupacion
  return registro
}

/** Servidor: `await cargarFiltros(props.searchParams)`. */
export async function cargarFiltros(
  searchParams: Promise<Record<string, string | string[] | undefined>>
): Promise<{ valores: ValoresFiltros; filtros: FiltrosReporte }> {
  const valores = await cargarValores(searchParams)
  return { valores, filtros: filtrosDesdeValores(valores) }
}

/**
 * Entrada de las Server Actions: los textos de la URL. Se validan con los
 * mismos parsers de la página (un valor inválido se descarta, como en la URL).
 */
export const esquemaValoresFiltros = z.object({
  periodo: z.enum(PRESETS_RANGO).nullable(),
  desde: z.string().max(10).nullable(),
  hasta: z.string().max(10).nullable(),
  departamento: z.string().max(2).nullable(),
  anunciante: z.string().max(36).nullable(),
  sector: z.string().max(36).nullable(),
  agrupacion: z.enum(AGRUPACIONES).nullable(),
  corte: z.string().max(10).nullable(),
})

export type EntradaFiltros = z.infer<typeof esquemaValoresFiltros>

export function valoresDesdeEntrada(entrada: EntradaFiltros): ValoresFiltros {
  const texto: Record<string, string> = {}
  for (const [clave, valor] of Object.entries(entrada)) {
    if (typeof valor === "string" && valor !== "") texto[clave] = valor
  }
  return cargarValores(texto)
}

/** Lo que la barra de filtros envía a la exportación (mismo contrato que la URL). */
export function entradaDesdeValores(valores: ValoresFiltros): EntradaFiltros {
  return {
    periodo: valores.periodo,
    desde: valores.desde,
    hasta: valores.hasta,
    departamento: valores.departamento,
    anunciante: valores.anunciante,
    sector: valores.sector,
    agrupacion: valores.agrupacion,
    corte: valores.corte,
  }
}

/**
 * Las RPC de analítica aceptan periodos de hasta diez años (`rango_kpi`,
 * migración `analitica_base`): más allá responden `AMO_CONFIG_INVALIDA`.
 */
export const MAXIMO_DIAS_PERIODO = 3661

export const MENSAJE_PERIODO_EXCEDIDO =
  "Los reportes consultan como máximo diez años. Elige un periodo más corto."

/** El periodo supera lo que las RPC aceptan: no se consulta (ni se exporta). */
export function periodoExcedido(
  reporte: Pick<ReporteCatalogo, "filtros">,
  filtros: Pick<FiltrosReporte, "rango">
): boolean {
  return (
    reporte.filtros.includes("periodo") &&
    diasEnRango(filtros.rango) > MAXIMO_DIAS_PERIODO
  )
}

/** Argumentos de fecha de las RPC ('YYYY-MM-DD'). */
export function argumentosPeriodo(rango: RangoFechas): {
  p_desde: string
  p_hasta: string
} {
  return {
    p_desde: serializarFecha(rango.desde),
    p_hasta: serializarFecha(rango.hasta),
  }
}

export function argumentosComparacion(filtros: FiltrosReporte): {
  p_desde: string
  p_hasta: string
  p_desde_ant: string
  p_hasta_ant: string
} {
  return {
    ...argumentosPeriodo(filtros.rango),
    p_desde_ant: serializarFecha(filtros.anterior.desde),
    p_hasta_ant: serializarFecha(filtros.anterior.hasta),
  }
}

const formatoRango = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  day: "numeric",
  month: "short",
  year: "numeric",
})

/** "1–30 sept 2026" (siempre con fechas, también para los presets). */
export function fechasDelRango(rango: RangoFechas): string {
  return formatoRango.formatRange(rango.desde, rango.hasta)
}

/** Texto del comparativo: "frente al mes anterior (1–31 ago 2026)". */
export function textoComparacion(filtros: FiltrosReporte): string {
  return `${etiquetaComparacion(filtros.rango)} (${fechasDelRango(filtros.anterior)})`
}

export interface NombresFiltros {
  anunciante?: string | null
  sector?: string | null
}

/**
 * Filtros aplicados, en palabras, para la portada de los documentos y el
 * resumen bajo el encabezado. Solo los que el reporte entiende.
 */
export function describirFiltros(
  reporte: Pick<ReporteCatalogo, "filtros" | "comparativo">,
  filtros: FiltrosReporte,
  nombres: NombresFiltros = {}
): FiltroDocumento[] {
  const lista: FiltroDocumento[] = []
  const usa = (filtro: ReporteCatalogo["filtros"][number]) =>
    reporte.filtros.includes(filtro)

  if (usa("periodo")) {
    const fechas = fechasDelRango(filtros.rango)
    // Un rango personalizado ya se nombra con sus fechas: no se repiten.
    const personalizado = filtros.rango.preset === "personalizado"
    lista.push({
      etiqueta: "Periodo",
      valor: personalizado
        ? fechas
        : `${etiquetaRango(filtros.rango)} (${fechas})`,
    })
    if (reporte.comparativo) {
      lista.push({
        etiqueta: "Comparado con",
        valor: fechasDelRango(filtros.anterior),
      })
    }
  }
  if (usa("corte")) {
    lista.push({
      etiqueta: "Fecha de corte",
      valor: formatearFecha(filtros.corte, "largo"),
    })
    if (reporte.comparativo) {
      lista.push({
        etiqueta: "Comparado con el corte del",
        valor: formatearFecha(filtros.corteAnterior, "largo"),
      })
    }
  }
  if (usa("departamento")) {
    lista.push({
      etiqueta: "Departamento",
      valor:
        departamentoPorCodigo(filtros.departamento)?.nombre ?? "Todo el país",
    })
  }
  if (usa("anunciante") && filtros.anunciante) {
    lista.push({
      etiqueta: "Anunciante",
      valor: nombres.anunciante ?? "Anunciante seleccionado",
    })
  }
  if (usa("sector") && filtros.sector) {
    lista.push({
      etiqueta: "Sector",
      valor: nombres.sector ?? "Sector seleccionado",
    })
  }
  if (usa("agrupacion")) {
    lista.push({
      etiqueta: "Detalle por",
      valor: ETIQUETAS_AGRUPACION[filtros.agrupacion],
    })
  }
  return lista
}

/**
 * Lo que todo reporte sabe de su consulta: los filtros en palabras, el texto
 * del comparativo ("frente al mes anterior (1–31 ago 2026)" o "frente al corte
 * anterior (31 de agosto de 2026)") y el periodo que conservan los enlaces.
 */
export function contextoDatos(
  reporte: Pick<ReporteCatalogo, "filtros" | "comparativo">,
  filtros: FiltrosReporte,
  nMinimo: number,
  nombres: NombresFiltros = {}
): ContextoDatos {
  const usaCorte = reporte.filtros.includes("corte")
  const comparacion = usaCorte
    ? `frente al corte anterior (${formatearFecha(filtros.corteAnterior, "largo")})`
    : textoComparacion(filtros)
  return {
    filtros: describirFiltros(reporte, filtros, nombres),
    comparacion: reporte.comparativo ? comparacion : null,
    nMinimo,
    periodo: usaCorte
      ? null
      : {
          desde: serializarFecha(filtros.rango.desde),
          hasta: serializarFecha(filtros.rango.hasta),
        },
  }
}
