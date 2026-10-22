/**
 * Textos de «Mis documentos» (módulo puro): los de la página y los que
 * dependen de los datos (el resumen de avance, la explicación del nivel
 * elegido y la línea de fechas de cada documento).
 */
import { formatearFecha } from "@/lib/format"

import { NIVEL_DE_ENTRADA, nivelVerificado } from "./requisitos"
import type { ResumenDocumentos, Situacion } from "./situacion"
import type {
  DocumentoCargado,
  MedioDocumentos,
  NivelVerificacion,
} from "./tipos"

export const TITULO_PAGINA = "Mis documentos"

export const DESCRIPCION_PAGINA =
  "Los que pide tu nivel de verificación para confirmar tu identidad y pagarte a tu nombre. Toma la foto con tu celular o sube el PDF."

/** `YYYY-MM-DD` a mediodía de Bogotá: el día no cambia al formatear. */
export function fechaDeDia(dia: string): string {
  return `${dia}T12:00:00-05:00`
}

function plural(cantidad: number, singular: string, varios: string): string {
  return cantidad === 1 ? singular : varios
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
  if (resumen.enRevision > 0) {
    return "Ya cargaste lo necesario: lo estamos revisando"
  }
  // Todo aprobado salvo lo voluntario (la prueba de vida).
  return "Solo falta verificar tu identidad"
}

/** Chips del resumen («2 en revisión», «1 sin cargar»), solo los que tienen algo. */
export function detallesResumen(resumen: ResumenDocumentos): string[] {
  const partes: [number, string][] = [
    [resumen.enRevision, "en revisión"],
    [resumen.porCorregir, "por corregir"],
    [resumen.faltan, "sin cargar"],
    [
      resumen.voluntarios,
      plural(
        resumen.voluntarios,
        "opcional sin cargar",
        "opcionales sin cargar"
      ),
    ],
    [resumen.porVencer, "por vencer"],
  ]
  return partes.flatMap(([cantidad, texto]) =>
    cantidad > 0 ? [`${cantidad} ${texto}`] : []
  )
}

export type SiguientePaso =
  { tipo: "enviar" } | { tipo: "en-cola"; desde: string } | null

/**
 * Qué sigue para un medio en alta: si ya envió su perfil, está en la cola;
 * si ya cargó lo que pide el nivel de entrada (`listoParaEnviar`), puede
 * enviarlo desde «Mi medio». Un medio verificado no envía nada: el equipo AMO
 * revisa cada carga nueva por su cuenta.
 */
export function siguientePaso(
  medio: Pick<MedioDocumentos, "estado" | "enviadoVerificacionAt">,
  listoParaEnviar: boolean
): SiguientePaso {
  if (medio.estado === "PENDIENTE" && medio.enviadoVerificacionAt) {
    return { tipo: "en-cola", desde: medio.enviadoVerificacionAt }
  }
  const enAlta = medio.estado === "PENDIENTE" || medio.estado === "RECHAZADO"
  return enAlta && listoParaEnviar ? { tipo: "enviar" } : null
}

/** Por qué se ven los documentos del nivel elegido. */
export function explicarNivelElegido(
  elegido: NivelVerificacion,
  medio: Pick<MedioDocumentos, "estado" | "nivel">
): string {
  const actual = nivelVerificado(medio)
  if (actual === null) {
    return elegido === NIVEL_DE_ENTRADA
      ? "Es el nivel de entrada: con estos documentos te verificamos para que empieces a tomar ofertas. Después puedes subir de nivel."
      : `Si cargas lo que pide el nivel ${elegido}, el equipo AMO puede verificarte directamente en ese nivel, con un tope anual mayor.`
  }
  if (elegido > actual) {
    return `Para subir al nivel ${elegido}, carga lo que falte. Cuando esté aprobado, el equipo AMO actualiza tu nivel.`
  }
  if (elegido < actual) {
    return `Es un nivel inferior al tuyo (nivel ${actual}): sus documentos ya están incluidos en el tuyo.`
  }
  return actual < 3
    ? "Es tu nivel actual: mantén estos documentos vigentes. Para subir de nivel, elige el siguiente y carga lo que falte."
    : "Es tu nivel actual, el más alto: mantén estos documentos vigentes."
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
