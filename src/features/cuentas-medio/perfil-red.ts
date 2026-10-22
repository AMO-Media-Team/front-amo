/**
 * Perfil de una cuenta social a partir de lo que escribe el medio (módulo
 * puro, cliente y servidor). Acepta «@usuario», «usuario» o el enlace del
 * perfil copiado de la app y devuelve el usuario y la URL canónica que se
 * guardan en `cuentas_sociales`: cumplen `cuentas_sociales_handle_chk`
 * (`^[A-Za-z0-9._]{1,60}$`) y `cuentas_sociales_url_chk` (dominio de la
 * plataforma; en TikTok, `/@usuario`). Además aplica las reglas de usuario de
 * cada red, para que el error llegue al campo y no a la base de datos.
 */
import { PLATAFORMAS, type Plataforma } from "@/features/operacion/estados"

export type { Plataforma }

export type ResultadoPerfil =
  | {
      ok: true
      /** Usuario sin «@» (en Facebook, también el id numérico de la página). */
      handle: string
      /** Forma canónica del perfil: la que se guarda y se enlaza. */
      url: string
    }
  | { ok: false; mensaje: string }

interface ReglasUsuario {
  min: number
  max: number
  caracteres: RegExp
  /** Instagram y TikTok no distinguen mayúsculas: se guardan en minúsculas. */
  minusculas: boolean
  descripcion: string
}

/** Lo que cada red admite en el nombre de usuario. */
const REGLAS: Readonly<Record<Plataforma, ReglasUsuario>> = {
  INSTAGRAM: {
    min: 1,
    max: 30,
    caracteres: /^[A-Za-z0-9._]+$/,
    minusculas: true,
    descripcion: "letras, números, puntos y guiones bajos",
  },
  TIKTOK: {
    min: 2,
    max: 24,
    caracteres: /^[A-Za-z0-9._]+$/,
    minusculas: true,
    descripcion: "letras, números, puntos y guiones bajos",
  },
  FACEBOOK: {
    min: 5,
    max: 50,
    caracteres: /^[A-Za-z0-9.]+$/,
    minusculas: false,
    descripcion: "letras, números y puntos",
  },
}

/** Ejemplos para los placeholders y los mensajes de error. */
export const EJEMPLOS_PERFIL: Readonly<
  Record<Plataforma, { usuario: string; enlace: string }>
> = {
  INSTAGRAM: {
    usuario: "@noticiasdelsur",
    enlace: "https://www.instagram.com/noticiasdelsur/",
  },
  FACEBOOK: {
    usuario: "NoticiasDelSur",
    enlace: "https://www.facebook.com/NoticiasDelSur",
  },
  TIKTOK: {
    usuario: "@noticiasdelsur",
    enlace: "https://www.tiktok.com/@noticiasdelsur",
  },
}

/** Igual que el CHECK de la URL (`char_length(url) <= 300`). */
export const LARGO_MAXIMO_ENTRADA = 300

const MENSAJE_VACIO =
  "Escribe el usuario de la cuenta o pega el enlace de tu perfil."
const MENSAJE_LARGO =
  "Ese texto es demasiado largo para ser un usuario o un enlace."
const MENSAJE_PUBLICACION =
  "Ese enlace es de una publicación, no del perfil. Abre tu perfil y copia su enlace, o escribe solo el usuario."
const MENSAJE_TIKTOK_CORTO =
  "Los enlaces cortos de TikTok no muestran el usuario. Escríbelo tal como aparece en tu perfil (por ejemplo @noticiasdelsur)."

// ── Dominios ────────────────────────────────────────────────────────────────

function esDe(host: string, dominio: string): boolean {
  return host === dominio || host.endsWith(`.${dominio}`)
}

const ENLACES_CORTOS_TIKTOK = new Set(["vm.tiktok.com", "vt.tiktok.com"])

/** Red social de un host; `null` si no es de ninguna. */
function plataformaDeHost(host: string): Plataforma | null {
  if (["facebook.com", "fb.com", "fb.me"].some((d) => esDe(host, d))) {
    return "FACEBOOK"
  }
  if (["instagram.com", "instagr.am"].some((d) => esDe(host, d))) {
    return "INSTAGRAM"
  }
  if (esDe(host, "tiktok.com")) return "TIKTOK"
  return null
}

