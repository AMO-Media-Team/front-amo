/**
 * La «siguiente acción» del medio (módulo puro, contrato de la fase 3): qué
 * significa cada fila de `proximas_acciones_medio`, a qué pantalla lleva,
 * cuál va primero y qué sigue en una asignación que no tiene nada pendiente.
 * La usan «Mis campañas», la ficha de la asignación y el inicio del medio (DM).
 */
import { rutaMetricaPersonalizada } from "@/features/ejecucion/rutas"
import { CORTES } from "@/features/operacion/estados"

import {
  rutaAsignacionMedio,
  rutaContenido,
  rutaEvidencia,
  rutaMetricas,
} from "./rutas"
import type {
  AccionMedio,
  AsignacionMedio,
  Corte,
  FilaAccionMedio,
  PasoMedio,
  TipoAccionMedio,
} from "./tipos"

/** Horas desde la publicación hasta que se puede cargar cada corte. */
export const HORAS_CORTE: Readonly<
  Record<Exclude<Corte, "PERSONALIZADO">, number>
> = {
  H24: 24,
  H72: 72,
  D7: 7 * 24,
}

/** `metricas.plazo_carga_horas` sembrado: lo que se usa si no se puede leer. */
export const PLAZO_CARGA_HORAS_POR_DEFECTO = 48

const HORA_MS = 3_600_000

const TIPOS: readonly TipoAccionMedio[] = [
  "DESCARGAR",
  "DESCARGAR_NUEVA_VERSION",
  "PUBLICAR",
  "CORREGIR_EVIDENCIA",
  "CORREGIR_METRICAS",
]

/** `CARGAR_METRICA_H72` → `CARGAR_METRICA`; un código desconocido → `null`. */
export function tipoDeAccion(codigo: string): TipoAccionMedio | null {
  if (/^CARGAR_METRICA_(H24|H72|D7)$/.test(codigo)) return "CARGAR_METRICA"
  return TIPOS.find((tipo) => tipo === codigo) ?? null
}

function corteDeCodigo(codigo: string): Corte | null {
  const corte = /^CARGAR_METRICA_(H24|H72|D7)$/.exec(codigo)?.[1]
  return (corte as Corte | undefined) ?? null
}

export interface OpcionesAccion {
  /**
   * La oferta pide más de una publicación: la etiqueta dice a cuál va. Sin
   * el dato, se menciona solo a partir de la segunda.
   */
  variasPublicaciones?: boolean
}

/** «Descarga el contenido», «Carga las métricas de 72 horas de la publicación 2». */
export function etiquetaAccion(
  tipo: TipoAccionMedio,
  {
    numero = null,
    corte = null,
    variasPublicaciones,
  }: { numero?: number | null; corte?: Corte | null } & OpcionesAccion = {}
): string {
  const conNumero = variasPublicaciones ?? (numero !== null && numero > 1)
  const sufijo = conNumero && numero ? ` de la publicación ${numero}` : ""
  const delCorte = corte ? ` de ${CORTES[corte].etiqueta}` : ""
  if (tipo === "CORREGIR_METRICAS" && corte === "PERSONALIZADO") {
    return `Corrige el corte personalizado${sufijo}`
  }
  switch (tipo) {
    case "DESCARGAR":
      return "Descarga el contenido"
    case "DESCARGAR_NUEVA_VERSION":
      return "Descarga la versión nueva del contenido"
    case "PUBLICAR":
      return "Publica y carga la evidencia"
    case "CORREGIR_EVIDENCIA":
      return `Corrige la evidencia${sufijo}`
    case "CARGAR_METRICA":
      return `Carga las métricas${delCorte}${sufijo}`
    case "CORREGIR_METRICAS":
      return `Corrige las métricas${delCorte}${sufijo}`
  }
}

