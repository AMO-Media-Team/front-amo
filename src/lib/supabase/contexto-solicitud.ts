/**
 * Contexto de la solicitud del usuario (IP, ubicación aproximada, navegador) y
 * cabeceras de procedencia confiable hacia PostgREST (docs/modelo-datos.md §2.5).
 *
 * Módulo puro (sin `server-only` ni `next/headers`): lo usan `contexto.ts`
 * (Server Components y acciones) y el proxy, que recibe las cabeceras en el
 * `NextRequest`. En Vercel, `x-forwarded-for` y `x-vercel-ip-*` los fija la
 * plataforma; fuera de ella podrían venir del cliente, por eso la base de datos
 * solo los confía cuando `x-amo-srv` coincide.
 */
import { isIP } from "node:net"

export interface ContextoSolicitud {
  ip: string | null
  /** ISO 3166-1 alfa-2 en mayúsculas. */
  pais: string | null
  /** Subdivisión ISO 3166-2 sin el prefijo del país (`ANT`, `DC`), en mayúsculas. */
  region: string | null
  ciudad: string | null
  latitud: number | null
  longitud: number | null
  userAgent: string | null
}

/** Solicitud sin datos del usuario (scripts de servidor, pruebas). */
export const CONTEXTO_VACIO: ContextoSolicitud = {
  ip: null,
  pais: null,
  region: null,
  ciudad: null,
  latitud: null,
  longitud: null,
  userAgent: null,
}

export const CABECERAS_CONTEXTO = {
  secreto: "x-amo-srv",
  actor: "x-amo-actor",
  ip: "x-amo-ip",
  pais: "x-amo-pais",
  ciudad: "x-amo-ciudad",
  userAgent: "x-amo-ua",
} as const

const LONGITUD_MAXIMA_CIUDAD = 120
const LONGITUD_MAXIMA_UA = 400
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CARACTERES_CONTROL = /[\u0000-\u001f\u007f]/g

type LectorCabeceras = Pick<Headers, "get">

function textoLimpio(valor: string | null, maximo: number): string | null {
  const limpio = valor?.replace(CARACTERES_CONTROL, "").trim()
  return limpio ? limpio.slice(0, maximo) : null
}

/** Primera IP válida de `x-forwarded-for` (la del cliente) o `x-real-ip`. */
export function ipCliente(cabeceras: LectorCabeceras): string | null {
  const candidatas = [
    cabeceras.get("x-forwarded-for")?.split(",")[0],
    cabeceras.get("x-real-ip"),
  ]
  for (const candidata of candidatas) {
    const ip = candidata?.trim()
    // La base de datos la convierte a `inet`: un valor inválido abortaría el registro.
    if (ip && isIP(ip) !== 0) return ip
  }
  return null
}

function paisCliente(cabeceras: LectorCabeceras): string | null {
  const pais = cabeceras.get("x-vercel-ip-country")?.trim().toUpperCase()
  return pais && /^[A-Z]{2}$/.test(pais) ? pais : null
}

function regionCliente(cabeceras: LectorCabeceras): string | null {
  const region = cabeceras
    .get("x-vercel-ip-country-region")
    ?.trim()
    .toUpperCase()
  return region && /^[A-Z0-9]{1,3}$/.test(region) ? region : null
}

/** Vercel envía la ciudad codificada como URL (`Bogot%C3%A1`). */
function ciudadCliente(cabeceras: LectorCabeceras): string | null {
  const cruda = cabeceras.get("x-vercel-ip-city")
  if (!cruda) return null
  let decodificada = cruda
  try {
    decodificada = decodeURIComponent(cruda)
  } catch {
    // Codificación inválida: se conserva el valor original.
  }
  return textoLimpio(decodificada, LONGITUD_MAXIMA_CIUDAD)
}

function coordenada(valor: string | null, limite: number): number | null {
  if (!valor?.trim()) return null
  const numero = Number(valor)
  return Number.isFinite(numero) && Math.abs(numero) <= limite ? numero : null
}

export function extraerContextoSolicitud(
  cabeceras: LectorCabeceras
): ContextoSolicitud {
  return {
    ip: ipCliente(cabeceras),
    pais: paisCliente(cabeceras),
    region: regionCliente(cabeceras),
    ciudad: ciudadCliente(cabeceras),
    latitud: coordenada(cabeceras.get("x-vercel-ip-latitude"), 90),
    longitud: coordenada(cabeceras.get("x-vercel-ip-longitude"), 180),
    userAgent: textoLimpio(cabeceras.get("user-agent"), LONGITUD_MAXIMA_UA),
  }
}

/**
 * `fetch` solo admite valores de cabecera con caracteres ≤ U+00FF y los envía
 * byte a byte. Para que PostgREST reciba UTF-8 ("Medellín", "São Paulo") se
 * pasan los bytes UTF-8 como caracteres Latin-1.
 */
export function valorCabeceraUtf8(valor: string): string {
  return String.fromCharCode(...new TextEncoder().encode(valor))
}

export interface OpcionesCabecerasContexto {
  /** `AMO_SERVIDOR_SECRET`: prueba ante Postgres que la llamada sale del servidor. */
  secreto: string
  /** Usuario que origina la acción; solo tiene efecto con la secret key. */
  actorId?: string | null
}

export function construirCabecerasContexto(
  contexto: ContextoSolicitud,
  { secreto, actorId }: OpcionesCabecerasContexto
): Record<string, string> {
  const cabeceras: Record<string, string> = {
    [CABECERAS_CONTEXTO.secreto]: secreto,
  }
  if (actorId) {
    if (!UUID.test(actorId)) throw new Error("x-amo-actor debe ser un UUID.")
    cabeceras[CABECERAS_CONTEXTO.actor] = actorId
  }
  const opcionales = {
    [CABECERAS_CONTEXTO.ip]: contexto.ip,
    [CABECERAS_CONTEXTO.pais]: contexto.pais,
    [CABECERAS_CONTEXTO.ciudad]: contexto.ciudad,
    [CABECERAS_CONTEXTO.userAgent]: contexto.userAgent,
  }
  for (const [nombre, valor] of Object.entries(opcionales)) {
    if (valor) cabeceras[nombre] = valorCabeceraUtf8(valor)
  }
  return cabeceras
}
