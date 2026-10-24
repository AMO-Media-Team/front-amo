/**
 * Presentación de la oferta (módulo puro, cliente y servidor): el aviso de un
 * envío rechazado (los pasos y sus títulos son los del asistente,
 * `asistente-oferta/pasos`), urgencia de la fecha límite de aceptación y la
 * explicación de cada estado para el anunciante y para el equipo AMO. Es la
 * fuente única de estos textos en la interfaz.
 */
import {
  type PasoOferta,
  textoFaltaCompletar,
} from "@/features/asistente-oferta/pasos"
import {
  type EstadoOferta,
  PLATAFORMAS,
  type Plataforma,
  type Tono,
} from "@/features/operacion/estados"
import {
  formatearFechaHoraFija,
  formatearRangoCompacto,
} from "@/features/operacion/formato"
import {
  formatearFecha,
  formatearPorcentaje,
  formatearRelativo,
} from "@/lib/format"

import type { FechasOferta, FilaHistorial, Perspectiva } from "./tipos"

/** "Reel de Instagram", "Video de TikTok". */
export function formatoYPlataforma(oferta: {
  formato: string
  plataforma: Plataforma
}): string {
  return `${oferta.formato} de ${PLATAFORMAS[oferta.plataforma]}`
}

/**
 * Porcentaje del tope por medio con los decimales que de verdad tiene (hasta
 * dos; la BD guarda la fracción con cuatro): «15 %», «12,5 %», «12,25 %».
 * Redondearlo a entero mostraría un tope de 12,5 % como «13 %».
 */
export function formatearTopePorMedio(fraccion: number): string {
  const puntos = fraccion * 100
  const decimales =
    [0, 1].find((cifras) => {
      const escalado = puntos * 10 ** cifras
      return Math.abs(escalado - Math.round(escalado)) < 1e-6
    }) ?? 2
  return formatearPorcentaje(fraccion, decimales)
}

// ── Envío rechazado (contrato con `validar_envio_oferta`) ────────────────────

/**
 * El paso «envío» no es algo que se corrija en el asistente (empresa sin
 * verificar, campaña sin activar): ahí solo se muestra el detalle.
 */
export function pasoCorregible(paso: PasoOferta | null): paso is PasoOferta {
  return paso !== null && paso !== "envio"
}

/** «Falta completar: Paquete creativo» (título del aviso de un envío rechazado). */
export function tituloFaltaPaso(paso: PasoOferta | null): string {
  return pasoCorregible(paso)
    ? textoFaltaCompletar(paso)
    : "No se pudo enviar a revisión"
}

// ── Fecha límite de aceptación ───────────────────────────────────────────────

/** Desde cuántas horas antes la fecha límite se marca como próxima. */
export const HORAS_AVISO_FECHA_LIMITE = 48

const MS_HORA = 3_600_000

export type NivelUrgencia = "vencida" | "proxima" | "holgada"

export interface UrgenciaFechaLimite {
  nivel: NivelUrgencia
  tono: Tono
  /** "Venció hace 2 horas", "Vence dentro de 20 horas", "Vence el 3 de nov de 2026". */
  texto: string
}

/** Estados en los que la fecha límite todavía decide algo. */
const ESTADOS_CON_FECHA_LIMITE: ReadonlySet<EstadoOferta> = new Set([
  "BORRADOR",
  "EN_REVISION",
  "DEVUELTA",
  "PUBLICADA",
])

export function urgenciaFechaLimite(
  fechaLimite: string,
  ahora: Date
): UrgenciaFechaLimite {
  const restante = new Date(fechaLimite).getTime() - ahora.getTime()
  if (restante <= 0) {
    return {
      nivel: "vencida",
      tono: "peligro",
      texto: `Venció ${formatearRelativo(fechaLimite, ahora)}`,
    }
  }
  if (restante <= HORAS_AVISO_FECHA_LIMITE * MS_HORA) {
    return {
      nivel: "proxima",
      tono: "aviso",
      texto: `Vence ${formatearRelativo(fechaLimite, ahora)}`,
    }
  }
  return {
    nivel: "holgada",
    tono: "neutro",
    texto: `Vence el ${formatearFecha(fechaLimite)}`,
  }
}

