/**
 * Textos de «Mi medio › Cuentas sociales» (módulo puro): el aviso de cada
 * tarjeta según el estado de la cuenta, el resumen de la página y el formato
 * del código. Escritos para el medio: qué pasa, por qué importa y qué hacer.
 */
import type { Tono } from "@/features/operacion/estados"
import { formatearHandle } from "@/features/operacion/formato"
import { formatearFecha, formatearNumero } from "@/lib/format"

import {
  esElegible,
  type EstadoCuenta,
  requiereAccion,
} from "./estado-cuenta"
import type { CuentaMedio, ParametrosVerificacion } from "./tipos"

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

function avisoRechazo(estado: EstadoCuenta, verificada: boolean): AvisoCuenta | null {
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
        descripcion: `${diasRestantes !== null ? `Faltan ${dias(diasRestantes)}. ` : ""}Si vence, tienes ${dias(parametros.diasGracia)} de gracia; después la cuenta deja de recibir ofertas hasta que la reverifiques.`,
        venceAt: null,
      }
    case "en_gracia":
      return {
        icono: "plazo",
        tono: "aviso",
        titulo: `La verificación venció el ${formatearFecha(vigencia.venceAt)}`,
        descripcion: `Sigue recibiendo ofertas hasta el ${formatearFecha(vigencia.elegibleHasta)}${diasRestantes !== null ? ` (quedan ${dias(diasRestantes)})` : ""}. Reverifícala ya para no perderlas.`,
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
