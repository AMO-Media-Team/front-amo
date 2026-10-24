/**
 * Los estados de una asignación en voz del medio (MED-011) y los segmentos
 * del tablero de «Mis campañas» (módulo puro). Es la fuente de estos textos
 * para todo lo que ve el medio: su tablero, su ficha y su inicio (DM).
 */
import type { PresentacionEstado, Tono } from "@/features/operacion/estados"

import type { CausaCancelacion, EstadoAsignacion } from "./tipos"

export type { PresentacionEstado, Tono }

function estado(
  etiqueta: string,
  tono: Tono,
  descripcion: string
): PresentacionEstado {
  return { etiqueta, tono, descripcion }
}

/** Los 12 estados de una asignación contados al medio. */
export const ESTADOS_PARA_MEDIO: Readonly<
  Record<EstadoAsignacion, PresentacionEstado>
> = {
  ACEPTADA: estado(
    "Por descargar",
    "info",
    "Aceptaste la oferta. Descarga el contenido para empezar."
  ),
  CONTENIDO_ENTREGADO: estado(
    "Por publicar",
    "info",
    "Ya tienes el contenido. Publícalo y carga la evidencia antes de la fecha límite."
  ),
  PUBLICADA: estado(
    "Evidencia en revisión",
    "aviso",
    "Cargaste la evidencia y el equipo AMO la está revisando. Mientras tanto, carga las métricas de cada corte."
  ),
  EVIDENCIA_VALIDADA: estado(
    "Por cargar métricas",
    "info",
    "El equipo AMO validó tu publicación. Carga las métricas de cada corte."
  ),
  METRICAS_CARGADAS: estado(
    "Métricas en revisión",
    "aviso",
    "Cargaste todas las métricas y el equipo AMO las está verificando."
  ),
  VERIFICADA: estado(
    "Verificada",
    "exito",
    "Cumpliste con todo. Entra en la próxima liquidación."
  ),
  LIQUIDADA: estado(
    "En liquidación",
    "exito",
    "Está incluida en una liquidación: tu pago va en camino."
  ),
  PAGADA: estado("Pagada", "exito", "Ya recibiste el pago de esta campaña."),
  RECHAZADA: estado(
    "Desististe",
    "neutro",
    "Desististe de esta campaña y el cupo quedó libre para otro medio."
  ),
  VENCIDA_SIN_PUBLICAR: estado(
    "Vencida",
    "peligro",
    "Pasó la fecha límite sin la evidencia de la publicación."
  ),
  EN_DISPUTA: estado(
    "En disputa",
    "aviso",
    "Hay una disputa abierta. El equipo AMO la está revisando."
  ),
  CANCELADA: estado(
    "Cancelada",
    "peligro",
    "El equipo AMO canceló tu participación en esta campaña."
  ),
}

/**
 * Qué significa para el medio que el equipo AMO cancelara su participación,
 * según la causa (ADM-010): una cancelación por fraude o por incumplimiento
 * suyo no se paga; las demás solo lo liberan de la campaña.
 */
export function consecuenciaCancelacion(
  causa: CausaCancelacion | null | undefined
): string {
  switch (causa) {
    case "FRAUDE":
      return "Según los términos que aceptaste, esta publicación no se paga."
    case "INCUMPLIMIENTO_MEDIO":
      return "Se canceló por incumplimiento: esta publicación no se paga y cuenta en tu cumplimiento."
    default:
      return "El equipo AMO canceló tu participación en esta campaña. Ya no tienes que publicar ni cargar nada más."
  }
}

/** Lo que el medio aún está cumpliendo (también en disputa): lo que una suspensión deja en pie. */
const EN_CURSO: readonly EstadoAsignacion[] = [
  "ACEPTADA",
  "CONTENIDO_ENTREGADO",
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
  "EN_DISPUTA",
]

export function estaEnCurso(estado: EstadoAsignacion): boolean {
  return EN_CURSO.includes(estado)
}

/**
 * Estado con que el medio sigue trabajando: durante una disputa, el que tenía
 * al abrirla (D72: los cortes de métricas siguen corriendo y se cargan).
 */
export function estadoDeTrabajo(asignacion: {
  estado: EstadoAsignacion
  estadoPrevioDisputa?: EstadoAsignacion | null
}): EstadoAsignacion {
  return asignacion.estado === "EN_DISPUTA" && asignacion.estadoPrevioDisputa
    ? asignacion.estadoPrevioDisputa
    : asignacion.estado
}

// ── Segmentos del tablero ────────────────────────────────────────────────────

/**
 * Los grupos de MED-011 (Por publicar, Pendiente de métricas, En verificación,
 * Liquidadas) más las verificadas que esperan liquidación y las que se
 * cayeron; «Terminadas» junta las liquidadas y las pagadas.
 */
export const SEGMENTOS_MIS_CAMPANAS = [
  "por_publicar",
  "pendiente_metricas",
  "en_verificacion",
  "validadas",
  "terminadas",
  "caidas",
] as const

export type SegmentoMisCampanas = (typeof SEGMENTOS_MIS_CAMPANAS)[number]