/** Texto del botón que lleva a hacer la acción (la etiqueta dice qué hacer). */
export const TEXTO_BOTON_ACCION: Readonly<Record<TipoAccionMedio, string>> = {
  DESCARGAR: "Ver y descargar",
  DESCARGAR_NUEVA_VERSION: "Descargar la versión nueva",
  PUBLICAR: "Cargar la evidencia",
  CORREGIR_EVIDENCIA: "Corregir la evidencia",
  CARGAR_METRICA: "Cargar las métricas",
  CORREGIR_METRICAS: "Corregir las métricas",
}

/** Qué implica cada acción, para la ficha («Lo que sigue»). */
export const DESCRIPCION_ACCION: Readonly<Record<TipoAccionMedio, string>> = {
  DESCARGAR:
    "Lee las instrucciones y descarga los archivos y el texto para tu publicación.",
  DESCARGAR_NUEVA_VERSION:
    "El anunciante actualizó el contenido. Descarga la versión nueva antes de publicar: tu evidencia se revisa contra ella.",
  PUBLICAR:
    "Publica el contenido con la etiqueta de publicidad y carga el enlace y una captura de la publicación.",
  CORREGIR_EVIDENCIA:
    "El equipo AMO te pidió corregir la evidencia. Revisa sus observaciones y cárgala de nuevo.",
  CARGAR_METRICA:
    "Cuando se cumpla el corte, carga las estadísticas de la publicación con una captura del panel.",
  CORREGIR_METRICAS:
    "El equipo AMO te pidió corregir estas métricas. Revisa sus observaciones y cárgalas de nuevo.",
}

/** Qué vence, para la cuenta regresiva y su aviso: «Publicación», «Métricas de 72 h». */
export function etiquetaPlazoAccion(
  tipo: TipoAccionMedio,
  corte: Corte | null = null
): string {
  if (tipo === "CARGAR_METRICA" || tipo === "CORREGIR_METRICAS") {
    if (corte === "PERSONALIZADO") return "Corte personalizado"
    return corte ? `Métricas de ${CORTES[corte].corta}` : "Métricas"
  }
  return "Publicación"
}

/**
 * Pantalla donde se hace cada acción (botón directo). Un corte personalizado
 * se corrige por su id (una publicación puede tener varios); sin él, la ficha
 * los lista con su botón.
 */
export function rutaDeAccion(
  asignacionId: string,
  tipo: TipoAccionMedio,
  numero: number | null = null,
  corte: Corte | null = null,
  metricaId: string | null = null
) {
  switch (tipo) {
    case "DESCARGAR":
    case "DESCARGAR_NUEVA_VERSION":
      return rutaContenido(asignacionId)
    case "PUBLICAR":
    case "CORREGIR_EVIDENCIA":
      return rutaEvidencia(asignacionId, numero ?? undefined)
    case "CARGAR_METRICA":
    case "CORREGIR_METRICAS":
      if (corte === "PERSONALIZADO") {
        return numero && metricaId
          ? rutaMetricaPersonalizada(asignacionId, numero, metricaId)
          : rutaAsignacionMedio(asignacionId)
      }
      return numero && corte
        ? rutaMetricas(asignacionId, numero, corte)
        : rutaAsignacionMedio(asignacionId)
  }
}

function restarHoras(iso: string | null, horas: number): string | null {
  if (!iso) return null
  const instante = new Date(iso).getTime()
  return Number.isFinite(instante)
    ? new Date(instante - horas * HORA_MS).toISOString()
    : null
}

/**
 * Una fila de `proximas_acciones_medio` lista para pintar. El corte de una
 * métrica por cargar se habilita `plazoCargaHoras` antes de su fecha límite
 * (la BD la calcula como publicación + corte + plazo). Un código que esta
 * versión de la app no conoce se descarta (`null`).
 */
