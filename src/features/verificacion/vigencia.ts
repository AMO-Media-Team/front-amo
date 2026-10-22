/**
 * Vigencia de un documento al aprobarlo (MED-003), módulo puro. La fecha es un
 * día de calendario de Bogotá (`YYYY-MM-DD`, columna `date`); el cron vence el
 * documento al día siguiente de esa fecha.
 */

const FORMATO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/

function aPartes(dia: string): [number, number, number] | null {
  const coincidencia = FORMATO_DIA.exec(dia)
  if (!coincidencia) return null
  const [anio, mes, diaMes] = coincidencia.slice(1).map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1, diaMes))
  const real =
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === diaMes
  return real ? [anio, mes, diaMes] : null
}

/** ¿Es un día real con el formato `YYYY-MM-DD`? */
export function esDiaValido(dia: string): boolean {
  return aPartes(dia) !== null
}

function dosCifras(valor: number): string {
  return String(valor).padStart(2, "0")
}

/**
 * Suma meses de calendario: el 31 de enero más un mes es el 28 (o 29) de
 * febrero, no el 3 de marzo.
 */
export function sumarMeses(dia: string, meses: number): string {
  const partes = aPartes(dia)
  if (!partes) throw new RangeError(`Día inválido: ${dia}`)
  const [anio, mes, diaMes] = partes
  const indice = anio * 12 + (mes - 1) + Math.trunc(meses)
  const anioNuevo = Math.floor(indice / 12)
  const mesNuevo = (indice % 12) + 1
  const ultimoDia = new Date(Date.UTC(anioNuevo, mesNuevo, 0)).getUTCDate()
  return `${anioNuevo}-${dosCifras(mesNuevo)}-${dosCifras(Math.min(diaMes, ultimoDia))}`
}

export interface AtajoVigencia {
  etiqueta: string
  meses: number
}

/** Atajos para fijar la vigencia sin abrir el calendario. */
export const ATAJOS_VIGENCIA: readonly AtajoVigencia[] = [
  { etiqueta: "3 meses", meses: 3 },
  { etiqueta: "6 meses", meses: 6 },
  { etiqueta: "1 año", meses: 12 },
  { etiqueta: "5 años", meses: 60 },
]

/** Un documento no se aprueba con una vigencia que ya pasó. */
export function vigenciaAdmisible(dia: string, hoy: string): boolean {
  return esDiaValido(dia) && dia >= hoy
}
