/**
 * Textos de «Mis documentos» que dependen de los datos (módulo puro): el
 * resumen de avance, la explicación del nivel elegido y la línea de fechas de
 * cada documento.
 */
import { formatearFecha } from "@/lib/format"

import { explicacionNivel, type NivelSugerido } from "./requisitos"
import type { ResumenDocumentos, Situacion } from "./situacion"
import type {
  DocumentoCargado,
  MedioDocumentos,
  NivelVerificacion,
} from "./tipos"

/** `YYYY-MM-DD` a mediodía de Bogotá: el día no cambia al formatear. */
export function fechaDeDia(dia: string): string {
  return `${dia}T12:00:00-05:00`
}

/** Titular del resumen: lo más urgente primero. */
export function tituloResumen(resumen: ResumenDocumentos): string {
  if (resumen.total === 0) return "Este nivel no pide documentos"
  if (resumen.completo) return "Tus documentos están al día"
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
  return "Ya cargaste todo: lo estamos revisando"
}

/** Chips del resumen («2 en revisión», «1 sin cargar»), solo los que tienen algo. */
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

export type SiguientePaso =
  | { tipo: "enviar" }
  | { tipo: "en-cola"; desde: string }
  | null

/**
 * Qué sigue para un medio en alta: con todo cargado puede enviar su perfil a
 * verificación (desde «Mi medio»); si ya lo envió, está en la cola.
 */
export function siguientePaso(
  medio: Pick<MedioDocumentos, "estado" | "enviadoVerificacionAt">,
  resumen: ResumenDocumentos
): SiguientePaso {
  if (medio.estado === "PENDIENTE" && medio.enviadoVerificacionAt) {
    return { tipo: "en-cola", desde: medio.enviadoVerificacionAt }
  }
  const enAlta = medio.estado === "PENDIENTE" || medio.estado === "RECHAZADO"
  return enAlta && resumen.todoCargado ? { tipo: "enviar" } : null
}

/** Por qué se ven los documentos del nivel elegido. */
export function explicarNivelElegido(
  elegido: NivelVerificacion,
  sugerido: NivelSugerido,
  medio: Pick<MedioDocumentos, "estado" | "nivel">
): string {
  if (elegido === sugerido.nivel) return explicacionNivel(sugerido)
  const verificado = medio.estado === "VERIFICADO" && medio.nivel >= 1
  if (verificado && elegido > medio.nivel) {
    return `Para subir al nivel ${elegido}, carga lo que falte. Cuando esté aprobado, el equipo AMO actualiza tu nivel.`
  }
  if (verificado && elegido < medio.nivel) {
    return `Es un nivel inferior al tuyo (nivel ${medio.nivel}): sus documentos ya están incluidos en el tuyo.`
  }
  return `Estos son los documentos que pide el nivel ${elegido}.`
}

function revisado(documento: DocumentoCargado): string | null {
  return documento.revisadoAt
    ? `revisado el ${formatearFecha(documento.revisadoAt)}`
    : null
}

/** Línea de fechas bajo el título de la tarjeta («Cargado el 3 oct 2026 · vence el…»). */
export function lineaFechas(situacion: Situacion): string | null {
  if (situacion.tipo === "falta") return null
  const { documento } = situacion
  if (documento.metodo === "VIDEOLLAMADA") {
    return `Verificada por videollamada el ${formatearFecha(documento.revisadoAt ?? documento.cargadoAt)}`
  }
  const partes = [`Cargado el ${formatearFecha(documento.cargadoAt)}`]
  if (situacion.tipo === "aprobado" || situacion.tipo === "rechazado") {
    const linea = revisado(documento)
    if (linea) partes.push(linea)
  }
  if (situacion.tipo === "aprobado" && documento.venceEl) {
    partes.push(`vence el ${formatearFecha(fechaDeDia(documento.venceEl))}`)
  }
  if (situacion.tipo === "vencido" && documento.venceEl) {
    partes.push(`venció el ${formatearFecha(fechaDeDia(documento.venceEl))}`)
  }
  return partes.join(" · ")
}