export function interpretarAccion(
  fila: FilaAccionMedio,
  {
    plazoCargaHoras = PLAZO_CARGA_HORAS_POR_DEFECTO,
    variasPublicaciones,
  }: { plazoCargaHoras?: number } & OpcionesAccion = {}
): AccionMedio | null {
  const tipo = tipoDeAccion(fila.accion)
  if (!tipo) return null
  const corte = fila.corte ?? corteDeCodigo(fila.accion)
  const numero = fila.numero
  const metricaId = fila.metricaId ?? null
  return {
    asignacionId: fila.asignacionId,
    ofertaTitulo: fila.ofertaTitulo,
    tipo,
    codigo: fila.accion,
    numero,
    corte,
    metricaId,
    venceAt: fila.venceAt,
    disponibleDesde:
      tipo === "CARGAR_METRICA"
        ? restarHoras(fila.venceAt, plazoCargaHoras)
        : null,
    etiqueta: etiquetaAccion(tipo, { numero, corte, variasPublicaciones }),
    etiquetaPlazo: etiquetaPlazoAccion(tipo, corte),
    ruta: rutaDeAccion(fila.asignacionId, tipo, numero, corte, metricaId),
  }
}

// ── Orden ────────────────────────────────────────────────────────────────────

/**
 * El contenido primero (sin la versión vigente la evidencia no pasa), luego
 * la evidencia y al final las métricas; dentro de cada grupo, el plazo más
 * cercano.
 */
const PRIORIDAD: Readonly<Record<TipoAccionMedio, number>> = {
  DESCARGAR_NUEVA_VERSION: 0,
  DESCARGAR: 1,
  CORREGIR_EVIDENCIA: 2,
  PUBLICAR: 3,
  CORREGIR_METRICAS: 4,
  CARGAR_METRICA: 4,
}

function instante(iso: string | null): number {
  const valor = iso ? new Date(iso).getTime() : Number.NaN
  return Number.isFinite(valor) ? valor : Number.POSITIVE_INFINITY
}

export function compararAcciones(a: AccionMedio, b: AccionMedio): number {
  return (
    PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo] ||
    instante(a.venceAt) - instante(b.venceAt) ||
    (a.numero ?? 0) - (b.numero ?? 0) ||
    a.codigo.localeCompare(b.codigo) ||
    (a.metricaId ?? "").localeCompare(b.metricaId ?? "")
  )
}

/** Acciones de una asignación, de la que va primero a la última. */
export function accionesDe(
  asignacionId: string,
  acciones: readonly AccionMedio[]
): AccionMedio[] {
  return acciones
    .filter((accion) => accion.asignacionId === asignacionId)
    .sort(compararAcciones)
}

// ── Disponibilidad en el tiempo ──────────────────────────────────────────────

/**
 * `bloqueada`: el corte aún no se cumple; `vencida`: pasó la fecha límite
 * (la evidencia ya no se acepta; las métricas sí, atrasadas); `disponible`.
 */
export type DisponibilidadAccion = "bloqueada" | "disponible" | "vencida"

export function disponibilidadAccion(
  accion: Pick<AccionMedio, "disponibleDesde" | "venceAt">,
  ahora: Date
): DisponibilidadAccion {
  if (
    accion.disponibleDesde &&
    ahora.getTime() < instante(accion.disponibleDesde)
  ) {
    return "bloqueada"
  }
  if (accion.venceAt && ahora.getTime() > instante(accion.venceAt)) {
    return "vencida"
  }
  return "disponible"
}

// ── Lo que sigue en una asignación ───────────────────────────────────────────

export type AsignacionParaPaso = Pick<
  AsignacionMedio,
  | "id"
  | "ofertaTitulo"
  | "estado"
  | "fechaLimitePublicacion"
  | "reclamoHasta"
  | "publicaciones"
>

