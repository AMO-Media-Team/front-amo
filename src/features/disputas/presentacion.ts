/**
 * Textos de las disputas en la voz de cada parte (módulo puro): motivos, quién
 * la abrió, estados, quién puede abrir una y el resultado de la resolución.
 * Lo usan la bandeja y la ficha del equipo AMO (paquete DI) y las páginas de
 * disputa del medio y del anunciante (paquete DX): las tres cuentan lo mismo
 * con las mismas palabras.
 */
import {
  CAUSAS_CANCELACION,
  ESTADOS_ASIGNACION,
  type PresentacionEstado,
  type Tono,
} from "@/features/operacion/estados"
import { formatearFechaHora } from "@/lib/format"

import type {
  CausaCancelacion,
  DisputaDetalle,
  EstadoAsignacion,
  EstadoDisputa,
  MensajeDisputa,
  MotivoDisputa,
  ParteDisputa,
  Perspectiva,
} from "./tipos"

// ── Estados de la asignación y de la disputa ─────────────────────────────────

/** Estados desde los que cualquier parte abre una disputa (ADM-011). */
export const ESTADOS_DISPUTABLES: readonly EstadoAsignacion[] = [
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
  "VERIFICADA",
]

/** Una disputa en estos estados bloquea la asignación (`disputas_abierta_key`). */
export const ESTADOS_ABIERTOS: readonly EstadoDisputa[] = [
  "ABIERTA",
  "EN_REVISION",
]

export function estaAbierta(estado: EstadoDisputa): boolean {
  return ESTADOS_ABIERTOS.includes(estado)
}

/** «métricas cargadas»: el estado de la asignación dentro de una frase. */
export function estadoEnFrase(estado: EstadoAsignacion): string {
  return ESTADOS_ASIGNACION[estado].etiqueta.toLocaleLowerCase("es-CO")
}

const ESTADOS_INTERNOS: Readonly<Record<EstadoDisputa, PresentacionEstado>> = {
  ABIERTA: {
    etiqueta: "Abierta",
    tono: "peligro",
    descripcion: "Nadie del equipo la ha tomado todavía.",
  },
  EN_REVISION: {
    etiqueta: "En revisión",
    tono: "aviso",
    descripcion: "Alguien del equipo la está revisando.",
  },
  RESUELTA: {
    etiqueta: "Resuelta",
    tono: "exito",
    descripcion: "El equipo decidió qué pasa con la asignación.",
  },
  DESCARTADA: {
    etiqueta: "Descartada",
    tono: "neutro",
    descripcion: "No prosperó: la asignación siguió como estaba.",
  },
}

const ESTADOS_PARTES: Readonly<Record<EstadoDisputa, PresentacionEstado>> = {
  ...ESTADOS_INTERNOS,
  ABIERTA: {
    etiqueta: "Abierta",
    tono: "aviso",
    descripcion: "El equipo AMO la revisará pronto.",
  },
  EN_REVISION: {
    etiqueta: "En revisión",
    tono: "info",
    descripcion: "El equipo AMO la está revisando.",
  },
  RESUELTA: {
    etiqueta: "Resuelta",
    tono: "exito",
    descripcion: "El equipo AMO ya tomó una decisión.",
  },
}

/** Estado de la disputa para quien mira (etiqueta, tono y ayuda). */
export function presentacionEstado(
  estado: EstadoDisputa,
  perspectiva: Perspectiva
): PresentacionEstado {
  return (perspectiva === "interno" ? ESTADOS_INTERNOS : ESTADOS_PARTES)[estado]
}

// ── Motivos ──────────────────────────────────────────────────────────────────

export interface PresentacionMotivo {
  etiqueta: string
  /** Qué cubre, en la voz de quien lo elige o lo lee. */
  ayuda: Readonly<Record<Perspectiva, string>>
}

