/**
 * Formateo es-CO para la UI. Los `Intl.*Format` se crean una sola vez a nivel
 * de módulo (crearlos por llamada es costoso) y todas las fechas se expresan en
 * la zona de Bogotá, aunque el servidor corra en UTC.
 */
import { ZONA } from "./fechas"

export const LOCALE = "es-CO"

/** Decimales de la cifra abreviada: "1,3 M", "250,9 mil M". */
const DECIMALES_COMPACTO = 1

/** Opciones compartidas con `NumeroAnimado` para que cifras y animaciones coincidan. */
export const OPCIONES_NUMERO = {
  cop: { style: "currency", currency: "COP", maximumFractionDigits: 0 },
  /** La cifra ya escalada de la notación compacta (ver `descomponerCompacto`). */
  compacto: { maximumFractionDigits: DECIMALES_COMPACTO },
} as const satisfies Record<string, Intl.NumberFormatOptions>

const SIN_VALOR = "—"
/** Espacio duro: la cifra y su abreviatura no se separan al saltar de línea. */
const ESPACIO_DURO = "\u00a0"
const SIMBOLO_COP = "$"

const formatoCOP = new Intl.NumberFormat(LOCALE, OPCIONES_NUMERO.cop)
const formatoCompacto = new Intl.NumberFormat(LOCALE, OPCIONES_NUMERO.compacto)

/** Caché por número de decimales (los valores posibles son pocos). */
function memoizarPorDecimales(
  crear: (decimales: number) => Intl.NumberFormat
): (decimales: number) => Intl.NumberFormat {
  const cache = new Map<number, Intl.NumberFormat>()
  return (decimales) => {
    let formato = cache.get(decimales)
    if (!formato) {
      formato = crear(decimales)
      cache.set(decimales, formato)
    }
    return formato
  }
}

export function opcionesPorcentaje(decimales: number, conSigno = false) {
  return {
    style: "percent",
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    signDisplay: conSigno ? "exceptZero" : "auto",
  } as const satisfies Intl.NumberFormatOptions
}

const formatoNumero = memoizarPorDecimales(
  (decimales) =>
    new Intl.NumberFormat(LOCALE, { maximumFractionDigits: decimales })
)
const formatoPorcentaje = memoizarPorDecimales(
  (decimales) => new Intl.NumberFormat(LOCALE, opcionesPorcentaje(decimales))
)
const formatoPorcentajeConSigno = memoizarPorDecimales(
  (decimales) =>
    new Intl.NumberFormat(LOCALE, opcionesPorcentaje(decimales, true))
)

type Numerico = number | null | undefined

function esNumeroValido(valor: Numerico): valor is number {
  return typeof valor === "number" && Number.isFinite(valor)
}

/** $ 1.234.567 */
export function formatearCOP(valor: Numerico): string {
  return esNumeroValido(valor) ? formatoCOP.format(valor) : SIN_VALOR
}

// ── Notación compacta ───────────────────────────────────────────────────────

/**
 * Escalas de la notación compacta, de menor a mayor. Regla única de la app
 * (escala larga del español: un billón es un millón de millones):
 * «mil» = 10³ · «M» = millones · «mil M» = miles de millones · «B» = billones.
 * No se usa la notación compacta de `Intl`: en es-CO mezcla «K» y «k», deja
 * «1656 M» sin separador de miles y solo pasa a «mil M» desde diez mil millones.
 */
const ESCALAS_COMPACTAS = [
  { factor: 1, abreviatura: "" },
  { factor: 1e3, abreviatura: "mil" },
  { factor: 1e6, abreviatura: "M" },
  { factor: 1e9, abreviatura: `mil${ESPACIO_DURO}M` },
  { factor: 1e12, abreviatura: "B" },
] as const

/** Una cifra escalada nunca llega a mil: pasa a la escala siguiente. */
const TOPE_ESCALA = 1000

export interface CifraCompacta {
  /** Cifra ya dividida por su escala y redondeada (conserva el signo). */
  valor: number
  /** Abreviatura con su espacio duro (" M"), o vacío por debajo de mil. */
  sufijo: string
}

function redondearCompacto(valor: number): number {
  const precision = 10 ** DECIMALES_COMPACTO
  return Math.round(valor * precision) / precision
}

/**
 * Parte una cifra en valor escalado y abreviatura: 1.656.000.000 →
 * { valor: 1,7, sufijo: " mil M" }. Lo comparten los formateadores de texto y
 * `NumeroAnimado`, así la cifra animada y la escrita siempre coinciden.
 */
export function descomponerCompacto(valor: number): CifraCompacta {
  const ultima = ESCALAS_COMPACTAS.length - 1
  // La primera escala cuya cifra, ya redondeada, no llega a mil: 999.950 es
  // "1 M", no "1.000 mil". Los billones no tienen a dónde saltar ("1.250 B").
  const indice = ESCALAS_COMPACTAS.findIndex(
    ({ factor }, i) =>
      i === ultima || Math.abs(redondearCompacto(valor / factor)) < TOPE_ESCALA
  )
  const { factor, abreviatura } = ESCALAS_COMPACTAS[indice]
  return {
    valor: redondearCompacto(valor / factor),
    sufijo: abreviatura ? `${ESPACIO_DURO}${abreviatura}` : "",
  }
}

/** Signo y símbolo que anteceden a una cifra abreviada en pesos: "$", "-$". */
export function prefijoCOPCompacto(valor: number): string {
  return valor < 0 ? `-${SIMBOLO_COP}` : SIMBOLO_COP
}