const DOMINIO_CONOCIDO =
  /^(?:[a-z0-9-]+\.)*(?:facebook\.com|fb\.com|fb\.me|instagram\.com|instagr\.am|tiktok\.com)(?:[/?#:]|$)/i

/**
 * ¿Lo escrito es un enlace? Un usuario de Instagram puede tener puntos
 * («noticias.sur»), así que solo cuenta como enlace con esquema, con una barra
 * o con el dominio de una red social.
 */
function pareceEnlace(texto: string): boolean {
  return (
    /^https?:\/\//i.test(texto) ||
    texto.includes("/") ||
    DOMINIO_CONOCIDO.test(texto)
  )
}

function leerUrl(texto: string): URL | null {
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

// ── Usuario dentro del enlace, por red ──────────────────────────────────────

type Extraido = { handle: string } | { mensaje: string }

/** Primeras rutas de Instagram que no son un perfil. */
const RUTAS_INSTAGRAM = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "explore",
  "accounts",
  "direct",
  "about",
  "legal",
  "developer",
  "web",
  "emails",
])

function usuarioInstagram(partes: readonly string[]): Extraido {
  const [primera, segunda] = partes
  if (!primera) return { mensaje: mensajeSinUsuario("INSTAGRAM") }
  // Una historia lleva el usuario: instagram.com/stories/<usuario>/<id>.
  if (primera.toLowerCase() === "stories") {
    return segunda
      ? { handle: segunda }
      : { mensaje: mensajeSinUsuario("INSTAGRAM") }
  }
  if (RUTAS_INSTAGRAM.has(primera.toLowerCase())) {
    return { mensaje: MENSAJE_PUBLICACION }
  }
  return { handle: primera }
}

function usuarioTikTok(partes: readonly string[]): Extraido {
  const [primera] = partes
  if (!primera) return { mensaje: mensajeSinUsuario("TIKTOK") }
  // El video de una cuenta también la identifica: /@usuario/video/<id>.
  if (primera.startsWith("@") && primera.length > 1) {
    return { handle: primera.slice(1) }
  }
  return { mensaje: MENSAJE_PUBLICACION }
}

/** Primeras rutas de Facebook que no son un perfil ni una página. */
const RUTAS_FACEBOOK = new Set([
  "groups",
  "watch",
  "events",
  "share",
  "sharer",
  "sharer.php",
  "photo",
  "photo.php",
  "photos",
  "reel",
  "reels",
  "story.php",
  "stories",
  "permalink.php",
  "marketplace",
  "gaming",
  "hashtag",
  "help",
  "login",
  "login.php",
  "privacy",
  "policies",
  "settings",
  "notifications",
  "messages",
  "friends",
  "search",
  "live",
  "video.php",
  "home.php",
])

const ID_NUMERICO = /^\d{5,20}$/

/** Id numérico al final de un segmento: «Noticias-del-Sur-100064123456». */
function idAlFinal(segmento: string | undefined): string | null {
  const id = segmento?.split("-").at(-1) ?? ""
  return ID_NUMERICO.test(id) ? id : null
}

function usuarioFacebook(url: URL, partes: readonly string[]): Extraido {
  const [primera, segunda, tercera] = partes
  if (!primera) return { mensaje: mensajeSinUsuario("FACEBOOK") }
  const ruta = primera.toLowerCase()
  if (ruta === "profile.php") {
    const id = url.searchParams.get("id") ?? ""
    return ID_NUMERICO.test(id)
      ? { handle: id }
      : { mensaje: mensajeSinUsuario("FACEBOOK") }
  }
  // Páginas sin usuario propio: /p/<nombre>-<id>, /people/<nombre>/<id>, /pages/<nombre>/<id>.
  if (ruta === "p" || ruta === "people" || ruta === "pages") {
    const id = ruta === "p" ? idAlFinal(segunda) : idAlFinal(tercera)
    return id ? { handle: id } : { mensaje: mensajeSinUsuario("FACEBOOK") }
  }
  if (RUTAS_FACEBOOK.has(ruta)) return { mensaje: MENSAJE_PUBLICACION }
  return { handle: primera }
}

// ── Mensajes ────────────────────────────────────────────────────────────────

function mensajeSinUsuario(plataforma: Plataforma): string {
  return `Ese enlace no lleva el usuario de la cuenta. Pega el enlace de tu perfil, por ejemplo ${EJEMPLOS_PERFIL[plataforma].enlace}, o escribe solo el usuario.`
}

function mensajeOtraRed(elegida: Plataforma, delEnlace: Plataforma): string {
  return `Ese enlace es de ${PLATAFORMAS[delEnlace]}, pero la cuenta es de ${PLATAFORMAS[elegida]}. Pega el enlace de tu perfil de ${PLATAFORMAS[elegida]}.`
}

function mensajeOtroSitio(plataforma: Plataforma): string {
  return `Ese enlace no es de ${PLATAFORMAS[plataforma]}. Pega el enlace de tu perfil, por ejemplo ${EJEMPLOS_PERFIL[plataforma].enlace}.`
}

// ── API ─────────────────────────────────────────────────────────────────────

function usuarioDeEnlace(plataforma: Plataforma, texto: string): Extraido {
  const url = leerUrl(texto)
  if (!url) return { mensaje: mensajeOtroSitio(plataforma) }
  const host = url.hostname.toLowerCase()
  if (plataforma === "TIKTOK" && ENLACES_CORTOS_TIKTOK.has(host)) {
    return { mensaje: MENSAJE_TIKTOK_CORTO }
  }
  const delEnlace = plataformaDeHost(host)
  if (!delEnlace) return { mensaje: mensajeOtroSitio(plataforma) }
  if (delEnlace !== plataforma) {
    return { mensaje: mensajeOtraRed(plataforma, delEnlace) }
  }
  const partes = segmentos(url)
  switch (plataforma) {
    case "INSTAGRAM":
      return usuarioInstagram(partes)
    case "TIKTOK":
      return usuarioTikTok(partes)
    case "FACEBOOK":
      return usuarioFacebook(url, partes)
  }
}

/** Problema del usuario según las reglas de la red, o `null` si es válido. */
export function problemaUsuario(
  plataforma: Plataforma,
  handle: string
): string | null {
  const reglas = REGLAS[plataforma]
  const nombre = PLATAFORMAS[plataforma]
  // Un id numérico de página de Facebook es válido aunque no sea un usuario.
  if (plataforma === "FACEBOOK" && ID_NUMERICO.test(handle)) return null
  if (!reglas.caracteres.test(handle)) {
    return `El usuario de ${nombre} solo puede tener ${reglas.descripcion}, sin espacios.`
  }
  if (handle.length < reglas.min) {
    return `El usuario de ${nombre} tiene al menos ${reglas.min} caracteres.`
  }
  if (handle.length > reglas.max) {
    return `El usuario de ${nombre} tiene como máximo ${reglas.max} caracteres.`
  }
  if (handle.startsWith(".") || handle.endsWith(".") || handle.includes("..")) {
    return `El usuario de ${nombre} no empieza ni termina con punto ni lleva dos puntos seguidos.`
  }
  return null
}

/** URL canónica del perfil (la que se guarda y se enlaza). */
export function urlPerfil(plataforma: Plataforma, handle: string): string {
  switch (plataforma) {
    case "INSTAGRAM":
      return `https://www.instagram.com/${handle}/`
    case "TIKTOK":
      return `https://www.tiktok.com/@${handle}`
    case "FACEBOOK":
      return ID_NUMERICO.test(handle)
        ? `https://www.facebook.com/profile.php?id=${handle}`
        : `https://www.facebook.com/${handle}`
  }
}

/** «instagram.com/noticiasdelsur»: la URL sin esquema, `www.` ni barra final. */
export function urlLegible(url: string): string {
  return url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "")
}

/**
 * Usuario y URL canónica a partir de lo que escribió el medio: «@usuario»,
 * «usuario» o el enlace del perfil (también el de una historia o un video de
 * TikTok, que nombran la cuenta).
 */
export function interpretarPerfil(
  plataforma: Plataforma,
  entrada: string
): ResultadoPerfil {
  const texto = entrada.trim()
  if (!texto) return { ok: false, mensaje: MENSAJE_VACIO }
  if (texto.length > LARGO_MAXIMO_ENTRADA) {
    return { ok: false, mensaje: MENSAJE_LARGO }
  }
  const extraido = pareceEnlace(texto)
    ? usuarioDeEnlace(plataforma, texto)
    : { handle: texto.replace(/^@+/, "") }
  if ("mensaje" in extraido) return { ok: false, mensaje: extraido.mensaje }

  const sinArroba = extraido.handle.replace(/^@+/, "")
  const problema = problemaUsuario(plataforma, sinArroba)
  if (problema) return { ok: false, mensaje: problema }
  const handle = REGLAS[plataforma].minusculas
    ? sinArroba.toLowerCase()
    : sinArroba
  return { ok: true, handle, url: urlPerfil(plataforma, handle) }
}
