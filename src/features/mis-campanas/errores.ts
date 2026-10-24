/**
 * Errores de «Mis campañas» en voz del medio (módulo puro). La BD ya escribe
 * el `detail` de sus reglas para la persona («Venció el plazo para publicar:
 * ya no puedes descargar el contenido.»); este catálogo cubre lo que llega
 * sin él y los casos propios de la interfaz.
 */
import {
  type ErrorBd,
  type ErrorBdInterpretado,
  interpretarErrorBd,
} from "@/lib/errores-bd"

export const MENSAJES_MIS_CAMPANAS = {
  noEncontrada:
    "No encontramos esta campaña o ya no tienes acceso a ella. Actualiza la página.",
  sinMedio:
    "Tu cuenta no está vinculada a un medio: el equipo AMO debe asociarla antes de que trabajes en tus campañas.",
  archivoNoEncontrado:
    "No encontramos ese archivo en tu contenido. Actualiza la página e inténtalo de nuevo.",
  noDisponible: "Esta campaña ya no tiene contenido disponible para descargar.",
} as const

/** Respaldo en voz del medio de los códigos que puede lanzar su ejecución. */
const RESPALDO: Readonly<Record<string, string>> = {
  AMO_TRANSICION_INVALIDA:
    "Esta campaña cambió de estado mientras la tenías abierta. Actualiza la página para ver lo que sigue.",
  AMO_FUERA_DE_VENTANA:
    "Venció el plazo para publicar: ya no puedes descargar el contenido.",
  AMO_MOTIVO_REQUERIDO: "Cuéntanos por qué desistes.",
}

/**
 * Como `interpretarErrorBd`, pero con el respaldo del medio cuando la BD no
 * trae un `detail` (el `detail` de la BD siempre manda).
 */
export function interpretarErrorMisCampanas(
  error: ErrorBd
): ErrorBdInterpretado {
  const interpretado = interpretarErrorBd(error)
  const respaldo = interpretado.codigo ? RESPALDO[interpretado.codigo] : null
  if (respaldo && !error.details?.trim()) {
    return { ...interpretado, mensaje: respaldo }
  }
  return interpretado
}