/**
 * $ 950 · $13,5 mil · $1,3 M · $2,6 mil M · $1,3 B. Por debajo de mil no hay
 * nada que abreviar: la cifra es la misma de `formatearCOP`.
 */
export function formatearCOPCompacto(valor: Numerico): string {
  if (!esNumeroValido(valor)) return SIN_VALOR
  const cifra = descomponerCompacto(valor)
  if (!cifra.sufijo) return formatoCOP.format(valor)
  const magnitud = formatoCompacto.format(Math.abs(cifra.valor))
  return `${prefijoCOPCompacto(cifra.valor)}${magnitud}${cifra.sufijo}`
}

/** 1.234.567 (hasta `decimales` decimales, sin ceros de relleno). */
export function formatearNumero(valor: Numerico, decimales = 0): string {
  return esNumeroValido(valor)
    ? formatoNumero(decimales).format(valor)
    : SIN_VALOR
}

/** 950 · 13,5 mil · 1,3 M · 2,6 mil M · 1,3 B */
export function formatearCompacto(valor: Numerico): string {
  if (!esNumeroValido(valor)) return SIN_VALOR
  const cifra = descomponerCompacto(valor)
  return `${formatoCompacto.format(cifra.valor)}${cifra.sufijo}`
}

/** Recibe una fracción: 0.125 → "12,5%". */
export function formatearPorcentaje(fraccion: Numerico, decimales = 1): string {
  return esNumeroValido(fraccion)
    ? formatoPorcentaje(decimales).format(fraccion)
    : SIN_VALOR
}

export type Tendencia = "sube" | "baja" | "estable"

const FLECHAS: Record<Tendencia, string> = {
  sube: "↑",
  baja: "↓",
  estable: "→",
}

/** Tendencia tras redondear a los decimales mostrados (evita "↑ 0,0%"). */
export function tendenciaDelta(fraccion: number, decimales = 1): Tendencia {
  const escala = 100 * 10 ** decimales
  const redondeado = Math.round(fraccion * escala)
  if (redondeado > 0) return "sube"
  if (redondeado < 0) return "baja"
  return "estable"
}

/** Variación relativa con flecha y signo: 0.125 → "↑ +12,5%"; sin base → "—". */
export function formatearDelta(fraccion: Numerico, decimales = 1): string {
  if (!esNumeroValido(fraccion)) return SIN_VALOR
  const tendencia = tendenciaDelta(fraccion, decimales)
  const valor = tendencia === "estable" ? 0 : fraccion
  const texto = formatoPorcentajeConSigno(decimales).format(valor)
  return `${FLECHAS[tendencia]} ${texto}`
}

/** Variación relativa entre dos periodos; `null` si no hay base de comparación. */
export function calcularDelta(actual: number, anterior: number): number | null {
  if (
    !Number.isFinite(actual) ||
    !Number.isFinite(anterior) ||
    anterior === 0
  ) {
    return null
  }
  return (actual - anterior) / Math.abs(anterior)
}

// ── Fechas ──────────────────────────────────────────────────────────────────

export type EstiloFecha = "corto" | "medio" | "largo"

const FORMATOS_FECHA: Record<EstiloFecha, Intl.DateTimeFormat> = {
  corto: new Intl.DateTimeFormat(LOCALE, {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }),
  medio: new Intl.DateTimeFormat(LOCALE, {
    timeZone: ZONA,
    day: "numeric",
    month: "short",
    year: "numeric",
  }),
  largo: new Intl.DateTimeFormat(LOCALE, {
    timeZone: ZONA,
    day: "numeric",
    month: "long",
    year: "numeric",
  }),
}

const formatoFechaHora = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONA,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

type EntradaFecha = Date | string | number | null | undefined

function aFecha(entrada: EntradaFecha): Date | null {
  if (entrada === null || entrada === undefined || entrada === "") return null
  const fecha = entrada instanceof Date ? entrada : new Date(entrada)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

/** corto "29/09/2026" · medio "29 de sept de 2026" · largo "29 de septiembre de 2026" */
export function formatearFecha(
  entrada: EntradaFecha,
  estilo: EstiloFecha = "medio"
): string {
  const fecha = aFecha(entrada)
  return fecha ? FORMATOS_FECHA[estilo].format(fecha) : SIN_VALOR
}

/** "30 de sept de 2026, 3:05 p. m." (hora de Bogotá). */
export function formatearFechaHora(entrada: EntradaFecha): string {
  const fecha = aFecha(entrada)
  return fecha ? formatoFechaHora.format(fecha) : SIN_VALOR
}

const formatoRelativo = new Intl.RelativeTimeFormat(LOCALE, {
  numeric: "auto",
})

type UnidadRelativa = readonly [Intl.RelativeTimeFormatUnit, number]

const SEGUNDO: UnidadRelativa = ["second", 1]

/** De mayor a menor: se usa la primera unidad que cabe en la distancia. */
const UNIDADES_RELATIVAS: ReadonlyArray<UnidadRelativa> = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
  SEGUNDO,
]

/** "hace 5 minutos", "ayer", "en 2 semanas", "ahora". */
export function formatearRelativo(
  entrada: EntradaFecha,
  ahora: Date = new Date()
): string {
  const fecha = aFecha(entrada)
  if (!fecha) return SIN_VALOR

  const segundos = Math.round((fecha.getTime() - ahora.getTime()) / 1000)
  const distancia = Math.abs(segundos)
  if (distancia < 45) return formatoRelativo.format(0, "second")

  const [unidad, duracion] =
    UNIDADES_RELATIVAS.find(([, s]) => distancia >= s) ?? SEGUNDO
  return formatoRelativo.format(Math.trunc(segundos / duracion), unidad)
}
