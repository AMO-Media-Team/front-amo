/**
 * Historia de la oferta (módulo puro): cada cambio de estado de
 * `oferta_historial` con un título legible, quién lo hizo según quién mira y
 * el comentario de la devolución o el motivo. Las ofertas anteriores al
 * historial (datos cargados en bloque) se reconstruyen con los instantes que
 * guarda la propia oferta.
 */
import { ESTADOS_OFERTA, type Tono } from "@/features/operacion/estados"

import type {
  ActorHistorial,
  FechasOferta,
  FilaHistorial,
  Perspectiva,
} from "./tipos"

export type ClaseEvento =
  | "creada"
  | "enviada"
  | "reenviada"
  | "retirada"
  | "devuelta"
  | "devuelta_sistema"
  | "publicada"
  | "rechazada"
  | "cancelada"
  | "cupos_completos"
  | "cupo_liberado"
  | "en_ejecucion"
  | "vencida"
  | "cerrada"

export interface EventoHistorial {
  id: string
  clase: ClaseEvento
  titulo: string
  tono: Tono
  at: string
  /** Quién lo hizo, dicho para quien mira ("Tú", "Equipo AMO", "Automático"…). */
  actor: string | null
  comentario: string | null
}

export interface HistorialConstruido {
  eventos: EventoHistorial[]
  /** Sin filas en `oferta_historial`: se armó con las fechas de la oferta. */
  reconstruido: boolean
}

const TITULOS: Readonly<Record<ClaseEvento, string>> = {
  creada: "Creada como borrador",
  enviada: "Enviada a revisión",
  reenviada: "Reenviada a revisión",
  retirada: "Retirada de revisión",
  devuelta: "Devuelta con comentarios",
  devuelta_sistema: "Devuelta: venció la fecha límite en revisión",
  publicada: "Publicada en el marketplace",
  rechazada: "Rechazada en moderación",
  cancelada: "Cancelada",
  cupos_completos: "Se tomaron todos los cupos",
  cupo_liberado: "Se liberó un cupo",
  en_ejecucion: "Empezó la ventana de publicación",
  vencida: "Venció la fecha límite sin cupos tomados",
  cerrada: "Cerrada",
}

const TITULO_ACEPTACION_CERRADA = "Se cerró la aceptación con medios asignados"

/**
 * Una oferta con cupos tomados pasa a ejecución cuando empieza su ventana o,
 * si antes llega la fecha límite de aceptación, en ese momento (la ventana
 * aún no empieza). El instante del cambio dice cuál de los dos fue.
 */
function tituloDe(
  clase: ClaseEvento,
  at: string,
  ventanaInicio: string
): string {
  if (
    clase === "en_ejecucion" &&
    new Date(at).getTime() < new Date(ventanaInicio).getTime()
  ) {
    return TITULO_ACEPTACION_CERRADA
  }
  return TITULOS[clase]
}

const TONOS: Readonly<Partial<Record<ClaseEvento, Tono>>> = {
  creada: "neutro",
  retirada: "neutro",
  devuelta: "aviso",
  devuelta_sistema: "aviso",
  rechazada: "peligro",
  cupo_liberado: "info",
}

/** Clase de un cambio de estado según su origen, destino y actor. */
export function claseDeCambio(
  fila: Pick<FilaHistorial, "desde" | "hacia" | "actorTipo">
): ClaseEvento {
  const { desde, hacia, actorTipo } = fila
  switch (hacia) {
    case "EN_REVISION":
      return desde === "DEVUELTA" ? "reenviada" : "enviada"
    case "BORRADOR":
      return "retirada"
    case "DEVUELTA":
      return actorTipo === "SISTEMA" ? "devuelta_sistema" : "devuelta"
    case "PUBLICADA":
      return desde === "CUPOS_COMPLETOS" ? "cupo_liberado" : "publicada"
    case "CANCELADA":
      return desde === "EN_REVISION" && actorTipo === "ADMIN"
        ? "rechazada"
        : "cancelada"
    case "CUPOS_COMPLETOS":
      return "cupos_completos"
    case "EN_EJECUCION":
      return "en_ejecucion"
    case "VENCIDA":
      return "vencida"
    case "CERRADA":
      return "cerrada"
  }
}

const ESTADO_DE_CLASE: Readonly<
  Partial<Record<ClaseEvento, keyof typeof ESTADOS_OFERTA>>
