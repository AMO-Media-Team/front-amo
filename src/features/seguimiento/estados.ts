/**
 * Los estados de una asignación contados al anunciante (ANU-011) y los grupos
 * con que filtra su seguimiento (módulo puro). Liquidar y pagar son asuntos
 * entre AMO y el medio: para el anunciante, una asignación verificada, liquidada
 * o pagada está simplemente «Cumplida».
 */
import type { PresentacionEstado, Tono } from "@/features/operacion/estados"

import type { EstadoAsignacion, EstadoValidacion } from "./tipos"

export type { PresentacionEstado, Tono }

function estado(
  etiqueta: string,
  tono: Tono,
  descripcion: string
): PresentacionEstado {
  return { etiqueta, tono, descripcion }
}

const CUMPLIDA = estado(
  "Cumplida",
  "exito",
  "El equipo AMO verificó la publicación y sus métricas."
)

/** Los 12 estados de una asignación en voz del anunciante. */
export const ESTADOS_PARA_ANUNCIANTE: Readonly<
  Record<EstadoAsignacion, PresentacionEstado>
> = {
  ACEPTADA: estado(
    "Aceptada",
    "info",
    "El medio aceptó el cupo y va a descargar tu contenido."
  ),
  CONTENIDO_ENTREGADO: estado(
    "Por publicar",
    "info",
    "El medio ya descargó tu contenido y debe publicarlo antes de la fecha límite."
  ),
  PUBLICADA: estado(
    "Publicada",
    "aviso",
    "El medio publicó y cargó la evidencia; el equipo AMO la está revisando."
  ),
  EVIDENCIA_VALIDADA: estado(
    "Publicación validada",
    "info",
    "El equipo AMO comprobó la publicación; faltan cortes de métricas."
  ),
  METRICAS_CARGADAS: estado(
    "Métricas en revisión",
    "aviso",
    "El medio cargó todos los cortes y el equipo AMO los está verificando."
  ),
  VERIFICADA: CUMPLIDA,
  LIQUIDADA: CUMPLIDA,
  PAGADA: CUMPLIDA,
  RECHAZADA: estado(
    "Desistió",
    "neutro",
    "El medio desistió del cupo y quedó libre para otro medio."
  ),
  VENCIDA_SIN_PUBLICAR: estado(
    "Vencida sin publicar",
    "peligro",
    "El medio no publicó antes de la fecha límite y el cupo se liberó."
  ),
  EN_DISPUTA: estado(
    "En disputa",
    "aviso",
    "Hay una disputa abierta y el equipo AMO la está resolviendo."
  ),
  CANCELADA: estado(
    "Cancelada",
    "peligro",
    "El equipo AMO canceló esta asignación."
  ),
}

/** Validación de una publicación, contada al anunciante. */
export const VALIDACION_PARA_ANUNCIANTE: Readonly<
  Record<EstadoValidacion, PresentacionEstado>
> = {
  PENDIENTE: estado(
    "En revisión",
    "aviso",
    "El equipo AMO está revisando la evidencia."
  ),
  APROBADA: estado(
    "Validada",
    "exito",
    "El equipo AMO comprobó que la publicación cumple."
  ),
  RECHAZADA: estado(
    "En corrección",
    "peligro",
    "El equipo AMO pidió corregir la evidencia y el medio la está corrigiendo."
  ),
}

// ── Grupos del filtro ────────────────────────────────────────────────────────

export const GRUPOS_SEGUIMIENTO = [
  "por_publicar",
  "publicadas",
  "cumplidas",
  "en_disputa",
  "sin_completar",
] as const

export type GrupoSeguimiento = (typeof GRUPOS_SEGUIMIENTO)[number]

export const ESTADOS_DE_GRUPO: Readonly<
  Record<GrupoSeguimiento, readonly EstadoAsignacion[]>
> = {
  por_publicar: ["ACEPTADA", "CONTENIDO_ENTREGADO"],
  publicadas: ["PUBLICADA", "EVIDENCIA_VALIDADA", "METRICAS_CARGADAS"],
  cumplidas: ["VERIFICADA", "LIQUIDADA", "PAGADA"],
  en_disputa: ["EN_DISPUTA"],
  sin_completar: ["RECHAZADA", "VENCIDA_SIN_PUBLICAR", "CANCELADA"],
}

export const GRUPOS: Readonly<
  Record<
    GrupoSeguimiento,
    { etiqueta: string; descripcion: string; tono: Tono }
  >
> = {
  por_publicar: {
    etiqueta: "Por publicar",
    descripcion: "Medios que aceptaron y aún no publican.",
    tono: "info",
  },
  publicadas: {
    etiqueta: "Publicadas",
    descripcion: "Con la publicación hecha; sus métricas se están completando.",
    tono: "aviso",
  },
  cumplidas: {
    etiqueta: "Cumplidas",
    descripcion: "Publicación y métricas verificadas por el equipo AMO.",
    tono: "exito",
  },
  en_disputa: {
    etiqueta: "En disputa",
    descripcion: "Con una disputa que el equipo AMO está resolviendo.",
    tono: "aviso",
  },
  sin_completar: {
    etiqueta: "Sin completar",
    descripcion: "El medio desistió, venció sin publicar o se canceló.",
    tono: "peligro",
  },
}

export function grupoDe(estadoActual: EstadoAsignacion): GrupoSeguimiento {
  return (
    GRUPOS_SEGUIMIENTO.find((grupo) =>
      ESTADOS_DE_GRUPO[grupo].includes(estadoActual)
    ) ?? "por_publicar"
  )
}

/** Cuántas asignaciones hay en cada grupo (todos los grupos, también en cero). */
export function contarPorGrupo(
  asignaciones: readonly { estado: EstadoAsignacion }[]
): Record<GrupoSeguimiento, number> {
  const conteo = Object.fromEntries(
    GRUPOS_SEGUIMIENTO.map((grupo) => [grupo, 0])
  ) as Record<GrupoSeguimiento, number>
  for (const asignacion of asignaciones) conteo[grupoDe(asignacion.estado)]++
  return conteo
}

/** La asignación sigue su curso y todavía no tiene publicación: aplica el plazo. */
export function esperaPublicacion(estadoActual: EstadoAsignacion): boolean {
  return ESTADOS_DE_GRUPO.por_publicar.includes(estadoActual)
}

/** Verificada, liquidada o pagada: la base del consolidado oficial. */
export function estaCumplida(estadoActual: EstadoAsignacion): boolean {
  return ESTADOS_DE_GRUPO.cumplidas.includes(estadoActual)
}

/** Desistió, venció sin publicar o se canceló: ya no dará resultados. */
export function quedoSinCompletar(estadoActual: EstadoAsignacion): boolean {
  return ESTADOS_DE_GRUPO.sin_completar.includes(estadoActual)
}
