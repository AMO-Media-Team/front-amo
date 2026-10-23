/**
 * Errores de la validación en voz del equipo AMO (módulo puro). La BD explica
 * casi todo en el `detail` de sus `AMO_*`; aquí se da texto propio a los
 * `hint` de la fase (`asignacion_cerrada`, `alerta_sin_revision`,
 * `metricas_pendientes`), se decide en qué campo mostrar cada error y se
 * traducen las restricciones de `metricas` que puede tocar una corrección.
 */
import {
  codigoNegocio,
  type ErrorBd,
  type ErrorBdInterpretado,
  interpretarErrorBd,
  type Restricciones,
} from "@/lib/errores-bd"

import { frasePermanenciaPendiente } from "./decision"

export const HINT_ASIGNACION_CERRADA = "asignacion_cerrada"
export const HINT_ALERTA_SIN_REVISION = "alerta_sin_revision"
export const HINT_METRICAS_PENDIENTES = "metricas_pendientes"

export const MENSAJES_VALIDACION = {
  asignacionCerrada:
    "La asignación ya no está en curso (se canceló, venció o terminó): no hay nada que validar. La página ya muestra su estado actual.",
  alertaSinRevision:
    "Esta métrica tiene alertas: anota qué revisaste antes de aprobarla.",
  metricasPendientes:
    "Hay métricas pendientes de revisión en esta asignación: apruébalas o recházalas antes de verificar.",
  permanenciaPendiente:
    "Aún no se cumple la permanencia mínima de la publicación.",
  etiquetaRequerida:
    "Marca la casilla cuando compruebes que la etiqueta de publicidad se ve en la publicación.",
  observacionesRequeridas: "Escribe qué debe corregir el medio.",
  sinCambios: "No cambiaste ninguna cifra ni la fecha del corte.",
  noAprobada:
    "Solo se corrige una métrica aprobada; una pendiente se aprueba o se rechaza.",
  noEncontrada:
    "No encontramos ese registro o ya no tienes acceso a él. Actualiza la página.",
  yaNoEsperaVerificacion:
    "La asignación ya no espera verificación: la página ya muestra su estado actual.",
  constanciaSoloAdministrador:
    "La constancia manual de permanencia solo la deja quien puede corregir métricas validadas.",
} as const

/** Restricciones de `metricas` que una corrección puede violar, con su campo. */
const RESTRICCIONES: Restricciones = {
  metricas_alcance_impresiones_chk: {
    mensaje: "Las impresiones no pueden ser menos que el alcance.",
    campo: "impresiones",
  },
  metricas_interacciones_chk: {
    mensaje: "Las interacciones no pueden superar las impresiones.",
    campo: "interacciones",
  },
  metricas_porcentaje_chk: {
    mensaje: "La reproducción completa va de 0 a 100 %.",
    campo: "porcentajeCompleto",
  },
  metricas_tiempo_chk: {
    mensaje: "El tiempo promedio no puede ser negativo.",
    campo: "tiempoPromedioS",
  },
  metricas_observaciones_chk: {
    mensaje: "Las observaciones admiten hasta 1.000 caracteres.",
    campo: "observaciones",
  },
}

export interface ContextoErrorValidacion {
  /** Campo donde se escribe el motivo u observación de esta decisión. */
  campoMotivo?: "observaciones" | "motivo"
  /** Fin de la permanencia pendiente, para decir hasta cuándo esperar. */
  permanenciaHasta?: string | null
}

/**
 * Mensaje para la persona, campo del formulario (si aplica) y si es un error
 * esperado (regla de negocio que se puede corregir) o un fallo que conviene
 * registrar.
 */
export function interpretarErrorValidacion(
  error: ErrorBd,
  {
    campoMotivo = "observaciones",
    permanenciaHasta,
  }: ContextoErrorValidacion = {}
): ErrorBdInterpretado {
  const codigo = codigoNegocio(error)
  switch (error.hint) {
    case HINT_ASIGNACION_CERRADA:
      return {
        codigo,
        esperado: true,
        mensaje: MENSAJES_VALIDACION.asignacionCerrada,
      }
    case HINT_ALERTA_SIN_REVISION:
      return {
        codigo,
        esperado: true,
        mensaje: MENSAJES_VALIDACION.alertaSinRevision,
        campo: campoMotivo,
      }
    case HINT_METRICAS_PENDIENTES:
      return {
        codigo,
        esperado: true,
        mensaje: MENSAJES_VALIDACION.metricasPendientes,
      }
  }
  if (codigo === "AMO_PERMANENCIA_PENDIENTE") {
    return {
      codigo,
      esperado: true,
      mensaje: permanenciaHasta
        ? frasePermanenciaPendiente(permanenciaHasta)
        : MENSAJES_VALIDACION.permanenciaPendiente,
    }
  }
  const interpretado = interpretarErrorBd(error, RESTRICCIONES)
  if (codigo === "AMO_ETIQUETA_REQUERIDA") {
    return {
      ...interpretado,
      mensaje: MENSAJES_VALIDACION.etiquetaRequerida,
      campo: "etiquetaVerificada",
    }
  }
  if (codigo === "AMO_MOTIVO_REQUERIDO") {
    return { ...interpretado, campo: campoMotivo }
  }
  return interpretado
}
