/**
 * Enlaces de publicaciones en redes sociales (módulo puro, cliente y servidor).
 *
 * `normalizarUrlPost` deja una forma canónica (https, dominio principal, sin
 * parámetros de rastreo, sin fragmento ni barra final) y `validarUrlPost`
 * comprueba que sea una publicación de la plataforma pedida. Sobre la forma
 * canónica acepta EXACTAMENTE lo que acepta el CHECK `publicaciones_url_chk`
 * de la BD (una prueba lo lee de las migraciones y compara las dos reglas con
 * miles de enlaces): lo que no pasa se explica antes de enviar (un perfil, otra
 * red, una sección que no es una publicación) con un ejemplo del formato que
 * pide la oferta. El formato no bloquea (la BD tampoco lo exige): si el enlace
 * parece de otro tipo de contenido, devuelve un `aviso` para que la persona lo
 * revise. Con la cuenta de la campaña, un enlace que nombra otra cuenta (un
 * video de TikTok, una historia de Instagram) se rechaza, igual que en
 * `registrar_evidencia_srv`.
 */
import type { Database } from "@/types/database.types"

export type PlataformaPost = Database["public"]["Enums"]["plataforma"]

/** Claves de `formatos` (matriz plataforma × formato). */
export type FormatoPost =
  "POST_FEED" | "CARRUSEL" | "REEL" | "HISTORIA" | "VIDEO"

/** Qué tipo de contenido abre un enlace válido (si se puede saber por su forma). */
export type TipoContenidoPost =
  | "publicacion"
  | "reel"
  | "historia"
  | "video"
  | "foto"
  /** Enlaces cortos o de compartir que no dicen qué abren. */
  | "indeterminado"

export type ResultadoUrlPost =
  | {
      ok: true
      /** Forma canónica: la que se guarda. */
      url: string
      /**
       * El enlace parece de otro tipo de contenido que el que pide la oferta
       * (una historia en una oferta de reel). No impide enviarlo.
       */
      aviso?: string
    }
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

/** Ejemplos por formato (los que no están usan el de la plataforma). */
const EJEMPLOS_POR_FORMATO: Readonly<
  Record<PlataformaPost, Partial<Record<FormatoPost, string>>>
> = {
  FACEBOOK: {
    VIDEO: "https://www.facebook.com/share/v/1Q2w3E4r5T/",
    REEL: "https://www.facebook.com/reel/1234567890123456",
    HISTORIA: "https://www.facebook.com/stories/100064527312345/UzpfSVNDOjEy/",
  },
  INSTAGRAM: {
    REEL: "https://www.instagram.com/reel/C9AbCdEfGhI/",
    HISTORIA: "https://www.instagram.com/stories/tucuenta/3456789012345678901/",
  },
  TIKTOK: {},
}

const FORMATOS_POST: ReadonlySet<string> = new Set<FormatoPost>([
  "POST_FEED",
  "CARRUSEL",
  "REEL",
  "HISTORIA",
  "VIDEO",
])

function comoFormato(formato: string | null | undefined): FormatoPost | null {
  return formato && FORMATOS_POST.has(formato) ? (formato as FormatoPost) : null
}