export const MOTIVOS: Readonly<Record<MotivoDisputa, PresentacionMotivo>> = {
  INCUMPLIMIENTO: {
    etiqueta: "Incumplimiento",
    ayuda: {
      interno: "Una de las partes no cumplió lo acordado en la oferta.",
      medio:
        "No se cumplió lo acordado contigo, por ejemplo el contenido no llegó a tiempo.",
      anunciante:
        "El medio no publicó lo acordado o no siguió las instrucciones de la oferta.",
    },
  },
  METRICAS: {
    etiqueta: "Métricas",
    ayuda: {
      interno: "Las cifras reportadas o su validación están en discusión.",
      medio:
        "No estás de acuerdo con la revisión de tus métricas o hay un error en un corte.",
      anunciante:
        "Las cifras reportadas no parecen reales o no coinciden con la publicación.",
    },
  },
  CONTENIDO: {
    etiqueta: "Contenido",
    ayuda: {
      interno:
        "La publicación, el creativo o la etiqueta de publicidad están en discusión.",
      medio:
        "Hubo un problema con el creativo o con lo que te pidieron publicar.",
      anunciante:
        "La publicación no corresponde al creativo, cambió el copy o le falta la etiqueta de publicidad.",
    },
  },
  PERMANENCIA: {
    etiqueta: "Permanencia",
    ayuda: {
      interno: "La publicación se habría retirado antes del tiempo acordado.",
      medio: "Hay una duda sobre cuánto tiempo siguió en línea tu publicación.",
      anunciante: "El medio retiró la publicación antes del tiempo acordado.",
    },
  },
  PAGO: {
    etiqueta: "Pago",
    ayuda: {
      interno: "El medio tiene una duda o un desacuerdo con el pago.",
      medio:
        "Tienes una duda o un desacuerdo con lo que recibirás por esta publicación.",
      anunciante: "Hay una duda sobre el cobro de esta publicación.",
    },
  },
  OTRO: {
    etiqueta: "Otro motivo",
    ayuda: {
      interno: "Algo distinto de lo anterior: la descripción lo explica.",
      medio:
        "Algo distinto de lo anterior. Cuéntalo con detalle en la descripción.",
      anunciante:
        "Algo distinto de lo anterior. Cuéntalo con detalle en la descripción.",
    },
  },
}

/** Orden en que se ofrecen los motivos (el catálogo de la BD). */
export const ORDEN_MOTIVOS: readonly MotivoDisputa[] = [
  "INCUMPLIMIENTO",
  "METRICAS",
  "CONTENIDO",
  "PERMANENCIA",
  "PAGO",
  "OTRO",
]

const MOTIVOS_POR_PARTE: Readonly<Record<ParteDisputa, MotivoDisputa[]>> = {
  MEDIO: ["METRICAS", "CONTENIDO", "PAGO", "OTRO"],
  ANUNCIANTE: [
    "INCUMPLIMIENTO",
    "METRICAS",
    "CONTENIDO",
    "PERMANENCIA",
    "OTRO",
  ],
  ADMIN: [...ORDEN_MOTIVOS],
}

/** El reclamo de una vencida: «Otro» (sí publiqué) o «Incumplimiento» (D70). */
const MOTIVOS_RECLAMO: readonly MotivoDisputa[] = ["OTRO", "INCUMPLIMIENTO"]

/** Motivos que cada parte puede elegir según el estado de la asignación. */
export function motivosDisponibles(
  parte: ParteDisputa,
  estadoAsignacion: EstadoAsignacion
): MotivoDisputa[] {
  if (estadoAsignacion === "VENCIDA_SIN_PUBLICAR") {
    return parte === "MEDIO" ? [...MOTIVOS_RECLAMO] : []
  }
  return ESTADOS_DISPUTABLES.includes(estadoAsignacion)
    ? [...MOTIVOS_POR_PARTE[parte]]
    : []
}

// ── Quién puede abrir una disputa ────────────────────────────────────────────

export interface AperturaPosible {
  motivos: MotivoDisputa[]
  /** Por qué no se puede ahora (se explica junto al botón); `null` si se puede. */
  bloqueo: string | null
}

/**
 * ¿La parte puede abrir una disputa sobre la asignación? Espejo de
 * `abrir_disputa_srv`, que vuelve a comprobarlo todo: estados disputables,
 * una sola abierta por asignación y el reclamo de una vencida solo del medio
 * y dentro de su plazo (`reclamoHasta`).
 */
