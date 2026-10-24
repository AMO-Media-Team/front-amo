/**
 * Decisiones del equipo AMO sobre una disputa (ADM-012), módulo puro: qué
 * botones ofrecer según la máquina de estados (`accionesPermitidas` con
 * `disputas.resolver`) y, al resolver, qué destinos admite la asignación
 * según su estado previo, con el efecto explicado y el bloqueo si lo hay.
 * Solo decide la interfaz: `transicionar_srv` revalida permiso, estado,
 * métricas, permanencia, oferta viva y causa.
 */
import {
  CAUSAS_CANCELACION,
  type Corte,
  type EstadoValidacion,
} from "@/features/operacion/estados"
import { formatearFechaHora } from "@/lib/format"
import { accionesPermitidas } from "@/lib/negocio/acciones"

import {
  type EfectoResolucion,
  estadoEnFrase,
  PLAZO_RECARGA_POR_DEFECTO,
} from "./presentacion"
import { type DestinoResolucion, esDestinoResolucion } from "./schemas"
import type { CausaCancelacion, EstadoAsignacion, EstadoDisputa } from "./tipos"

// ── Decisiones sobre la disputa ──────────────────────────────────────────────

export type DecisionDisputa = "tomar" | "resolver" | "descartar"

export interface OpcionDecisionDisputa {
  decision: DecisionDisputa
  requiereMotivo: boolean
}

const PERMISO_RESOLVER = "disputas.resolver"

const ORDEN_DECISIONES: readonly DecisionDisputa[] = [
  "tomar",
  "resolver",
  "descartar",
]

const DECISION_POR_DESTINO: Readonly<
  Partial<Record<EstadoDisputa, DecisionDisputa>>
> = {
  EN_REVISION: "tomar",
  RESUELTA: "resolver",
  DESCARTADA: "descartar",
}

/** Lo que el rol puede hacer con la disputa en su estado actual. */
export function decisionesDisputa(
  estado: EstadoDisputa,
  permisos: Iterable<string>
): OpcionDecisionDisputa[] {
  return accionesPermitidas("disputas", estado, "ADMIN", permisos)
    .filter((accion) => accion.permiso === PERMISO_RESOLVER)
    .flatMap(({ hacia, requiereMotivo }) => {
      const decision = DECISION_POR_DESTINO[hacia]
      return decision ? [{ decision, requiereMotivo }] : []
    })
    .sort(
      (a, b) =>
        ORDEN_DECISIONES.indexOf(a.decision) -
        ORDEN_DECISIONES.indexOf(b.decision)
    )
}

/** Estados de la disputa desde los que parte cada decisión (lo comprueba la acción). */
export const ORIGEN_DECISION_DISPUTA: Readonly<
  Record<DecisionDisputa, readonly EstadoDisputa[]>
> = {
  tomar: ["ABIERTA"],
  resolver: ["ABIERTA", "EN_REVISION"],
  descartar: ["ABIERTA", "EN_REVISION"],
}

// ── Verificación (puerta a pago) ─────────────────────────────────────────────

export interface DatosVerificacion {
  publicacionesEsperadas: number
  cortesRequeridos: readonly Corte[]
  publicaciones: readonly {
    id: string
    permanenciaHasta: string
    permanenciaVerificadaAt: string | null
  }[]
  metricas: readonly {
    publicacionId: string
    corte: Corte
    estado: EstadoValidacion
  }[]
}

export interface SituacionVerificacion {
  /** Falta una publicación o un corte requerido aprobado. */
  faltanMetricas: boolean
  /** Hay cortes sin revisar (también personalizados o reabiertos). */
  metricasPendientes: boolean
  /** Hasta cuándo corre la permanencia sin constancia; `null` si ya se cumplió. */
  permanenciaHasta: string | null
}

/**
 * Espejo de `private.validar_verificacion_asignacion`: todas las
 * publicaciones con sus cortes requeridos aprobados, nada pendiente de
 * revisión y la permanencia cumplida (o comprobada).
 */
export function situacionVerificacion(
  datos: DatosVerificacion,
  ahora: Date
): SituacionVerificacion {
  const aprobadas = new Set(
    datos.metricas
      .filter((metrica) => metrica.estado === "APROBADA")
      .map((metrica) => `${metrica.publicacionId}:${metrica.corte}`)
  )
  const faltanMetricas =
    datos.publicaciones.length < datos.publicacionesEsperadas ||
    datos.publicaciones.some((publicacion) =>
      datos.cortesRequeridos.some(
        (corte) => !aprobadas.has(`${publicacion.id}:${corte}`)
      )
    )
  const pendientes = datos.publicaciones
    .filter(
      (publicacion) =>
        publicacion.permanenciaVerificadaAt === null &&
        new Date(publicacion.permanenciaHasta).getTime() > ahora.getTime()
    )
    .map((publicacion) => publicacion.permanenciaHasta)
    .sort()
  return {
    faltanMetricas,
    metricasPendientes: datos.metricas.some(
      (metrica) => metrica.estado === "PENDIENTE"
    ),
    permanenciaHasta: pendientes.at(-1) ?? null,
  }
}

