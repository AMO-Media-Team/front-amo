/**
 * Textos de «Mi medio › Cuentas sociales» (módulo puro): el aviso de cada
 * tarjeta según el estado de la cuenta, el resumen de la página y el formato
 * del código. Escritos para el medio: qué pasa, por qué importa y qué hacer.
 */
import type { Plataforma, Tono } from "@/features/operacion/estados"
import { formatearHandle } from "@/features/operacion/formato"
import { formatearFecha, formatearNumero } from "@/lib/format"

import {
  codigoVencido,
  esElegible,
  type EstadoCuenta,
  requiereAccion,
} from "./estado-cuenta"
import { enFrase, franjaPara } from "./franjas"
import type {
  CuentaMedio,
  FranjaSeguidores,
  MetodoVerificacion,
  ParametrosVerificacion,
  VerificacionCuentaMedio,
} from "./tipos"

export type IconoAviso =
  "revision" | "captura" | "vencido" | "rechazo" | "verificar" | "plazo"

export interface AvisoCuenta {
  icono: IconoAviso
  tono: Tono
  titulo: string
  descripcion: string
  /** Fecha límite que se muestra con cuenta regresiva (código de la historia). */
  venceAt: string | null
}

function dias(n: number): string {
  return n === 1 ? "1 día" : `${formatearNumero(n)} días`
}

/** «Falta 1 día» / «Faltan 3 días». */
function faltan(n: number): string {
  return `${n === 1 ? "Falta" : "Faltan"} ${dias(n)}`
}

function seguidores(n: number): string {
  return n === 1 ? "1 seguidor" : `${formatearNumero(n)} seguidores`
}

function avisoEnCurso(
  estado: EstadoCuenta,
  cuenta: Pick<CuentaMedio, "handle" | "verificada">
): AvisoCuenta | null {
  const { enCurso } = estado
  if (!enCurso) return null
  const { verificacion } = enCurso
  const que = cuenta.verificada ? "la reverificación" : "tu verificación"
  switch (enCurso.tipo) {
    case "revision":
      return {
        icono: "revision",
        tono: "info",
        titulo: `Estamos revisando ${que}`,
        descripcion: `La enviaste el ${formatearFecha(verificacion.creadaAt)} con ${seguidores(verificacion.seguidoresReportados)}. Te avisaremos cuando la revisemos.`,
        venceAt: null,
      }
    case "esperando_captura":
      return verificacion.metodo === "CODIGO_HISTORIA"
        ? {
            icono: "captura",
            tono: "aviso",
            titulo: "Falta la captura de la historia",
            descripcion: `Publica el código en una historia de ${formatearHandle(cuenta.handle)} y carga la captura antes de que venza.`,
            venceAt: verificacion.codigoExpiraAt,
          }
        : {
            icono: "captura",
            tono: "aviso",
            titulo: "Falta la captura del panel",
            descripcion:
              "Carga la captura de las estadísticas de la cuenta para enviar la verificación.",
            venceAt: null,
          }
    case "codigo_vencido":
      return {
        icono: "vencido",
        tono: "aviso",
        titulo: "El código venció sin la captura",
        descripcion:
          "Genera un código nuevo para terminar la verificación, o envía una captura del panel de estadísticas.",
        venceAt: null,
      }
  }
}

function avisoRechazo(
  estado: EstadoCuenta,
  verificada: boolean
): AvisoCuenta | null {
  if (!estado.rechazo) return null
  const motivo = estado.rechazo.observaciones?.trim().replace(/[.\s]+$/, "")
  return {
    icono: "rechazo",
    tono: "peligro",
    titulo: verificada
      ? "No aprobamos la reverificación"
      : "No aprobamos la verificación",
    descripcion: motivo
      ? `Motivo: ${motivo}. Corrígelo y vuelve a intentarlo.`
      : "Vuelve a intentarlo con una captura clara en la que se vean la cuenta y los seguidores.",
    venceAt: null,
  }
}

