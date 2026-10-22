/**
 * Estado de cada cuenta social vista por su medio (módulo puro): vigencia de
 * la verificación (igual que `private.cuenta_vigente`), la verificación en
 * curso, el último rechazo y lo que el medio puede hacer ahora. Se calcula en
 * el cliente con la hora del dispositivo, así el vencimiento de un código o de
 * una verificación se refleja sin recargar.
 */
import {
  type ResultadoVigencia,
  vigenciaVerificacion,
} from "@/features/operacion/calculos"
import {
  ORDEN_PLATAFORMAS,
  type PresentacionEstado,
} from "@/features/operacion/estados"

import type {
  CuentaMedio,
  FranjaSeguidores,
  ParametrosVerificacion,
  VerificacionCuentaMedio,
} from "./tipos"

const MS_DIA = 86_400_000

// ── Verificación en curso ───────────────────────────────────────────────────

export type VerificacionEnCurso =
  | {
      /** Con captura: espera la revisión del equipo AMO. */
      tipo: "revision"
      verificacion: VerificacionCuentaMedio
      /** MANUAL siempre; CODIGO_HISTORIA solo mientras el código no venza. */
      puedeReemplazar: boolean
    }
  | {
      /** Sin captura todavía (el código sigue vigente, o una MANUAL incompleta). */
      tipo: "esperando_captura"
      verificacion: VerificacionCuentaMedio
    }
  | {
      /** El código venció sin captura: hay que generar otro. */
      tipo: "codigo_vencido"
      verificacion: VerificacionCuentaMedio
    }

export function codigoVencido(
  verificacion: Pick<VerificacionCuentaMedio, "metodo" | "codigoExpiraAt">,
  ahora: Date
): boolean {
  return (
    verificacion.metodo === "CODIGO_HISTORIA" &&
    verificacion.codigoExpiraAt !== null &&
    ahora.getTime() >= new Date(verificacion.codigoExpiraAt).getTime()
  )
}

/** La verificación PENDIENTE (la BD admite una por cuenta) y en qué punto está. */
export function verificacionEnCurso(
  verificaciones: readonly VerificacionCuentaMedio[],
  ahora: Date
): VerificacionEnCurso | null {
  const verificacion = verificaciones.find((v) => v.estado === "PENDIENTE")
  if (!verificacion) return null
  const vencido = codigoVencido(verificacion, ahora)
  if (verificacion.tieneCaptura) {
    return {
      tipo: "revision",
      verificacion,
      puedeReemplazar:
        verificacion.metodo === "MANUAL" ||
        (verificacion.metodo === "CODIGO_HISTORIA" && !vencido),
    }
  }
  return vencido
    ? { tipo: "codigo_vencido", verificacion }
    : { tipo: "esperando_captura", verificacion }
}

/**
 * Último intento resuelto si fue un rechazo y no hay otro en curso: lo que el
 * medio debe corregir. Un rechazo anterior a una aprobación ya no cuenta.
 */
export function ultimoRechazo(
  verificaciones: readonly VerificacionCuentaMedio[]
): VerificacionCuentaMedio | null {
  if (verificaciones.some((v) => v.estado === "PENDIENTE")) return null
  const ultima = verificaciones.find((v) => v.estado !== "PENDIENTE")
  return ultima?.estado === "RECHAZADA" ? ultima : null
}

// ── Estado principal ────────────────────────────────────────────────────────

export type EstadoPrincipal =
  | "vigente"
  | "por_vencer"
  | "en_gracia"
  | "vencida"
  | "en_revision"
  | "incompleta"
  | "rechazada"
  | "sin_verificar"

/** Cómo se nombra cada estado ante el medio (la descripción va de ayuda). */
export const ESTADOS_CUENTA_MEDIO: Readonly<
  Record<EstadoPrincipal, PresentacionEstado>
> = {
  vigente: {
    etiqueta: "Verificada",
    tono: "exito",
    descripcion: "Recibe ofertas de su franja de seguidores.",
  },
  por_vencer: {
    etiqueta: "Por vencer",
    tono: "aviso",
    descripcion:
      "La verificación vence pronto: reverifícala para seguir recibiendo ofertas.",
  },
  en_gracia: {
    etiqueta: "En periodo de gracia",
    tono: "aviso",
    descripcion:
      "La verificación venció; recibe ofertas solo unos días más. Reverifícala ya.",
  },
  vencida: {
    etiqueta: "Verificación vencida",
    tono: "peligro",
    descripcion: "No recibe ofertas hasta que la reverifiques.",
  },
  en_revision: {
    etiqueta: "En revisión",
    tono: "info",
    descripcion: "El equipo de AMO está revisando la verificación.",
  },
  incompleta: {
    etiqueta: "Falta la captura",
    tono: "aviso",
    descripcion: "La verificación no se envía hasta que cargues la captura.",
  },
  rechazada: {
    etiqueta: "No aprobada",
    tono: "peligro",
    descripcion: "Revisa el motivo y vuelve a intentarlo.",
  },
  sin_verificar: {
    etiqueta: "Sin verificar",
    tono: "neutro",
    descripcion: "Verifícala para empezar a recibir ofertas.",
  },
}

export type AccionVerificar = "verificar" | "reverificar"

