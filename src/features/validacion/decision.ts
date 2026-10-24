/**
 * Decisiones de la validación (ADM-007, ADM-008, ADM-009), módulo puro: qué
 * se ofrece sobre una evidencia, un corte de métricas y la asignación, con el
 * bloqueo explicado, y los motivos frecuentes. Solo decide la interfaz:
 * `validar_evidencia_srv`, `validar_metrica_srv`, `corregir_metrica_srv` y
 * `transicionar_srv` revalidan permiso, estado y condiciones.
 */
import {
  type Corte,
  type EstadoAsignacion,
  ESTADOS_ASIGNACION,
  type EstadoValidacion,
} from "@/features/operacion/estados"
import {
  cerrarFrase,
  formatearFechaHoraFija,
} from "@/features/operacion/formato"
import {
  disputaAbierta,
  type SituacionGestion,
} from "@/features/operacion/gestion-asignacion"
import type { PublicacionEvidencia } from "@/features/operacion/tipos"
import { formatearNumero } from "@/lib/format"

import type { AsignacionPorVerificar, ValidacionEnFicha } from "./tipos"

/**
 * Estados de la asignación en que la BD deja validar evidencias y métricas
 * (fuera de ellos responde con el hint `asignacion_cerrada`).
 */
export const ESTADOS_EN_CURSO: readonly EstadoAsignacion[] = [
  "CONTENIDO_ENTREGADO",
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
  "EN_DISPUTA",
]

export function enCurso(estado: EstadoAsignacion): boolean {
  return ESTADOS_EN_CURSO.includes(estado)
}

/**
 * Permisos y estado que necesitan las decisiones de la ficha de la
 * asignación; con `disputas.ver`, la disputa abierta a la que enlazar lo que
 * se decide al resolverla.
 */
export function validacionEnFicha(
  permisos: Iterable<string>,
  asignacion: {
    estado: EstadoAsignacion
    estadoPrevioDisputa: EstadoAsignacion | null
    disputas: SituacionGestion["disputas"]
  }
): ValidacionEnFicha {
  const disponibles = new Set(permisos)
  const abierta = disputaAbierta(asignacion.disputas)
  return {
    estadoAsignacion: asignacion.estado,
    estadoPrevioDisputa: asignacion.estadoPrevioDisputa,
    disputaId: abierta && disponibles.has("disputas.ver") ? abierta.id : null,
    evidencias: disponibles.has("evidencias.validar"),
    metricas: disponibles.has("metricas.validar"),
    corregir: disponibles.has("metricas.editar_validadas"),
  }
}

// ── Durante una disputa ──────────────────────────────────────────────────────

/**
 * La BD no decide la evidencia de una asignación en disputa (aprobarla no la
 * movería): responde el hint `en_disputa`. Se decide al resolver la disputa.
 */
export function evidenciaEnDisputa(
  estadoAsignacion: EstadoAsignacion
): boolean {
  return estadoAsignacion === "EN_DISPUTA"
}

/**
 * Rechazar una métrica de una asignación que entró en disputa con todo
 * cargado la dejaría en «Métricas cargadas» con una rechazada al restaurarla
 * (D10): la BD responde `en_disputa`. Aprobarla sí se puede.
 */
export function rechazoMetricaEnDisputa(asignacion: {
  estadoAsignacion: EstadoAsignacion
  estadoPrevioDisputa: EstadoAsignacion | null
}): boolean {
  return (
    asignacion.estadoAsignacion === "EN_DISPUTA" &&
    asignacion.estadoPrevioDisputa === "METRICAS_CARGADAS"
  )
}

export const TEXTO_SE_DECIDE_EN_DISPUTA = "Se decide al resolver la disputa."

/** El porqué, junto a `TEXTO_SE_DECIDE_EN_DISPUTA`. */
export const DETALLE_EVIDENCIA_EN_DISPUTA =
  "Mientras la asignación está en disputa, su evidencia no se aprueba ni se rechaza aparte."

export const DETALLE_RECHAZO_EN_DISPUTA =
  "Entró en disputa con todas sus métricas cargadas: rechazar este corte espera a la resolución. Aprobarlo sí se puede."

/** ¿Se ofrece aprobar o rechazar esta evidencia? */
export function puedeValidarEvidencia(
  estado: EstadoValidacion,
  validacion: ValidacionEnFicha | undefined
): boolean {
  return (
    validacion !== undefined &&
    validacion.evidencias &&
    estado === "PENDIENTE" &&
    enCurso(validacion.estadoAsignacion) &&
    !evidenciaEnDisputa(validacion.estadoAsignacion)
  )
}

/**
 * La evidencia está pendiente y quien mira la decidiría, pero espera a la
 * disputa: en su lugar se explica y se enlaza a la disputa.
 */
export function evidenciaEsperaDisputa(
  estado: EstadoValidacion,
  validacion: ValidacionEnFicha | undefined
): boolean {
  return (
    validacion !== undefined &&
    validacion.evidencias &&
    estado === "PENDIENTE" &&
    evidenciaEnDisputa(validacion.estadoAsignacion)
  )
}