function avisoVigencia(
  estado: EstadoCuenta,
  parametros: Pick<ParametrosVerificacion, "diasGracia">
): AvisoCuenta | null {
  const { vigencia, diasRestantes } = estado
  switch (vigencia.vigencia) {
    case "sin_verificar":
      return {
        icono: "verificar",
        tono: "neutro",
        titulo: "Verifica esta cuenta",
        descripcion:
          "Solo las cuentas verificadas reciben ofertas. Te toma unos minutos: un código en una historia o una captura de tus estadísticas.",
        venceAt: null,
      }
    case "por_vencer":
      return {
        icono: "plazo",
        tono: "aviso",
        titulo: `Reverifícala antes del ${formatearFecha(vigencia.venceAt)}`,
        descripcion: `${diasRestantes !== null ? `${faltan(diasRestantes)}. ` : ""}Si vence, tienes ${dias(parametros.diasGracia)} de gracia; después la cuenta deja de recibir ofertas hasta que la reverifiques.`,
        venceAt: null,
      }
    case "en_gracia":
      return {
        icono: "plazo",
        tono: "aviso",
        titulo: `La verificación venció el ${formatearFecha(vigencia.venceAt)}`,
        descripcion: `Sigue recibiendo ofertas hasta el ${formatearFecha(vigencia.elegibleHasta)}${diasRestantes !== null ? ` (${faltan(diasRestantes).toLocaleLowerCase("es-CO")})` : ""}. Reverifícala ya para no perderlas.`,
        venceAt: null,
      }
    case "vencida":
      return {
        icono: "vencido",
        tono: "peligro",
        titulo: "La verificación venció",
        descripcion: `Desde el ${formatearFecha(vigencia.elegibleHasta)} esta cuenta no recibe ofertas. Reverifícala para volver a recibirlas.`,
        venceAt: null,
      }
    case "vigente":
      return null
  }
}

/**
 * El aviso más importante de la tarjeta: la verificación en curso; si no hay,
 * el último rechazo; si no, lo que pide la vigencia. Una cuenta al día no
 * lleva aviso (sus fechas ya se ven en los datos).
 */
export function avisoCuenta(
  estado: EstadoCuenta,
  cuenta: Pick<CuentaMedio, "handle" | "verificada">,
  parametros: Pick<ParametrosVerificacion, "diasGracia">
): AvisoCuenta | null {
  return (
    avisoEnCurso(estado, cuenta) ??
    avisoRechazo(estado, cuenta.verificada) ??
    avisoVigencia(estado, parametros)
  )
}

/** «Vence el 12 de nov de 2026 · en 9 días» (o por qué no aplica). */
export function textoVigencia(estado: EstadoCuenta): string {
  const { vigencia, diasRestantes } = estado
  switch (vigencia.vigencia) {
    case "sin_verificar":
      return "Sin verificar"
    case "vencida":
      return `Venció el ${formatearFecha(vigencia.venceAt)}`
    case "en_gracia":
      return `Venció el ${formatearFecha(vigencia.venceAt)} · gracia hasta el ${formatearFecha(vigencia.elegibleHasta)}`
    default:
      return `Vence el ${formatearFecha(vigencia.venceAt)}${diasRestantes !== null ? ` · en ${dias(diasRestantes)}` : ""}`
  }
}

// ── Resumen de la página ────────────────────────────────────────────────────

export interface ResumenCuentas {
  total: number
  /** Reciben ofertas hoy (verificadas, también en gracia). */
  elegibles: number
  enRevision: number
  /** Piden algo al medio (verificar, reverificar, cargar captura…). */
  pendientes: number
}

export function resumirCuentas(
  estados: readonly Pick<EstadoCuenta, "principal" | "enCurso">[]
): ResumenCuentas {
  return {
    total: estados.length,
    elegibles: estados.filter((e) => esElegible(e.principal)).length,
    enRevision: estados.filter((e) => e.enCurso?.tipo === "revision").length,
    pendientes: estados.filter(
      (e) =>
        e.enCurso?.tipo !== "revision" &&
        (requiereAccion(e.principal) || e.enCurso !== null)
    ).length,
  }
}

