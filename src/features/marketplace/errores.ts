/**
 * Errores de la BD al aceptar o rechazar una oferta → mensajes en voz del
 * medio (módulo puro, catálogo propio del paquete). Cada error de la reserva
 * (`reservar_cupo_srv`) dice qué pasó, si todavía se puede aceptar y a qué
 * pantalla ir para resolverlo; el título de `AMO_SIN_CUPO` es el del
 * criterio de MED-010: «No quedan cupos en tu franja».
 */
import { RUTAS_MI_MEDIO } from "@/features/mi-medio/alta"
import { RUTA_MIS_CAMPANAS } from "@/features/mis-campanas/rutas"
import {
  codigoNegocio,
  type ErrorBd,
  interpretarErrorBd,
  MENSAJE_SIN_PERMISO,
} from "@/lib/errores-bd"

import { RUTA_OFERTAS_MEDIO } from "./rutas"
import type { EnlaceError, FalloAceptar } from "./tipos"

const VER_OFERTAS: EnlaceError = {
  texto: "Ver otras ofertas",
  href: RUTA_OFERTAS_MEDIO,
}
const VER_MIS_CAMPANAS: EnlaceError = {
  texto: "Ir a Mis campañas",
  href: RUTA_MIS_CAMPANAS,
}

// La reserva falla si esta oferta O la que ya aceptaste (de otra marca del
// mismo sector, con fechas que se cruzan) pide exclusividad: el texto cubre
// las dos direcciones. La ficha lo anticipa (`impedimentos_aceptar`) con el
// mismo título, texto y enlace.
export const CHOQUE_EXCLUSIVIDAD: Readonly<{
  titulo: string
  mensaje: string
  enlace: EnlaceError
}> = {
  titulo: "Choca con otra campaña del mismo sector",
  mensaje:
    "Esta oferta o una que ya aceptaste pide exclusividad, y en esas fechas tienes pauta de otra marca del mismo sector.",
  enlace: VER_MIS_CAMPANAS,
}

interface EntradaCatalogo {
  titulo: string
  /** Sin mensaje propio se usa el `detail` de la BD. */
  mensaje?: string
  /** Ya no se puede aceptar ahora (cupo, estado, presupuesto o topes). */
  bloquea: boolean
  enlace?: EnlaceError
}

const CATALOGO_ACEPTAR: Readonly<Record<string, EntradaCatalogo>> = {
  AMO_SIN_CUPO: {
    titulo: "No quedan cupos en tu franja",
    mensaje:
      "Otro medio tomó el último cupo mientras decidías. Mira las otras ofertas que tienes disponibles.",
    bloquea: true,
    enlace: VER_OFERTAS,
  },
  AMO_YA_ACEPTADA: {
    titulo: "Ya aceptaste esta oferta",
    mensaje: "La encuentras en Mis campañas, con lo que sigue por hacer.",
    bloquea: true,
    enlace: VER_MIS_CAMPANAS,
  },
  AMO_OFERTA_NO_DISPONIBLE: {
    titulo: "Esta oferta ya no recibe aceptaciones",
    mensaje:
      "Se llenó, se cerró o venció su fecha límite mientras la revisabas.",
    bloquea: true,
    enlace: VER_OFERTAS,
  },
  AMO_NO_ELEGIBLE: {
    titulo: "No cumples los requisitos de esta oferta",
    bloquea: true,
    enlace: { texto: "Revisar mis cuentas", href: RUTAS_MI_MEDIO.cuentas },
  },
  AMO_PRESUPUESTO_OFERTA: {
    titulo: "La oferta se quedó sin presupuesto",
    mensaje:
      "El anunciante ya comprometió el presupuesto disponible para un cupo como el tuyo.",
    bloquea: true,
    enlace: VER_OFERTAS,
  },
  AMO_PRESUPUESTO_CAMPANA: {
    titulo: "La campaña se quedó sin presupuesto",
    mensaje:
      "El anunciante ya comprometió el presupuesto de la campaña en otros cupos.",
    bloquea: true,
    enlace: VER_OFERTAS,
  },
  AMO_TOPE_MEDIO: {
    titulo: "Llegaste al máximo en esta campaña",
    mensaje:
      "Cada medio puede llevarse solo una parte del presupuesto de una campaña, y con este cupo la superarías.",
    bloquea: true,
    enlace: VER_MIS_CAMPANAS,
  },
  AMO_TOPE_NIVEL: {
    titulo: "Llegaste al tope anual de tu nivel",
    mensaje:
      "Con esta oferta superarías lo que tu nivel de verificación permite recibir este año. Sube de nivel para seguir aceptando.",
    bloquea: true,
    enlace: { texto: "Cómo subir de nivel", href: RUTAS_MI_MEDIO.nivel },
  },
  AMO_EXCLUSIVIDAD: { ...CHOQUE_EXCLUSIVIDAD, bloquea: true },
  AMO_SIN_TARIFA: {
    titulo: "Aún no podemos calcular tu pago",
    mensaje:
      "Falta la tarifa de este formato para tu franja. El equipo AMO debe configurarla: intenta más tarde.",
    bloquea: true,
  },
  AMO_IDEMPOTENCIA_INVALIDA: {
    titulo: "Vuelve a intentarlo",
    mensaje:
      "Esa solicitud ya se había usado. Toca «Sí, acepto» otra vez para enviar una nueva.",
    bloquea: false,
  },
  AMO_NO_AUTORIZADO: {
    titulo: "No pudimos confirmar tu sesión",
    mensaje: MENSAJE_SIN_PERMISO,
    bloquea: false,
  },
}