export interface PresentacionSegmento {
  etiqueta: string
  descripcion: string
  /** Estado vacío del segmento. */
  vacio: { titulo: string; descripcion: string }
}

export const SEGMENTOS: Readonly<
  Record<SegmentoMisCampanas, PresentacionSegmento>
> = {
  por_publicar: {
    etiqueta: "Por publicar",
    descripcion: "Descarga el contenido, publícalo y carga la evidencia.",
    vacio: {
      titulo: "Nada por publicar",
      descripcion:
        "Cuando aceptes una oferta, aquí verás qué publicar y para cuándo.",
    },
  },
  pendiente_metricas: {
    etiqueta: "Pendiente de métricas",
    descripcion:
      "Con la evidencia cargada: aquí cargas las métricas de cada corte.",
    vacio: {
      titulo: "Ninguna con métricas pendientes",
      descripcion:
        "Cuando cargues la evidencia de una publicación, aquí seguirás sus cortes de métricas.",
    },
  },
  en_verificacion: {
    etiqueta: "En verificación",
    descripcion:
      "Cargaste las métricas de todos los cortes y el equipo AMO las está verificando.",
    vacio: {
      titulo: "Nada en verificación",
      descripcion:
        "Cuando cargues las métricas de todos los cortes, aquí verás la campaña mientras el equipo AMO la verifica.",
    },
  },
  validadas: {
    etiqueta: "Validadas",
    descripcion: "El equipo AMO verificó tu trabajo: entran a liquidación.",
    vacio: {
      titulo: "Ninguna validada por ahora",
      descripcion:
        "Cuando el equipo AMO verifique tu publicación y tus métricas, aparecerá aquí.",
    },
  },
  terminadas: {
    etiqueta: "Terminadas",
    descripcion: "En liquidación o ya pagadas.",
    vacio: {
      titulo: "Aún no hay campañas terminadas",
      descripcion: "Aquí quedan las campañas liquidadas y pagadas.",
    },
  },
  caidas: {
    etiqueta: "Vencidas o canceladas",
    descripcion:
      "Las que vencieron sin publicar, de las que desististe o que se cancelaron.",
    vacio: {
      titulo: "Nada vencido ni cancelado",
      descripcion:
        "Aquí aparecerán las campañas que venzan sin publicar, de las que desistas o que se cancelen.",
    },
  },
}

export const ESTADOS_POR_SEGMENTO: Readonly<
  Record<SegmentoMisCampanas, readonly EstadoAsignacion[]>
> = {
  por_publicar: ["ACEPTADA", "CONTENIDO_ENTREGADO"],
  pendiente_metricas: ["PUBLICADA", "EVIDENCIA_VALIDADA"],
  en_verificacion: ["METRICAS_CARGADAS"],
  validadas: ["VERIFICADA"],
  terminadas: ["LIQUIDADA", "PAGADA"],
  caidas: ["VENCIDA_SIN_PUBLICAR", "RECHAZADA", "CANCELADA"],
}

/**
 * Segmento de una asignación. Una disputa se muestra donde estaba antes de
 * abrirla (el reclamo de una vencida, entre las vencidas); sin ese dato, con
 * las de métricas pendientes, que es donde se discuten evidencias y métricas.
 */
export function segmentoDe(
  estadoActual: EstadoAsignacion,
  estadoPrevioDisputa: EstadoAsignacion | null = null
): SegmentoMisCampanas {
  const base =
    estadoActual === "EN_DISPUTA"
      ? (estadoPrevioDisputa ?? "PUBLICADA")
      : estadoActual
  return (
    SEGMENTOS_MIS_CAMPANAS.find((segmento) =>
      ESTADOS_POR_SEGMENTO[segmento].includes(base)
    ) ?? "pendiente_metricas"
  )
}

/** Segmentos donde el medio todavía tiene algo que hacer. */
export const SEGMENTOS_ACTIVOS: readonly SegmentoMisCampanas[] = [
  "por_publicar",
  "pendiente_metricas",
]

/**
 * Segmento que se abre sin uno en la URL: el primero con asignaciones en el
 * orden del tablero (lo pendiente primero); sin ninguna, «Por publicar».
 */
export function segmentoInicial(
  conteo: Readonly<Record<SegmentoMisCampanas, number>>
): SegmentoMisCampanas {
  return (
    SEGMENTOS_MIS_CAMPANAS.find((segmento) => conteo[segmento] > 0) ??
    "por_publicar"
  )
}

export function contarPorSegmento(
  asignaciones: readonly {
    estado: EstadoAsignacion
    estadoPrevioDisputa: EstadoAsignacion | null
  }[]
): Record<SegmentoMisCampanas, number> {
  const conteo = Object.fromEntries(
    SEGMENTOS_MIS_CAMPANAS.map((segmento) => [segmento, 0])
  ) as Record<SegmentoMisCampanas, number>
  for (const asignacion of asignaciones) {
    conteo[segmentoDe(asignacion.estado, asignacion.estadoPrevioDisputa)] += 1
  }
  return conteo
}
