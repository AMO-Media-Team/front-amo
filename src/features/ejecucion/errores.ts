/**
 * Errores de la evidencia y las métricas en voz del medio (módulo puro). La
 * BD explica casi todo en el `detail` de sus `AMO_*`; aquí se decide en qué
 * campo del formulario mostrarlo y se traducen las restricciones propias
 * (URL única, coherencia por fila, intervalo repetido).
 */
import {
  type ErrorBd,
  type ErrorBdInterpretado,
  interpretarErrorBd,
  type Restricciones,
} from "@/lib/errores-bd"

export const MENSAJES_EJECUCION = {
  sinMedio:
    "Tu usuario no está vinculado a un medio. Escríbele al equipo AMO para revisarlo.",
  noEncontrada:
    "No encontramos esa campaña entre las tuyas. Actualiza la página e inténtalo de nuevo.",
  capturaAjena:
    "La captura no corresponde a esta campaña. Elígela de nuevo para subirla.",
  capturaRequerida:
    "Carga la captura del panel de estadísticas, con la fecha visible.",
  urlRepetida:
    "Ese enlace ya se registró como evidencia de otra publicación. Revisa que sea el de tu publicación.",
  evidenciaCerrada:
    "Esta publicación ya no admite cambios. Actualiza la página para ver su estado.",
  metricaCerrada:
    "Este corte ya no admite cambios: el equipo AMO lo revisó o la campaña cambió de estado. Actualiza la página.",
  sinEvidencia:
    "Esa publicación aún no tiene evidencia. Cárgala antes de las métricas.",
  corteNoPedido: "Esta oferta no pide ese corte de métricas.",
  intervaloRepetido:
    "Ya cargaste métricas para ese mismo periodo. Elige otras fechas o corrige el que ya enviaste.",
  corteRepetido:
    "Ese corte ya está cargado. Actualiza la página para corregirlo.",
  correccionSinCambios:
    "Cambia alguna cifra, la fecha o la captura para enviar la corrección.",
} as const

const RESTRICCIONES: Restricciones = {
  publicaciones_url_post_key: {
    mensaje: MENSAJES_EJECUCION.urlRepetida,
    campo: "url",
  },
  publicaciones_url_chk: {
    mensaje:
      "Ese enlace no corresponde a una publicación de la red de la oferta. Copia el enlace desde «Compartir» en la publicación.",
    campo: "url",
  },
  publicaciones_ruta_chk: {
    mensaje: MENSAJES_EJECUCION.capturaAjena,
    campo: "captura",
  },
  metricas_ruta_chk: {
    mensaje: MENSAJES_EJECUCION.capturaAjena,
    campo: "captura",
  },
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
  metricas_personalizado_key: {
    mensaje: MENSAJES_EJECUCION.intervaloRepetido,
    campo: "periodoDesde",
  },
  metricas_personalizado_chk: {
    mensaje: "El periodo debe terminar después de empezar.",
    campo: "periodoDesde",
  },
  metricas_corte_key: MENSAJES_EJECUCION.corteRepetido,
}

/** Mensajes de la BD que se reescriben en voz del medio. */
const DETALLES: Readonly<Record<string, { mensaje?: string; campo?: string }>> =
  {
    "La fecha de publicación está fuera de la ventana de la oferta.": {
      mensaje:
        "La fecha de publicación debe estar dentro de la ventana de la oferta y no en el futuro.",
      campo: "dia",
    },
    "Venció el plazo para cargar la evidencia.": {
      mensaje:
        "Venció el plazo para cargar la evidencia. Si crees que es un error, el equipo AMO puede ayudarte.",
    },
    "Confirma que la publicación lleva la etiqueta de publicidad.": {
      campo: "etiquetaConfirmada",
    },
    "Descarga la versión vigente del creativo antes de publicar.": {
      mensaje:
        "El anunciante actualizó el contenido antes de tu publicación. Descarga la versión vigente y publica con ella antes de registrar la evidencia.",
    },
    "La fecha del corte está en el futuro.": {
      mensaje: "La fecha de la captura no puede estar en el futuro.",
      campo: "hora",
    },
    "Aún no se cumple el tiempo del corte desde la publicación.": {
      mensaje:
        "La captura es de antes de que se cumpliera el corte. Toma una nueva desde el panel y corrige la fecha.",
      campo: "hora",
    },
    "El intervalo debe empezar el día de la publicación y terminar antes de la fecha del corte.":
      {
        mensaje:
          "El periodo debe empezar el día de la publicación o después y terminar, como mucho, el día de la captura.",
        campo: "periodoDesde",
      },
  }

const CAMPOS_POR_CODIGO: Readonly<Record<string, string>> = {
  AMO_CAPTURA_REQUERIDA: "captura",
  AMO_ETIQUETA_REQUERIDA: "etiquetaConfirmada",
  // El `detail` ya nombra las dos cuentas: «El enlace es de @x y esta campaña es con @y…».
  AMO_URL_OTRA_CUENTA: "url",
}

/** Mensaje en voz del medio y, si aplica, el campo del formulario. */
export function interpretarErrorEjecucion(error: ErrorBd): ErrorBdInterpretado {
  const base = interpretarErrorBd(error, RESTRICCIONES)
  if (!base.codigo) return base
  const detalle = DETALLES[error.details?.trim() ?? ""]
  const campo = detalle?.campo ?? CAMPOS_POR_CODIGO[base.codigo] ?? base.campo
  return {
    ...base,
    mensaje: detalle?.mensaje ?? base.mensaje,
    ...(campo ? { campo } : {}),
  }
}
