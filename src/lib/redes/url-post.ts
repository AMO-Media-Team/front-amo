/**
 * Enlaces de publicaciones en redes sociales (módulo puro, cliente y servidor).
 *
 * `normalizarUrlPost` deja una forma canónica (https, dominio principal, sin
 * parámetros de rastreo, sin fragmento ni barra final) y `validarUrlPost`
 * comprueba que sea una publicación de la plataforma pedida. La forma
 * canónica cumple el CHECK `publicaciones_url_chk` de la BD (una prueba lo lee
 * de las migraciones): la BD solo exige el dominio y el prefijo de la ruta;
 * aquí además se distingue una publicación de un perfil para orientar a la
 * persona antes de enviar.
 */
import type { Database } from "@/types/database.types"

export type PlataformaPost = Database["public"]["Enums"]["plataforma"]

export type ResultadoUrlPost =
  | { ok: true; /** Forma canónica: la que se guarda. */ url: string }
  | { ok: false; mensaje: string; ejemplo: string }

/** Igual que `publicaciones_url_chk`. */
export const LONGITUD_MAXIMA_URL_POST = 500

/**
 * Tope del texto pegado (el enlace y, a veces, el mensaje que lo acompaña): por
 * encima no se analiza, para que una entrada enorme no cueste tiempo de servidor.
 */
const LONGITUD_MAXIMA_ENTRADA = 2000

export const EJEMPLOS_URL_POST: Readonly<Record<PlataformaPost, string>> = {
  FACEBOOK: "https://www.facebook.com/share/p/1AbCdEfGh2/",
  INSTAGRAM: "https://www.instagram.com/p/C8xYz12AbCd/",
  TIKTOK: "https://www.tiktok.com/@tucuenta/video/7412345678901234567",
}

const NOMBRES: Readonly<Record<PlataformaPost, string>> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
}

const DOMINIOS: Readonly<Record<PlataformaPost, string>> = {
  FACEBOOK: "facebook.com o fb.watch",
  INSTAGRAM: "instagram.com",
  TIKTOK: "tiktok.com",
}

const QUE_SE_ACEPTA: Readonly<Record<PlataformaPost, string>> = {
  FACEBOOK: "una publicación, un video, un reel o una historia",
  INSTAGRAM: "una publicación, un reel o una historia",
  TIKTOK: "un video o una publicación de fotos",
}

const MENSAJE_VACIO = "Pega el enlace de la publicación."
const MENSAJE_NO_ES_ENLACE =
  "Eso no parece un enlace. En la app, abre la publicación y toca «Compartir» → «Copiar enlace»."
const MENSAJE_PERFIL =
  "Ese es el enlace del perfil, no el de la publicación. Abre la publicación y copia su enlace."
const MENSAJE_TIKTOK_VT =
  "Ese enlace corto de TikTok no se admite. Ábrelo en el navegador y copia la dirección completa del video."
const MENSAJE_LARGO = `El enlace supera los ${LONGITUD_MAXIMA_URL_POST} caracteres. Copia el enlace directo de la publicación.`

// ── Dominios ───────────────────────────────────────────────────────────────

interface Dominio {
  plataforma: PlataformaPost
  /** Host canónico: el que se guarda. */
  host: string
}

const TIKTOK_VT = "vt.tiktok.com"

function esDe(host: string, dominio: string): boolean {
  return host === dominio || host.endsWith(`.${dominio}`)
}

/** Plataforma y host canónico de un host; `null` si no es de ninguna red. */
function clasificarHost(host: string): Dominio | null {
  if (esDe(host, "fb.watch")) {
    return { plataforma: "FACEBOOK", host: "fb.watch" }
  }
  if (esDe(host, "facebook.com") || esDe(host, "fb.com")) {
    return { plataforma: "FACEBOOK", host: "www.facebook.com" }
  }
  if (esDe(host, "instagram.com") || esDe(host, "instagr.am")) {
    return { plataforma: "INSTAGRAM", host: "www.instagram.com" }
  }
  if (host === "vm.tiktok.com" || host === TIKTOK_VT) {
    return { plataforma: "TIKTOK", host }
  }
  if (esDe(host, "tiktok.com")) {
    return { plataforma: "TIKTOK", host: "www.tiktok.com" }
  }
  return null
}

// ── Normalización ──────────────────────────────────────────────────────────

