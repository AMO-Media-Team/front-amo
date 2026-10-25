/**
 * Errores de la BD en el asistente de oferta (módulo puro): cada restricción
 * de `ofertas` y `oferta_cupos` al campo del paso que la corrige, y los
 * errores del envío a revisión (`hint` = `envio_oferta:<paso>`) al paso que
 * los resuelve.
 */
import {
  type ErrorBd,
  type ErrorBdInterpretado,
  interpretarErrorBd,
  type Restricciones,
} from "@/lib/errores-bd"

import { type PasoOferta, pasoDeHint } from "./pasos"

export const RESTRICCIONES_OFERTA: Restricciones = {
  ofertas_titulo_chk: {
    campo: "que.titulo",
    mensaje: "El título debe tener entre 3 y 120 caracteres.",
  },
  ofertas_publicaciones_chk: {
    campo: "que.publicacionesPorMedio",
    mensaje: "Cada medio hace de 1 a 10 publicaciones.",
  },
  ofertas_segmentacion_chk: {
    campo: "quien.segmentacion",
    mensaje:
      "La segmentación tiene demasiadas zonas, categorías o exclusiones.",
  },
  ofertas_seguidores_minimos_chk: {
    campo: "quien.seguidoresMinimos",
    mensaje: "El mínimo de seguidores no puede ser negativo.",
  },
  ofertas_ventana_chk: {
    campo: "cuando.ventanaFin",
    mensaje: "El fin de la ventana debe quedar después del inicio.",
  },
  ofertas_fecha_limite_chk: {
    campo: "cuando.fechaLimite",
    mensaje:
      "La fecha límite de aceptación no puede pasar del fin de la ventana.",
  },
  ofertas_permanencia_chk: {
    campo: "cuando.permanenciaDias",
    mensaje: "La permanencia va de 0 a 365 días.",
  },
  ofertas_exclusividad_chk: {
    campo: "cuando.exclusividadDias",
    mensaje: "La exclusividad va de 1 a 90 días.",
  },
  ofertas_cortes_chk: {
    campo: "cuando.cortes",
    mensaje: "Exige al menos un corte de métricas.",
  },
  ofertas_tope_chk: {
    campo: "cuanto.topePorcentaje",
    mensaje: "El tope por medio va de 1 % a 100 %.",
  },
  ofertas_presupuesto_maximo_chk:
    "El presupuesto de cada oferta debe ser mayor que cero.",
  oferta_cupos_totales_chk: "Cada franja admite de 1 a 500 cupos.",
  ofertas_instrucciones_chk: {
    campo: "envio.instrucciones",
    mensaje: "Las instrucciones admiten hasta 4.000 caracteres.",
  },
  ofertas_restricciones_chk: {
    campo: "envio.restricciones",
    mensaje: "Las restricciones admiten hasta 4.000 caracteres.",
  },
}

/** Error al guardar los borradores, con el campo que lo corrige si se conoce. */
export function interpretarErrorGuardado(error: ErrorBd): ErrorBdInterpretado {
  return interpretarErrorBd(error, RESTRICCIONES_OFERTA)
}

export interface ErrorEnvio {
  paso: PasoOferta
  mensaje: string
  esperado: boolean
}

/**
 * Error de `transicionar_srv` al enviar a revisión. Con pista
 * `envio_oferta:<paso>` la BD dice qué falta y dónde; sin ella (permiso,
 * sesión, estado que cambió), el problema se muestra en el paso de envío.
 */
export function interpretarErrorEnvio(error: ErrorBd): ErrorEnvio {
  const { mensaje, esperado } = interpretarErrorBd(error, RESTRICCIONES_OFERTA)
  return { paso: pasoDeHint(error.hint) ?? "envio", mensaje, esperado }
}

export const OFERTA_NO_EDITABLE =
  "Esta oferta ya no se puede editar: está en revisión o ya se publicó. Actualiza la página para ver su estado."

/**
 * Bloqueo optimista: otra persona guardó la oferta después de abrirla aquí
 * (alguien de la empresa o, en la gestión asistida, del equipo AMO).
 */
export const OFERTA_DESACTUALIZADA =
  "Otra persona cambió esta oferta mientras la editabas. Actualiza la página para ver lo vigente y vuelve a aplicar tus cambios."

/** La oferta dejó de ser editable mientras se editaba (la envió un compañero, se canceló o venció). */
export const OFERTA_CAMBIO_ESTADO =
  "Cambió de estado mientras la editabas (otra persona la envió a revisión o se canceló): no se guardaron tus cambios en ella. Ábrela desde la campaña para ver su estado."

/** Un formato elegido ya no está activo y su oferta (devuelta) no se puede descartar desde el asistente. */
export const FORMATO_RETIRADO =
  "Este formato ya no está disponible: cancela esta oferta desde su ficha y crea otra con un formato vigente."

export const CAMPANA_SIN_OFERTAS =
  "La campaña ya no admite ofertas nuevas: está finalizada, cancelada o archivada."

export const SIN_EMPRESA =
  "Tu cuenta no está vinculada a una empresa anunciante. Escríbenos para revisarlo."
