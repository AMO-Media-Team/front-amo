/**
 * La entrega del contenido al medio (MED-012, módulo puro): si puede
 * descargarlo, si hay una versión nueva, cómo se copia cada texto y cómo se
 * llama cada archivo al guardarlo.
 */
import { consumeCupo } from "@/features/operacion/estados"
import { contar } from "@/features/operacion/formato"
import {
  categoriaDe,
  esMimeConocido,
  extensionDeMime,
} from "@/lib/archivos/mime"

import type {
  ArchivoContenido,
  AsignacionMedio,
  ContenidoAsignacion,
  VersionContenido,
} from "./tipos"

export type SituacionContenido =
  /** Aceptó y aún no descarga: primero instrucciones, luego «Descargar». */
  | { tipo: "por_descargar"; vigente: VersionContenido }
  /** Descargó la versión vigente. */
  | { tipo: "al_dia"; version: VersionContenido }
  /** Descargó una versión que ya no es la vigente y aún no publica. */
  | {
      tipo: "version_nueva"
      descargada: VersionContenido
      vigente: VersionContenido
    }
  /** Ya publicó (o terminó): ve lo que descargó, sin descargar otra vez. */
  | { tipo: "descargado"; version: VersionContenido }
  /** Pasó la fecha límite sin descargar. */
  | { tipo: "fuera_de_plazo" }
  /** La oferta aún no tiene un creativo vigente (no debería pasar). */
  | { tipo: "sin_creativo" }
  /** Desistió, venció o se canceló: el contenido ya no está disponible. */
  | { tipo: "no_disponible" }

/** Estados en que todavía se registra una descarga (antes de publicar). */
const ANTES_DE_PUBLICAR = new Set(["ACEPTADA", "CONTENIDO_ENTREGADO"])

function vencido(fecha: string, ahora: Date): boolean {
  const limite = new Date(fecha).getTime()
  return Number.isFinite(limite) && ahora.getTime() > limite
}

/**
 * Qué puede hacer el medio con el contenido. La BD decide de nuevo al
 * descargar (`registrar_descarga_srv`) y al firmar cada archivo (Storage
 * solo deja leerlo a quien tiene la asignación en pie y ya lo descargó).
 */
export function situacionContenido(
  asignacion: Pick<
    AsignacionMedio,
    "estado" | "estadoPrevioDisputa" | "fechaLimitePublicacion"
  >,
  contenido: Pick<ContenidoAsignacion, "vigente" | "descargada">,
  ahora: Date
): SituacionContenido {
  if (!consumeCupo(asignacion.estado, asignacion.estadoPrevioDisputa)) {
    return { tipo: "no_disponible" }
  }
  const { vigente, descargada } = contenido
  const antesDePublicar = ANTES_DE_PUBLICAR.has(asignacion.estado)
  if (descargada) {
    if (!antesDePublicar) return { tipo: "descargado", version: descargada }
    if (vigente && vigente.id !== descargada.id) {
      return vencido(asignacion.fechaLimitePublicacion, ahora)
        ? { tipo: "descargado", version: descargada }
        : { tipo: "version_nueva", descargada, vigente }
    }
    return { tipo: "al_dia", version: descargada }
  }
  if (antesDePublicar && vencido(asignacion.fechaLimitePublicacion, ahora)) {
    return { tipo: "fuera_de_plazo" }
  }
  if (!vigente) return { tipo: "sin_creativo" }
  return { tipo: "por_descargar", vigente }
}

export type ResumenContenido =
  "por_descargar" | "descargado" | "fuera_de_plazo" | "no_disponible"

/**
 * Lo mismo que `situacionContenido`, sin leer el creativo (para la ficha): si
 * ya lo descargó, si aún puede o si dejó de estar disponible.
 */
export function resumenContenido(
  asignacion: Pick<
    AsignacionMedio,
    | "estado"
    | "estadoPrevioDisputa"
    | "fechaLimitePublicacion"
    | "creativoDescargadoId"
    | "contenidoDescargadoAt"
  >,
  ahora: Date
): ResumenContenido {
  if (!consumeCupo(asignacion.estado, asignacion.estadoPrevioDisputa)) {
    return "no_disponible"
  }
  if (asignacion.creativoDescargadoId || asignacion.contenidoDescargadoAt) {
    return "descargado"
  }
  return ANTES_DE_PUBLICAR.has(asignacion.estado) &&
    vencido(asignacion.fechaLimitePublicacion, ahora)
    ? "fuera_de_plazo"
    : "por_descargar"
}

// ── Textos para copiar ───────────────────────────────────────────────────────

function conPrefijo(valor: string, prefijo: "#" | "@"): string {
  const limpio = valor.trim()
  return limpio.startsWith(prefijo) ? limpio : `${prefijo}${limpio}`
}

/** «#Publicidad #MarcaX», listo para pegar en la publicación. */
export function textoHashtags(hashtags: readonly string[]): string {
  return hashtags
    .filter((valor) => valor.trim())
    .map((valor) => conPrefijo(valor, "#"))
    .join(" ")
}

/** «@marca @aliado». */
export function textoMenciones(menciones: readonly string[]): string {
  return menciones
    .filter((valor) => valor.trim())
    .map((valor) => conPrefijo(valor, "@"))
    .join(" ")
}

/**
 * Todo el texto de la publicación en el orden en que se pega: el copy, los
 * hashtags, las menciones y el enlace (para quien prefiere copiar una vez).
 */
export function textoCompleto(
  version: Pick<
    VersionContenido,
    "copySugerido" | "hashtags" | "menciones" | "enlaceDestino"
  >
): string {
  return [
    version.copySugerido?.trim(),
    textoHashtags(version.hashtags),
    textoMenciones(version.menciones),
    version.enlaceDestino?.trim(),
  ]
    .filter(Boolean)
    .join("\n\n")
}

/** «contenido-v2-1.mp4»: nombre del archivo guardado en el celular. */
export function nombreArchivoDescarga(
  version: number,
  orden: number,
  mime: string
): string {
  const extension = esMimeConocido(mime) ? `.${extensionDeMime(mime)}` : ""
  return `contenido-v${version}-${orden + 1}${extension}`
}

/** «1 video», «3 imágenes», «2 imágenes y 1 video»: lo que trae una versión. */
export function resumenArchivos(
  archivos: readonly Pick<ArchivoContenido, "mime">[]
): string {
  const videos = archivos.filter(
    (archivo) => categoriaDe(archivo.mime) === "video"
  ).length
  const imagenes = archivos.length - videos
  const partes = [
    imagenes > 0 ? contar(imagenes, "imagen", "imágenes") : null,
    videos > 0 ? contar(videos, "video", "videos") : null,
  ].filter(Boolean)
  return partes.length > 0 ? partes.join(" y ") : "solo texto"
}