const ENLACE_EN_TEXTO = /https?:\/\/[^\s<>"']+/i
/** Se recorre a mano: `/[…]+$/` retrocede en tiempo cuadrático ante una racha larga de signos. */
const PUNTUACION_FINAL: ReadonlySet<string> = new Set(".,;:!?)]}»”’")
const PARECE_DOMINIO = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i

/** Únicos parámetros que identifican una publicación de Facebook. */
const PARAMETROS_FACEBOOK = new Set([
  "story_fbid",
  "fbid",
  "id",
  "v",
  "set",
  "multi_permalinks",
])

const PARAMETROS_RASTREO = new Set([
  "fbclid",
  "gclid",
  "igsh",
  "igshid",
  "mibextid",
  "si",
  "ref",
])

/** Instagram: `/reels/X` y `/tv/X` también existen; se guardan como reel y p. */
const TIPOS_MEDIA_INSTAGRAM: ReadonlyMap<string, string> = new Map([
  ["p", "p"],
  ["reel", "reel"],
  ["reels", "reel"],
  ["tv", "p"],
])

/** Rutas bajo `/reels/` que no son un reel (`/reels/audio/<id>` es la página de un audio). */
const NO_CODIGOS_INSTAGRAM: ReadonlySet<string> = new Set(["audio"])

/** Primeros segmentos de Facebook e Instagram que no son el nombre de un perfil. */
const SECCIONES_RESERVADAS: ReadonlySet<string> = new Set([
  "watch",
  "photo",
  "reel",
  "reels",
  "share",
  "groups",
  "stories",
  "events",
  "marketplace",
  "gaming",
  "explore",
  "accounts",
  "direct",
  "p",
  "tv",
])

function sinPuntuacionFinal(enlace: string): string {
  let fin = enlace.length
  while (fin > 0 && PUNTUACION_FINAL.has(enlace[fin - 1])) fin--
  return enlace.slice(0, fin)
}

/** Toma el enlace aunque venga dentro del texto que copian algunas apps. */
function extraerEnlace(entrada: string): string {
  const texto = entrada.trim()
  const enlace = ENLACE_EN_TEXTO.exec(texto)?.[0]
  if (enlace) return sinPuntuacionFinal(enlace)
  return PARECE_DOMINIO.test(texto) ? `https://${texto}` : texto
}

function analizar(texto: string): URL | null {
  if (!URL.canParse(texto)) return null
  const url = new URL(texto)
  return url.protocol === "https:" || url.protocol === "http:" ? url : null
}

function rutaLimpia(ruta: string): string {
  const sinDobles = ruta.replace(/\/{2,}/g, "/")
  return sinDobles.length > 1 ? sinDobles.replace(/\/+$/, "") : sinDobles
}

/** `/<usuario>/p/X`, `/reels/X/…` o `/tv/X` → `/p/X` o `/reel/X`. */
function rutaInstagram(ruta: string): string {
  const segmentos = ruta.split("/").filter(Boolean)
  const [primero = "", segundo = ""] = segmentos.map((s) => s.toLowerCase())
  const conUsuario =
    segmentos.length >= 3 &&
    !SECCIONES_RESERVADAS.has(primero) &&
    TIPOS_MEDIA_INSTAGRAM.has(segundo)
  const inicio = conUsuario ? 1 : 0
  const tipo = TIPOS_MEDIA_INSTAGRAM.get(conUsuario ? segundo : primero)
  const codigo = segmentos[inicio + 1]
  if (!tipo || !codigo || NO_CODIGOS_INSTAGRAM.has(codigo.toLowerCase())) {
    return ruta
  }
  return `/${tipo}/${codigo}`
}

function parametrosLimpios(
  parametros: URLSearchParams,
  plataforma: PlataformaPost | null
): string {
  const conservar = (nombre: string) => {
    if (plataforma === "FACEBOOK") return PARAMETROS_FACEBOOK.has(nombre)
    if (plataforma) return false
    const minusculas = nombre.toLowerCase()
    return !minusculas.startsWith("utm_") && !PARAMETROS_RASTREO.has(minusculas)
  }
  return new URLSearchParams(
    [...parametros].filter(([nombre, valor]) => valor && conservar(nombre))
  ).toString()
}

/**
 * Forma canónica del enlace: https, host principal de la red, sin
 * credenciales, puerto, fragmento, parámetros de rastreo ni barra final. Si
 * no se puede interpretar como enlace, devuelve el texto recortado.
 */
export function normalizarUrlPost(url: string): string {
  const texto = extraerEnlace(url)
  const partes = analizar(texto)
  if (!partes) return texto
  const host = partes.hostname.replace(/\.$/, "")
  const dominio = clasificarHost(host)
  let ruta = rutaLimpia(partes.pathname)
  if (dominio?.plataforma === "INSTAGRAM") ruta = rutaInstagram(ruta)
  const consulta = parametrosLimpios(
    partes.searchParams,
    dominio?.plataforma ?? null
  )
  return `https://${dominio?.host ?? host}${ruta}${consulta ? `?${consulta}` : ""}`
}

// ── Validación ─────────────────────────────────────────────────────────────

type TipoEnlace = "publicacion" | "perfil" | "otro"

const RUTAS_POST_FACEBOOK = [
  /^\/[^/]+\/posts\/[^/]+$/i,
  /^\/[^/]+\/videos\/(?:[^/]+\/)?[^/]+$/i,
  /^\/[^/]+\/photos\/(?:[^/]+\/)?[^/]+$/i,
  /^\/reel\/[^/]+$/i,
  /^\/share\/(?:[prv]\/)?[^/]+$/i,
  /^\/groups\/[^/]+\/(?:posts|permalink)\/[^/]+$/i,
  /^\/stories\/[^/]+(?:\/[^/]+)?$/i,
]

/** Rutas de Facebook que identifican la publicación con un parámetro. */
const RUTAS_CON_PARAMETRO_FACEBOOK: readonly (readonly [RegExp, string])[] = [
  [/^\/(?:watch|video\.php)$/i, "v"],
  [/^\/(?:photo|photo\.php)$/i, "fbid"],
  [/^\/(?:permalink|story)\.php$/i, "story_fbid"],
  [/^\/groups\/[^/]+$/i, "multi_permalinks"],
]

function esPerfilDeUnSegmento(ruta: string): boolean {
  const segmento = /^\/([^/]+)$/.exec(ruta)?.[1]?.toLowerCase()
  return (
    segmento !== undefined &&
    !segmento.endsWith(".php") &&
    !SECCIONES_RESERVADAS.has(segmento)
  )
}

function tipoFacebook(url: URL): TipoEnlace {
  const ruta = url.pathname
  if (url.hostname === "fb.watch") {
    return /^\/[\w-]+$/.test(ruta) ? "publicacion" : "otro"
  }
  if (RUTAS_POST_FACEBOOK.some((patron) => patron.test(ruta))) {
    return "publicacion"
  }
  const conParametro = RUTAS_CON_PARAMETRO_FACEBOOK.find(([patron]) =>
    patron.test(ruta)
  )
  if (conParametro && url.searchParams.get(conParametro[1])) {
    return "publicacion"
  }
  if (/^\/profile\.php$/i.test(ruta) || esPerfilDeUnSegmento(ruta)) {
    return "perfil"
  }
  return "otro"
}

function tipoInstagram(url: URL): TipoEnlace {
  const ruta = url.pathname
  if (
    /^\/(?:p|reel)\/[\w-]+$/.test(ruta) ||
    /^\/stories\/[\w.]+\/\d+$/.test(ruta)
  ) {
    return "publicacion"
  }
  return esPerfilDeUnSegmento(ruta) ? "perfil" : "otro"
}

function tipoTikTok(url: URL): TipoEnlace {
  const ruta = url.pathname
  if (url.hostname === "vm.tiktok.com") {
    return /^\/[A-Za-z0-9]+$/.test(ruta) ? "publicacion" : "otro"
  }
  if (
    /^\/@[\w.-]+\/(?:video|photo)\/\d+$/i.test(ruta) ||
    /^\/t\/[A-Za-z0-9]+$/.test(ruta)
  ) {
    return "publicacion"
  }
  return /^\/@[\w.-]+$/.test(ruta) ? "perfil" : "otro"
}

const TIPO_POR_PLATAFORMA: Readonly<
  Record<PlataformaPost, (url: URL) => TipoEnlace>
> = {
  FACEBOOK: tipoFacebook,
  INSTAGRAM: tipoInstagram,
  TIKTOK: tipoTikTok,
}

/** Primer problema del enlace (ya normalizado) o `null` si es una publicación válida. */
function problemaDelEnlace(
  plataforma: PlataformaPost,
  url: string
): string | null {
  const partes = analizar(url)
  if (!partes) return MENSAJE_NO_ES_ENLACE
  const dominio = clasificarHost(partes.hostname)
  if (!dominio) {
    return `El enlace debe ser de ${NOMBRES[plataforma]} (${DOMINIOS[plataforma]}).`
  }
  if (dominio.plataforma !== plataforma) {
    return `Ese enlace es de ${NOMBRES[dominio.plataforma]}, pero la publicación debe estar en ${NOMBRES[plataforma]}.`
  }
  if (partes.hostname === TIKTOK_VT) return MENSAJE_TIKTOK_VT
  if (url.length > LONGITUD_MAXIMA_URL_POST) return MENSAJE_LARGO
  const tipo = TIPO_POR_PLATAFORMA[plataforma](partes)
  if (tipo === "perfil") return MENSAJE_PERFIL
  if (tipo === "otro") {
    return `Ese enlace de ${NOMBRES[plataforma]} no lleva a ${QUE_SE_ACEPTA[plataforma]}.`
  }
  return null
}

/**
 * ¿Es el enlace de una publicación de `plataforma`? Valida la forma canónica y
 * la devuelve en `url` para guardarla; si no, explica qué falla con un ejemplo.
 */
export function validarUrlPost(
  plataforma: PlataformaPost,
  url: string
): ResultadoUrlPost {
  const ejemplo = EJEMPLOS_URL_POST[plataforma]
  if (!url.trim()) return { ok: false, mensaje: MENSAJE_VACIO, ejemplo }
  if (url.length > LONGITUD_MAXIMA_ENTRADA) {
    return { ok: false, mensaje: MENSAJE_LARGO, ejemplo }
  }
  const normalizada = normalizarUrlPost(url)
  const mensaje = problemaDelEnlace(plataforma, normalizada)
  return mensaje
    ? { ok: false, mensaje, ejemplo }
    : { ok: true, url: normalizada }
}