/** Urgencia solo donde importa (antes de cerrar la aceptación); si no, `null`. */
export function urgenciaSegunEstado(
  estado: EstadoOferta,
  fechaLimite: string,
  ahora: Date
): UrgenciaFechaLimite | null {
  return ESTADOS_CON_FECHA_LIMITE.has(estado)
    ? urgenciaFechaLimite(fechaLimite, ahora)
    : null
}

export function fechaLimiteVencida(fechaLimite: string, ahora: Date): boolean {
  return new Date(fechaLimite).getTime() <= ahora.getTime()
}

// ── Situación de la oferta según quién la mira ───────────────────────────────

export interface SituacionOferta {
  tono: Tono
  titulo: string
  descripcion: string
  /** Comentario o motivo que se destaca (devolución, rechazo o cancelación). */
  comentario: { etiqueta: string; texto: string } | null
  /** El equipo AMO la rechazó en moderación (cancelada desde la revisión). */
  rechazada?: boolean
}

export interface DatosSituacion {
  estado: EstadoOferta
  fechas: FechasOferta
  fechaLimiteAceptacion: string
  ventanaInicio: string
  ventanaFin: string
  comentarioModeracion: string | null
  /** El cambio de estado más reciente del historial, si lo hay. */
  ultimoCambio: Pick<
    FilaHistorial,
    "desde" | "hacia" | "actorTipo" | "comentario"
  > | null
}

function texto(valor: string | null | undefined): string | null {
  const limpio = valor?.trim()
  return limpio ? limpio : null
}

/** El último cambio explica el estado actual solo si llevó a él. */
function cambioHacia(datos: DatosSituacion) {
  return datos.ultimoCambio?.hacia === datos.estado ? datos.ultimoCambio : null
}

function situacionDevuelta(
  datos: DatosSituacion,
  perspectiva: Perspectiva
): SituacionOferta {
  const cambio = cambioHacia(datos)
  if (cambio?.actorTipo === "SISTEMA") {
    return {
      tono: "aviso",
      titulo: "Devuelta: venció la fecha límite",
      descripcion:
        perspectiva === "anunciante"
          ? "La fecha límite de aceptación pasó mientras estaba en revisión. Ajusta las fechas y envíala de nuevo."
          : "La fecha límite de aceptación pasó mientras esperaba moderación; el anunciante debe ajustar las fechas.",
      comentario: null,
    }
  }
  const comentario =
    texto(datos.comentarioModeracion) ?? texto(cambio?.comentario)
  return {
    tono: "aviso",
    titulo: "Devuelta con comentarios",
    descripcion:
      perspectiva === "anunciante"
        ? "El equipo AMO pidió ajustes antes de publicarla. Corrígela en el asistente y reenvíala a revisión."
        : "Espera que el anunciante la ajuste y la reenvíe a revisión.",
    comentario: comentario
      ? {
          etiqueta:
            perspectiva === "anunciante"
              ? "Comentario del equipo AMO"
              : "Comentario enviado al anunciante",
          texto: comentario,
        }
      : null,
  }
}

function situacionCancelada(
  datos: DatosSituacion,
  perspectiva: Perspectiva
): SituacionOferta {
  const cambio = cambioHacia(datos)
  const rechazo =
    cambio?.desde === "EN_REVISION" && cambio.actorTipo === "ADMIN"
  if (rechazo) {
    const motivo = texto(cambio.comentario) ?? texto(datos.comentarioModeracion)
    return {
      tono: "peligro",
      titulo: "Rechazada en moderación",
      rechazada: true,
      descripcion:
        perspectiva === "anunciante"
          ? "El equipo AMO no la aprobó para publicarse. Si quieres intentarlo de nuevo, crea una oferta nueva teniendo en cuenta el motivo."
          : "No se aprobó para publicarse; el anunciante recibió el motivo.",
      comentario: motivo ? { etiqueta: "Motivo", texto: motivo } : null,
    }
  }
  const motivo = texto(cambio?.comentario)
  const cuando = datos.fechas.canceladaAt
    ? ` el ${formatearFecha(datos.fechas.canceladaAt)}`
    : ""
  return {
    tono: "peligro",
    titulo: `Cancelada${cuando}`,
    descripcion:
      cambio?.actorTipo === "SISTEMA"
        ? "Se canceló automáticamente (la campaña se canceló o el borrador caducó). Ya no está disponible para los medios."
        : "Ya no está disponible para los medios.",
    comentario: motivo ? { etiqueta: "Motivo", texto: motivo } : null,
  }
}

