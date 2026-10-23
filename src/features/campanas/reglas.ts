/**
 * Reglas del portal de campañas que la interfaz anticipa (módulo puro): qué
 * acciones ofrecer, cuánto puede bajar el presupuesto, qué fechas respetan las
 * ofertas vivas y qué ofertas piden atención. La autoridad sigue siendo la BD
 * (`fn_campanas_guardar`, `transicionar_srv`, `validar_envio_oferta`); esto
 * solo evita viajes inútiles y explica antes de que falle.
 */
import type { ClavePermiso } from "@/lib/auth/permisos"
import { serializarFecha } from "@/lib/fechas"
import { accionesPermitidas } from "@/lib/negocio/acciones"
import type { TipoActor } from "@/lib/negocio/tipos"

import { motivoSinActivar, ORDEN_ESTADOS_OFERTA } from "./presentacion"
import type {
  EstadoAnunciante,
  EstadoCampana,
  EstadoOferta,
  OfertaDeCampana,
} from "./tipos"

/** Estados en que el anunciante edita su campaña y le crea ofertas (RLS y `fn_ofertas_derivar`). */
export const ESTADOS_EDITABLES: readonly EstadoCampana[] = [
  "BORRADOR",
  "ACTIVA",
]

/**
 * Estados en que la campaña se archiva (`archivar_campana_srv`): sale de «Mis
 * campañas» con sus ofertas en borrador, canceladas o terminadas.
 */
export const ESTADOS_ARCHIVABLES: readonly EstadoCampana[] = [
  "BORRADOR",
  "CANCELADA",
  "FINALIZADA",
]

/** Ofertas cuya ventana deben respetar las fechas de la campaña (`fn_campanas_guardar`). */
export const ESTADOS_OFERTA_VIVOS: readonly EstadoOferta[] = [
  "EN_REVISION",
  "PUBLICADA",
  "CUPOS_COMPLETOS",
  "EN_EJECUCION",
]

const PERMISO_CAMPANAS: ClavePermiso = "campanas.gestionar_propias"
const PERMISO_CAMPANAS_INTERNO: ClavePermiso = "campanas.gestionar"
const PERMISO_OFERTAS: ClavePermiso = "ofertas.gestionar_propias"

export function esEditable(estado: EstadoCampana): boolean {
  return ESTADOS_EDITABLES.includes(estado)
}

// ── Acciones de la ficha ─────────────────────────────────────────────────────

export type AccionCampana = "activar" | "cancelar" | "archivar"

export interface AccionDisponible {
  accion: AccionCampana
  requiereMotivo: boolean
  /** Por qué no se puede hacer todavía (el botón se muestra deshabilitado). */
  bloqueo: string | null
}

const ORDEN_ACCIONES: readonly AccionCampana[] = [
  "activar",
  "cancelar",
  "archivar",
]

/**
 * Lo que se le ofrece a la persona: los cambios de estado de la máquina
 * (`accionesPermitidas`): activar (bloqueado y explicado si la empresa no
 * está verificada) y cancelar una activa (con motivo); y archivar un
 * borrador, una cancelada o una finalizada (`archivar_campana_srv`, sin
 * motivo). Un borrador no se cancela: se archiva.
 */
export function accionesCampana({
  estado,
  tipoActor,
  permisos,
  estadoEmpresa,
}: {
  estado: EstadoCampana
  tipoActor: TipoActor
  permisos: Iterable<string>
  estadoEmpresa: EstadoAnunciante
}): AccionDisponible[] {
  const acciones = accionesPermitidas(
    "campanas",
    estado,
    tipoActor,
    permisos
  ).flatMap<AccionDisponible>(({ hacia, requiereMotivo }) => {
    if (hacia === "ACTIVA") {
      return [
        {
          accion: "activar",
          requiereMotivo,
          bloqueo:
            estadoEmpresa === "VERIFICADO"
              ? null
              : motivoSinActivar(estadoEmpresa),
        },
      ]
    }
    if (hacia === "CANCELADA" && estado !== "BORRADOR") {
      return [{ accion: "cancelar", requiereMotivo, bloqueo: null }]
    }
    return []
  })
  if (puedeArchivarCampana(estado, tipoActor, permisos)) {
    acciones.push({ accion: "archivar", requiereMotivo: false, bloqueo: null })
  }
  return acciones.sort(
    (a, b) =>
      ORDEN_ACCIONES.indexOf(a.accion) - ORDEN_ACCIONES.indexOf(b.accion)
  )
}

function tiene(permisos: Iterable<string>, permiso: ClavePermiso): boolean {
  return new Set(permisos).has(permiso)
}

/**
 * Quién archiva, como lo exige `archivar_campana_srv`: el anunciante sus
 * campañas (`campanas.gestionar_propias`) o el equipo AMO que las gestiona.
 */
export function puedeArchivarCampana(
  estado: EstadoCampana,
  tipoActor: TipoActor,
  permisos: Iterable<string>
): boolean {
  if (!ESTADOS_ARCHIVABLES.includes(estado)) return false
  if (tipoActor === "ANUNCIANTE") return tiene(permisos, PERMISO_CAMPANAS)
  if (tipoActor === "ADMIN") return tiene(permisos, PERMISO_CAMPANAS_INTERNO)
  return false
}

export function puedeEditarCampana(
  estado: EstadoCampana,
  permisos: Iterable<string>
): boolean {
  return esEditable(estado) && tiene(permisos, PERMISO_CAMPANAS)
}

export function puedeCrearOfertas(
  estado: EstadoCampana,
  permisos: Iterable<string>
): boolean {
  return esEditable(estado) && tiene(permisos, PERMISO_OFERTAS)
}

