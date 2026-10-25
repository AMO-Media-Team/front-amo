/**
 * Textos y tonos del portal de campañas del anunciante (módulo puro): estados
 * de la campaña contados para quien la gestiona, conteo de ofertas por
 * estado, situación de la verificación de la empresa y la fase de la vigencia.
 */
import type { Route } from "next"

import {
  ESTADOS_OFERTA,
  type PresentacionEstado,
  type Tono,
} from "@/features/operacion/estados"
import { diasDeVigencia, faseVigencia } from "@/features/operacion/formato"
import { formatearFecha, formatearNumero } from "@/lib/format"

import { RUTA_MI_EMPRESA } from "./rutas"
import type {
  EstadoAnunciante,
  EstadoCampana,
  EstadoOferta,
  OfertasPorEstado,
  SituacionEmpresa,
} from "./tipos"

function estado(
  etiqueta: string,
  tono: Tono,
  descripcion: string
): PresentacionEstado {
  return { etiqueta, tono, descripcion }
}

/** Mismas etiquetas que la operación; la descripción le habla al anunciante. */
export const ESTADOS_MI_CAMPANA: Readonly<
  Record<EstadoCampana, PresentacionEstado>
> = {
  BORRADOR: estado(
    "Borrador",
    "neutro",
    "En preparación: actívala para enviar sus ofertas a revisión."
  ),
  ACTIVA: estado(
    "Activa",
    "exito",
    "Sus ofertas pueden ir a revisión y publicarse en el marketplace."
  ),
  FINALIZADA: estado(
    "Finalizada",
    "info",
    "Todas sus ofertas cerraron o se cancelaron."
  ),
  CANCELADA: estado(
    "Cancelada",
    "peligro",
    "Se canceló; sus ofertas sin compromisos también."
  ),
}

/** Estados de campaña en el orden del filtro y de los resúmenes. */
export const ORDEN_ESTADOS_CAMPANA: readonly EstadoCampana[] = [
  "ACTIVA",
  "BORRADOR",
  "FINALIZADA",
  "CANCELADA",
]

// ── Ofertas por estado ───────────────────────────────────────────────────────

/** Primero lo que pide algo al anunciante; después lo que está en juego. */
export const ORDEN_ESTADOS_OFERTA: readonly EstadoOferta[] = [
  "DEVUELTA",
  "BORRADOR",
  "EN_REVISION",
  "PUBLICADA",
  "CUPOS_COMPLETOS",
  "EN_EJECUCION",
  "VENCIDA",
  "CERRADA",
  "CANCELADA",
]

const CONTEO_OFERTA: Readonly<
  Record<EstadoOferta, readonly [singular: string, plural: string]>
> = {
  BORRADOR: ["en borrador", "en borrador"],
  EN_REVISION: ["en revisión", "en revisión"],
  DEVUELTA: ["devuelta", "devueltas"],
  PUBLICADA: ["publicada", "publicadas"],
  CUPOS_COMPLETOS: ["con cupos completos", "con cupos completos"],
  EN_EJECUCION: ["en ejecución", "en ejecución"],
  VENCIDA: ["vencida", "vencidas"],
  CERRADA: ["cerrada", "cerradas"],
  CANCELADA: ["cancelada", "canceladas"],
}

export interface ConteoOfertas {
  estado: EstadoOferta
  cantidad: number
  /** "2 publicadas", "1 devuelta", "3 en borrador". */
  texto: string
  tono: Tono
}

/** Cuenta las ofertas por estado. */
export function contarPorEstado(
  ofertas: readonly { estado: EstadoOferta }[]
): OfertasPorEstado {
  const conteo: OfertasPorEstado = {}
  for (const { estado: actual } of ofertas) {
    conteo[actual] = (conteo[actual] ?? 0) + 1
  }
  return conteo
}

/** Conteos presentes, en el orden de `ORDEN_ESTADOS_OFERTA`. */
export function conteosDeOfertas(porEstado: OfertasPorEstado): ConteoOfertas[] {
  return ORDEN_ESTADOS_OFERTA.flatMap((actual) => {
    const cantidad = porEstado[actual] ?? 0
    if (cantidad <= 0) return []
    const [singular, plural] = CONTEO_OFERTA[actual]
    return [
      {
        estado: actual,
        cantidad,
        texto: `${formatearNumero(cantidad)} ${cantidad === 1 ? singular : plural}`,
        tono: ESTADOS_OFERTA[actual].tono,
      },
    ]
  })
}

export function totalOfertas(porEstado: OfertasPorEstado): number {
  return Object.values(porEstado).reduce((suma, n) => suma + (n ?? 0), 0)
}

// ── Verificación de la empresa ───────────────────────────────────────────────

export interface PresentacionEmpresa {
  tono: Tono
  titulo: string
  descripcion: string
  /** Motivo que dejó el equipo AMO (rechazo o suspensión). */
  motivo: string | null
  accion: { texto: string; href: Route }
}

/**
 * Qué le falta a la empresa para activar campañas y qué hacer. `null` si ya
 * está verificada (nada que avisar).
 */
