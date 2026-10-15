/**
 * Descarga de archivos generados en el navegador y nombres de archivo
 * consistentes ("resumen-ejecutivo-2026-09-30.xlsx").
 */
import { nombreArchivoExportacion } from "@/components/data-table/exportar"

export const MIME = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  png: "image/png",
} as const

export type ExtensionExportacion = keyof typeof MIME

const LIBERAR_URL_MS = 10_000

/** Mismo criterio de nombre que la exportación de tablas: sin tildes y con fecha de Bogotá. */
export function nombreArchivo(
  base: string,
  extension: ExtensionExportacion,
  fecha = new Date()
): string {
  return `${nombreArchivoExportacion(base, fecha)}.${extension}`
}

export function descargarArchivo(
  contenido: Blob | BlobPart,
  nombre: string,
  tipo: string
): void {
  const blob =
    contenido instanceof Blob
      ? contenido
      : new Blob([contenido], { type: tipo })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement("a")
  enlace.href = url
  enlace.download = nombre
  enlace.rel = "noopener"
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
  // Se libera con margen: revocar en el mismo ciclo del clic cancela la
  // descarga en algunos navegadores (Safari, Firefox con archivos grandes).
  setTimeout(() => URL.revokeObjectURL(url), LIBERAR_URL_MS)
}