/** Ejemplo de enlace para la plataforma y, si se conoce, el formato de la oferta. */
export function ejemploUrlPost(
  plataforma: PlataformaPost,
  formato?: string | null
): string {
  const clave = comoFormato(formato)
  return (
    (clave && EJEMPLOS_POR_FORMATO[plataforma][clave]) ??
    EJEMPLOS_URL_POST[plataforma]
  )
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

/** Cómo se nombra lo que pide la oferta: «el enlace del reel». */
const CONTENIDO_DEL_FORMATO: Readonly<
  Record<FormatoPost, { del: string; un: string }>
> = {
  POST_FEED: { del: "de la publicación", un: "una publicación de feed" },
  CARRUSEL: { del: "del carrusel", un: "un carrusel" },
  REEL: { del: "del reel", un: "un reel" },
  HISTORIA: { del: "de la historia", un: "una historia" },
  VIDEO: { del: "del video", un: "un video" },
}

const NOMBRE_TIPO: Readonly<
  Record<Exclude<TipoContenidoPost, "indeterminado">, string>
> = {
  publicacion: "una publicación",
  reel: "un reel",
  historia: "una historia",
  video: "un video",
  foto: "una foto",
}

/**
 * Tipos de contenido que con seguridad NO son lo que pide el formato. Lo
 * dudoso no avisa: Instagram abre un reel también con `/p/` y un video de
 * feed con `/reel/`; Facebook, un reel con `/watch`.
 */
const INCOMPATIBLES: Readonly<
  Record<FormatoPost, ReadonlySet<TipoContenidoPost>>
> = {
  POST_FEED: new Set(["historia"]),
  CARRUSEL: new Set(["historia"]),
  REEL: new Set(["historia", "foto"]),
  HISTORIA: new Set(["publicacion", "reel", "video", "foto"]),
  VIDEO: new Set(["historia", "foto"]),
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

/**
 * Únicos parámetros que identifican una publicación de Facebook, en el orden
 * en que se guardan: el mismo post copiado con los parámetros en otro orden
 * (o repetidos) queda igual.
 */
const PARAMETROS_FACEBOOK = [
  "story_fbid",
  "fbid",
  "id",
  "v",
  "set",
  "multi_permalinks",
] as const

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
  if (plataforma === "FACEBOOK") {
    return new URLSearchParams(
      PARAMETROS_FACEBOOK.flatMap((nombre) => {
        const valor = parametros.get(nombre)
        return valor ? [[nombre, valor]] : []
      })
    ).toString()
  }
  if (plataforma) return ""
  const conservar = (nombre: string) => {
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

/**
 * Las rutas de cada red son las alternativas de `publicaciones_url_chk` (que
 * no distingue mayúsculas), cada una con el tipo de contenido que abre.
 */
type TipoEnlace = TipoContenidoPost | "perfil" | "otro"

const RUTAS_POST_FACEBOOK: readonly (readonly [RegExp, TipoContenidoPost])[] = [
  [/^\/[^/]+\/posts\/(?:[^/]+\/)?[^/]+$/i, "publicacion"],
  [/^\/[^/]+\/videos\/(?:[^/]+\/)?[^/]+$/i, "video"],
  [/^\/[^/]+\/photos\/(?:[^/]+\/)?[^/]+$/i, "foto"],
  [/^\/reel\/[^/]+$/i, "reel"],
  [/^\/share\/p\/[^/]+$/i, "publicacion"],
  [/^\/share\/r\/[^/]+$/i, "reel"],
  [/^\/share\/v\/[^/]+$/i, "video"],
  [/^\/share\/[^/]+$/i, "indeterminado"],
  [/^\/groups\/[^/]+\/(?:posts|permalink)\/[^/]+$/i, "publicacion"],
  [/^\/stories\/[^/]+(?:\/[^/]+)?$/i, "historia"],
]

/** Rutas de Facebook que identifican la publicación con un parámetro. */
const RUTAS_CON_PARAMETRO_FACEBOOK: readonly (readonly [
  RegExp,
  string,
  TipoContenidoPost,
])[] = [
  [/^\/(?:watch|video\.php)$/i, "v", "video"],
  [/^\/(?:photo|photo\.php)$/i, "fbid", "foto"],
  [/^\/(?:permalink|story)\.php$/i, "story_fbid", "publicacion"],
  [/^\/groups\/[^/]+$/i, "multi_permalinks", "publicacion"],
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
    return /^\/[\w-]+$/.test(ruta) ? "video" : "otro"
  }
  const porRuta = RUTAS_POST_FACEBOOK.find(([patron]) => patron.test(ruta))
  if (porRuta) return porRuta[1]
  const conParametro = RUTAS_CON_PARAMETRO_FACEBOOK.find(([patron]) =>
    patron.test(ruta)
  )
  if (conParametro && url.searchParams.get(conParametro[1])) {
    return conParametro[2]
  }
  if (/^\/profile\.php$/i.test(ruta) || esPerfilDeUnSegmento(ruta)) {
    return "perfil"
  }
  return "otro"
}

function tipoInstagram(url: URL): TipoEnlace {
  const ruta = url.pathname
  if (/^\/p\/[\w-]+$/i.test(ruta)) return "publicacion"
  if (/^\/reel\/[\w-]+$/i.test(ruta)) return "reel"
  if (/^\/stories\/[\w.]+\/\d+$/i.test(ruta)) return "historia"
  return esPerfilDeUnSegmento(ruta) ? "perfil" : "otro"
}

function tipoTikTok(url: URL): TipoEnlace {
  const ruta = url.pathname
  if (url.hostname === "vm.tiktok.com") {
    return /^\/[A-Za-z0-9]+$/.test(ruta) ? "indeterminado" : "otro"
  }
  if (/^\/@[\w.-]+\/video\/\d+$/i.test(ruta)) return "video"
  if (/^\/@[\w.-]+\/photo\/\d+$/i.test(ruta)) return "foto"
  if (/^\/t\/[A-Za-z0-9]+$/i.test(ruta)) return "indeterminado"
  return /^\/@[\w.-]+$/.test(ruta) ? "perfil" : "otro"
}

const TIPO_POR_PLATAFORMA: Readonly<
  Record<PlataformaPost, (url: URL) => TipoEnlace>
> = {
  FACEBOOK: tipoFacebook,
  INSTAGRAM: tipoInstagram,
  TIKTOK: tipoTikTok,
}

type Analisis =
  | {
      valido: false
      mensaje: string
      /** Es de la red correcta pero no es una publicación: ayuda el formato. */
      conPista: boolean
    }
  | { valido: true; tipo: TipoContenidoPost }

/** El primer problema del enlace (ya normalizado) o el tipo de contenido que abre. */
function analizarEnlace(plataforma: PlataformaPost, url: string): Analisis {
  const invalido = (mensaje: string, conPista = false): Analisis => ({
    valido: false,
    mensaje,
    conPista,
  })
  const partes = analizar(url)
  if (!partes) return invalido(MENSAJE_NO_ES_ENLACE)
  const dominio = clasificarHost(partes.hostname)
  if (!dominio) {
    return invalido(
      `El enlace debe ser de ${NOMBRES[plataforma]} (${DOMINIOS[plataforma]}).`
    )
  }
  if (dominio.plataforma !== plataforma) {
    return invalido(
      `Ese enlace es de ${NOMBRES[dominio.plataforma]}, pero la publicación debe estar en ${NOMBRES[plataforma]}.`
    )
  }
  if (partes.hostname === TIKTOK_VT) return invalido(MENSAJE_TIKTOK_VT)
  if (url.length > LONGITUD_MAXIMA_URL_POST) return invalido(MENSAJE_LARGO)
  const tipo = TIPO_POR_PLATAFORMA[plataforma](partes)
  if (tipo === "perfil") return invalido(MENSAJE_PERFIL, true)
  if (tipo === "otro") {
    return invalido(
      `Ese enlace de ${NOMBRES[plataforma]} no lleva a ${QUE_SE_ACEPTA[plataforma]}.`,
      true
    )
  }
  return { valido: true, tipo }
}

/** «Para esta oferta, copia el enlace del reel.» (sin formato conocido, nada). */
function pistaDelFormato(formato: FormatoPost | null): string {
  return formato
    ? ` Para esta oferta, copia el enlace ${CONTENIDO_DEL_FORMATO[formato].del}.`
    : ""
}

function avisoDelFormato(
  tipo: TipoContenidoPost,
  formato: FormatoPost | null
): string | null {
  if (!formato || tipo === "indeterminado") return null
  if (!INCOMPATIBLES[formato].has(tipo)) return null
  return `Ese enlace parece de ${NOMBRE_TIPO[tipo]}, pero esta oferta pide ${CONTENIDO_DEL_FORMATO[formato].un}. Revisa que sea el de tu publicación.`
}

// ── Cuenta del enlace ──────────────────────────────────────────────────────

/** `@usuario` de un video o una publicación de fotos de TikTok. */
const CUENTA_TIKTOK = /^https:\/\/www\.tiktok\.com\/@([^/]+)\//i
/** Usuario de una historia de Instagram. */
const CUENTA_HISTORIA = /^https:\/\/www\.instagram\.com\/stories\/([^/]+)\//i
/** `stories/highlights/<id>` es una historia destacada: no nombra la cuenta. */
const NO_CUENTAS_HISTORIA: ReadonlySet<string> = new Set(["highlights"])

/**
 * Cuenta que nombra el enlace (sin `@`), si la nombra: el `@usuario` de TikTok
 * o el usuario de una historia de Instagram. Las publicaciones y los reels de
 * Instagram, Facebook y los enlaces cortos no dicen de qué cuenta son.
 */
export function cuentaDelEnlace(url: string): string | null {
  const canonica = normalizarUrlPost(url)
  const tiktok = CUENTA_TIKTOK.exec(canonica)?.[1]
  if (tiktok) return tiktok
  const historia = CUENTA_HISTORIA.exec(canonica)?.[1]
  return historia && !NO_CUENTAS_HISTORIA.has(historia.toLowerCase())
    ? historia
    : null
}

/**
 * Mensaje si el enlace nombra una cuenta distinta de la de la campaña (sin
 * distinguir mayúsculas); el mismo `detail` de `AMO_URL_OTRA_CUENTA`.
 */
function mensajeOtraCuenta(url: string, cuenta: string): string | null {
  const deLaCampana = cuenta.trim().replace(/^@/, "")
  const delEnlace = cuentaDelEnlace(url)
  if (!deLaCampana || !delEnlace) return null
  if (delEnlace.toLowerCase() === deLaCampana.toLowerCase()) return null
  return `El enlace es de @${delEnlace} y esta campaña es con @${deLaCampana}. Pega el enlace de la publicación en tu cuenta.`
}

/**
 * Tipo de contenido que abre un enlace (canónico o tal como se pegó), o `null`
 * si no es un enlace válido de esa plataforma.
 */
export function tipoContenidoPost(
  plataforma: PlataformaPost,
  url: string
): TipoContenidoPost | null {
  const analisis = analizarEnlace(plataforma, normalizarUrlPost(url))
  return analisis.valido ? analisis.tipo : null
}

/**
 * ¿Es el enlace de una publicación de `plataforma`? Valida la forma canónica y
 * la devuelve en `url` para guardarla; si no, explica qué falla con un ejemplo
 * (del formato de la oferta, si se indica). Con `formato`, un enlace válido que
 * parece de otro tipo de contenido trae un `aviso` que no bloquea. Con
 * `cuenta` (el usuario de la cuenta de la campaña), un enlace que nombra otra
 * cuenta no vale.
 */
export function validarUrlPost(
  plataforma: PlataformaPost,
  url: string,
  formato?: string | null,
  cuenta?: string | null
): ResultadoUrlPost {
  const clave = comoFormato(formato)
  const ejemplo = ejemploUrlPost(plataforma, clave)
  if (!url.trim()) {
    const mensaje = clave
      ? `Pega el enlace ${CONTENIDO_DEL_FORMATO[clave].del}.`
      : MENSAJE_VACIO
    return { ok: false, mensaje, ejemplo }
  }
  if (url.length > LONGITUD_MAXIMA_ENTRADA) {
    return { ok: false, mensaje: MENSAJE_LARGO, ejemplo }
  }
  const normalizada = normalizarUrlPost(url)
  const analisis = analizarEnlace(plataforma, normalizada)
  if (!analisis.valido) {
    const pista = analisis.conPista ? pistaDelFormato(clave) : ""
    return { ok: false, mensaje: `${analisis.mensaje}${pista}`, ejemplo }
  }
  const otraCuenta = cuenta ? mensajeOtraCuenta(normalizada, cuenta) : null
  if (otraCuenta) return { ok: false, mensaje: otraCuenta, ejemplo }
  const aviso = avisoDelFormato(analisis.tipo, clave)
  return aviso
    ? { ok: true, url: normalizada, aviso }
    : { ok: true, url: normalizada }
}
