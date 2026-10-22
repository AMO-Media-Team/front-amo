/**
 * Tipos de archivo que admite la plataforma (los de los buckets de Storage,
 * docs/modelo-datos.md §8): etiqueta para la persona, extensiones y
 * normalización del MIME que reporta el navegador. Módulo puro.
 */

interface Formato {
  /** Cómo se nombra el formato en los mensajes («JPG», «PDF»). */
  etiqueta: string
  /** Sin punto; la primera es la que se usa al guardar. */
  extensiones: readonly string[]
}

export const FORMATOS = {
  "image/jpeg": { etiqueta: "JPG", extensiones: ["jpg", "jpeg"] },
  "image/png": { etiqueta: "PNG", extensiones: ["png"] },
  "image/webp": { etiqueta: "WebP", extensiones: ["webp"] },
  "image/gif": { etiqueta: "GIF", extensiones: ["gif"] },
  "image/heic": { etiqueta: "HEIC", extensiones: ["heic", "heif"] },
  "application/pdf": { etiqueta: "PDF", extensiones: ["pdf"] },
  "video/mp4": { etiqueta: "MP4", extensiones: ["mp4", "m4v"] },
  "video/quicktime": { etiqueta: "MOV", extensiones: ["mov", "qt"] },
  "text/csv": { etiqueta: "CSV", extensiones: ["csv"] },
} as const satisfies Record<string, Formato>

export type MimeConocido = keyof typeof FORMATOS

/** Variantes que reportan algunos navegadores y sistemas para el mismo formato. */
const ALIAS: Readonly<Record<string, MimeConocido>> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/heif": "image/heic",
  "application/x-pdf": "application/pdf",
  "text/comma-separated-values": "text/csv",
  "application/csv": "text/csv",
}

/**
 * MIME que no dicen nada del contenido: se decide por la extensión. Windows
 * reporta los CSV como hoja de Excel.
 */
const GENERICOS = new Set([
  "",
  "application/octet-stream",
  "application/vnd.ms-excel",
  "binary/octet-stream",
])

const MIME_POR_EXTENSION: ReadonlyMap<string, MimeConocido> = new Map(
  Object.entries(FORMATOS).flatMap(([mime, formato]) =>
    formato.extensiones.map((ext) => [ext, mime as MimeConocido] as const)
  )
)

export function esMimeConocido(mime: string): mime is MimeConocido {
  return Object.hasOwn(FORMATOS, mime)
}

/** Extensión en minúsculas y sin punto («Foto.JPG» → «jpg»); vacía si no tiene. */
export function extensionDeNombre(nombre: string): string {
  const punto = nombre.lastIndexOf(".")
  return punto > 0 && punto < nombre.length - 1
    ? nombre.slice(punto + 1).toLowerCase()
    : ""
}

/**
 * MIME real del archivo: normaliza los alias y, si el navegador no lo sabe
 * (vacío, genérico), lo deduce de la extensión. Si no se reconoce, devuelve el
 * que reportó el navegador para que la validación lo rechace con su nombre.
 */
export function mimeDeArchivo(archivo: { name: string; type: string }): string {
  const reportado = archivo.type.trim().toLowerCase()
  const normalizado = ALIAS[reportado] ?? reportado
  if (esMimeConocido(normalizado)) return normalizado
  if (GENERICOS.has(normalizado)) {
    return (
      MIME_POR_EXTENSION.get(extensionDeNombre(archivo.name)) ?? normalizado
    )
  }
  return normalizado
}

/** «Foto final.JPG» + «webp» → «Foto final.webp». */
export function nombreConExtension(nombre: string, extension: string): string {
  const base = extensionDeNombre(nombre)
    ? nombre.slice(0, nombre.lastIndexOf("."))
    : nombre
  return `${base || "archivo"}.${extension}`
}

/** Extensión con la que se guarda un MIME admitido («image/jpeg» → «jpg»). */
export function extensionDeMime(mime: MimeConocido): string {
  return FORMATOS[mime].extensiones[0]
}

export function etiquetaDeMime(mime: string): string {
  if (esMimeConocido(mime)) return FORMATOS[mime].etiqueta
  const subtipo = mime.split("/")[1]
  return subtipo ? subtipo.toUpperCase() : "desconocido"
}

const listaDisyuntiva = new Intl.ListFormat("es-CO", {
  style: "long",
  type: "disjunction",
})

/** «JPG, PNG o WebP», sin repetir etiquetas. */
export function describirFormatos(mimes: readonly string[]): string {
  return listaDisyuntiva.format([...new Set(mimes.map(etiquetaDeMime))])
}

/** El mismo rechazo de formato en la zona, en la validación y en el servidor. */
export function mensajeFormatoNoAdmitido(mimes: readonly string[]): string {
  return `Este formato no se admite. Sube un archivo ${describirFormatos(mimes)}.`
}

/** Mapa para el `accept` de react-dropzone: `{ "image/jpeg": [".jpg", ".jpeg"] }`. */
export function aceptarDe(mimes: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(
    mimes.map((mime) => [
      mime,
      esMimeConocido(mime)
        ? FORMATOS[mime].extensiones.map((ext) => `.${ext}`)
        : [],
    ])
  )
}

/** Valor del atributo `accept` de un `<input type="file">` nativo. */
export function atributoAccept(mimes: readonly string[]): string {
  return Object.entries(aceptarDe(mimes))
    .flatMap(([mime, extensiones]) => [mime, ...extensiones])
    .join(",")
}

export type CategoriaArchivo = "imagen" | "video" | "pdf" | "otro"

export function categoriaDe(mime: string): CategoriaArchivo {
  if (mime === "application/pdf") return "pdf"
  if (mime.startsWith("image/")) return "imagen"
  if (mime.startsWith("video/")) return "video"
  return "otro"
}
