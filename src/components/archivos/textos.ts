/**
 * Textos de la interfaz de archivos (puros, sin React): ayuda de la zona de
 * carga, rechazos y estado de cada subida.
 */
import { formatearDuracion, formatearTamano } from "@/lib/archivos/formato"
import { categoriaDe, describirFormatos } from "@/lib/archivos/mime"
import { describirRelacion, type ReglasArchivo } from "@/lib/archivos/validar"
import { formatearPorcentaje } from "@/lib/format"

import type { EstadoSubida, InstantaneaSubida } from "./motor-subida"

/** Rechazo de formato (el mismo texto que la validación y el servidor). */
export { mensajeFormatoNoAdmitido as mensajeFormato } from "@/lib/archivos/mime"

/** «JPG, PNG o WebP · hasta 10 MB · proporción 9:16 · hasta 1 min». */
export function describirReglas(reglas: ReglasArchivo): string {
  return [
    describirFormatos(reglas.mimes),
    `hasta ${formatearTamano(reglas.maxBytes)}`,
    reglas.aspecto
      ? `proporción ${describirRelacion(reglas.aspecto.relacion)}`
      : null,
    reglas.duracionMaxSeg !== undefined
      ? `video de hasta ${formatearDuracion(reglas.duracionMaxSeg)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

/** Qué hace el botón de cámara según lo que se admite. */
export function etiquetaCamara(mimes: readonly string[]): string | null {
  const categorias = new Set(mimes.map(categoriaDe))
  const imagenes = categorias.has("imagen")
  const videos = categorias.has("video")
  if (imagenes && videos) return "Usar la cámara"
  if (imagenes) return "Tomar foto"
  if (videos) return "Grabar video"
  return null
}

/** Mimes que la cámara puede producir (para el `accept` del input con `capture`). */
export function mimesDeCamara(mimes: readonly string[]): string[] {
  return mimes.filter((mime) => {
    const categoria = categoriaDe(mime)
    return categoria === "imagen" || categoria === "video"
  })
}

/** react-dropzone conserva los primeros y rechaza el excedente. */
export function mensajeDemasiados(maxArchivos: number): string {
  return maxArchivos <= 1
    ? "Elige un solo archivo: se tomó el primero."
    : `Puedes elegir hasta ${maxArchivos} archivos a la vez: se tomaron los primeros ${maxArchivos}.`
}

const ETIQUETAS_ESTADO: Readonly<Record<EstadoSubida, string>> = {
  "en-cola": "En espera",
  procesando: "Preparando el archivo…",
  preparando: "Preparando la subida…",
  subiendo: "Subiendo…",
  pausada: "Sin conexión. Seguirá sola al volver la señal.",
  reintentando: "Reintentando…",
  confirmando: "Guardando…",
  completada: "Listo",
  error: "No se pudo subir",
  cancelada: "Cancelada",
}

/**
 * Línea de estado visible de una subida. `segundosRestantes` es la cuenta
 * regresiva del próximo reintento.
 */
export function textoEstado(
  subida: Pick<InstantaneaSubida, "estado" | "progreso" | "error" | "intento">,
  segundosRestantes: number | null,
  maxIntentos: number
): string {
  switch (subida.estado) {
    case "subiendo":
      return `Subiendo… ${formatearPorcentaje(subida.progreso, 0)}`
    case "reintentando":
      return segundosRestantes !== null && segundosRestantes > 0
        ? `Falló la conexión. Reintento ${subida.intento} de ${maxIntentos} en ${segundosRestantes} s`
        : `Reintento ${subida.intento} de ${maxIntentos}…`
    case "error":
      return subida.error ?? ETIQUETAS_ESTADO.error
    default:
      return ETIQUETAS_ESTADO[subida.estado]
  }
}

/**
 * Lo que se anuncia al lector de pantalla: solo los hitos (no cada punto de
 * progreso), para no saturarlo.
 */
export function anuncioEstado(
  nombre: string,
  subida: Pick<InstantaneaSubida, "estado" | "error">
): string {
  switch (subida.estado) {
    case "completada":
      return `${nombre}: subido.`
    case "error":
      return `${nombre}: ${subida.error ?? ETIQUETAS_ESTADO.error}`
    case "pausada":
      return `${nombre}: en pausa sin conexión.`
    case "cancelada":
      return `${nombre}: subida cancelada.`
    default:
      return ""
  }
}
