/**
 * Textos de «Mi empresa › Documentos» (módulo puro): los de la página y los
 * que dependen de los datos (el titular del avance y la línea de fechas de
 * cada documento).
 */
import { fechaDeDia } from "@/features/documentos-medio/textos"
import { formatearFecha } from "@/lib/format"

import type { ResumenDocumentos, Situacion } from "./situacion"

export { fechaDeDia }

export const TITULO_PAGINA = "Documentos de la empresa"

/**
 * Id del titular del resumen de «Documentos» (`tabIndex=-1`): recibe el foco
 * cuando el envío a verificación quita el botón que lo hizo.
 */
export const ID_RESUMEN_DOCUMENTOS = "resumen-documentos"

export const DESCRIPCION_PAGINA =
  "Los que pide AMO para verificar tu empresa. Sube el PDF o tómale una foto con tu celular."

/** Por qué un documento aprobado ya no cuenta (tarjeta de «Documentos»). */
export const NOTA_DESACTUALIZADO =
  "Carga de nuevo: la identificación de la empresa cambió después de aprobarlo."

/** Titular del resumen: lo más urgente primero. */
export function tituloResumen(resumen: ResumenDocumentos): string {
  if (resumen.completo) {
    return resumen.porVencer > 0
      ? "Tus documentos están aprobados; alguno vence pronto"
      : "Tus documentos están aprobados"
  }
  if (resumen.porCorregir > 0) {
    return resumen.porCorregir === 1
      ? "Tienes 1 documento por corregir"
      : `Tienes ${resumen.porCorregir} documentos por corregir`
  }
  if (resumen.faltan > 0) {
    return resumen.faltan === 1
      ? "Te falta 1 documento"
      : `Te faltan ${resumen.faltan} documentos`
  }
  return "Ya cargaste lo necesario"
}

/** Chips del resumen («1 en revisión», «1 por corregir»), solo los que tienen algo. */
export function detallesResumen(resumen: ResumenDocumentos): string[] {
  const partes: [number, string][] = [
    [resumen.enRevision, "en revisión"],
    [resumen.porCorregir, "por corregir"],
    [resumen.faltan, "sin cargar"],
    [resumen.porVencer, "por vencer"],
  ]
  return partes.flatMap(([cantidad, texto]) =>
    cantidad > 0 ? [`${cantidad} ${texto}`] : []
  )
}

/** Línea de fechas bajo el título de la tarjeta («Cargado el 3 oct 2026 · vence el…»). */
export function lineaFechas(situacion: Situacion): string | null {
  if (situacion.tipo === "falta") return null
  const { documento } = situacion
  const partes = [`Cargado el ${formatearFecha(documento.cargadoAt)}`]
  if (
    (situacion.tipo === "aprobado" ||
      situacion.tipo === "rechazado" ||
      situacion.tipo === "desactualizado") &&
    documento.revisadoAt
  ) {
    partes.push(`revisado el ${formatearFecha(documento.revisadoAt)}`)
  }
  if (situacion.tipo === "aprobado" && documento.venceEl) {
    partes.push(`vence el ${formatearFecha(fechaDeDia(documento.venceEl))}`)
  }
  if (situacion.tipo === "vencido" && documento.venceEl) {
    partes.push(`venció el ${formatearFecha(fechaDeDia(documento.venceEl))}`)
  }
  return partes.join(" · ")
}