export const BLOQUEO_EVIDENCIA_SIN_APROBAR =
  "Primero valida la evidencia de esta publicación: las métricas se aprueban sobre una publicación comprobada."

export interface AccionesCorte {
  /** Aprobar o rechazar (corte pendiente). */
  validar: boolean
  /** Por qué no se puede aprobar aunque esté pendiente (rechazar sí). */
  bloqueoAprobar: string | null
  /**
   * Rechazar espera a la disputa (`rechazoMetricaEnDisputa`): solo se ofrece
   * aprobar y se explica por qué.
   */
  rechazoEnDisputa: boolean
  /** Corregir las cifras de una métrica aprobada (`metricas.editar_validadas`). */
  corregir: boolean
}

/** Lo que se ofrece sobre un corte de métricas en la ficha. */
export function accionesCorte(
  corte: { estado: EstadoValidacion },
  evidenciaAprobada: boolean,
  validacion: ValidacionEnFicha | undefined
): AccionesCorte {
  if (!validacion)
    return {
      validar: false,
      bloqueoAprobar: null,
      rechazoEnDisputa: false,
      corregir: false,
    }
  const validar =
    validacion.metricas &&
    corte.estado === "PENDIENTE" &&
    enCurso(validacion.estadoAsignacion)
  return {
    validar,
    bloqueoAprobar:
      validar && !evidenciaAprobada ? BLOQUEO_EVIDENCIA_SIN_APROBAR : null,
    rechazoEnDisputa: validar && rechazoMetricaEnDisputa(validacion),
    corregir: validacion.corregir && corte.estado === "APROBADA",
  }
}

// ── Verificación (ADM-009) ───────────────────────────────────────────────────

export const TEXTO_FALTAN_METRICAS = "Faltan métricas por aprobar"

export function textoPermanenciaPendiente(hasta: string): string {
  return `Permanencia pendiente hasta ${formatearFechaHoraFija(hasta)}`
}

/** La misma, como frase (la hora acaba en «m.» y ese punto la cierra). */
export function frasePermanenciaPendiente(hasta: string): string {
  return cerrarFrase(textoPermanenciaPendiente(hasta))
}