/** Frase del resumen para lectores de pantalla y el subtítulo. */
export function fraseResumen(resumen: ResumenCuentas): string {
  if (resumen.total === 0) return "Aún no registras cuentas."
  const partes = [
    `${resumen.elegibles} de ${resumen.total} ${resumen.total === 1 ? "cuenta recibe" : "cuentas reciben"} ofertas`,
    resumen.enRevision > 0 ? `${resumen.enRevision} en revisión` : null,
    resumen.pendientes > 0
      ? `${resumen.pendientes} ${resumen.pendientes === 1 ? "necesita" : "necesitan"} tu atención`
      : null,
  ].filter(Boolean)
  return `${partes.join(" · ")}.`
}

// ── Código ──────────────────────────────────────────────────────────────────

/** «K7P4XQ» → «K7P 4XQ»: dos grupos, más fáciles de copiar a mano. */
export function agruparCodigo(codigo: string): string {
  const mitad = Math.ceil(codigo.length / 2)
  return codigo.length > 4
    ? `${codigo.slice(0, mitad)} ${codigo.slice(mitad)}`
    : codigo
}

/** Cómo lo deletrea un lector de pantalla: «K, 7, P, 4, X, Q». */
export function deletrearCodigo(codigo: string): string {
  return codigo.split("").join(", ")
}

// ── Métodos e historial ─────────────────────────────────────────────────────

/** Cómo se nombra cada método de verificación ante el medio. */
export const METODOS_VERIFICACION: Readonly<
  Record<MetodoVerificacion, { etiqueta: string; descripcion: string }>
> = {
  CODIGO_HISTORIA: {
    etiqueta: "Código en una historia",
    descripcion:
      "Te damos un código, lo publicas en una historia de la cuenta y nos envías la captura.",
  },
  MANUAL: {
    etiqueta: "Captura de estadísticas",
    descripcion:
      "Nos envías una captura del panel de la cuenta donde se vean el usuario, los seguidores y la fecha.",
  },
  API: {
    etiqueta: "Conexión con la red social",
    descripcion: "AMO leyó los seguidores directamente de la red social.",
  },
}

/** Estado de un intento en el historial, contado al medio. */
export function estadoIntento(
  verificacion: Pick<
    VerificacionCuentaMedio,
    "estado" | "tieneCaptura" | "metodo" | "codigoExpiraAt"
  >,
  ahora: Date
): { etiqueta: string; tono: Tono } {
  switch (verificacion.estado) {
    case "APROBADA":
      return { etiqueta: "Aprobada", tono: "exito" }
    case "RECHAZADA":
      return { etiqueta: "No aprobada", tono: "peligro" }
    case "PENDIENTE":
      if (verificacion.tieneCaptura) {
        return { etiqueta: "En revisión", tono: "info" }
      }
      return codigoVencido(verificacion, ahora)
        ? { etiqueta: "Código vencido", tono: "neutro" }
        : { etiqueta: "Falta la captura", tono: "aviso" }
  }
}

/**
 * Seguidores del intento: los que verificó AMO si ya lo revisó; si no, los
 * que reportó el medio.
 */
export function seguidoresIntento(
  verificacion: Pick<
    VerificacionCuentaMedio,
    "seguidoresReportados" | "seguidoresVerificados"
  >
): string {
  return verificacion.seguidoresVerificados !== null
    ? `${seguidores(verificacion.seguidoresVerificados)} verificados`
    : `${seguidores(verificacion.seguidoresReportados)} reportados`
}

// ── Franja según los seguidores ─────────────────────────────────────────────

export interface PistaFranja {
  tono: Tono
  texto: string
}