/**
 * Qué significa el estado actual para quien mira la oferta, con el
 * comentario de la devolución o el motivo del rechazo destacados.
 */
export function situacionOferta(
  datos: DatosSituacion,
  perspectiva: Perspectiva
): SituacionOferta {
  const anunciante = perspectiva === "anunciante"
  const limite = formatearFechaHoraFija(datos.fechaLimiteAceptacion)
  const ventana = formatearRangoCompacto(datos.ventanaInicio, datos.ventanaFin)

  switch (datos.estado) {
    case "BORRADOR": {
      const retirada = cambioHacia(datos)?.desde === "EN_REVISION"
      return {
        tono: "neutro",
        titulo: retirada ? "Retirada de revisión" : "Borrador",
        descripcion: anunciante
          ? retirada
            ? "Volvió a borrador para que la ajustes. Envíala de nuevo a revisión cuando esté lista."
            : "Complétala en el asistente y envíala a revisión. Hasta entonces solo la ven tú y tu equipo."
          : "El anunciante aún no la envía a revisión.",
        comentario: null,
      }
    }
    case "EN_REVISION": {
      const enviada = datos.fechas.enviadaAt
        ? formatearFechaHoraFija(datos.fechas.enviadaAt)
        : null
      const reenvio = datos.fechas.devueltaAt !== null
      return {
        tono: anunciante ? "info" : "aviso",
        titulo: anunciante ? "En revisión" : "Espera moderación",
        descripcion: anunciante
          ? `${enviada ? `La enviaste el ${enviada}. ` : ""}El equipo AMO revisa que cumpla las condiciones de publicación y te avisará cuando la publique o si necesita ajustes. Si quieres cambiar algo, retírala de revisión.`
          : `${enviada ? `Enviada el ${enviada}. ` : ""}${
              reenvio
                ? "Es un reenvío tras una devolución: el comentario anterior está en el historial. "
                : ""
            }Revisa segmentación, presupuesto, creativo y condiciones antes de decidir.`,
        comentario: null,
      }
    }
    case "DEVUELTA":
      return situacionDevuelta(datos, perspectiva)
    case "PUBLICADA":
      return {
        tono: "info",
        titulo: "Publicada",
        descripcion: anunciante
          ? `Los medios elegibles ya la ven en el marketplace y pueden aceptar cupos hasta el ${limite}.`
          : `Visible en el marketplace para los medios elegibles hasta el ${limite}.`,
        comentario: null,
      }
    case "CUPOS_COMPLETOS":
      return {
        tono: "exito",
        titulo: "Cupos completos",
        descripcion: `Todos los cupos fueron tomados. Los medios publican entre el ${ventana}.`,
        comentario: null,
      }
    case "EN_EJECUCION":
      return {
        tono: "info",
        titulo: "En ejecución",
        descripcion: `Los medios publican el contenido entre el ${ventana}.`,
        comentario: null,
      }
    case "VENCIDA":
      // Con algún cupo tomado no vence: pasa a ejecución (cron `ofertas_vencidas`).
      return {
        tono: "neutro",
        titulo: "Venció la fecha límite",
        descripcion:
          "Pasó la fecha límite de aceptación sin que ningún medio tomara un cupo.",
        comentario: null,
      }
    case "CERRADA":
      return {
        tono: "neutro",
        titulo: "Cerrada",
        descripcion: "Terminó su ventana de publicación.",
        comentario: null,
      }
    case "CANCELADA":
      return situacionCancelada(datos, perspectiva)
  }
}

// ── Motivos frecuentes de la cancelación del anunciante ──────────────────────

export const SUGERENCIAS_CANCELACION_ANUNCIANTE: readonly string[] = [
  "La campaña cambió de estrategia.",
  "El producto o servicio ya no está disponible.",
  "Hay un error en la configuración de la oferta.",
]

/** Los mismos motivos dichos por el equipo AMO por cuenta de la empresa (ADM-014). */
export const SUGERENCIAS_CANCELACION_ASISTIDA: readonly string[] = [
  "Lo solicitó la empresa.",
  "La empresa ya no ofrece el producto o servicio.",
  "La oferta tiene un error de configuración y se creará otra.",
]