> = {
  enviada: "EN_REVISION",
  reenviada: "EN_REVISION",
  publicada: "PUBLICADA",
  cancelada: "CANCELADA",
  cupos_completos: "CUPOS_COMPLETOS",
  en_ejecucion: "EN_EJECUCION",
  vencida: "VENCIDA",
  cerrada: "CERRADA",
}

function tonoDe(clase: ClaseEvento): Tono {
  const estado = ESTADO_DE_CLASE[clase]
  return TONOS[clase] ?? (estado ? ESTADOS_OFERTA[estado].tono : "neutro")
}

export interface Observador {
  perspectiva: Perspectiva
  /** Usuario que mira: sus propios cambios se leen como «Tú». */
  usuarioId: string
}

/** Quién hizo el cambio, dicho para quien mira la oferta. */
export function nombreActor(
  actor: {
    tipo: ActorHistorial
    id: string | null
    nombre: string | null
  },
  { perspectiva, usuarioId }: Observador
): string {
  if (actor.tipo === "SISTEMA") return "Automático"
  if (actor.id !== null && actor.id === usuarioId) return "Tú"
  if (actor.tipo === "ADMIN") {
    // El anunciante no ve quién del equipo AMO moderó su oferta.
    return perspectiva === "interno"
      ? (actor.nombre ?? "Equipo AMO")
      : "Equipo AMO"
  }
  if (actor.tipo === "MEDIO") return actor.nombre ?? "Un medio"
  return (
    actor.nombre ??
    (perspectiva === "anunciante" ? "Tu equipo" : "El anunciante")
  )
}

function eventoCreada(creadaAt: string): EventoHistorial {
  return {
    id: "creada",
    clase: "creada",
    titulo: TITULOS.creada,
    tono: tonoDe("creada"),
    at: creadaAt,
    actor: null,
    comentario: null,
  }
}

function evento(
  id: string,
  clase: ClaseEvento,
  at: string,
  actor: string | null,
  comentario: string | null,
  ventanaInicio: string
): EventoHistorial {
  return {
    id,
    clase,
    titulo: tituloDe(clase, at, ventanaInicio),
    tono: tonoDe(clase),
    at,
    actor,
    comentario: comentario?.trim() ? comentario.trim() : null,
  }
}

/** Instantes de la oferta → eventos (sin actor: no quedó registrado). */
function reconstruir(
  fechas: FechasOferta,
  comentarioModeracion: string | null,
  ventanaInicio: string
): EventoHistorial[] {
  const candidatos: [ClaseEvento, string | null, string | null][] = [
    ["enviada", fechas.enviadaAt, null],
    ["devuelta", fechas.devueltaAt, comentarioModeracion],
    ["publicada", fechas.publicadaAt, null],
    ["cupos_completos", fechas.cuposCompletosAt, null],
    ["en_ejecucion", fechas.enEjecucionAt, null],
    ["vencida", fechas.vencidaAt, null],
    ["cerrada", fechas.cerradaAt, null],
    ["cancelada", fechas.canceladaAt, null],
  ]
  return candidatos.flatMap(([clase, at, comentario]) =>
    at
      ? [
          evento(
            `reconstruido-${clase}`,
            clase,
            at,
            null,
            comentario,
            ventanaInicio
          ),
        ]
      : []
  )
}

function porFecha(a: EventoHistorial, b: EventoHistorial): number {
  return new Date(a.at).getTime() - new Date(b.at).getTime()
}

/** Historia completa, del primer al último hecho, con la creación al inicio. */
export function construirHistorial(
  {
    filas,
    fechas,
    comentarioModeracion,
    ventanaInicio,
  }: {
    filas: readonly FilaHistorial[]
    fechas: FechasOferta
    comentarioModeracion: string | null
    /** Inicio de la ventana: distingue por qué la oferta pasó a ejecución. */
    ventanaInicio: string
  },
  observador: Observador
): HistorialConstruido {
  const creada = eventoCreada(fechas.creadaAt)
  if (filas.length === 0) {
    const reconstruidos = reconstruir(
      fechas,
      comentarioModeracion,
      ventanaInicio
    )
    return {
      eventos: [creada, ...reconstruidos.sort(porFecha)],
      reconstruido: reconstruidos.length > 0,
    }
  }
  const eventos = filas.map((fila) =>
    evento(
      fila.id,
      claseDeCambio(fila),
      fila.at,
      nombreActor(
        { tipo: fila.actorTipo, id: fila.actorId, nombre: fila.actorNombre },
        observador
      ),
      fila.comentario,
      ventanaInicio
    )
  )
  return { eventos: [creada, ...eventos.sort(porFecha)], reconstruido: false }
}
