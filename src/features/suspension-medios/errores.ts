/**
 * Errores de la suspensión de medios → mensajes para la persona (módulo puro).
 * `transicionar_srv` revalida permiso, estado y motivo; si el medio cambió de
 * estado mientras el diálogo estaba abierto (otra persona lo suspendió o lo
 * reactivó), se explica en esos términos en lugar del genérico de la BD.
 */
import {
  type ErrorBd,
  type ErrorBdInterpretado,
  interpretarErrorBd,
  type Restricciones,
} from "@/lib/errores-bd"

import type { AccionSuspension } from "./tipos"

export const RESTRICCIONES_SUSPENSION: Restricciones = {
  medios_motivo_estado_chk: {
    mensaje: "El motivo admite hasta 500 caracteres.",
    campo: "motivo",
  },
}

export const MENSAJES_SUSPENSION = {
  yaNoVerificado:
    "El medio ya no está verificado: quizá otra persona lo suspendió o cambió su estado hace un momento. Revisa cómo quedó en la ficha.",
  yaNoSuspendido:
    "El medio ya no está suspendido: quizá otra persona lo reactivó hace un momento. Revisa cómo quedó en la ficha.",
  enCursoNoDisponible:
    "No pudimos cargar sus asignaciones en curso. Intenta de nuevo.",
  sinPermisoAsignaciones:
    "Ver sus asignaciones en curso exige además el permiso de ver asignaciones.",
} as const

export function interpretarErrorSuspension(
  error: ErrorBd,
  accion: AccionSuspension
): ErrorBdInterpretado {
  const interpretado = interpretarErrorBd(error, RESTRICCIONES_SUSPENSION)
  if (interpretado.codigo !== "AMO_TRANSICION_INVALIDA") return interpretado
  return {
    ...interpretado,
    mensaje:
      accion === "suspender"
        ? MENSAJES_SUSPENSION.yaNoVerificado
        : MENSAJES_SUSPENSION.yaNoSuspendido,
  }
}
