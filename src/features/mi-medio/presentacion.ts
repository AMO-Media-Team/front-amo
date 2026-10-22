/**
 * Textos y tonos de «Mi medio» (módulo puro): estado de cada paso de la lista
 * de alta, situación de cada documento y el titular de la verificación.
 */
import type { Tono } from "@/features/usuarios/presentacion"
import { parsearFecha } from "@/lib/fechas"
import { formatearFecha } from "@/lib/format"

import type { EstadoPaso, SituacionMedio } from "./alta"
import type { EstadoRequisito, SituacionDocumento } from "./requisitos"

export const ESTADOS_PASO: Readonly<
  Record<EstadoPaso, { etiqueta: string; tono: Tono }>
> = {
  completo: { etiqueta: "Listo", tono: "exito" },
  "en-curso": { etiqueta: "En curso", tono: "info" },
  pendiente: { etiqueta: "Pendiente", tono: "neutro" },
  atencion: { etiqueta: "Revisar", tono: "aviso" },
}

export const SITUACIONES_DOCUMENTO: Readonly<
  Record<SituacionDocumento, { etiqueta: string; tono: Tono }>
> = {
  aprobado: { etiqueta: "Aprobado", tono: "exito" },
  "en-revision": { etiqueta: "En revisión", tono: "info" },
  rechazado: { etiqueta: "Rechazado", tono: "peligro" },
  vencido: { etiqueta: "Vencido", tono: "aviso" },
  falta: { etiqueta: "Por cargar", tono: "neutro" },
}

/** 'YYYY-MM-DD' (día de Bogotá) → «1 de diciembre de 2026». */
export function fechaCalendario(dia: string): string {
  return formatearFecha(parsearFecha(dia), "largo")
}

/** Nota bajo el nombre del documento (vigencia, videollamada, rechazo). */
export function notaRequisito(requisito: EstadoRequisito): string | null {
  switch (requisito.situacion) {
    case "aprobado":
      if (requisito.porVideollamada) return "Verificada por videollamada."
      if (requisito.renovacionEnRevision) {
        return "Tu documento nuevo está en revisión."
      }
      if (requisito.fechaVencimiento) {
        return requisito.porVencer
          ? `Vence el ${fechaCalendario(requisito.fechaVencimiento)}: carga uno vigente.`
          : `Vigente hasta el ${fechaCalendario(requisito.fechaVencimiento)}.`
      }
      return null
    case "en-revision":
      return "El equipo de AMO lo está revisando."
    case "rechazado":
      return requisito.observaciones
        ? `Motivo: ${requisito.observaciones}`
        : "No fue aprobado: carga uno nuevo."
    case "vencido":
      return requisito.fechaVencimiento
        ? `Venció el ${fechaCalendario(requisito.fechaVencimiento)}: carga uno vigente.`
        : "Venció: carga uno vigente."
    case "falta":
      return null
  }
}

export interface PresentacionSituacion {
  titulo: string
  descripcion: string
  tono: Tono
}

/** Titular de la tarjeta de verificación de «Mi medio». */
export function presentarSituacion(
  situacion: SituacionMedio,
  nombreNivel: string | null,
  pasosFaltantes: number
): PresentacionSituacion {
  switch (situacion.tipo) {
    case "alta":
      return {
        titulo:
          pasosFaltantes === 0
            ? "Todo listo para enviar"
            : "Completa el alta de tu medio",
        descripcion:
          pasosFaltantes === 0
            ? "Envía tu medio a verificación. El equipo de AMO revisará tus datos y te avisará el resultado."
            : `Te ${pasosFaltantes === 1 ? "falta 1 paso" : `faltan ${pasosFaltantes} pasos`} para enviarlo a verificación. Cuando te verifiquen podrás aceptar ofertas.`,
        tono: pasosFaltantes === 0 ? "exito" : "info",
      }
    case "en-revision":
      return {
        titulo: "Tu medio está en revisión",
        descripcion: `Lo enviaste el ${formatearFecha(situacion.enviadoAt, "largo")}. El equipo de AMO revisa tus documentos, cuentas y datos de pago; te avisaremos por notificación. Puedes seguir actualizando tu información.`,
        tono: "info",
      }
    case "rechazado":
      return {
        titulo: "Tu verificación no fue aprobada",
        descripcion:
          "Corrige lo que te indicamos y vuelve a enviar tu medio a verificación.",
        tono: "peligro",
      }
    case "verificado":
      return {
        titulo: "Tu medio está verificado",
        descripcion: `Nivel ${situacion.nivel}${nombreNivel ? ` · ${nombreNivel}` : ""}. Ya puedes ver y aceptar las ofertas de tu nivel.`,
        tono: "exito",
      }
    case "suspendido":
      return {
        titulo: "Tu medio está suspendido",
        descripcion:
          "Mientras siga suspendido no verás ofertas nuevas ni podrás aceptarlas. Si crees que es un error, escríbele al equipo de AMO.",
        tono: "aviso",
      }
  }
}
