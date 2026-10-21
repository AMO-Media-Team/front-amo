/**
 * Ejes temporales de los gráficos del panel: etiquetas legibles de cada
 * periodo ('YYYY-MM-DD' de las RPC) y cubetas completas cuando la RPC solo
 * devuelve los periodos con datos. Son fechas de calendario (Bogotá) sin
 * hora: se calculan en UTC puro para no desplazar el día. Módulo puro.
 */
import type { Granularidad } from "./periodo"

const DIA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_DIA = 86_400_000

/** 'YYYY-MM-DD' → instante UTC de ese día de calendario; `null` si no es una fecha. */
export function diaCalendario(texto: string): Date | null {
  const partes = DIA_ISO.exec(texto)
  if (!partes) return null
  const [anio, mes, dia] = partes.slice(1).map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  return fecha.getUTCMonth() === mes - 1 ? fecha : null
}

function aTexto(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}

const formatoDia = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
})
const formatoMes = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  month: "short",
})
const formatoMesAnio = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
})

/**
 * "14 de sept" → "14 sept" y "sept." → "sept": cabe en el eje y todas las
 * etiquetas se escriben igual (es-CO añade el punto al mes abreviado solo).
 */
function sinPreposicion(texto: string): string {
  return texto.replace(/\s+de\s+/g, " ").replace(/\.$/, "")
}

/**
 * "14 sept" (día), "Sem. 14 sept" (semana que empieza ese lunes) o "sept"
 * (mes; con el año si el eje cruza de año).
 */
export function etiquetaPeriodo(
  periodo: string,
  granularidad: Granularidad,
  conAnio = false
): string {
  const fecha = diaCalendario(periodo)
  if (!fecha) return periodo
  switch (granularidad) {
    case "dia":
      return sinPreposicion(formatoDia.format(fecha))
    case "semana":
      return `Sem. ${sinPreposicion(formatoDia.format(fecha))}`
    case "mes":
      return sinPreposicion(
        (conAnio ? formatoMesAnio : formatoMes).format(fecha)
      )
  }
}

/** ¿Los periodos abarcan más de un año? (las etiquetas de mes llevan el año). */
export function cruzaDeAnio(periodos: readonly string[]): boolean {
  const anios = new Set(periodos.map((periodo) => periodo.slice(0, 4)))
  return anios.size > 1
}

export function etiquetasPeriodos(
  periodos: readonly string[],
  granularidad: Granularidad
): string[] {
  const conAnio = cruzaDeAnio(periodos)
  return periodos.map((periodo) =>
    etiquetaPeriodo(periodo, granularidad, conAnio)
  )
}

/** Lunes de la semana ISO del día. */
function lunesDe(fecha: Date): Date {
  const desdeLunes = (fecha.getUTCDay() + 6) % 7
  return new Date(fecha.getTime() - desdeLunes * MS_DIA)
}

/**
 * Cubetas del sparkline y de los cortes por fecha (igual que
 * `private.cubetas`): un día por día hasta 31 días; si no, el lunes de cada
 * semana ISO que toca el rango.
 */
export function cubetasDelRango(desde: string, hasta: string): string[] {
  const inicio = diaCalendario(desde)
  const fin = diaCalendario(hasta)
  if (!inicio || !fin || fin < inicio) return []
  const dias = Math.round((fin.getTime() - inicio.getTime()) / MS_DIA) + 1
  const cubetas = new Set<string>()
  for (let i = 0; i < dias; i++) {
    const dia = new Date(inicio.getTime() + i * MS_DIA)
    cubetas.add(aTexto(dias <= 31 ? dia : lunesDe(dia)))
  }
  return [...cubetas]
}

/**
 * Una fila por cubeta, en orden: las que la RPC no trajo se rellenan con
 * `vacia(cubeta)` (cero, no "sin dato": el periodo existió sin actividad).
 */
export function completarCubetas<T>(
  cubetas: readonly string[],
  filas: readonly T[],
  clave: (fila: T) => string,
  vacia: (cubeta: string) => T
): T[] {
  const porClave = new Map(filas.map((fila) => [clave(fila), fila]))
  return cubetas.map((cubeta) => porClave.get(cubeta) ?? vacia(cubeta))
}
