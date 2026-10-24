/**
 * Presentación de las liquidaciones (módulo puro): periodos, retenciones
 * agrupadas con su tarifa, la situación del documento del pago, por qué no se
 * puede aprobar o anular y los textos de seguridad social y del corte. Los RF
 * piden literales: «Seguridad social pendiente», «Documento soporte
 * requerido».
 */
import type { Tono } from "@/features/operacion/estados"
import {
  contar,
  formatearFechaCompacta,
  formatearRangoCompacto,
  formatearVigencia,
  instanteDeDia,
} from "@/features/operacion/formato"
import { formatearFecha, formatearNumero } from "@/lib/format"

import type {
  AlertaPendiente,
  DispersionResumen,
  DocumentoResumen,
  EstadoLiquidacion,
  PoliticaSegSocial,
  ResultadoAprobacion,
  ResultadoCorteMedio,
  RetencionAplicada,
  RetencionLiquidacion,
  SoportePago,
} from "./tipos"

// ── Periodo ──────────────────────────────────────────────────────────────────

/** «1 – 15 oct 2026» (tablas). */
export function periodoCompacto(inicio: string, fin: string): string {
  return formatearRangoCompacto(instanteDeDia(inicio), instanteDeDia(fin))
}

/** «1 de oct – 15 de oct de 2026» (ficha y diálogos). */
export function periodoLargo(inicio: string, fin: string): string {
  return formatearVigencia(inicio, fin)
}

/** Un día `AAAA-MM-DD` en formato largo («15 de octubre de 2026»). */
export function diaLargo(dia: string): string {
  return formatearFecha(instanteDeDia(dia), "largo")
}

// ── Soporte del pago y avisos ────────────────────────────────────────────────

export const ETIQUETAS_SOPORTE: Readonly<Record<SoportePago, string>> = {
  DOCUMENTO_SOPORTE: "Documento soporte",
  FACTURA: "Factura del medio",
}

export const AYUDA_SOPORTE: Readonly<Record<SoportePago, string>> = {
  DOCUMENTO_SOPORTE:
    "El medio no factura: AMO emite el documento soporte del pago.",
  FACTURA: "El medio factura: debe cargar su factura antes del pago.",
}

export function soporteDe(requiereDocumentoSoporte: boolean): SoportePago {
  return requiereDocumentoSoporte ? "DOCUMENTO_SOPORTE" : "FACTURA"
}

export const ETIQUETAS_ALERTA: Readonly<Record<AlertaPendiente, string>> = {
  DATOS_PAGO: "Datos de pago incompletos",
  SEG_SOCIAL: "Seguridad social pendiente",
}

export const AYUDA_ALERTA: Readonly<Record<AlertaPendiente, string>> = {
  DATOS_PAGO:
    "Falta la cuenta, el titular o la certificación aprobada después del último cambio: no podrá entrar al archivo de pagos.",
  SEG_SOCIAL:
    "Supera el umbral mensual de ingresos sin seguridad social aprobada y vigente.",
}

export interface SituacionSoporte {
  etiqueta: string
  tono: Tono
  /** Hay documento soporte emitido o factura del medio registrada: se puede pagar. */
  listo: boolean
}

/** Cómo va el documento del pago: documento soporte (si no factura) o factura del medio. */
export function situacionSoporte(fila: {
  requiereDocumentoSoporte: boolean
  documento: DocumentoResumen | null
  numeroFacturaMedio: string | null
}): SituacionSoporte {
  if (!fila.requiereDocumentoSoporte) {
    return fila.numeroFacturaMedio
      ? {
          etiqueta: `Factura ${fila.numeroFacturaMedio}`,
          tono: "exito",
          listo: true,
        }
      : { etiqueta: "Falta la factura del medio", tono: "aviso", listo: false }
  }
  const documento = fila.documento
  if (documento?.estado === "EMITIDO") {
    return {
      etiqueta: documento.numero
        ? `Documento soporte ${documento.numero}`
        : "Documento soporte emitido",
      tono: "exito",
      listo: true,
    }
  }
  if (documento?.estado === "ANULADO") {
    return {
      etiqueta: "Documento soporte anulado",
      tono: "neutro",
      listo: false,
    }
  }
  return {
    etiqueta: "Documento soporte por emitir",
    tono: "aviso",
    listo: false,
  }
}