export function aperturaPosible({
  parte,
  estadoAsignacion,
  hayAbierta,
  reclamoHasta = null,
  ahora,
}: {
  parte: ParteDisputa
  estadoAsignacion: EstadoAsignacion
  hayAbierta: boolean
  reclamoHasta?: string | null
  ahora: Date
}): AperturaPosible {
  const motivos = motivosDisponibles(parte, estadoAsignacion)
  const sin = (bloqueo: string): AperturaPosible => ({ motivos: [], bloqueo })
  if (hayAbierta || estadoAsignacion === "EN_DISPUTA") {
    return sin("Ya hay una disputa abierta sobre esta asignación.")
  }
  if (estadoAsignacion === "VENCIDA_SIN_PUBLICAR") {
    if (parte !== "MEDIO") {
      return sin("Una asignación vencida solo la reclama el medio.")
    }
    if (reclamoHasta && ahora.getTime() > new Date(reclamoHasta).getTime()) {
      return sin(
        `El plazo para reclamar terminó el ${formatearFechaHora(reclamoHasta)}.`
      )
    }
    return { motivos, bloqueo: null }
  }
  if (estadoAsignacion === "LIQUIDADA" || estadoAsignacion === "PAGADA") {
    return sin("La asignación ya se liquidó: no admite disputas.")
  }
  if (motivos.length === 0) {
    return sin(
      `En «${estadoEnFrase(estadoAsignacion)}» la asignación no admite disputas.`
    )
  }
  return { motivos, bloqueo: null }
}

// ── Partes ───────────────────────────────────────────────────────────────────

/** Rótulo corto de la parte (insignias del hilo y de la bandeja). */
export const ETIQUETAS_PARTE: Readonly<Record<ParteDisputa, string>> = {
  MEDIO: "Medio",
  ANUNCIANTE: "Anunciante",
  ADMIN: "Equipo AMO",
}

const PARTE_DE_PERSPECTIVA: Readonly<Record<Perspectiva, ParteDisputa | null>> =
  {
    interno: null,
    medio: "MEDIO",
    anunciante: "ANUNCIANTE",
  }

/** La parte que mira es la que abrió la disputa. */
export function laAbrioQuienMira(
  parte: ParteDisputa,
  perspectiva: Perspectiva
): boolean {
  return PARTE_DE_PERSPECTIVA[perspectiva] === parte
}

/** La parte dentro de una frase: «el medio», «tu empresa», «el equipo AMO». */
export function nombreParte(
  parte: ParteDisputa,
  perspectiva: Perspectiva
): string {
  if (parte === "ADMIN") return "el equipo AMO"
  if (laAbrioQuienMira(parte, perspectiva)) {
    return parte === "MEDIO" ? "tu medio" : "tu empresa"
  }
  return parte === "MEDIO" ? "el medio" : "el anunciante"
}

/** «La abrió el medio», «La abriste tú», «La abrió tu empresa». */
export function quienAbrio(
  parte: ParteDisputa,
  perspectiva: Perspectiva
): string {
  if (perspectiva === "medio" && parte === "MEDIO") return "La abriste tú"
  return `La abrió ${nombreParte(parte, perspectiva)}`
}

/** Quién verá lo que se escribe en el hilo. */
export function avisoVisibilidad(
  perspectiva: Perspectiva,
  notaInterna = false
): string {
  if (notaInterna) return "Solo la ve el equipo AMO."
  switch (perspectiva) {
    case "medio":
      return "Lo que escribas y adjuntes lo verán el anunciante y el equipo AMO."
    case "anunciante":
      return "Lo que escribas y adjuntes lo verán el medio y el equipo AMO."
    default:
      return "Lo verán el medio, el anunciante y el equipo AMO."
  }
}

export interface AutorMensaje {
  nombre: string
  /** Parte o persona, para el rótulo pequeño junto al nombre. */
  detalle: string | null
}