// ── Opciones de resolución ───────────────────────────────────────────────────

export type EfectoAlResolver = Exclude<EfectoResolucion, "descartar">

export interface OpcionResolucion {
  efecto: EfectoAlResolver
  /** `estado_asignacion_resultante` que recibe la BD. */
  estadoResultante: DestinoResolucion
  titulo: string
  /** Qué le pasa a la asignación (y a las partes) si se elige. */
  explicacion: string
  /** Cancelar exige la causa del catálogo. */
  requiereCausa: boolean
  /**
   * Verificar con la permanencia sin cumplir: quien tiene
   * `metricas.editar_validadas` deja constancia manual (con la explicación).
   */
  pideConstancia: boolean
  /** Por qué no se puede elegir ahora; `null` si se puede. */
  bloqueo: string | null
}

export interface ContextoResolucion {
  /** `estado_previo_disputa` de la asignación (de dónde venía). */
  estadoPrevio: EstadoAsignacion | null
  /** La oferta está cerrada o cancelada, o la campaña ya no está activa. */
  ofertaCerrada: boolean
  verificacion: SituacionVerificacion
  /** `metricas.validar`: verificar desde «métricas cargadas» lo exige. */
  puedeVerificar: boolean
  /** `metricas.editar_validadas`: constancia manual de la permanencia. */
  puedeConstanciaManual: boolean
  /** `disputas.plazo_recarga_horas`. */
  plazoRecargaHoras?: number
}

export const BLOQUEO_SIN_PREVIO =
  "No sabemos de qué estado venía la asignación: actualiza la página o revisa su ficha."

export const BLOQUEO_OFERTA_CERRADA =
  "La oferta ya cerró: no se puede reabrir la publicación. Mantén el vencimiento o cancela la asignación."

/*
 * En disputa, las métricas no salen en la cola de validación (`cola_metricas`)
 * y rechazarlas espera a la resolución (hint `en_disputa`): se aprueban desde
 * la ficha de la asignación.
 */
export const BLOQUEO_METRICAS =
  "Faltan métricas por aprobar: apruébalas desde la ficha de la asignación antes de verificar. Si alguna debe corregirse, restaura el estado previo y recházala después."

export const BLOQUEO_PENDIENTES =
  "Hay métricas pendientes de revisión: apruébalas desde la ficha de la asignación antes de verificar. Si alguna debe corregirse, restaura el estado previo y recházala después."

const BLOQUEO_SIN_PERMISO_VERIFICAR =
  "Verificar exige además el permiso de validar métricas."

export function bloqueoPermanencia(hasta: string): string {
  return `Permanencia pendiente hasta el ${formatearFechaHora(hasta)}.`
}

/** Lo que exige el destino VERIFICADA (verificar o restaurar una verificada). */
function exigenciasVerificada(
  contexto: ContextoResolucion,
  { comprobarPermiso }: { comprobarPermiso: boolean }
): { bloqueo: string | null; pideConstancia: boolean } {
  const { verificacion } = contexto
  if (comprobarPermiso && !contexto.puedeVerificar) {
    return { bloqueo: BLOQUEO_SIN_PERMISO_VERIFICAR, pideConstancia: false }
  }
  if (verificacion.faltanMetricas) {
    return { bloqueo: BLOQUEO_METRICAS, pideConstancia: false }
  }
  if (verificacion.metricasPendientes) {
    return { bloqueo: BLOQUEO_PENDIENTES, pideConstancia: false }
  }
  if (verificacion.permanenciaHasta) {
    return contexto.puedeConstanciaManual
      ? { bloqueo: null, pideConstancia: true }
      : {
          bloqueo: bloqueoPermanencia(verificacion.permanenciaHasta),
          pideConstancia: false,
        }
  }
  return { bloqueo: null, pideConstancia: false }
}

function explicacionRestaurar(previo: EstadoAsignacion): string {
  switch (previo) {
    case "VENCIDA_SIN_PUBLICAR":
      return "La asignación sigue vencida: el cupo sigue libre y el medio no recibe pago por ella."
    case "PUBLICADA":
      return "Vuelve a «publicada»: la evidencia sigue esperando la validación del equipo."
    case "EVIDENCIA_VALIDADA":
      return "Vuelve a «evidencia validada»: el medio sigue con sus cortes de métricas (si ya los cargó todos, pasa sola a «métricas cargadas»)."
    case "METRICAS_CARGADAS":
      return "Vuelve a «métricas cargadas»: queda en la cola para verificar."
    case "VERIFICADA":
      return "Vuelve a «verificada»: entra en la próxima liquidación como estaba."
    default:
      return `Vuelve a «${estadoEnFrase(previo)}», el estado que tenía al abrirse la disputa.`
  }
}