/** Texto del archivo de pagos de una liquidación (lista y ficha). */
export function textoDispersion(dispersion: DispersionResumen | null): string {
  if (!dispersion) return "Sin archivo de pagos"
  return dispersion.fecha
    ? `En el archivo del ${formatearFechaCompacta(dispersion.fecha)}`
    : "En un archivo de pagos"
}

// ── Aprobar (D17) y anular (D38) ─────────────────────────────────────────────

export const BLOQUEO_GENERADA_POR_MI =
  "La generaste tú: otra persona del equipo debe aprobarla."

export const BLOQUEO_NO_BORRADOR =
  "Ya no está en borrador: la página muestra su estado actual."

/** Por qué quien mira no puede aprobarla (`null` si puede). */
export function bloqueoAprobacion(
  fila: { estado: EstadoLiquidacion; generadaPorMi: boolean },
  superadmin: boolean
): string | null {
  if (fila.estado !== "BORRADOR") return BLOQUEO_NO_BORRADOR
  if (fila.generadaPorMi && !superadmin) return BLOQUEO_GENERADA_POR_MI
  return null
}

/** Solo se anula un borrador o una aprobada (una pagada ya no). */
export function sePuedeAnular(estado: EstadoLiquidacion): boolean {
  return estado === "BORRADOR" || estado === "APROBADA"
}

/**
 * D38 del RF: un documento soporte ya transmitido a la DIAN (con CUDS) se
 * corrige con su nota de ajuste antes de anular la liquidación.
 */
export function requiereNotaAjuste(
  documento: DocumentoResumen | null
): boolean {
  return (
    documento?.estado === "EMITIDO" &&
    documento.conCuds &&
    !documento.conNotaAjuste
  )
}

export const TEXTO_REQUIERE_NOTA_AJUSTE =
  "Su documento soporte ya se transmitió a la DIAN: registra la nota de ajuste en la sección «Documento soporte» y después anula la liquidación."

/** Advertencia del diálogo de anulación si ya salió en un archivo de pagos. */
export function avisoAnulacion(
  dispersion: DispersionResumen | null
): string | null {
  if (!dispersion) return null
  return dispersion.fecha
    ? `Ya está en el archivo de pagos del ${formatearFecha(dispersion.fecha, "largo")}: confirma con tesorería que el banco no la pagó.`
    : "Ya está en un archivo de pagos: confirma con tesorería que el banco no la pagó."
}

// ── Retenciones (LIQ-002) ────────────────────────────────────────────────────

const NOMBRES_RETENCION: Readonly<Record<string, string>> = {
  RETEFUENTE: "Retención en la fuente",
  RETEIVA: "Retención de IVA",
  RETEICA: "Retención de ICA",
}

const CONCEPTOS: Readonly<Record<string, string>> = {
  SERVICIOS: "servicios",
  HONORARIOS: "honorarios",
  PUBLICIDAD: "publicidad",
}

/** «Retención en la fuente · servicios», «Retención de ICA · Pasto». */
export function nombreRetencion(
  retencion: Pick<RetencionLiquidacion, "tipo" | "concepto" | "municipio">
): string {
  const nombre = NOMBRES_RETENCION[retencion.tipo] ?? retencion.tipo
  if (retencion.tipo === "RETEICA") {
    return retencion.municipio ? `${nombre} · ${retencion.municipio}` : nombre
  }
  const concepto = retencion.concepto
    ? (CONCEPTOS[retencion.concepto] ??
      retencion.concepto.toLocaleLowerCase("es-CO").replaceAll("_", " "))
    : null
  return concepto ? `${nombre} · ${concepto}` : nombre
}

function decimalesNecesarios(valor: number): number {
  const redondeado = Math.round(valor * 100) / 100
  if (Number.isInteger(redondeado)) return 0
  return Number.isInteger(redondeado * 10) ? 1 : 2
}

/** ReteICA por mil («9,66 ‰»); las demás en porcentaje («6 %», «2,5 %»). */
export function formatearTarifa(tipo: string, tarifa: number): string {
  if (!Number.isFinite(tarifa)) return "—"
  const [valor, unidad] =
    tipo === "RETEICA" ? [tarifa * 1000, "‰"] : [tarifa * 100, "%"]
  return `${formatearNumero(valor, decimalesNecesarios(valor))} ${unidad}`
}