/**
 * Qué significan los seguidores que escribe el medio: por debajo del umbral
 * la cuenta no recibe ofertas; por encima, en qué franja quedaría (la decide
 * AMO con los seguidores que verifique).
 */
export function pistaFranja(
  cantidad: number | null,
  franjas: readonly FranjaSeguidores[],
  umbral: number
): PistaFranja | null {
  if (cantidad === null || !Number.isInteger(cantidad) || cantidad <= 0) {
    return null
  }
  if (cantidad < umbral) {
    return {
      tono: "aviso",
      texto: `Las cuentas con menos de ${seguidores(umbral)} no reciben ofertas. Puedes verificarla igual y volver a hacerlo cuando crezca.`,
    }
  }
  const franja = franjaPara(cantidad, franjas)
  return franja
    ? {
        tono: "info",
        texto: `Con ${seguidores(cantidad)} quedaría en la franja ${enFrase(franja.nombre)}. La franja final depende de los seguidores que verifiquemos.`,
      }
    : null
}

/** «30.000 – 60.000 seguidores · 60.001 – 120.000 · Más de 120.000». */
export function describirFranjas(
  franjas: readonly Pick<FranjaSeguidores, "nombre">[]
): string {
  return franjas.map((franja) => franja.nombre).join(" · ")
}

/** Dónde encuentra cada red el panel de estadísticas con los seguidores. */
export const INSTRUCCIONES_ESTADISTICAS: Readonly<Record<Plataforma, string>> =
  {
    INSTAGRAM:
      "En Instagram, abre tu perfil y entra a «Panel profesional» › «Estadísticas».",
    FACEBOOK:
      "En Facebook, abre tu página y entra a «Panel profesional» o a Meta Business Suite › «Estadísticas».",
    TIKTOK:
      "En TikTok, abre tu perfil y entra a «Herramientas para creadores» › «Estadísticas».",
  }

// ── Acción principal de la tarjeta ──────────────────────────────────────────

export type TipoAccionPrincipal =
  | "cargar_captura"
  | "pedir_codigo"
  | "cambiar_captura"
  | "verificar"
  | "reverificar"

export interface AccionPrincipal {
  tipo: TipoAccionPrincipal
  etiqueta: string
  /** Botón primario (pide algo al medio) o secundario (opcional). */
  destacada: boolean
}

/**
 * El botón grande de la tarjeta: lo que el medio debería hacer ahora. Todas
 * abren la hoja de verificación, que empieza en el paso que corresponde. Una
 * cuenta al día o en revisión no lleva botón (reverificar antes de tiempo
 * queda en el menú).
 */
export function accionPrincipal(
  estado: Pick<EstadoCuenta, "principal" | "enCurso" | "acciones" | "rechazo">
): AccionPrincipal | null {
  const { enCurso, acciones, principal, rechazo } = estado
  if (enCurso?.tipo === "esperando_captura") {
    return {
      tipo: "cargar_captura",
      etiqueta: "Cargar la captura",
      destacada: true,
    }
  }
  if (enCurso?.tipo === "codigo_vencido") {
    return {
      tipo: "pedir_codigo",
      etiqueta: "Pedir un código nuevo",
      destacada: true,
    }
  }
  if (enCurso?.tipo === "revision") {
    return acciones.reemplazarCaptura
      ? {
          tipo: "cambiar_captura",
          etiqueta: "Cambiar la captura",
          destacada: false,
        }
      : null
  }
  if (acciones.verificar === "verificar") {
    return {
      tipo: "verificar",
      etiqueta:
        principal === "rechazada" ? "Verificar de nuevo" : "Verificar cuenta",
      destacada: true,
    }
  }
  if (
    acciones.verificar === "reverificar" &&
    (requiereAccion(principal) || rechazo !== null)
  ) {
    return {
      tipo: "reverificar",
      etiqueta: rechazo ? "Reverificar de nuevo" : "Reverificar",
      destacada: true,
    }
  }
  return null
}
