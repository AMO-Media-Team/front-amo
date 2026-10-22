/**
 * Cuentas sociales que declara un medio en su solicitud de vinculación
 * (módulo puro, cliente y servidor).
 *
 * La persona escribe el usuario («@noticias.pasto») o pega el enlace de su
 * perfil; aquí se reduce a un usuario canónico, que es lo que se guarda en
 * `solicitudes_vinculacion.cuentas` (la BD solo exige 1–120 caracteres). Los
 * seguidores son aproximados y se aceptan como se dicen: «45.000», «45 mil»,
 * «1,2 M».
 */
import type { Database } from "@/types/database.types"

export type PlataformaCuenta = Database["public"]["Enums"]["plataforma"]

/** Orden en que se ofrecen (y en que se proponen al agregar otra cuenta). */
export const PLATAFORMAS_CUENTA = [
  "INSTAGRAM",
  "FACEBOOK",
  "TIKTOK",
] as const satisfies readonly PlataformaCuenta[]

export const NOMBRES_PLATAFORMA: Readonly<Record<PlataformaCuenta, string>> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
}

/** `private.cuentas_solicitud_validas`: de 1 a 6 cuentas. */
export const MINIMO_CUENTAS = 1
export const MAXIMO_CUENTAS = 6
export const MAXIMO_SEGUIDORES = 1_000_000_000
const LARGO_MAXIMO_ENTRADA = 300

export type ResultadoUsuario =
  { ok: true; usuario: string } | { ok: false; mensaje: string }

export type ResultadoSeguidores =
  { ok: true; valor: number | null } | { ok: false; mensaje: string }

// ── Usuario ─────────────────────────────────────────────────────────────────

const DOMINIOS: Readonly<Record<PlataformaCuenta, readonly string[]>> = {
  INSTAGRAM: ["instagram.com", "instagr.am"],
  FACEBOOK: ["facebook.com", "fb.com", "fb.me"],
  TIKTOK: ["tiktok.com"],
}

/** Reglas de cada red para el nombre de usuario (Facebook admite páginas con tildes). */
const PATRONES: Readonly<Record<PlataformaCuenta, RegExp>> = {
  INSTAGRAM: /^[a-z0-9._]{1,30}$/,
  TIKTOK: /^[a-z0-9._]{2,24}$/,
  FACEBOOK: /^[\p{L}\p{N}.-]{2,80}$/u,
}

const AYUDA_PATRON: Readonly<Record<PlataformaCuenta, string>> = {
  INSTAGRAM:
    "El usuario de Instagram solo lleva letras, números, puntos y guiones bajos (máximo 30).",
  TIKTOK:
    "El usuario de TikTok solo lleva letras, números, puntos y guiones bajos (de 2 a 24).",
  FACEBOOK:
    "Escribe el nombre de usuario de la página (lo que va después de facebook.com/) o pega su enlace.",
}

/** Rutas que no son un perfil (publicaciones, secciones de la app). */
const RUTAS_NO_PERFIL: Readonly<Record<PlataformaCuenta, readonly string[]>> = {
  INSTAGRAM: ["p", "reel", "reels", "stories", "tv", "explore", "accounts"],
  TIKTOK: ["video", "t", "tag", "discover", "music", "foryou"],
  FACEBOOK: [
    "share",
    "watch",
    "photo",
    "photo.php",
    "story.php",
    "permalink.php",
    "reel",
    "events",
    "groups",
    "marketplace",
    "hashtag",
  ],
}

const MENSAJE_VACIO = "Escribe el usuario o pega el enlace del perfil."
const MENSAJE_PUBLICACION =
  "Ese enlace es de una publicación. Abre el perfil del medio y copia su enlace, o escribe solo el usuario."

function hostDe(url: URL): string {
  return url.hostname.toLowerCase().replace(/^(?:www|m|web|mobile|vm)\./, "")
}

