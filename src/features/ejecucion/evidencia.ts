/**
 * Evidencia de publicación (MED-013; módulo puro): qué puede hacer el medio
 * con la publicación N según el estado de la asignación, la fecha límite y
 * la revisión de AMO, entre qué fechas puede decir que publicó (ventana de la
 * oferta, no antes de descargar el contenido, nunca en el futuro) y si le
 * falta descargar la versión vigente del contenido. Las reglas de
 * `registrar_evidencia_srv`; la de la descarga la exige la Server Action.
 */
import { separarFechaHora } from "@/features/asistente-oferta/instantes"

import type {
  AsignacionEjecucion,
  ContenidoEjecucion,
  EstadoAsignacion,
  PublicacionEjecucion,
} from "./tipos"

/** Desfase de reloj que la BD admite hacia el futuro (15 minutos). */
export const MARGEN_RELOJ_MS = 15 * 60_000

const MINUTO_MS = 60_000

/**
 * El instante con los segundos en 0 (`date_trunc('minute', …)`): el medio
 * declara la hora de publicación al minuto.
 */
export function alMinuto(fecha: string | Date): Date {
  const ms = new Date(fecha).getTime()
  return new Date(ms - (((ms % MINUTO_MS) + MINUTO_MS) % MINUTO_MS))
}

/** Estados en que `registrar_evidencia_srv` acepta evidencias. */
export const ESTADOS_CON_EVIDENCIA: ReadonlySet<EstadoAsignacion> = new Set([
  "CONTENIDO_ENTREGADO",
  "PUBLICADA",
])

export type SituacionEvidencia =
  /** Aún no descarga el contenido: no hay qué publicar. */
  | { tipo: "descargar-primero" }
  /** Primera evidencia de esa publicación. */
  | { tipo: "cargar" }
  /** AMO la rechazó: se corrige con sus observaciones. */
  | { tipo: "corregir"; observaciones: string | null }
  /** Enviada y por revisar; se puede corregir mientras siga abierta. */
  | { tipo: "en-revision"; editable: boolean }
  | { tipo: "aprobada" }
  /** Pasó la fecha límite sin evidencia válida. */
  | { tipo: "vencida"; reclamoHasta: string | null }
  /** La asignación ya no admite evidencias (cancelada, en disputa…). */
  | { tipo: "cerrada" }

export function situacionEvidencia(
  asignacion: Pick<
    AsignacionEjecucion,
    "estado" | "fechaLimitePublicacion" | "reclamoHasta"
  >,
  publicacion: Pick<PublicacionEjecucion, "estado" | "observaciones"> | null,
  ahora: Date
): SituacionEvidencia {
  const limite = new Date(asignacion.fechaLimitePublicacion).getTime()
  const aTiempo = !(ahora.getTime() > limite)
  const abierta = ESTADOS_CON_EVIDENCIA.has(asignacion.estado) && aTiempo
  const vencida = {
    tipo: "vencida",
    reclamoHasta: asignacion.reclamoHasta,
  } as const

  if (asignacion.estado === "ACEPTADA") {
    return aTiempo ? { tipo: "descargar-primero" } : vencida
  }
  if (publicacion?.estado === "APROBADA") return { tipo: "aprobada" }
  if (publicacion?.estado === "PENDIENTE") {
    return { tipo: "en-revision", editable: abierta }
  }
  if (
    asignacion.estado === "VENCIDA_SIN_PUBLICAR" ||
    (ESTADOS_CON_EVIDENCIA.has(asignacion.estado) && !aTiempo)
  ) {
    return vencida
  }
  if (!abierta) return { tipo: "cerrada" }
  return publicacion?.estado === "RECHAZADA"
    ? { tipo: "corregir", observaciones: publicacion.observaciones }
    : { tipo: "cargar" }
}

/** ¿La situación deja enviar (o reenviar) la evidencia? */
export function admiteEnvio(situacion: SituacionEvidencia): boolean {
  return (
    situacion.tipo === "cargar" ||
    situacion.tipo === "corregir" ||
    (situacion.tipo === "en-revision" && situacion.editable)
  )
}

/**
 * Número de publicación a mostrar: el pedido si es válido; si no, la primera
 * que falta o está rechazada; si todas van bien, la 1.
 */
export function elegirNumero(
  pedido: string | string[] | undefined,
  total: number,
  registradas: readonly Pick<PublicacionEjecucion, "numero" | "estado">[]
): number {
  const texto = Array.isArray(pedido) ? pedido[0] : pedido
  const numero = texto && /^\d{1,2}$/.test(texto) ? Number(texto) : Number.NaN
  if (Number.isInteger(numero) && numero >= 1 && numero <= total) return numero
  for (let n = 1; n <= total; n++) {
    const registrada = registradas.find((p) => p.numero === n)
    if (!registrada || registrada.estado === "RECHAZADA") return n
  }
  return 1
}

export interface LimitesFecha {
  minimo: Date
  maximo: Date
  /** El mínimo es la descarga del contenido, no el inicio de la ventana. */
  desdeDescarga: boolean
}

/**
 * Entre qué instantes pudo publicar: desde el inicio de la ventana o la
 * primera descarga del contenido (al minuto; sin contenido no hay qué
 * publicar) hasta el fin de la ventana o ahora, lo que llegue antes.
 * `margenMs` admite el desfase de reloj del celular frente al servidor (la BD
 * admite 15 minutos).
 */
export function limitesFechaPublicacion(
  asignacion: Pick<
    AsignacionEjecucion,
    "ventanaInicio" | "ventanaFin" | "contenidoDescargadoAt"
  >,
  ahora: Date,
  margenMs = 0
): LimitesFecha {
  const inicio = new Date(asignacion.ventanaInicio)
  const descarga = asignacion.contenidoDescargadoAt
    ? alMinuto(asignacion.contenidoDescargadoAt)
    : null
  const desdeDescarga = descarga !== null && descarga > inicio
  const fin = new Date(asignacion.ventanaFin).getTime()
  return {
    minimo: desdeDescarga ? descarga : inicio,
    maximo: new Date(Math.min(fin, ahora.getTime() + margenMs)),
    desdeDescarga,
  }
}

/** Día y hora con que se abre el formulario: ahora, dentro de la ventana. */
export function fechaPorDefecto(
  limites: LimitesFecha,
  ahora: Date
): { dia: string; hora: string } {
  const instante = Math.min(
    Math.max(ahora.getTime(), limites.minimo.getTime()),
    limites.maximo.getTime()
  )
  return separarFechaHora(new Date(instante).toISOString())
}

/**
 * Hay una versión del contenido más nueva que la descargada. Si además se
 * activó antes de la fecha en que dice haber publicado (o en ese mismo
 * minuto), la BD rechaza la evidencia (`AMO_CREATIVO_DESACTUALIZADO`).
 */
export function versionPendiente(
  contenido: ContenidoEjecucion,
  fechaPublicacion: string | null = null
): boolean {
  const { vigente, versionDescargada } = contenido
  if (!vigente) return false
  if (versionDescargada !== null && versionDescargada >= vigente.version) {
    return false
  }
  if (!fechaPublicacion) return true
  return (
    alMinuto(vigente.activadoAt).getTime() <=
    new Date(fechaPublicacion).getTime()
  )
}