/** Cómo se presenta el autor de un mensaje para quien mira. */
export function autorDeMensaje(
  mensaje: Pick<
    MensajeDisputa,
    "autorParte" | "autorNombre" | "autorPersona" | "esMio"
  >,
  perspectiva: Perspectiva
): AutorMensaje {
  const parte = ETIQUETAS_PARTE[mensaje.autorParte]
  if (mensaje.esMio) {
    return { nombre: "Tú", detalle: perspectiva === "interno" ? parte : null }
  }
  if (mensaje.autorParte === "ADMIN") {
    return {
      nombre: "Equipo AMO",
      detalle: perspectiva === "interno" ? mensaje.autorPersona : null,
    }
  }
  const persona =
    perspectiva === "interno" && mensaje.autorPersona
      ? ` · ${mensaje.autorPersona}`
      : ""
  return { nombre: mensaje.autorNombre, detalle: `${parte}${persona}` }
}

// ── Resolución ───────────────────────────────────────────────────────────────

/** Qué le pasó a la asignación al cerrar la disputa (ADM-012). */
export type EfectoResolucion =
  "restaurar" | "verificar" | "reabrir" | "cancelar" | "descartar"

/** Efecto de una disputa cerrada; `null` mientras siga abierta. */
export function efectoResolucion(
  disputa: Pick<DisputaDetalle, "estado" | "estadoOrigen" | "estadoResultante">
): EfectoResolucion | null {
  if (disputa.estado === "DESCARTADA") return "descartar"
  if (disputa.estado !== "RESUELTA") return null
  const { estadoOrigen: origen, estadoResultante: resultante } = disputa
  if (resultante === "CANCELADA") return "cancelar"
  if (resultante === "CONTENIDO_ENTREGADO" && origen === "VENCIDA_SIN_PUBLICAR")
    return "reabrir"
  if (resultante === "VERIFICADA" && origen === "METRICAS_CARGADAS")
    return "verificar"
  return "restaurar"
}

/** Rótulo breve del efecto (bandeja): «Se reabrió», «Se canceló»… */
export const RESUMEN_EFECTO: Readonly<Record<EfectoResolucion, string>> = {
  restaurar: "Se restauró",
  verificar: "Se verificó",
  reabrir: "Se reabrió",
  cancelar: "Se canceló",
  descartar: "Sin cambios",
}

/** Lo que la ficha conoce de la asignación para contar el resultado. */
export interface ContextoDisputa {
  /** Plazo para cargar la evidencia tras reabrir una vencida. */
  fechaLimitePublicacion?: string | null
  causaCancelacion?: CausaCancelacion | null
  /** `disputas.plazo_recarga_horas` (24 por defecto). */
  plazoRecargaHoras?: number
}

/** Clave del icono y del aspecto del aviso. */
export type ClaveSituacion =
  | "abierta"
  | "revision"
  | "restaurada"
  | "verificada"
  | "reabierta"
  | "cancelada"
  | "descartada"

export interface SituacionDisputa {
  clave: ClaveSituacion
  titulo: string
  descripcion: string
  tono: Tono
}

export const PLAZO_RECARGA_POR_DEFECTO = 24

/** Estados en que el medio sigue cargando cortes durante la disputa (D72). */
const CON_CORTES_PENDIENTES: readonly EstadoAsignacion[] = [
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
]

function textoCausa(causa: CausaCancelacion | null | undefined): string {
  return causa ? CAUSAS_CANCELACION[causa].toLocaleLowerCase("es-CO") : ""
}

/** «hasta el 24 oct 2026, 3:00 p. m.» o «24 horas desde la resolución». */
function plazoEvidencia(contexto: ContextoDisputa): string {
  const plazo = contexto.plazoRecargaHoras ?? PLAZO_RECARGA_POR_DEFECTO
  return contexto.fechaLimitePublicacion
    ? `hasta el ${formatearFechaHora(contexto.fechaLimitePublicacion)}`
    : `${plazo} horas desde la resolución`
}