function plataformaDeHost(host: string): PlataformaCuenta | null {
  for (const plataforma of PLATAFORMAS_CUENTA) {
    if (
      DOMINIOS[plataforma].some(
        (dominio) => host === dominio || host.endsWith(`.${dominio}`)
      )
    ) {
      return plataforma
    }
  }
  return null
}

function pareceEnlace(texto: string): boolean {
  return /^https?:\/\//i.test(texto) || /^[\w.-]+\.[a-z]{2,}\//i.test(texto)
}

function leerEnlace(texto: string): URL | null {
  try {
    return new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`)
  } catch {
    return null
  }
}

function segmentos(url: URL): string[] {
  return url.pathname
    .split("/")
    .map((segmento) => {
      try {
        return decodeURIComponent(segmento)
      } catch {
        return segmento
      }
    })
    .filter(Boolean)
}

/** Usuario dentro de la ruta del enlace de un perfil; `null` si no es un perfil. */
function usuarioDeEnlace(
  plataforma: PlataformaCuenta,
  url: URL
): string | null {
  const partes = segmentos(url)
  if (plataforma === "FACEBOOK") {
    // facebook.com/profile.php?id=100089…  ·  facebook.com/people/Nombre/100089…
    if (partes[0] === "profile.php") return url.searchParams.get("id")
    if (partes[0] === "people" || partes[0] === "pages") {
      return partes.at(-1) ?? null
    }
    if (partes[0] === "pg") return partes[1] ?? null
  }
  const primera = partes[0]
  if (!primera) return null
  if (RUTAS_NO_PERFIL[plataforma].includes(primera.toLowerCase())) return null
  if (plataforma === "TIKTOK") {
    return primera.startsWith("@") ? primera.slice(1) : null
  }
  return primera
}

function canonico(plataforma: PlataformaCuenta, usuario: string): string {
  const limpio = usuario.trim().replace(/^@+/, "")
  // Instagram y TikTok no distinguen mayúsculas; Facebook se conserva legible.
  return plataforma === "FACEBOOK" ? limpio : limpio.toLowerCase()
}

/**
 * Usuario canónico (sin «@») a partir de lo que escribió la persona: el
 * usuario o el enlace del perfil. Rechaza enlaces de otra red, de
 * publicaciones y usuarios que la red no admitiría.
 */
export function normalizarUsuarioCuenta(
  plataforma: PlataformaCuenta,
  texto: string
): ResultadoUsuario {
  const entrada = texto.trim()
  if (!entrada) return { ok: false, mensaje: MENSAJE_VACIO }
  if (entrada.length > LARGO_MAXIMO_ENTRADA) {
    return { ok: false, mensaje: AYUDA_PATRON[plataforma] }
  }

  let usuario = entrada
  if (pareceEnlace(entrada)) {
    const url = leerEnlace(entrada)
    const otra = url ? plataformaDeHost(hostDe(url)) : null
    if (!url || !otra) {
      return {
        ok: false,
        mensaje: `Pega el enlace del perfil en ${NOMBRES_PLATAFORMA[plataforma]} o escribe solo el usuario.`,
      }
    }
    if (otra !== plataforma) {
      return {
        ok: false,
        mensaje: `Ese enlace es de ${NOMBRES_PLATAFORMA[otra]}. Cambia la red o pega el enlace de ${NOMBRES_PLATAFORMA[plataforma]}.`,
      }
    }
    const delEnlace = usuarioDeEnlace(plataforma, url)
    if (!delEnlace) return { ok: false, mensaje: MENSAJE_PUBLICACION }
    usuario = delEnlace
  }

  const resultado = canonico(plataforma, usuario)
  if (!resultado) return { ok: false, mensaje: MENSAJE_VACIO }
  return PATRONES[plataforma].test(resultado)
    ? { ok: true, usuario: resultado }
    : { ok: false, mensaje: AYUDA_PATRON[plataforma] }
}

/** Enlace público del perfil (para revisar la cuenta declarada). */
export function urlPerfil(
  plataforma: PlataformaCuenta,
  usuario: string
): string {
  const segmento = encodeURIComponent(canonico(plataforma, usuario))
  switch (plataforma) {
    case "INSTAGRAM":
      return `https://www.instagram.com/${segmento}/`
    case "FACEBOOK":
      return `https://www.facebook.com/${segmento}`
    case "TIKTOK":
      return `https://www.tiktok.com/@${segmento}`
  }
}