// ── Presupuesto y fechas al editar ───────────────────────────────────────────

/**
 * El presupuesto total no puede quedar por debajo de lo comprometido: lo
 * aceptado por los medios (la BD lo impide) ni lo que ya reservan las ofertas
 * en revisión o publicadas (`total − disponible`), que dejaría a una oferta
 * viva sin respaldo.
 */
export function presupuestoMinimo({
  presupuestoTotal,
  presupuestoComprometido,
  disponible,
}: {
  presupuestoTotal: number
  presupuestoComprometido: number
  disponible: number | null
}): number {
  const reservado =
    disponible === null ? 0 : Math.max(0, presupuestoTotal - disponible)
  return Math.max(presupuestoComprometido, reservado)
}

export interface LimitesFechas {
  /** Último día en que puede empezar (el de la ventana más temprana). */
  inicioMaximo: string | null
  /** Primer día en que puede terminar (el de la ventana más tardía). */
  finMinimo: string | null
}

/**
 * Fechas que respetan las ventanas de las ofertas vivas, como las exige
 * `fn_campanas_guardar`: `ventana_inicio ≥ inicio del día de inicio` y
 * `ventana_fin ≤ inicio del día siguiente al fin` (días de Bogotá). Una
 * ventana que termina justo a medianoche cabe en el día anterior.
 */
export function limitesFechas(
  ofertas: readonly Pick<
    OfertaDeCampana,
    "estado" | "ventanaInicio" | "ventanaFin"
  >[]
): LimitesFechas {
  let inicioMaximo: string | null = null
  let finMinimo: string | null = null
  for (const oferta of ofertas) {
    if (!ESTADOS_OFERTA_VIVOS.includes(oferta.estado)) continue
    const inicio = new Date(oferta.ventanaInicio)
    const fin = new Date(oferta.ventanaFin)
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) continue
    const diaInicio = serializarFecha(inicio)
    const diaFin = serializarFecha(new Date(fin.getTime() - 1))
    if (inicioMaximo === null || diaInicio < inicioMaximo) {
      inicioMaximo = diaInicio
    }
    if (finMinimo === null || diaFin > finMinimo) finMinimo = diaFin
  }
  return { inicioMaximo, finMinimo }
}

// ── Ofertas ──────────────────────────────────────────────────────────────────

/** Devueltas y borradores primero; dentro de cada estado, la fecha límite más próxima. */
export function ordenarOfertas<
  T extends Pick<OfertaDeCampana, "estado" | "fechaLimiteAceptacion">,
>(ofertas: readonly T[]): T[] {
  return [...ofertas].sort(
    (a, b) =>
      ORDEN_ESTADOS_OFERTA.indexOf(a.estado) -
        ORDEN_ESTADOS_OFERTA.indexOf(b.estado) ||
      a.fechaLimiteAceptacion.localeCompare(b.fechaLimiteAceptacion)
  )
}

export type MotivoAtencion = "devuelta" | "envio_vencido" | "envio_proximo"

export interface Atencion<T> {
  oferta: T
  motivo: MotivoAtencion
  /**
   * Hasta cuándo se puede enviar a revisión un borrador (fecha límite menos
   * la anticipación mínima); `null` en las devueltas.
   */
  limiteEnvio: string | null
}

/** Horas antes del límite de envío en que un borrador ya pide atención. */
export const HORAS_AVISO_ENVIO = 72

const MS_HORA = 3_600_000

/**
 * Ofertas que esperan algo del anunciante: las devueltas por la moderación
 * (la más reciente primero) y los borradores cuyo plazo para enviarse a
 * revisión ya pasó o vence pronto (`validar_envio_oferta` exige la
 * anticipación mínima antes de la fecha límite de aceptación).
 */
export function ofertasPorAtender<
  T extends Pick<
    OfertaDeCampana,
    "estado" | "fechaLimiteAceptacion" | "devueltaAt" | "actualizadaAt"
  >,
>(
  ofertas: readonly T[],
  {
    ahora,
    anticipacionHoras,
    horasAviso = HORAS_AVISO_ENVIO,
  }: { ahora: Date; anticipacionHoras: number; horasAviso?: number }
): Atencion<T>[] {
  const devueltas: Atencion<T>[] = []
  const borradores: (Atencion<T> & { instante: number })[] = []
  for (const oferta of ofertas) {
    if (oferta.estado === "DEVUELTA") {
      devueltas.push({ oferta, motivo: "devuelta", limiteEnvio: null })
      continue
    }
    if (oferta.estado !== "BORRADOR") continue
    const limite = Date.parse(oferta.fechaLimiteAceptacion)
    if (Number.isNaN(limite)) continue
    const instante = limite - anticipacionHoras * MS_HORA
    const restante = instante - ahora.getTime()
    if (restante > horasAviso * MS_HORA) continue
    borradores.push({
      oferta,
      motivo: restante <= 0 ? "envio_vencido" : "envio_proximo",
      limiteEnvio: new Date(instante).toISOString(),
      instante,
    })
  }
  const fechaDevolucion = (atencion: Atencion<T>) =>
    atencion.oferta.devueltaAt ?? atencion.oferta.actualizadaAt
  devueltas.sort((a, b) => fechaDevolucion(b).localeCompare(fechaDevolucion(a)))
  borradores.sort((a, b) => a.instante - b.instante)
  return [
    ...devueltas,
    ...borradores.map(({ oferta, motivo, limiteEnvio }) => ({
      oferta,
      motivo,
      limiteEnvio,
    })),
  ]
}