function situacionAbierta(
  disputa: Pick<DisputaDetalle, "estado" | "parte" | "estadoOrigen">,
  perspectiva: Perspectiva,
  contexto: ContextoDisputa
): SituacionDisputa {
  const enRevision = disputa.estado === "EN_REVISION"
  const clave: ClaveSituacion = enRevision ? "revision" : "abierta"
  const reclamo = disputa.estadoOrigen === "VENCIDA_SIN_PUBLICAR"
  const plazo = contexto.plazoRecargaHoras ?? PLAZO_RECARGA_POR_DEFECTO
  const bloqueo =
    disputa.estadoOrigen === "VERIFICADA"
      ? "Mientras dure, esta publicación no se liquida."
      : "Mientras dure, esta publicación no se verifica ni se liquida."

  if (perspectiva === "interno") {
    const abrio = `${quienAbrio(disputa.parte, "interno")}${reclamo ? " para reclamar una asignación vencida" : ""}.`
    return enRevision
      ? {
          clave,
          tono: "aviso",
          titulo: "En revisión",
          descripcion: `${abrio} Resuélvela con el efecto que corresponda o descártala: las partes recibirán tu explicación.`,
        }
      : {
          clave,
          tono: "peligro",
          titulo: "Espera que alguien la tome",
          descripcion: `${abrio} ${reclamo ? "Mientras se revisa, la asignación no ocupa cupo." : bloqueo}`,
        }
  }

  const propia = laAbrioQuienMira(disputa.parte, perspectiva)
  const tono: Tono = enRevision ? "info" : "aviso"
  if (perspectiva === "medio" && reclamo) {
    return {
      clave,
      tono,
      titulo: enRevision
        ? "Estamos revisando tu reclamo"
        : "Recibimos tu reclamo",
      descripcion: `Mientras lo revisamos, el cupo no vuelve a tu cuenta. Si te damos la razón, tendrás ${plazo} horas para cargar la evidencia.`,
    }
  }
  if (perspectiva === "anunciante" && reclamo) {
    return {
      clave,
      tono,
      titulo: "El medio reclama una publicación vencida",
      descripcion:
        "Dice que sí publicó y no se registró. Mientras lo revisamos, la asignación no ocupa cupo ni se te cobra.",
    }
  }
  const cortes =
    perspectiva === "medio" &&
    CON_CORTES_PENDIENTES.includes(disputa.estadoOrigen)
      ? " Si tienes cortes de métricas pendientes, sigue cargándolos."
      : ""
  if (propia) {
    const sustantivo = perspectiva === "medio" ? "disputa" : "reporte"
    return {
      clave,
      tono,
      titulo: enRevision
        ? `Estamos revisando tu ${sustantivo}`
        : `Recibimos tu ${sustantivo}`,
      descripcion: `${bloqueo}${cortes}`,
    }
  }
  const quien = nombreParte(disputa.parte, perspectiva)
  return {
    clave,
    tono,
    titulo: `${quien.charAt(0).toLocaleUpperCase("es-CO")}${quien.slice(1)} abrió una disputa`,
    descripcion: `${bloqueo} Puedes responder y aportar pruebas aquí.${cortes}`,
  }
}