function contar(cantidad: number, singular: string, plural: string): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? singular : plural}`
}

/** «Faltan métricas por aprobar: 1 corte sin aprobar y 2 pendientes de revisión.» */
export function detalleFaltanMetricas(
  sinAprobar: number,
  pendientes: number
): string {
  const partes = [
    sinAprobar > 0
      ? contar(sinAprobar, "corte sin aprobar", "cortes sin aprobar")
      : null,
    pendientes > 0
      ? contar(
          pendientes,
          "métrica pendiente de revisión",
          "métricas pendientes de revisión"
        )
      : null,
  ].filter(Boolean)
  return partes.length > 0
    ? `${TEXTO_FALTAN_METRICAS}: ${partes.join(" y ")}.`
    : `${TEXTO_FALTAN_METRICAS}.`
}

export type SituacionVerificacion =
  /** No está en «Métricas cargadas» o la persona no verifica. */
  | { tipo: "no-aplica" }
  | { tipo: "lista" }
  | {
      tipo: "bloqueada"
      /** Frases que explican el bloqueo, en orden. */
      motivos: string[]
      /** Fin de la permanencia que falta cumplir (`null` si no es eso). */
      permanenciaHasta: string | null
      /** Solo falta la permanencia y la persona puede dejar constancia manual. */
      constancia: boolean
    }

/**
 * ¿Hay «Verificar» que ofrecer? Solo en «Métricas cargadas» y a quien
 * verifica; fuera de eso no se muestra nada (ni un hueco vacío en el pie fijo
 * del celular).
 */
export function aplicaVerificacion(
  estado: EstadoAsignacion,
  puedeVerificar: boolean
): boolean {
  return estado === "METRICAS_CARGADAS" && puedeVerificar
}

/**
 * ¿Se puede verificar la asignación? Las mismas condiciones que
 * `private.validar_verificacion_asignacion`: cada publicación con todos los
 * cortes requeridos aprobados, ninguna métrica pendiente (también un
 * personalizado) y la permanencia mínima cumplida o comprobada.
 */
export function situacionVerificacion({
  estado,
  publicaciones,
  cortesRequeridos,
  puedeVerificar,
  puedeConstanciaManual,
  ahora,
}: {
  estado: EstadoAsignacion
  publicaciones: readonly Pick<
    PublicacionEvidencia,
    "permanenciaHasta" | "permanenciaVerificadaAt" | "cortes"
  >[]
  cortesRequeridos: readonly Corte[]
  puedeVerificar: boolean
  puedeConstanciaManual: boolean
  ahora: Date
}): SituacionVerificacion {
  if (!aplicaVerificacion(estado, puedeVerificar)) return { tipo: "no-aplica" }
  let sinAprobar = 0
  let pendientes = 0
  let permanenciaHasta: string | null = null
  for (const publicacion of publicaciones) {
    for (const corte of cortesRequeridos) {
      const aprobado = publicacion.cortes.some(
        (metrica) => metrica.corte === corte && metrica.estado === "APROBADA"
      )
      if (!aprobado) sinAprobar += 1
    }
    pendientes += publicacion.cortes.filter(
      (metrica) => metrica.estado === "PENDIENTE"
    ).length
    const hasta = publicacion.permanenciaHasta
    const fin = new Date(hasta).getTime()
    if (
      !publicacion.permanenciaVerificadaAt &&
      fin > ahora.getTime() &&
      (permanenciaHasta === null || fin > new Date(permanenciaHasta).getTime())
    ) {
      permanenciaHasta = hasta
    }
  }
  const faltanMetricas = sinAprobar > 0 || pendientes > 0
  if (!faltanMetricas && permanenciaHasta === null) return { tipo: "lista" }
  return {
    tipo: "bloqueada",
    motivos: [
      faltanMetricas ? detalleFaltanMetricas(sinAprobar, pendientes) : null,
      permanenciaHasta ? frasePermanenciaPendiente(permanenciaHasta) : null,
    ].filter((motivo): motivo is string => motivo !== null),
    permanenciaHasta,
    constancia: !faltanMetricas && puedeConstanciaManual,
  }
}

/** Por qué una asignación de la cola aún no se puede verificar (o `null` si está lista). */
export function bloqueoEnCola(
  fila: Pick<
    AsignacionPorVerificar,
    | "bloqueo"
    | "cortesRequeridos"
    | "cortesAprobados"
    | "metricasPendientes"
    | "permanenciaHasta"
  >
): string | null {
  if (fila.bloqueo === "METRICAS") {
    return detalleFaltanMetricas(
      Math.max(0, fila.cortesRequeridos - fila.cortesAprobados),
      fila.metricasPendientes
    )
  }
  if (fila.bloqueo === "PERMANENCIA") {
    return fila.permanenciaHasta
      ? frasePermanenciaPendiente(fila.permanenciaHasta)
      : "Permanencia pendiente."
  }
  return null
}

// ── Qué comprobar y motivos frecuentes (un toque llena el campo) ─────────────

export const COMPROBACIONES_EVIDENCIA: readonly string[] = [
  "El enlace abre la publicación sin iniciar sesión y es de la cuenta de la campaña.",
  "La etiqueta de publicidad se ve («Colaboración pagada», «Contenido de marca» o #Publicidad).",
  "La captura corresponde a ese post y la publicación usa el contenido del anunciante sin editar el copy.",
  "La fecha de publicación cae dentro de la ventana de la oferta.",
]

export const COMPROBACIONES_METRICA: readonly string[] = [
  "Las cifras coinciden con las de la captura del panel.",
  "La captura es de esta publicación y muestra la fecha del corte.",
  "Si hay alerta, la captura respalda el alcance reportado.",
]

/**
 * Adónde vuelve la asignación al rechazar su evidencia, con el nombre que
 * muestran las insignias («Contenido descargado»).
 */
export const TEXTO_VUELVE_TRAS_RECHAZO_EVIDENCIA = `La asignación vuelve a «${ESTADOS_ASIGNACION.CONTENIDO_ENTREGADO.etiqueta}».`

export const SUGERENCIAS_RECHAZO_EVIDENCIA: readonly string[] = [
  "El post no abre públicamente: revisa que la cuenta sea pública y que el enlace sea el de la publicación.",
  "Falta la etiqueta de publicidad: agrega «Colaboración pagada» o #Publicidad a la publicación.",
  "La captura no corresponde al post: carga la captura de esta publicación.",
  "La publicación no usa el contenido del anunciante o cambia el copy sugerido.",
  "La fecha de publicación está fuera de la ventana de la oferta.",
]

export const SUGERENCIAS_RECHAZO_METRICA: readonly string[] = [
  "Las cifras no coinciden con la captura del panel: revísalas y cárgalas de nuevo.",
  "La captura no muestra la fecha o es de otra publicación.",
  "La captura se tomó antes de cumplirse el corte: carga una de ese momento o después.",
  "Faltan cifras que el panel sí muestra, como el alcance o las impresiones.",
]

export const SUGERENCIAS_REVISION_ALERTA: readonly string[] = [
  "Comparé las cifras con la captura del panel y coinciden.",
  "La publicación tuvo un alcance inusual (contenido compartido o viral) y la captura lo respalda.",
  "Confirmé con el medio el origen del alcance y la captura es auténtica.",
]

export const SUGERENCIAS_CONSTANCIA: readonly string[] = [
  "Comprobé que la publicación sigue en línea y cumple las condiciones de la oferta.",
  "El anunciante pidió verificarla antes de terminar la permanencia y la publicación sigue activa.",
]
