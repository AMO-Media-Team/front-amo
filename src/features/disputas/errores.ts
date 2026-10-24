/**
 * Errores de la BD al abrir, escribir o resolver una disputa → mensaje y
 * campo del formulario (módulo puro). La BD explica casi todo en el `detail`
 * de sus `AMO_*`; aquí se da texto propio a los `hint` de la fase 4 y a las
 * restricciones de las tablas de disputas.
 */
import {
  codigoNegocio,
  type ErrorBd,
  interpretarErrorBd,
  type Restricciones,
} from "@/lib/errores-bd"

export const MENSAJES_DISPUTA = {
  cerrada:
    "Esta disputa ya se cerró: no admite mensajes nuevos. Actualiza la página para ver su resultado.",
  noEncontrada:
    "No encontramos la disputa o ya no tienes acceso a ella. Actualiza la página.",
  sinPermisoNota: "Solo el equipo que resuelve disputas deja notas internas.",
  adjuntoAjeno:
    "El adjunto no corresponde a esta disputa. Elígelo de nuevo para subirlo.",
  ofertaCerrada:
    "La oferta ya cerró: no se puede reabrir la publicación. Mantén el vencimiento o cancela la asignación.",
  metricasPendientes:
    "Hay métricas pendientes de revisión: apruébalas desde la ficha de la asignación antes de verificar. Si alguna debe corregirse, restaura el estado previo y recházala después.",
  permanenciaPendiente:
    "La permanencia mínima de la publicación aún no se cumple: espera a que pase o deja constancia manual.",
  asignacionCerrada:
    "La asignación ya está cerrada: no admite este cambio. Actualiza la página para ver su estado.",
  enDisputa:
    "La asignación está en disputa: se cancela al resolver la disputa, eligiendo «Cancelar la asignación».",
  liquidacionVigente:
    "La asignación ya está en una liquidación: anula primero la liquidación.",
  alertaSinRevision:
    "La métrica tiene alertas: anota qué revisaste antes de aprobarla.",
  reclamoPrevio:
    "Ya reclamaste esta publicación: una vencida admite un solo reclamo. Actualiza la página para ver cómo terminó.",
} as const

/** `hint` de la BD con texto propio en la interfaz. */
const POR_HINT: Readonly<Record<string, { mensaje: string; campo?: string }>> =
  {
    oferta_cerrada: { mensaje: MENSAJES_DISPUTA.ofertaCerrada },
    metricas_pendientes: { mensaje: MENSAJES_DISPUTA.metricasPendientes },
    asignacion_cerrada: { mensaje: MENSAJES_DISPUTA.asignacionCerrada },
    en_disputa: { mensaje: MENSAJES_DISPUTA.enDisputa },
    liquidacion_vigente: { mensaje: MENSAJES_DISPUTA.liquidacionVigente },
    alerta_sin_revision: {
      mensaje: MENSAJES_DISPUTA.alertaSinRevision,
      campo: "motivo",
    },
    reclamo_previo: { mensaje: MENSAJES_DISPUTA.reclamoPrevio },
  }

const RESTRICCIONES: Restricciones = {
  disputas_descripcion_chk: {
    mensaje: "La descripción debe tener entre 10 y 4.000 caracteres.",
    campo: "descripcion",
  },
  disputas_resolucion_chk: {
    mensaje: "La explicación admite hasta 4.000 caracteres.",
    campo: "motivo",
  },
  disputa_mensajes_mensaje_chk: {
    mensaje: "El mensaje debe tener entre 1 y 4.000 caracteres.",
    campo: "mensaje",
  },
  disputa_mensajes_adjunto_chk: {
    mensaje: MENSAJES_DISPUTA.adjuntoAjeno,
    campo: "adjunto",
  },
  // La BD recorta lo que copia en la asignación (admite 1.000); si una base
  // sin ese recorte lo rechaza, se dice junto al texto qué acortar (al abrir,
  // la acción lo lleva a la descripción).
  asignaciones_motivo_chk: {
    mensaje:
      "El texto es demasiado largo para la asignación (admite 1.000 caracteres): acórtalo e inténtalo de nuevo.",
    campo: "motivo",
  },
}

export interface ErrorDisputa {
  mensaje: string
  /** Campo del formulario o del diálogo donde mostrarlo. */
  campo?: string
  /** Regla de negocio o restricción conocida (no se registra como fallo). */
  esperado: boolean
}

export function interpretarErrorDisputa(error: ErrorBd): ErrorDisputa {
  const porHint = error.hint ? POR_HINT[error.hint] : undefined
  if (porHint) return { ...porHint, esperado: true }
  const codigo = codigoNegocio(error)
  if (codigo === "AMO_PERMANENCIA_PENDIENTE") {
    return { mensaje: MENSAJES_DISPUTA.permanenciaPendiente, esperado: true }
  }
  const base = interpretarErrorBd(error, RESTRICCIONES)
  // Sin motivo (o sin causa), la BD responde con un mensaje que va junto al campo.
  const campo =
    base.campo ??
    (codigo === "AMO_MOTIVO_REQUERIDO"
      ? /causa/i.test(error.details ?? "")
        ? "causa"
        : "motivo"
      : undefined)
  return {
    mensaje: base.mensaje,
    ...(campo ? { campo } : {}),
    esperado: base.esperado,
  }
}