export function presentarSituacionEmpresa(
  situacion: Pick<SituacionEmpresa, "estado" | "motivo" | "enviadaAt">
): PresentacionEmpresa | null {
  switch (situacion.estado) {
    case "VERIFICADO":
      return null
    case "PENDIENTE":
      return situacion.enviadaAt
        ? {
            tono: "info",
            titulo: "Estamos verificando tu empresa",
            descripcion: `La enviaste a verificación el ${formatearFecha(situacion.enviadaAt, "largo")}. Te avisaremos cuando el equipo de AMO termine; mientras tanto puedes preparar tus campañas en borrador.`,
            motivo: null,
            accion: { texto: "Ver mi empresa", href: RUTA_MI_EMPRESA },
          }
        : {
            tono: "aviso",
            titulo: "Verifica tu empresa para activar campañas",
            descripcion:
              "Carga los documentos de tu empresa en «Mi empresa» y envíala a verificación. Mientras tanto puedes preparar tus campañas y ofertas en borrador.",
            motivo: null,
            accion: { texto: "Completar mi empresa", href: RUTA_MI_EMPRESA },
          }
    case "RECHAZADO":
      return {
        tono: "peligro",
        titulo: "No pudimos verificar tu empresa",
        descripcion:
          "Corrige lo que te indicamos y vuelve a enviarla a verificación. Hasta entonces no puedes activar campañas.",
        motivo: situacion.motivo?.trim() || null,
        accion: { texto: "Corregir y reenviar", href: RUTA_MI_EMPRESA },
      }
    case "SUSPENDIDO":
      return {
        tono: "aviso",
        titulo: "Tu empresa está suspendida",
        descripcion:
          "Mientras siga suspendida no puedes activar campañas y tus ofertas publicadas no reciben aceptaciones nuevas. Si necesitas ayuda, escríbele al equipo de AMO.",
        motivo: situacion.motivo?.trim() || null,
        accion: { texto: "Ver mi empresa", href: RUTA_MI_EMPRESA },
      }
  }
}

/** Quién lee el texto: el anunciante o el equipo AMO que actúa por su cuenta. */
export type VozGestion = "propio" | "asistido"

/** Por qué no se puede activar una campaña (junto al botón deshabilitado). */
export function motivoSinActivar(
  estadoEmpresa: EstadoAnunciante,
  voz: VozGestion = "propio"
): string {
  if (voz === "asistido") {
    switch (estadoEmpresa) {
      case "VERIFICADO":
        return ""
      case "PENDIENTE":
        return "Se podrá activar cuando AMO verifique la empresa."
      case "RECHAZADO":
        return "Se podrá activar cuando la empresa corrija sus datos y AMO la verifique."
      case "SUSPENDIDO":
        return "La empresa está suspendida: sus campañas no se pueden activar."
    }
  }
  switch (estadoEmpresa) {
    case "VERIFICADO":
      return ""
    case "PENDIENTE":
      return "Podrás activarla cuando AMO verifique tu empresa."
    case "RECHAZADO":
      return "Podrás activarla cuando corrijas los datos de tu empresa y AMO la verifique."
    case "SUSPENDIDO":
      return "Tu empresa está suspendida: por ahora no puedes activar campañas."
  }
}

// ── Vigencia ─────────────────────────────────────────────────────────────────

const MS_DIA = 86_400_000

/** Días de calendario entre dos fechas 'YYYY-MM-DD' (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (Date.parse(`${hasta}T12:00:00-05:00`) -
      Date.parse(`${desde}T12:00:00-05:00`)) /
      MS_DIA
  )
}

function enDias(dias: number): string {
  return `${formatearNumero(dias)} ${dias === 1 ? "día" : "días"}`
}

/**
 * Dónde está la vigencia de una campaña activa: «Empieza mañana», «En curso ·
 * faltan 12 días», «Último día», «Vigencia terminada». `null` en las demás
 * (su estado ya lo dice todo).
 */
export function textoFase(
  campana: { estado: EstadoCampana; fechaInicio: string; fechaFin: string },
  hoy: string
): { texto: string; tono: Tono } | null {
  if (campana.estado !== "ACTIVA") return null
  const fase = faseVigencia(campana.fechaInicio, campana.fechaFin, hoy)
  if (fase === "por_iniciar") {
    const dias = diasEntre(hoy, campana.fechaInicio)
    return {
      texto: dias === 1 ? "Empieza mañana" : `Empieza en ${enDias(dias)}`,
      tono: "info",
    }
  }
  if (fase === "en_curso") {
    const dias = diasEntre(hoy, campana.fechaFin)
    if (dias === 0) return { texto: "Último día", tono: "aviso" }
    return {
      texto: `En curso · ${dias === 1 ? "falta 1 día" : `faltan ${enDias(dias)}`}`,
      tono: "exito",
    }
  }
  return { texto: "Vigencia terminada", tono: "neutro" }
}

/** "61 días" (ambos extremos incluidos). */
export function duracionVigencia(
  fechaInicio: string,
  fechaFin: string
): string {
  return enDias(diasDeVigencia(fechaInicio, fechaFin))
}