/**
 * Destinos de la asignación al resolver, según su estado previo (ADM-012):
 * restaurar el previo, verificar (si venía de «métricas cargadas»), reabrir
 * la publicación (si venía vencida) o cancelar con causa. Espejo de
 * `private.validar_condicion_transicion` para `EN_DISPUTA → x`.
 */
export function opcionesResolucion(
  contexto: ContextoResolucion
): OpcionResolucion[] {
  const previo = contexto.estadoPrevio
  if (!previo || !esDestinoResolucion(previo)) return []
  const plazo = contexto.plazoRecargaHoras ?? PLAZO_RECARGA_POR_DEFECTO
  const opciones: OpcionResolucion[] = []

  const restaurarVerificada =
    previo === "VERIFICADA"
      ? exigenciasVerificada(contexto, { comprobarPermiso: false })
      : { bloqueo: null, pideConstancia: false }
  opciones.push({
    efecto: "restaurar",
    estadoResultante: previo,
    titulo:
      previo === "VENCIDA_SIN_PUBLICAR"
        ? "Mantener el vencimiento"
        : `Restaurar «${estadoEnFrase(previo)}»`,
    explicacion: explicacionRestaurar(previo),
    requiereCausa: false,
    ...restaurarVerificada,
  })

  if (previo === "METRICAS_CARGADAS") {
    opciones.push({
      efecto: "verificar",
      estadoResultante: "VERIFICADA",
      titulo: "Verificar la asignación",
      explicacion:
        "Queda verificada con sus métricas aprobadas y entra en la próxima liquidación del medio.",
      requiereCausa: false,
      ...exigenciasVerificada(contexto, { comprobarPermiso: true }),
    })
  }

  if (previo === "VENCIDA_SIN_PUBLICAR") {
    opciones.push({
      efecto: "reabrir",
      estadoResultante: "CONTENIDO_ENTREGADO",
      titulo: "Reabrir la publicación",
      explicacion: `Le das la razón al medio: vuelve a «contenido descargado», ocupa de nuevo el cupo y el presupuesto, y tiene ${plazo} horas para cargar la evidencia.`,
      requiereCausa: false,
      pideConstancia: false,
      bloqueo: contexto.ofertaCerrada ? BLOQUEO_OFERTA_CERRADA : null,
    })
  }

  opciones.push({
    efecto: "cancelar",
    estadoResultante: "CANCELADA",
    titulo: "Cancelar la asignación",
    explicacion:
      previo === "VENCIDA_SIN_PUBLICAR"
        ? "Queda cancelada con la causa que elijas; el cupo ya estaba libre. Con fraude o incumplimiento cuenta como incumplimiento del medio."
        : "Queda cancelada con la causa que elijas: libera el cupo y el presupuesto, y el medio no recibe pago. Con fraude o incumplimiento cuenta como incumplimiento del medio.",
    requiereCausa: true,
    pideConstancia: false,
    bloqueo: null,
  })
  return opciones
}

// ── Catálogos de la interfaz ─────────────────────────────────────────────────

export const ORDEN_CAUSAS: readonly CausaCancelacion[] = [
  "ADMINISTRATIVA",
  "ACUERDO",
  "INCUMPLIMIENTO_MEDIO",
  "FRAUDE",
]

/** Ayuda de cada causa: qué implica para el medio. */
export const AYUDA_CAUSAS: Readonly<Record<CausaCancelacion, string>> = {
  ADMINISTRATIVA: "Una decisión del equipo AMO que no culpa a ninguna parte.",
  ACUERDO: "El medio y el anunciante acordaron no seguir.",
  INCUMPLIMIENTO_MEDIO:
    "El medio no cumplió: cuenta en su historial de cumplimiento.",
  FRAUDE:
    "Evidencia o métricas falsas: el medio no recibe pago y cuenta como incumplimiento.",
}

export function etiquetaCausa(causa: CausaCancelacion): string {
  return CAUSAS_CANCELACION[causa]
}

/** Redacciones frecuentes de la explicación (un toque llena el campo). */
export const SUGERENCIAS_RESOLUCION: Readonly<
  Record<EfectoAlResolver, readonly string[]>
> = {
  restaurar: [
    "Revisamos las pruebas de ambas partes y la asignación sigue como estaba.",
    "La publicación cumple lo acordado en la oferta.",
  ],
  verificar: [
    "Las métricas coinciden con la captura del panel y la publicación sigue en línea.",
  ],
  reabrir: [
    "El medio demostró que publicó a tiempo: la evidencia no se registró por un error.",
  ],
  cancelar: [
    "Las métricas reportadas no corresponden a la publicación.",
    "El medio retiró la publicación antes del tiempo acordado.",
    "Las partes acordaron no seguir con esta publicación.",
  ],
}

export const SUGERENCIAS_DESCARTE: readonly string[] = [
  "Las pruebas no muestran un incumplimiento: la asignación sigue como estaba.",
  "La disputa no tiene relación con esta asignación.",
  "Las partes ya lo aclararon en la conversación.",
]