/** Fallo que no es una regla de negocio: se reintenta con la misma clave. */
export const FALLO_ACEPTAR_INESPERADO = {
  titulo: "No pudimos confirmar tu aceptación",
  mensaje:
    "Revisa tu conexión y vuelve a intentarlo: si ya había quedado aceptada, no se tomará un segundo cupo.",
} as const

function falloAceptar(
  datos: Omit<FalloAceptar, "ok" | "error"> & { mensaje: string }
): FalloAceptar {
  const { mensaje, ...resto } = datos
  return { ok: false, error: mensaje, ...resto }
}

/** Fallo de la reserva traducido para el medio. */
export function interpretarErrorAceptar(error: ErrorBd): FalloAceptar {
  const codigo = codigoNegocio(error)
  const entrada = codigo ? CATALOGO_ACEPTAR[codigo] : undefined
  const base = interpretarErrorBd(error)
  if (entrada) {
    return falloAceptar({
      codigo,
      titulo: entrada.titulo,
      mensaje: entrada.mensaje ?? base.mensaje,
      definitivo: true,
      bloquea: entrada.bloquea,
      enlace: entrada.enlace ?? null,
    })
  }
  if (base.esperado) {
    return falloAceptar({
      codigo,
      titulo: "No pudimos aceptar la oferta",
      mensaje: base.mensaje,
      definitivo: true,
      bloquea: false,
      enlace: null,
    })
  }
  return falloInesperadoAceptar()
}

/** La respuesta no llegó o el servidor falló: misma clave en el reintento. */
export function falloInesperadoAceptar(): FalloAceptar {
  return falloAceptar({
    codigo: null,
    titulo: FALLO_ACEPTAR_INESPERADO.titulo,
    mensaje: FALLO_ACEPTAR_INESPERADO.mensaje,
    definitivo: false,
    bloquea: false,
    enlace: null,
  })
}

/** Datos de la solicitud inválidos (no llegaron a la BD). */
export function falloValidacionAceptar(mensaje: string): FalloAceptar {
  return falloAceptar({
    codigo: null,
    titulo: "Revisa la cuenta elegida",
    mensaje,
    definitivo: true,
    bloquea: false,
    enlace: null,
  })
}

// ── «No me interesa» ─────────────────────────────────────────────────────────

export interface ErrorRechazo {
  mensaje: string
  /** Campo del diálogo donde mostrarlo (el motivo). */
  campo?: "motivo"
  esperado: boolean
}

const MENSAJES_RECHAZO: Readonly<Record<string, string>> = {
  AMO_OFERTA_NO_DISPONIBLE:
    "Esta oferta ya no está disponible: ya no aparece en tu lista.",
  AMO_MOTIVO_REQUERIDO:
    "Ya habías aceptado esta oferta: cuéntanos por qué desistes.",
}

export function interpretarErrorRechazo(error: ErrorBd): ErrorRechazo {
  const codigo = codigoNegocio(error)
  const base = interpretarErrorBd(error)
  const propio = codigo ? MENSAJES_RECHAZO[codigo] : undefined
  return {
    mensaje: propio ?? base.mensaje,
    ...(codigo === "AMO_MOTIVO_REQUERIDO" ? { campo: "motivo" as const } : {}),
    esperado: base.esperado,
  }
}
