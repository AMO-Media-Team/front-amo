/**
 * Cuenta regresiva hasta un plazo (lógica pura): texto en español de
 * Colombia y urgencia con la que se colorea. La usan `CuentaRegresiva` y
 * cualquier lista de pendientes con fecha límite.
 */

export type UrgenciaPlazo = "vencida" | "critica" | "pronto" | "holgada"

export interface UmbralesUrgencia {
  /** Con menos de estas horas restantes el plazo es crítico. */
  readonly criticaHoras: number
  /** Con menos de estas horas restantes el plazo está próximo. */
  readonly prontoHoras: number
}

export const UMBRALES_URGENCIA: UmbralesUrgencia = {
  criticaHoras: 6,
  prontoHoras: 24,
}

export interface TextosPlazo {
  /** Antes del plazo: «Vence en 4 h 12 min». */
  readonly pendiente: string
  /** Pasado el plazo: «Venció hace 3 h». */
  readonly vencido: string
  /** Sin fecha (o ilegible). */
  readonly sinFecha: string
}

export const TEXTOS_PLAZO: TextosPlazo = {
  pendiente: "Vence en",
  vencido: "Venció hace",
  sinFecha: "Sin fecha límite",
}

export interface Plazo {
  readonly urgencia: UrgenciaPlazo
  /** «Vence en 2 h 15 min», «Venció hace 3 h», «Vence en 4 días». */
  readonly texto: string
  /** Negativo si ya venció; `null` sin fecha límite. */
  readonly minutosRestantes: number | null
}

export interface OpcionesPlazo {
  readonly umbrales?: Partial<UmbralesUrgencia>
  readonly textos?: Partial<TextosPlazo>
}

export type EntradaPlazo = string | number | Date | null | undefined

const MINUTO_MS = 60_000
const MINUTOS_DIA = 60 * 24

/**
 * Duración legible, con la precisión que importa a cada escala: minutos
 * cuando queda menos de una hora, horas y minutos dentro del día, «1 día 2 h»
 * el día siguiente y solo días a partir de dos. Nunca «0 min».
 *
 * Trunca los minutos (no redondea): con 5 h 59 min 40 s restantes dice
 * «5 h 59 min», coherente con la urgencia crítica (menos de 6 h).
 */
export function describirDuracion(minutos: number): string {
  const total = Math.floor(Math.abs(minutos))
  const dias = Math.floor(total / MINUTOS_DIA)
  const horas = Math.floor((total % MINUTOS_DIA) / 60)
  const mins = total % 60
  if (dias >= 2) return `${dias} días`
  if (dias === 1) return horas > 0 ? `1 día ${horas} h` : "1 día"
  if (horas > 0) return mins > 0 ? `${horas} h ${mins} min` : `${horas} h`
  return `${Math.max(1, mins)} min`
}

/** Instante del plazo en milisegundos; `NaN` sin fecha o si es ilegible. */
export function milisegundosDe(venceAt: EntradaPlazo): number {
  if (venceAt === null || venceAt === undefined || venceAt === "") {
    return Number.NaN
  }
  return venceAt instanceof Date
    ? venceAt.getTime()
    : new Date(venceAt).getTime()
}

/** Cuenta regresiva hasta `venceAt` vista en el instante `ahora`. */
export function calcularPlazo(
  venceAt: EntradaPlazo,
  ahora: Date,
  opciones: OpcionesPlazo = {}
): Plazo {
  const textos = { ...TEXTOS_PLAZO, ...opciones.textos }
  const umbrales = { ...UMBRALES_URGENCIA, ...opciones.umbrales }
  const limite = milisegundosDe(venceAt)
  if (!Number.isFinite(limite)) {
    return {
      urgencia: "holgada",
      texto: textos.sinFecha,
      minutosRestantes: null,
    }
  }
  const minutos = (limite - ahora.getTime()) / MINUTO_MS
  if (minutos <= 0) {
    return {
      urgencia: "vencida",
      texto: `${textos.vencido} ${describirDuracion(minutos)}`,
      minutosRestantes: Math.round(minutos),
    }
  }
  const horas = minutos / 60
  return {
    urgencia:
      horas < umbrales.criticaHoras
        ? "critica"
        : horas < umbrales.prontoHoras
          ? "pronto"
          : "holgada",
    texto: `${textos.pendiente} ${describirDuracion(minutos)}`,
    minutosRestantes: Math.round(minutos),
  }
}

/** Cómo se nombra cada urgencia para quien no ve el color. */
export const NOMBRE_URGENCIA: Readonly<Record<UrgenciaPlazo, string>> = {
  vencida: "Vencido",
  critica: "Urgente",
  pronto: "Próximo a vencer",
  holgada: "Con tiempo",
}

/**
 * Aviso para lectores de pantalla cuando la urgencia sube de nivel (no en
 * cada minuto: sería ruido). Volver a «con tiempo» (p. ej. al ampliar el
 * plazo) no se anuncia.
 */
export function anuncioCambioUrgencia(plazo: Plazo, etiqueta?: string): string {
  if (plazo.urgencia === "holgada") return ""
  const sujeto = etiqueta ? `${etiqueta}: ` : ""
  const texto = etiqueta
    ? plazo.texto.charAt(0).toLowerCase() + plazo.texto.slice(1)
    : plazo.texto
  const cierre =
    plazo.urgencia === "critica"
      ? " Es urgente."
      : plazo.urgencia === "vencida"
        ? " El plazo ya pasó."
        : ""
  return `${sujeto}${texto}.${cierre}`
}