function situacionCerrada(
  disputa: Pick<DisputaDetalle, "parte" | "estadoOrigen">,
  efecto: EfectoResolucion,
  perspectiva: Perspectiva,
  contexto: ContextoDisputa
): SituacionDisputa {
  const origen = disputa.estadoOrigen
  const vencida = origen === "VENCIDA_SIN_PUBLICAR"
  const propia = laAbrioQuienMira(disputa.parte, perspectiva)
  const causa = textoCausa(contexto.causaCancelacion)

  switch (efecto) {
    case "verificar":
      return {
        clave: "verificada",
        tono: "exito",
        titulo:
          perspectiva === "interno"
            ? "Resuelta: quedó verificada"
            : "Quedó verificada",
        descripcion:
          perspectiva === "medio"
            ? "Tu publicación quedó verificada: entra en la próxima liquidación."
            : perspectiva === "anunciante"
              ? "La publicación quedó verificada con sus métricas aprobadas."
              : "La asignación quedó verificada y entra en la próxima liquidación.",
      }
    case "reabrir":
      return perspectiva === "medio"
        ? {
            clave: "reabierta",
            tono: "exito",
            titulo: "Te dimos la razón",
            descripcion: `Tienes ${plazoEvidencia(contexto)} para cargar la evidencia de tu publicación.`,
          }
        : {
            clave: "reabierta",
            tono: "info",
            titulo:
              perspectiva === "interno"
                ? "Resuelta: se reabrió la publicación"
                : "Se reabrió la publicación",
            descripcion: `${perspectiva === "anunciante" ? "Le dimos la razón al medio: tiene" : "El medio tiene"} ${plazoEvidencia(contexto)} para cargar la evidencia.`,
          }
    case "cancelar": {
      if (perspectiva === "medio") {
        const descripcion =
          contexto.causaCancelacion === "FRAUDE"
            ? "Según los términos que aceptaste, esta publicación no se paga."
            : contexto.causaCancelacion === "INCUMPLIMIENTO_MEDIO"
              ? "Se canceló por incumplimiento: esta publicación no se paga y cuenta en tu cumplimiento."
              : "Ya no tienes que publicar ni cargar nada más para esta asignación."
        return {
          clave: "cancelada",
          tono: "peligro",
          titulo: "Se canceló tu participación",
          descripcion,
        }
      }
      const cupo = vencida
        ? ""
        : " Su cupo y su presupuesto volvieron a la oferta."
      return {
        clave: "cancelada",
        tono: "peligro",
        titulo:
          perspectiva === "interno"
            ? "Resuelta: se canceló la asignación"
            : "Se canceló la asignación",
        descripcion:
          perspectiva === "anunciante"
            ? `Esta publicación no se te cobra.${cupo}`
            : `${causa ? `Causa: ${causa}.` : "Quedó cancelada."}${cupo}`,
      }
    }
    case "descartar":
      if (perspectiva === "interno") {
        return {
          clave: "descartada",
          tono: "neutro",
          titulo: "Descartada",
          descripcion: `La disputa no prosperó: la asignación volvió a «${estadoEnFrase(origen)}».`,
        }
      }
      return propia
        ? {
            clave: "descartada",
            tono: "neutro",
            titulo:
              perspectiva === "medio" && vencida
                ? "Se descartó tu reclamo"
                : "Se descartó tu disputa",
            descripcion:
              "Revisamos el caso y no encontramos motivo para cambiar la asignación: sigue como estaba.",
          }
        : {
            clave: "descartada",
            tono: "neutro",
            titulo: "Se descartó la disputa",
            descripcion: "La asignación sigue su curso como estaba.",
          }
    default:
      if (perspectiva === "interno") {
        return {
          clave: "restaurada",
          tono: "neutro",
          titulo: vencida
            ? "Resuelta: se mantuvo el vencimiento"
            : `Resuelta: se restauró «${estadoEnFrase(origen)}»`,
          descripcion:
            "La asignación volvió al estado que tenía al abrirse la disputa.",
        }
      }
      if (propia) {
        return {
          clave: "restaurada",
          tono: "neutro",
          titulo: "Se mantuvo la decisión",
          descripcion:
            perspectiva === "medio" && vencida
              ? "Revisamos tu reclamo y la asignación sigue vencida: el cupo no vuelve a tu cuenta."
              : "Revisamos el caso y la asignación sigue como estaba.",
        }
      }
      return {
        clave: "restaurada",
        tono: "neutro",
        titulo: "Todo sigue como estaba",
        descripcion: vencida
          ? "Revisamos el reclamo del medio y la asignación sigue vencida: no se te cobra."
          : "El equipo AMO revisó el caso y la asignación sigue su curso.",
      }
  }
}

/**
 * Qué significa la disputa para quien mira: abierta (quién la abrió y qué
 * queda en pausa) o cerrada (el resultado en su voz: «Te dimos la razón:
 * tienes hasta…», «Se mantuvo la decisión», «Quedó verificada», «Se canceló
 * tu participación»). La explicación del equipo (`resolucion`) va aparte.
 */
export function situacionDisputa(
  disputa: Pick<
    DisputaDetalle,
    "estado" | "parte" | "estadoOrigen" | "estadoResultante"
  >,
  perspectiva: Perspectiva,
  contexto: ContextoDisputa = {}
): SituacionDisputa {
  const efecto = efectoResolucion(disputa)
  return efecto
    ? situacionCerrada(disputa, efecto, perspectiva, contexto)
    : situacionAbierta(disputa, perspectiva, contexto)
}