function numero(valor: unknown): number | null {
  const convertido = typeof valor === "string" ? Number(valor) : valor
  return typeof convertido === "number" && Number.isFinite(convertido)
    ? convertido
    : null
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null
}

/**
 * Lee `asignacion_montos.retenciones_aplicadas` (jsonb que escribe
 * `generar_liquidacion_srv`). Descarta lo que no tenga tipo, tarifa o valor.
 */
export function leerRetenciones(json: unknown): RetencionAplicada[] {
  if (!Array.isArray(json)) return []
  return json.flatMap((elemento): RetencionAplicada[] => {
    if (!elemento || typeof elemento !== "object") return []
    const registro = elemento as Record<string, unknown>
    const tipo = texto(registro.tipo)
    const tarifa = numero(registro.tarifa)
    const valor = numero(registro.valor)
    if (!tipo || tarifa === null || valor === null) return []
    const base = numero(registro.base) ?? 0
    return [
      {
        tipo,
        concepto: texto(registro.concepto),
        tarifa,
        base,
        basePago: numero(registro.base_pago) ?? base,
        valor,
        municipioCodigo: texto(registro.municipio_codigo),
      },
    ]
  })
}

const ORDEN_TIPOS = ["RETEFUENTE", "RETEIVA", "RETEICA"]

function posicionTipo(tipo: string): number {
  const posicion = ORDEN_TIPOS.indexOf(tipo)
  return posicion === -1 ? ORDEN_TIPOS.length : posicion
}

/**
 * Las retenciones de la liquidación: cada regla se prorratea por asignación;
 * aquí se vuelven a sumar. La base es la del pago completo (la que decidió la
 * cuantía mínima), el valor la suma de lo retenido a cada asignación.
 */
export function agruparRetenciones(
  porAsignacion: readonly (readonly RetencionAplicada[])[]
): Omit<RetencionLiquidacion, "municipio">[] {
  const grupos = new Map<string, Omit<RetencionLiquidacion, "municipio">>()
  for (const retenciones of porAsignacion) {
    for (const retencion of retenciones) {
      const clave = [
        retencion.tipo,
        retencion.concepto ?? "",
        retencion.municipioCodigo ?? "",
        retencion.tarifa,
      ].join("|")
      const previo = grupos.get(clave)
      if (previo) {
        previo.valor += retencion.valor
        previo.base = Math.max(previo.base, retencion.basePago)
      } else {
        grupos.set(clave, {
          clave,
          tipo: retencion.tipo,
          concepto: retencion.concepto,
          tarifa: retencion.tarifa,
          base: retencion.basePago,
          valor: retencion.valor,
          municipioCodigo: retencion.municipioCodigo,
        })
      }
    }
  }
  return [...grupos.values()].sort(
    (a, b) =>
      posicionTipo(a.tipo) - posicionTipo(b.tipo) ||
      a.clave.localeCompare(b.clave)
  )
}

// ── Seguridad social (LIQ-007) ───────────────────────────────────────────────

export interface TextoSegSocial {
  titulo: string
  politica: string
  queHacer: string
  /** Con la política BLOQUEAR, aprobarla falla hasta que el medio la cargue. */
  bloquea: boolean
}

export function textoSegSocial(politica: PoliticaSegSocial): TextoSegSocial {
  const comun =
    "Pide al medio que cargue su planilla de seguridad social vigente en «Mi medio › Documentos»; al aprobar se vuelve a evaluar."
  return politica === "BLOQUEAR"
    ? {
        titulo: "Seguridad social pendiente",
        politica:
          "La política vigente bloquea la aprobación: el medio supera el umbral mensual de ingresos sin seguridad social aprobada y vigente.",
        queHacer: comun,
        bloquea: true,
      }
    : {
        titulo: "Seguridad social pendiente",
        politica:
          "La política vigente solo alerta: el medio supera el umbral mensual de ingresos sin seguridad social aprobada y vigente, pero puedes aprobarla.",
        queHacer: comun,
        bloquea: false,
      }
}

// ── Resultados en lote ───────────────────────────────────────────────────────

export interface ResumenLote {
  correctas: number
  fallidas: number
  /** Frase para el aviso y para lectores de pantalla. */
  texto: string
}