/** «@noticias.pasto» para mostrar. */
export function arroba(usuario: string): string {
  return usuario.startsWith("@") ? usuario : `@${usuario}`
}

/** Clave para detectar la misma cuenta escrita dos veces. */
export function claveCuenta(
  plataforma: PlataformaCuenta,
  usuario: string
): string {
  return `${plataforma}:${canonico(plataforma, usuario).toLowerCase()}`
}

/** La primera red aún no usada (o Instagram si ya están todas). */
export function siguientePlataforma(
  usadas: readonly PlataformaCuenta[]
): PlataformaCuenta {
  return (
    PLATAFORMAS_CUENTA.find((plataforma) => !usadas.includes(plataforma)) ??
    PLATAFORMAS_CUENTA[0]
  )
}

// ── Seguidores ──────────────────────────────────────────────────────────────

const MULTIPLICADORES: Readonly<Record<string, number>> = {
  k: 1_000,
  mil: 1_000,
  m: 1_000_000,
  mm: 1_000_000,
  millon: 1_000_000,
  millón: 1_000_000,
  millones: 1_000_000,
}

const PATRON_SEGUIDORES =
  /^(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d{1,2})?)\s*([a-zñó]+)?\.?$/

const MENSAJE_SEGUIDORES = "Escribe un número, por ejemplo 45.000."

/**
 * Seguidores aproximados tal como los dice la persona: «45000», «45.000»,
 * «45 000», «45 mil», «45k», «1,2 M», «1,5 millones». Vacío = sin dato.
 * Sin unidad, el punto y la coma separan miles (es-CO); con unidad, una coma
 * o un punto seguidos de uno o dos dígitos son decimales.
 */
export function interpretarSeguidores(texto: string): ResultadoSeguidores {
  const entrada = texto.trim().toLowerCase().replace(/\s+/g, " ")
  if (!entrada) return { ok: true, valor: null }
  const partes = PATRON_SEGUIDORES.exec(entrada)
  if (!partes) return { ok: false, mensaje: MENSAJE_SEGUIDORES }

  const [, cifra, unidad = ""] = partes
  const multiplicador = unidad ? MULTIPLICADORES[unidad] : 1
  if (!multiplicador) return { ok: false, mensaje: MENSAJE_SEGUIDORES }

  // Con unidad, «1,2 M» lleva decimales; sin ella, «45,5» no es una cifra entera.
  const decimal = /^\d+[.,]\d{1,2}$/.test(cifra)
  if (decimal && !unidad) {
    return {
      ok: false,
      mensaje: "Escribe la cifra completa, por ejemplo 45.500.",
    }
  }
  const base = decimal
    ? Number(cifra.replace(",", "."))
    : Number(cifra.replace(/[.,\s]/g, ""))
  const valor = Math.round(base * multiplicador)
  if (!Number.isFinite(valor) || valor > MAXIMO_SEGUIDORES) {
    return {
      ok: false,
      mensaje: "Revisa la cifra: parece demasiado alta.",
    }
  }
  return { ok: true, valor }
}

/** Mayor número de seguidores declarado (`null` si ninguna cuenta lo dice). */
export function seguidoresMaximos(
  cuentas: readonly { seguidores: number | null }[]
): number | null {
  const conDato = cuentas
    .map((cuenta) => cuenta.seguidores)
    .filter((valor): valor is number => valor !== null)
  return conDato.length > 0 ? Math.max(...conDato) : null
}