export interface AccionesCuenta {
  /** Cambiar usuario o enlace (la BD lo impide en una cuenta verificada). */
  editarPerfil: boolean
  /** La tarifa de referencia se puede cambiar siempre. */
  editarTarifa: boolean
  quitar: boolean
  /** Empezar una verificación nueva (o reverificar); `null` si hay una en revisión. */
  verificar: AccionVerificar | null
  /** Cargar la captura de una verificación que la espera. */
  cargarCaptura: boolean
  /** Sustituir la captura de una verificación aún en revisión. */
  reemplazarCaptura: boolean
}

export interface EstadoCuenta {
  principal: EstadoPrincipal
  vigencia: ResultadoVigencia
  enCurso: VerificacionEnCurso | null
  rechazo: VerificacionCuentaMedio | null
  /**
   * Días que faltan para que venza la verificación (o, en gracia, para dejar
   * de ser elegible); `null` sin verificación vigente.
   */
  diasRestantes: number | null
  acciones: AccionesCuenta
}

function diasHasta(limite: Date | null, ahora: Date): number | null {
  if (!limite) return null
  const restante = limite.getTime() - ahora.getTime()
  return restante > 0 ? Math.ceil(restante / MS_DIA) : null
}

function principalDe(
  vigencia: ResultadoVigencia,
  enCurso: VerificacionEnCurso | null,
  rechazo: VerificacionCuentaMedio | null
): EstadoPrincipal {
  if (vigencia.vigencia !== "sin_verificar") return vigencia.vigencia
  if (enCurso?.tipo === "revision") return "en_revision"
  if (enCurso) return "incompleta"
  if (rechazo) return "rechazada"
  return "sin_verificar"
}

function accionesDe(
  cuenta: Pick<CuentaMedio, "verificada">,
  enCurso: VerificacionEnCurso | null
): AccionesCuenta {
  const enRevision = enCurso?.tipo === "revision"
  const libre = !cuenta.verificada && !enRevision
  return {
    editarPerfil: libre,
    editarTarifa: true,
    quitar: libre,
    verificar: enRevision
      ? null
      : cuenta.verificada
        ? "reverificar"
        : "verificar",
    cargarCaptura: enCurso?.tipo === "esperando_captura",
    reemplazarCaptura: enCurso?.tipo === "revision" && enCurso.puedeReemplazar,
  }
}

/** Todo lo que la tarjeta de una cuenta necesita saber en el instante `ahora`. */
export function estadoCuenta(
  cuenta: Pick<
    CuentaMedio,
    "verificada" | "ultimaVerificacionAt" | "verificaciones"
  >,
  parametros: Pick<ParametrosVerificacion, "diasVigencia" | "diasGracia">,
  ahora: Date
): EstadoCuenta {
  const vigencia = vigenciaVerificacion(
    cuenta.verificada ? cuenta.ultimaVerificacionAt : null,
    parametros.diasVigencia,
    parametros.diasGracia,
    ahora
  )
  const enCurso = verificacionEnCurso(cuenta.verificaciones, ahora)
  const rechazo = ultimoRechazo(cuenta.verificaciones)
  const limite =
    vigencia.vigencia === "en_gracia" ? vigencia.elegibleHasta : vigencia.venceAt
  return {
    principal: principalDe(vigencia, enCurso, rechazo),
    vigencia,
    enCurso,
    rechazo,
    diasRestantes:
      vigencia.vigencia === "vencida" ? null : diasHasta(limite, ahora),
    acciones: accionesDe(cuenta, enCurso),
  }
}

/** Estados que piden algo al medio (para el resumen de la página). */
const REQUIEREN_ACCION: ReadonlySet<EstadoPrincipal> = new Set([
  "por_vencer",
  "en_gracia",
  "vencida",
  "incompleta",
  "rechazada",
  "sin_verificar",
])

export function requiereAccion(principal: EstadoPrincipal): boolean {
  return REQUIEREN_ACCION.has(principal)
}

/** ¿La cuenta puede recibir ofertas hoy? (verificada y dentro de vigencia + gracia). */
export function esElegible(principal: EstadoPrincipal): boolean {
  return (
    principal === "vigente" ||
    principal === "por_vencer" ||
    principal === "en_gracia"
  )
}

// ── Franjas ─────────────────────────────────────────────────────────────────

/** Franja que corresponde a unos seguidores (como `fn_cuentas_sociales_franja`). */
export function franjaPara(
  seguidores: number,
  franjas: readonly FranjaSeguidores[]
): FranjaSeguidores | null {
  return (
    [...franjas]
      .sort((a, b) => a.seguidoresMin - b.seguidoresMin)
      .find(
        (franja) =>
          seguidores >= franja.seguidoresMin &&
          seguidores <= (franja.seguidoresMax ?? Number.POSITIVE_INFINITY)
      ) ?? null
  )
}

// ── Orden ───────────────────────────────────────────────────────────────────

/** Instagram, Facebook y TikTok; dentro de cada red, por fecha de registro. */
export function ordenarCuentas<
  T extends Pick<CuentaMedio, "plataforma" | "creadaAt">,
>(cuentas: readonly T[]): T[] {
  return [...cuentas].sort(
    (a, b) =>
      ORDEN_PLATAFORMAS.indexOf(a.plataforma) -
        ORDEN_PLATAFORMAS.indexOf(b.plataforma) ||
      a.creadaAt.localeCompare(b.creadaAt)
  )
}