/** «Se generaron 4 liquidaciones; 1 medio quedó por fuera.» */
export function resumirCorte(
  resultados: readonly ResultadoCorteMedio[]
): ResumenLote {
  const correctas = resultados.filter((r) => r.liquidacionId !== null).length
  const fallidas = resultados.length - correctas
  if (resultados.length === 0) {
    return {
      correctas,
      fallidas,
      texto: "Ningún medio tenía asignaciones verificadas en ese periodo.",
    }
  }
  const generadas =
    correctas === 0
      ? "No se generó ninguna liquidación"
      : correctas === 1
        ? "Se generó 1 liquidación"
        : `Se generaron ${formatearNumero(correctas)} liquidaciones`
  const porFuera =
    fallidas === 0
      ? ""
      : `; ${contar(fallidas, "medio quedó", "medios quedaron")} por fuera`
  return { correctas, fallidas, texto: `${generadas}${porFuera}.` }
}

/** «Se aprobaron 3 liquidaciones; 1 no se pudo aprobar.» */
export function resumirAprobacion(
  resultados: readonly ResultadoAprobacion[]
): ResumenLote {
  const correctas = resultados.filter((r) => r.ok).length
  const fallidas = resultados.length - correctas
  const aprobadas =
    correctas === 0
      ? "No se aprobó ninguna liquidación"
      : correctas === 1
        ? "Se aprobó 1 liquidación"
        : `Se aprobaron ${formatearNumero(correctas)} liquidaciones`
  const pendientes =
    fallidas === 0
      ? ""
      : `; ${contar(fallidas, "no se pudo aprobar", "no se pudieron aprobar")}`
  return { correctas, fallidas, texto: `${aprobadas}${pendientes}.` }
}

// ── Aviso del estado en la ficha ─────────────────────────────────────────────

export interface AvisoEstado {
  tono: Tono
  titulo: string
  texto: string
}

/** Qué significa el estado para quien mira la ficha y qué sigue. */
export function avisoEstado(
  liquidacion: {
    estado: EstadoLiquidacion
    generadaPorMi: boolean
    aprobadaAt: string | null
    anuladaAt: string | null
    fechaPago: string | null
    requiereDocumentoSoporte: boolean
    documento: DocumentoResumen | null
    numeroFacturaMedio: string | null
    dispersion: DispersionResumen | null
  },
  superadmin: boolean
): AvisoEstado {
  switch (liquidacion.estado) {
    case "BORRADOR":
      return {
        tono: "info",
        titulo: "En borrador: falta aprobarla",
        texto:
          liquidacion.generadaPorMi && !superadmin
            ? BLOQUEO_GENERADA_POR_MI
            : "Revisa los montos, las retenciones y la seguridad social antes de aprobarla.",
      }
    case "APROBADA": {
      const titulo = liquidacion.aprobadaAt
        ? `Aprobada el ${formatearFecha(liquidacion.aprobadaAt, "largo")}: pendiente de pago`
        : "Aprobada: pendiente de pago"
      const { listo } = situacionSoporte(liquidacion)
      const texto = !listo
        ? liquidacion.requiereDocumentoSoporte
          ? "Documento soporte requerido: emítelo para poder pagarla."
          : "Falta la factura del medio para poder pagarla."
        : liquidacion.dispersion
          ? "Ya está en el archivo de pagos: falta registrar el pago con su soporte."
          : "Lista para el archivo de pagos y el registro del pago."
      return { tono: "info", titulo, texto }
    }
    case "PAGADA":
      return {
        tono: "exito",
        titulo: liquidacion.fechaPago
          ? `Pagada el ${diaLargo(liquidacion.fechaPago)}`
          : "Pagada",
        texto:
          "El medio ve el pago, su soporte y el documento del pago en Ganancias.",
      }
    case "ANULADA":
      return {
        tono: "neutro",
        titulo: liquidacion.anuladaAt
          ? `Anulada el ${formatearFecha(liquidacion.anuladaAt, "largo")}`
          : "Anulada",
        texto:
          "Sus asignaciones volvieron a verificadas y entran en el próximo corte.",
      }
  }
}

/** «20 %» de comisión sobre el bruto (`null` sin bruto). */
export function porcentajeComision(
  bruto: number,
  comision: number
): string | null {
  if (!(bruto > 0)) return null
  const porcentaje = (comision / bruto) * 100
  return `${formatearNumero(porcentaje, decimalesNecesarios(porcentaje))} %`
}
