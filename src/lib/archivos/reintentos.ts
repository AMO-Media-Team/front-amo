/**
 * Política de reintentos de las subidas: espera creciente con variación
 * aleatoria (para que muchos celulares que recuperan la señal a la vez no
 * golpeen Storage al mismo tiempo) y qué fallos vale la pena repetir.
 */

export interface PoliticaReintentos {
  /** Reintentos automáticos tras el primer intento. */
  intentos: number
  baseMs: number
  maxMs: number
}

export const POLITICA_REINTENTOS: PoliticaReintentos = {
  intentos: 4,
  baseMs: 1_000,
  maxMs: 30_000,
}

/**
 * Espera antes del reintento número `intento` (1, 2, …): base·2^(n−1) con
 * tope, multiplicada por un factor en [0,5; 1].
 */
export function esperaReintento(
  intento: number,
  politica: PoliticaReintentos = POLITICA_REINTENTOS,
  aleatorio: () => number = Math.random
): number {
  const exponencial = politica.baseMs * 2 ** Math.max(0, intento - 1)
  const tope = Math.min(politica.maxMs, exponencial)
  return Math.round(tope * (0.5 + aleatorio() / 2))
}

/**
 * Estado HTTP efectivo de un fallo (`null` = sin respuesta: red caída, CORS,
 * tiempo agotado). Se repiten los de red, los transitorios y los 5xx; un 4xx
 * (permiso, formato, peso) no cambia por insistir.
 */
export function esReintentable(estado: number | null): boolean {
  if (estado === null || estado === 0) return true
  if ([408, 409, 423, 425, 429].includes(estado)) return true
  return estado >= 500
}

const MENSAJES_POR_ESTADO: Readonly<Record<number, string>> = {
  400: "Storage rechazó el archivo. Vuelve a intentarlo; si se repite, elige el archivo de nuevo.",
  401: "Tu sesión venció. Recarga la página e inténtalo de nuevo.",
  403: "No tienes permiso para subir este archivo aquí o el enlace de subida venció.",
  404: "El destino de la subida ya no existe. Vuelve a intentarlo.",
  413: "El archivo supera el tamaño que admite este espacio.",
  415: "Este formato de archivo no se admite aquí.",
  429: "Hay demasiadas subidas seguidas. Espera un momento.",
}

/** Mensaje en español para un fallo de subida según su estado HTTP. */
export function mensajeFalloSubida(estado: number | null): string {
  if (estado === null || estado === 0) {
    return "Se perdió la conexión mientras se subía el archivo."
  }
  if (estado >= 500) {
    return "El servicio de archivos no respondió. Inténtalo de nuevo en unos minutos."
  }
  return (
    MENSAJES_POR_ESTADO[estado] ??
    "No se pudo subir el archivo. Inténtalo de nuevo."
  )
}

/** Fallo de transporte con su estado HTTP efectivo (`null` = sin respuesta). */
export class ErrorSubida extends Error {
  readonly estado: number | null

  constructor(estado: number | null, mensaje = mensajeFalloSubida(estado)) {
    super(mensaje)
    this.name = "ErrorSubida"
    this.estado = estado
  }

  get reintentable(): boolean {
    return esReintentable(this.estado)
  }
}

/** Error de cancelación con la forma estándar (`AbortError`). */
export function errorCancelada(): DOMException {
  return new DOMException("Subida cancelada.", "AbortError")
}

export function esCancelacion(error: unknown): boolean {
  return (
    (error instanceof DOMException || error instanceof Error) &&
    error.name === "AbortError"
  )
}

/**
 * Storage a veces responde 400 con el estado real en el cuerpo
 * (`{ "statusCode": "403", … }`): se prefiere ese.
 */
export function estadoEfectivo(
  estadoHttp: number,
  cuerpo: string | null | undefined
): number {
  if (!cuerpo) return estadoHttp
  try {
    const datos: unknown = JSON.parse(cuerpo)
    if (datos && typeof datos === "object" && "statusCode" in datos) {
      const interno = Number(datos.statusCode)
      if (Number.isInteger(interno) && interno >= 400 && interno < 600) {
        return interno
      }
    }
  } catch {
    // Cuerpo que no es JSON (proxy, HTML de error): vale el estado HTTP.
  }
  return estadoHttp
}
