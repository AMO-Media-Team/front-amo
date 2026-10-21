/**
 * Formatos propios de la operación (módulo puro): NIT, búsqueda normalizada
 * igual que en la BD, multiplicadores y
 * vigencias (columnas `date` de campañas y ofertas).
 */
import { etiquetaRango } from "@/features/auditoria/periodo"
import { diasEnRango, parsearFecha, ZONA } from "@/lib/fechas"
import { formatearFechaHora, formatearNumero } from "@/lib/format"

/** Dígitos mínimos para que un texto cuente como búsqueda por NIT. */
export const DIGITOS_MINIMOS_NIT = 4

/** "900123456" → "900.123.456" (miles con punto, como en el RUT). */
function agruparMiles(digitos: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

/**
 * NIT con dígito de verificación: "900.123.456-7". Es el identificador
 * tributario de una empresa, público en el RUES y en cada factura: no es un
 * dato sensible y no se enmascara (lo ve quien puede ver al anunciante). Los
 * datos personales del contacto sí lo son y viven en `anunciantes_privado`.
 */
export function formatearNit(
  nit: string | null,
  digitoVerificacion: string | null
): string | null {
  if (!nit) return null
  const base = /^\d+$/.test(nit) ? agruparMiles(nit) : nit
  return digitoVerificacion ? `${base}-${digitoVerificacion}` : base
}

/**
 * Misma normalización que `private.normalizar_texto` (minúsculas, sin tildes
 * ni puntuación, espacios colapsados) para buscar en `nombre_normalizado`. El
 * resultado solo tiene letras, números y espacios: no admite comodines.
 */
export function normalizarBusqueda(texto: string): string {
  return texto
    .replace(/¥/g, "ñ")
    .replace(/&/g, " y ")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[.'’‘`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

/** Patrón `ilike` para PostgREST a partir de una búsqueda ya normalizada. */
export function patronContiene(normalizado: string): string | null {
  return normalizado ? `%${normalizado.replace(/\s+/g, "%")}%` : null
}

/**
 * Texto libre para un `ilike` dentro de un `or(...)` de PostgREST: sin comas,
 * paréntesis, comillas, puntos ni comodines, que romperían o ampliarían el
 * filtro. Conserva tildes (la columna no está normalizada).
 */
export function textoParaFiltro(texto: string): string {
  return texto
    .replace(/[,()*%_\\"'.:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Cierra una frase con punto salvo que ya termine en uno: una hora acaba en
 * "a. m." y el punto de la abreviatura hace también de punto final.
 */
export function cerrarFrase(texto: string): string {
  return texto.endsWith(".") ? texto : `${texto}.`
}

/** "1 día" o "3 días": la cifra con su sustantivo en singular o plural. */
export function contar(
  cantidad: number,
  singular: string,
  plural: string
): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? singular : plural}`
}

/** "Sin asignaciones cumplidas", "1 asignación cumplida", "34 asignaciones cumplidas". */
export function contarCumplidas(cantidad: number): string {
  return cantidad <= 0
    ? "Sin asignaciones cumplidas"
    : contar(cantidad, "asignación cumplida", "asignaciones cumplidas")
}

/** Multiplicador de precio o de calidad: "1,15 ×". */
export function formatearMultiplicador(
  valor: number | null | undefined
): string {
  return valor === null || valor === undefined
    ? "—"
    : `${formatearNumero(valor, 3)} ×`
}

/** "@noticias.pasto" (el handle se guarda sin arroba). */
export function formatearHandle(handle: string): string {
  return handle.startsWith("@") ? handle : `@${handle}`
}

/** Calificación promedio 1–5 con un decimal: "4,3". */
export function formatearCalificacion(valor: number | null): string {
  return valor === null ? "—" : formatearNumero(valor, 1)
}

// ── Días de calendario (`date`) ──────────────────────────────────────────────

/**
 * Una columna `date` ('YYYY-MM-DD') como el mediodía de ese día en Bogotá:
 * así `formatearFecha` no la corre al día anterior al pasarla por UTC.
 */
export function instanteDeDia(dia: string): string {
  return `${dia}T12:00:00-05:00`
}

/** "1 de sept – 30 de nov de 2026"; con fechas inválidas, el texto tal cual. */
export function formatearVigencia(inicio: string, fin: string): string {
  const desde = parsearFecha(inicio)
  const hasta = parsearFecha(fin)
  if (!desde || !hasta) return `${inicio} – ${fin}`
  return etiquetaRango({ preset: "personalizado", desde, hasta })
}

/** Días de calendario de una vigencia, ambos extremos incluidos (0 si es inválida). */
export function diasDeVigencia(inicio: string, fin: string): number {
  const desde = parsearFecha(inicio)
  const hasta = parsearFecha(fin)
  if (!desde || !hasta || hasta < desde) return 0
  return diasEnRango({ preset: "personalizado", desde, hasta })
}

export type FaseVigencia = "por_iniciar" | "en_curso" | "terminada"

/** ¿La vigencia aún no empieza, está en curso o ya terminó? (días de Bogotá). */
export function faseVigencia(
  inicio: string,
  fin: string,
  hoy: string
): FaseVigencia {
  if (hoy < inicio) return "por_iniciar"
  if (hoy > fin) return "terminada"
  return "en_curso"
}

const diaMesAnio = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  day: "numeric",
  month: "short",
  year: "numeric",
})

interface PartesFecha {
  dia: string
  mes: string
  anio: string
}

function partesDe(instante: string): PartesFecha | null {
  const fecha = new Date(instante)
  if (Number.isNaN(fecha.getTime())) return null
  const partes = diaMesAnio.formatToParts(fecha)
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value.replace(".", "") ?? ""
  return { dia: parte("day"), mes: parte("month"), anio: parte("year") }
}

/** "29 sept" (hora de Bogotá, sin "de"): fechas compactas de pasos y ejes. */
export function formatearDiaMes(instante: string): string {
  const partes = partesDe(instante)
  return partes ? `${partes.dia} ${partes.mes}` : "—"
}

/** "29 sept 2026" (hora de Bogotá, sin "de"): fechas de columnas angostas. */
export function formatearFechaCompacta(instante: string | null): string {
  const partes = instante ? partesDe(instante) : null
  return partes ? `${partes.dia} ${partes.mes} ${partes.anio}` : "—"
}

/**
 * Rango entre dos instantes sin repetir lo que comparten: "7 – 21 oct 2026",
 * "14 sept – 14 nov 2026" o "23 dic 2026 – 8 ene 2027" (hora de Bogotá).
 */
export function formatearRangoCompacto(inicio: string, fin: string): string {
  const desde = partesDe(inicio)
  const hasta = partesDe(fin)
  if (!desde || !hasta) return "—"
  const final = `${hasta.dia} ${hasta.mes} ${hasta.anio}`
  if (desde.anio !== hasta.anio) {
    return `${desde.dia} ${desde.mes} ${desde.anio} – ${final}`
  }
  if (desde.mes !== hasta.mes) return `${desde.dia} ${desde.mes} – ${final}`
  return desde.dia === hasta.dia ? final : `${desde.dia} – ${final}`
}

const ESPACIO_FIJO = " "

/**
 * Fecha y hora que no se parte entre la hora y "a. m." / "p. m." (el formato
 * de es-CO usa espacios normales y en columnas angostas deja "m." colgando).
 */
export function formatearFechaHoraFija(instante: string | null): string {
  if (!instante) return "—"
  return formatearFechaHora(instante).replace(
    /\s([ap])\.\s?m\./i,
    `${ESPACIO_FIJO}$1.${ESPACIO_FIJO}m.`
  )
}

// ── Ubicación ────────────────────────────────────────────────────────────────

/** "Pasto, Nariño": une lo que haya del municipio y el departamento. */
export function unirUbicacion(
  municipio: string | null,
  departamento: string | null
): string | null {
  const partes = [municipio, departamento].filter((parte): parte is string =>
    Boolean(parte?.trim())
  )
  return partes.length > 0 ? partes.join(", ") : null
}
