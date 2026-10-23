/**
 * Textos del paquete creativo (módulo puro): copy sugerido, hashtags,
 * menciones y enlace de destino, con los límites de las restricciones de
 * `creativos` (`creativos_copy_chk`, `_hashtags_chk`, `_menciones_chk`,
 * `_enlace_chk`). Los hashtags se guardan con `#` y las menciones con `@`,
 * como los escribe la persona en la red social.
 */
import { formatearNumero } from "@/lib/format"

/** `char_length(copy_sugerido) <= 2200` (lo mismo que admite Instagram). */
export const MAX_COPY = 2200
export const MAX_HASHTAGS = 30
export const MAX_MENCIONES = 20
export const MAX_ENLACE = 2000
const MAX_ETIQUETA = 100

/** Siempre se sugiere: la etiqueta de publicidad es obligatoria (ANU-009). */
export const HASHTAG_PUBLICIDAD = "#Publicidad"

const CUERPO_HASHTAG = /^[\p{L}\p{N}_]+$/u
const CUERPO_MENCION = /^[\p{L}\p{N}._]+$/u
const SEPARADORES = /[\s,;]+/u

/** Caracteres como los cuenta Postgres (`char_length`): un emoji es uno. */
export function contarCaracteres(texto: string): number {
  return [...texto].length
}

/** «#Publicidad #MiMarca, otra» → `["#Publicidad", "#MiMarca", "otra"]`. */
export function separarEntradas(texto: string): string[] {
  return texto.split(SEPARADORES).filter(Boolean)
}

function sinPrefijo(texto: string, prefijo: "#" | "@"): string {
  let cuerpo = texto.trim()
  while (cuerpo.startsWith(prefijo)) cuerpo = cuerpo.slice(1)
  return cuerpo
}

/** «publicidad», «#Publicidad» → «#Publicidad»; `null` si no es un hashtag válido. */
export function normalizarHashtag(texto: string): string | null {
  const cuerpo = sinPrefijo(texto, "#")
  return cuerpo.length > 0 &&
    contarCaracteres(cuerpo) <= MAX_ETIQUETA &&
    CUERPO_HASHTAG.test(cuerpo)
    ? `#${cuerpo}`
    : null
}

/** «marca.oficial», «@marca.oficial» → «@marca.oficial»; `null` si no es válida. */
export function normalizarMencion(texto: string): string | null {
  const cuerpo = sinPrefijo(texto, "@")
  return cuerpo.length > 0 &&
    contarCaracteres(cuerpo) <= MAX_ETIQUETA &&
    CUERPO_MENCION.test(cuerpo)
    ? `@${cuerpo}`
    : null
}

export type ClaseEtiqueta = "hashtag" | "mencion"

export const NORMALIZADORES: Readonly<
  Record<ClaseEtiqueta, (texto: string) => string | null>
> = {
  hashtag: normalizarHashtag,
  mencion: normalizarMencion,
}

/** Mensaje para una entrada que no se pudo normalizar. */
export function mensajeEtiquetaInvalida(
  clase: ClaseEtiqueta,
  texto: string
): string {
  return clase === "hashtag"
    ? `«${texto}» no es un hashtag válido: usa letras, números o guion bajo, sin espacios.`
    : `«${texto}» no es una mención válida: usa letras, números, punto o guion bajo, sin espacios.`
}

/** Iguales sin distinguir mayúsculas («#Marca» y «#marca» son el mismo hashtag). */
export function mismaEtiqueta(a: string, b: string): boolean {
  return a.localeCompare(b, "es-CO", { sensitivity: "accent" }) === 0
}

/** Agrega sin repetir (conserva la primera forma escrita). */
export function agregarEtiquetas(
  actuales: readonly string[],
  nuevas: readonly string[]
): string[] {
  const resultado = [...actuales]
  for (const nueva of nuevas) {
    if (!resultado.some((actual) => mismaEtiqueta(actual, nueva))) {
      resultado.push(nueva)
    }
  }
  return resultado
}

/**
 * Enlace tal como se guarda: sin espacios en los extremos y, si se escribió
 * sin protocolo («marca.co/promo»), con `https://`. Un `http://` se conserva
 * para que la validación lo rechace con su motivo (no se cambia en silencio).
 */
export function normalizarEnlace(texto: string): string {
  const limpio = texto.trim()
  if (!limpio) return ""
  return /^[a-z][a-z0-9+.-]*:/i.test(limpio) ? limpio : `https://${limpio}`
}

export type ProblemaEnlace = "inseguro" | "invalido" | "largo"

/** Por qué un enlace no sirve como destino (`null` si sirve). */
export function problemaEnlace(enlace: string): ProblemaEnlace | null {
  if (contarCaracteres(enlace) > MAX_ENLACE) return "largo"
  let url: URL
  try {
    url = new URL(enlace)
  } catch {
    return "invalido"
  }
  if (url.protocol === "http:") return "inseguro"
  if (url.protocol !== "https:" || !url.hostname.includes(".")) {
    return "invalido"
  }
  // La restricción de la BD exige el prefijo exacto en minúsculas.
  return enlace.startsWith("https://") ? null : "invalido"
}

export const MENSAJES_ENLACE: Readonly<Record<ProblemaEnlace, string>> = {
  inseguro:
    "Usa un enlace seguro: debe empezar por https:// (los medios no pueden dirigir a sitios sin cifrado).",
  invalido:
    "Escribe un enlace completo, por ejemplo https://tumarca.co/promocion.",
  largo: `El enlace admite hasta ${formatearNumero(MAX_ENLACE)} caracteres.`,
}

/** «tumarca.co/promocion» para mostrar un enlace sin el protocolo. */
export function enlaceVisible(enlace: string): string {
  return enlace.replace(/^https?:\/\//i, "").replace(/\/$/, "")
}
