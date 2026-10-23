/**
 * Textos de la ejecución en voz del medio (módulo puro): el estado de una
 * evidencia o de un corte y lo que se le dice cuando una pantalla no admite
 * cambios (descarga primero, venció, aprobada, aún no llega el corte…).
 */
import type { PresentacionEstado } from "@/features/operacion/estados"
import { parsearFecha } from "@/lib/fechas"
import { formatearFecha, formatearFechaHora } from "@/lib/format"

import { NOMBRES_CORTE } from "./cortes"
import type { SituacionEvidencia } from "./evidencia"
import { diasDelPeriodo, type SituacionMetricas } from "./metricas"
import type { Corte, EstadoValidacion } from "./tipos"

/** Revisión del equipo AMO sobre una evidencia o un corte, contada al medio. */
export const REVISION_PARA_MEDIO: Readonly<
  Record<EstadoValidacion, PresentacionEstado>
> = {
  PENDIENTE: {
    etiqueta: "En revisión",
    tono: "aviso",
    descripcion: "El equipo AMO la está revisando.",
  },
  APROBADA: {
    etiqueta: "Aprobada",
    tono: "exito",
    descripcion: "El equipo AMO la revisó y la aprobó.",
  },
  RECHAZADA: {
    etiqueta: "Por corregir",
    tono: "peligro",
    descripcion: "El equipo AMO pidió corregirla.",
  },
}

export interface TextoSituacion {
  titulo: string
  descripcion: string
}

/** «la publicación 2» cuando la oferta pide varias; si no, «tu publicación». */
export function nombrePublicacion(numero: number, total: number): string {
  return total > 1 ? `la publicación ${numero}` : "tu publicación"
}

/** Título de la pantalla de evidencia. */
export function tituloEvidencia(numero: number, total: number): string {
  return total > 1
    ? `Evidencia de la publicación ${numero}`
    : "Evidencia de tu publicación"
}

/** Lo que se dice cuando la evidencia no se puede enviar. */
export function textoSituacionEvidencia(
  situacion: SituacionEvidencia
): TextoSituacion | null {
  switch (situacion.tipo) {
    case "descargar-primero":
      return {
        titulo: "Primero descarga el contenido",
        descripcion:
          "Para registrar tu publicación necesitas el contenido del anunciante. Descárgalo, publícalo y vuelve aquí con el enlace.",
      }
    case "aprobada":
      return {
        titulo: "Tu evidencia fue aprobada",
        descripcion:
          "El equipo AMO revisó tu publicación y la aprobó. Ya no hace falta cambiar nada.",
      }
    case "en-revision":
      return situacion.editable
        ? null
        : {
            titulo: "Tu evidencia está en revisión",
            descripcion:
              "El equipo AMO la está revisando. Te avisaremos si hay que corregir algo.",
          }
    case "vencida":
      return {
        titulo: "Venció el plazo para cargar la evidencia",
        descripcion: situacion.reclamoHasta
          ? `Si publicaste a tiempo y no pudiste cargarla, puedes reclamar hasta el ${formatearFechaHora(situacion.reclamoHasta)}. El equipo AMO atiende tu caso.`
          : "Si publicaste a tiempo y no pudiste cargarla, escríbele al equipo AMO para revisar tu caso.",
      }
    case "cerrada":
      return {
        titulo: "Esta campaña ya no recibe evidencias",
        descripcion:
          "La campaña cambió de estado y no admite cambios en la evidencia. Revisa el detalle para ver qué sigue.",
      }
    case "cargar":
    case "corregir":
      return null
  }
}

/** Lo que se dice cuando el corte no se puede cargar ni corregir. */
export function textoSituacionMetricas(
  situacion: SituacionMetricas,
  corte: Corte
): TextoSituacion | null {
  const delCorte = `de ${NOMBRES_CORTE[corte].largo}`
  switch (situacion.tipo) {
    case "corte-no-pedido":
      return {
        titulo: "Esta oferta no pide ese corte",
        descripcion:
          "Carga solo los cortes que pide la oferta. Si quieres reportar otro periodo, usa el corte personalizado.",
      }
    case "sin-evidencia":
      return {
        titulo: "Primero carga la evidencia",
        descripcion:
          "Las métricas van con una publicación registrada. Carga el enlace y la captura de tu publicación y luego vuelve aquí.",
      }
    case "evidencia-rechazada":
      return {
        titulo: "Primero corrige la evidencia",
        descripcion:
          "El equipo AMO pidió corregir la evidencia de esta publicación. Cuando la corrijas podrás cargar sus métricas.",
      }
    case "faltan-evidencias":
      return {
        titulo: "Falta la evidencia de otra publicación",
        descripcion:
          "La oferta pide varias publicaciones. Carga la evidencia de todas y luego sigue con las métricas.",
      }
    case "bloqueada":
      return {
        titulo: `Las métricas ${delCorte} aún no están listas`,
        descripcion: `Se habilitan el ${formatearFechaHora(situacion.desde)}, cuando se cumple el tiempo desde tu publicación. Así el panel muestra las cifras completas.`,
      }
    case "aprobada":
      return {
        titulo: `Las métricas ${delCorte} fueron aprobadas`,
        descripcion:
          "El equipo AMO ya las revisó. Si encuentras un error, escríbele: solo el equipo puede corregirlas.",
      }
    case "cerrada":
      return {
        titulo: "Esta campaña ya no recibe métricas",
        descripcion:
          "La campaña cambió de estado y no admite cambios en las métricas. Revisa el detalle para ver qué sigue.",
      }
    case "cargar":
    case "corregir":
    case "en-revision":
      return null
  }
}

/** «Del 21 oct 2026 al 22 oct 2026» para un periodo personalizado. */
export function describirPeriodo(desde: string, hasta: string): string {
  const dias = diasDelPeriodo(desde, hasta)
  const inicio = parsearFecha(dias.desde)
  const fin = parsearFecha(dias.hasta)
  return `Del ${formatearFecha(inicio)} al ${formatearFecha(fin)}`
}
