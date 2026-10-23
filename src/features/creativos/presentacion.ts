/**
 * Textos de presentación del paquete creativo (módulo puro): cómo se nombra
 * cada archivo y cada versión en la interfaz y para los lectores de pantalla.
 */
import type { Tono } from "@/features/usuarios/presentacion"
import { formatearDuracion, formatearTamano } from "@/lib/archivos/formato"
import { categoriaDe, etiquetaDeMime } from "@/lib/archivos/mime"
import { formatearFechaHora } from "@/lib/format"

import type { ArchivoCreativo, VersionCreativo } from "./tipos"

/** «MP4 · 1080 × 1920 px · 45 s · 12,4 MB». */
export function describirArchivo(
  archivo: Pick<
    ArchivoCreativo,
    "mime" | "ancho" | "alto" | "duracionSegundos" | "tamanoBytes"
  >
): string {
  return [
    etiquetaDeMime(archivo.mime),
    archivo.ancho && archivo.alto
      ? `${archivo.ancho} × ${archivo.alto} px`
      : null,
    archivo.duracionSegundos !== null && categoriaDe(archivo.mime) === "video"
      ? formatearDuracion(archivo.duracionSegundos)
      : null,
    formatearTamano(archivo.tamanoBytes),
  ]
    .filter(Boolean)
    .join(" · ")
}

/** «Imagen 2 de 5», «Video»: cómo se llama un archivo dentro de su versión. */
export function nombreArchivo(
  archivo: Pick<ArchivoCreativo, "mime">,
  posicion: number,
  total: number
): string {
  const clase = categoriaDe(archivo.mime) === "video" ? "Video" : "Imagen"
  return total > 1 ? `${clase} ${posicion + 1} de ${total}` : clase
}

export interface EstadoVersion {
  etiqueta: string
  tono: Tono
  descripcion: string
}

/** Vigente, en preparación o reemplazada, con lo que significa para los medios. */
export function estadoVersion(
  version: Pick<VersionCreativo, "vigente" | "pendiente">
): EstadoVersion {
  if (version.vigente) {
    return {
      etiqueta: "Vigente",
      tono: "exito",
      descripcion: "Es la que descargan los medios que aceptan la oferta.",
    }
  }
  if (version.pendiente) {
    return {
      etiqueta: "En preparación",
      tono: "aviso",
      descripcion: "Los medios aún no la ven: queda vigente cuando la actives.",
    }
  }
  return {
    etiqueta: "Reemplazada",
    tono: "neutro",
    descripcion: "Una versión más nueva la reemplazó.",
  }
}

/** «Versión 2». */
export function tituloVersion(version: Pick<VersionCreativo, "version">) {
  return `Versión ${version.version}`
}

/** «Activada el 22 oct. 2026, 3:15 p. m.» o «Creada el …» si aún no se activa. */
export function fechaVersion(
  version: Pick<VersionCreativo, "activadoAt" | "createdAt">
): string {
  return version.activadoAt
    ? `Activada el ${formatearFechaHora(version.activadoAt)}`
    : `Creada el ${formatearFechaHora(version.createdAt)}`
}

/** «9f86d081…b0f00a08»: la huella abreviada para mostrarla. */
export function huellaCorta(sha256: string): string {
  return sha256.length > 16
    ? `${sha256.slice(0, 8)}…${sha256.slice(-8)}`
    : sha256
}