/** Sin fila en `proximas_acciones_medio`, lo que su estado pide hacer. */
function accionPorEstado(asignacion: AsignacionParaPaso): AccionMedio | null {
  const tipo: TipoAccionMedio | null =
    asignacion.estado === "ACEPTADA"
      ? "DESCARGAR"
      : asignacion.estado === "CONTENIDO_ENTREGADO"
        ? "PUBLICAR"
        : null
  if (!tipo) return null
  return {
    asignacionId: asignacion.id,
    ofertaTitulo: asignacion.ofertaTitulo,
    tipo,
    codigo: tipo,
    numero: null,
    corte: null,
    metricaId: null,
    venceAt: asignacion.fechaLimitePublicacion,
    disponibleDesde: null,
    etiqueta: etiquetaAccion(tipo),
    etiquetaPlazo: etiquetaPlazoAccion(tipo),
    ruta: rutaDeAccion(asignacion.id, tipo),
  }
}

/**
 * Lo que sigue en la asignación: su acción más urgente, la espera mientras
 * el equipo AMO revisa, el plazo para reclamar una vencida o su cierre.
 */
export function siguientePaso(
  asignacion: AsignacionParaPaso,
  acciones: readonly AccionMedio[]
): PasoMedio {
  const accion =
    accionesDe(asignacion.id, acciones).at(0) ?? accionPorEstado(asignacion)
  if (accion) return { tipo: "accion", accion }

  switch (asignacion.estado) {
    case "VENCIDA_SIN_PUBLICAR":
      return { tipo: "reclamo", hasta: asignacion.reclamoHasta }
    case "PUBLICADA":
      return {
        tipo: "espera",
        titulo: "Tu evidencia está en revisión",
        descripcion:
          "El equipo AMO la revisa. Si hay que corregir algo, te avisamos.",
      }
    case "EVIDENCIA_VALIDADA":
      return {
        tipo: "espera",
        titulo: "Tus métricas están en revisión",
        descripcion:
          "Cargaste los cortes que pide la oferta y el equipo AMO los está revisando.",
      }
    case "METRICAS_CARGADAS":
      return {
        tipo: "espera",
        titulo: "Tus métricas están en verificación",
        descripcion:
          "El equipo AMO revisa tus cifras para verificar la campaña. Te avisamos al terminar.",
      }
    case "EN_DISPUTA":
      return {
        tipo: "espera",
        titulo: "Hay una disputa abierta",
        descripcion:
          "El equipo AMO la atiende y te avisará la decisión. No tienes que hacer nada por ahora.",
        disputa: true,
      }
    case "VERIFICADA":
      return {
        tipo: "cerrada",
        titulo: "¡Cumpliste!",
        descripcion:
          "Tu trabajo quedó verificado y entra en la próxima liquidación.",
        tono: "exito",
      }
    case "LIQUIDADA":
      return {
        tipo: "cerrada",
        titulo: "Tu pago va en camino",
        descripcion: "Está incluida en una liquidación.",
        tono: "exito",
      }
    case "PAGADA":
      return {
        tipo: "cerrada",
        titulo: "Pagada",
        descripcion: "Ya recibiste el pago de esta campaña.",
        tono: "exito",
      }
    case "RECHAZADA":
      return {
        tipo: "cerrada",
        titulo: "Desististe",
        descripcion: "El cupo quedó libre para otro medio.",
        tono: "neutro",
      }
    case "CANCELADA":
      return {
        tipo: "cerrada",
        titulo: "Cancelada",
        descripcion: "El equipo AMO canceló tu participación en esta campaña.",
        tono: "peligro",
      }
    case "ACEPTADA":
    case "CONTENIDO_ENTREGADO":
      // Inalcanzable: `accionPorEstado` ya respondió por estos dos.
      return {
        tipo: "espera",
        titulo: "Sin acciones pendientes",
        descripcion: "",
      }
  }
}

/** Fecha que ordena el tablero: la del paso que sigue (las cerradas, al final). */
export function vencimientoDelPaso(paso: PasoMedio): string | null {
  if (paso.tipo === "accion") return paso.accion.venceAt
  if (paso.tipo === "reclamo") return paso.hasta
  return null
}
