/**
 * Situación de los documentos de la empresa (módulo puro): a partir de todas
 * sus cargas de un tipo, qué está vigente, qué espera revisión y qué debe
 * corregir, y cuánto falta de lo que exige la verificación. Sigue las reglas
 * de la BD: para ENVIAR a verificación basta con tener cargado (pendiente o
 * aprobado y vigente) lo exigido (`enviar_anunciante_a_verificacion_srv`);
 * para VERIFICAR, aprobado y vigente (`validar_verificacion_anunciante`).
 * Una carga nueva no borra la anterior: mientras se revisa, la aprobada sigue
 * valiendo. Lo aprobado antes del último cambio de la identificación de la
 * empresa (`identificacion_cambiada_at`) ya no la respalda: no cuenta ni para
 * enviar ni para verificar, y hay que cargarlo de nuevo.
 */
import {
  DIAS_AVISO_VENCIMIENTO,
  diasEntre,
} from "@/features/mi-medio/requisitos"
import type { Tono } from "@/features/operacion/estados"

import {
  documentosExigidos,
  FICHAS_DOCUMENTO_ANUNCIANTE,
  fichaDocumento,
  type TipoDocumentoAnunciante,
} from "./catalogo"
import type { DocumentoAnunciante } from "./tipos"

export { DIAS_AVISO_VENCIMIENTO }

export type Situacion =
  | { tipo: "falta" }
  | {
      tipo: "en-revision"
      /** La carga que espera revisión (la más reciente). */
      documento: DocumentoAnunciante
      /** La aprobada que sigue valiendo mientras tanto, si la hay. */
      vigente: DocumentoAnunciante | null
    }
  | {
      tipo: "aprobado"
      documento: DocumentoAnunciante
      /** Días que le quedan (0 = vence hoy); `null` sin fecha de vencimiento. */
      diasParaVencer: number | null
      porVencer: boolean
      /** Un reemplazo posterior que fue rechazado (el aprobado sigue valiendo). */
      reemplazoRechazado: DocumentoAnunciante | null
    }
  | { tipo: "rechazado"; documento: DocumentoAnunciante }
  | { tipo: "vencido"; documento: DocumentoAnunciante }
  /** Aprobado antes de que cambiara la identificación de la empresa. */
  | { tipo: "desactualizado"; documento: DocumentoAnunciante }

export type TipoSituacion = Situacion["tipo"]

const SIN_CARGAR: Situacion = { tipo: "falta" }

/**
 * Aprobado antes del último cambio de la identificación de la empresa
 * (`cambioAt`, ISO; `null` si nunca cambió): ya no la respalda. Sin fecha de
 * revisión tampoco consta que sea posterior (así lo trata la BD).
 */
export function aprobadoAntesDelCambio(
  documento: Pick<DocumentoAnunciante, "estado" | "revisadoAt">,
  cambioAt: string | null
): boolean {
  if (documento.estado !== "APROBADO" || cambioAt === null) return false
  return (
    documento.revisadoAt === null ||
    Date.parse(documento.revisadoAt) < Date.parse(cambioAt)
  )
}

function dentroDeVigencia(
  documento: DocumentoAnunciante,
  hoy: string
): boolean {
  return (
    documento.estado === "APROBADO" &&
    (documento.venceEl === null || documento.venceEl >= hoy)
  )
}

/**
 * Aprobado, dentro de su vigencia el día `hoy` (`YYYY-MM-DD` de Bogotá) y
 * posterior al último cambio de la identificación (`cambioAt`).
 */
export function estaVigente(
  documento: DocumentoAnunciante,
  hoy: string,
  cambioAt: string | null = null
): boolean {
  return (
    dentroDeVigencia(documento, hoy) &&
    !aprobadoAntesDelCambio(documento, cambioAt)
  )
}

function masRecientePrimero(
  a: DocumentoAnunciante,
  b: DocumentoAnunciante
): number {
  return Date.parse(b.cargadoAt) - Date.parse(a.cargadoAt)
}

function aprobado(
  vigente: DocumentoAnunciante,
  cargas: readonly DocumentoAnunciante[],
  hoy: string
): Situacion {
  const diasParaVencer =
    vigente.venceEl === null ? null : diasEntre(hoy, vigente.venceEl)
  const reemplazoRechazado =
    cargas.find(
      (carga) =>
        carga.estado === "RECHAZADO" &&
        Date.parse(carga.cargadoAt) > Date.parse(vigente.cargadoAt)
    ) ?? null
  return {
    tipo: "aprobado",
    documento: vigente,
    diasParaVencer,
    porVencer:
      diasParaVencer !== null && diasParaVencer <= DIAS_AVISO_VENCIMIENTO,
    reemplazoRechazado,
  }
}

/**
 * Situación de un tipo a partir de TODAS sus cargas (en cualquier orden).
 * `cambioAt`: último cambio de la identificación de la empresa (ISO).
 */
export function situacionDe(
  cargas: readonly DocumentoAnunciante[],
  hoy: string,
  cambioAt: string | null = null
): Situacion {
  const ordenadas = [...cargas].sort(masRecientePrimero)
  const ultima = ordenadas[0]
  if (!ultima) return SIN_CARGAR
  const vigente =
    ordenadas.find((carga) => estaVigente(carga, hoy, cambioAt)) ?? null
  if (ultima.estado === "PENDIENTE") {
    return { tipo: "en-revision", documento: ultima, vigente }
  }
  if (vigente) return aprobado(vigente, ordenadas, hoy)
  // Aprobado y vigente, pero de antes del cambio de identificación: se pide
  // de nuevo aunque después le hayan rechazado un reemplazo.
  const desactualizado = ordenadas.find(
    (carga) =>
      dentroDeVigencia(carga, hoy) && aprobadoAntesDelCambio(carga, cambioAt)
  )
  if (desactualizado) {
    return { tipo: "desactualizado", documento: desactualizado }
  }
  if (ultima.estado === "RECHAZADO") {
    return { tipo: "rechazado", documento: ultima }
  }
  // VENCIDO, o APROBADO con la fecha ya pasada (el proceso diario aún no lo marcó).
  return { tipo: "vencido", documento: ultima }
}

export type SituacionesPorTipo = ReadonlyMap<TipoDocumentoAnunciante, Situacion>

/** Situación de cada tipo que tiene al menos una carga. */
export function situacionesPorTipo(
  documentos: readonly DocumentoAnunciante[],
  hoy: string,
  cambioAt: string | null = null
): SituacionesPorTipo {
  const porTipo = new Map<TipoDocumentoAnunciante, DocumentoAnunciante[]>()
  for (const documento of documentos) {
    porTipo.set(documento.tipo, [
      ...(porTipo.get(documento.tipo) ?? []),
      documento,
    ])
  }
  return new Map(
    [...porTipo].map(([tipo, cargas]) => [
      tipo,
      situacionDe(cargas, hoy, cambioAt),
    ])
  )
}

export function situacionDeTipo(
  situaciones: SituacionesPorTipo,
  tipo: TipoDocumentoAnunciante
): Situacion {
  return situaciones.get(tipo) ?? SIN_CARGAR
}

// ── Requisitos de la verificación ───────────────────────────────────────────

/**
 * - `aprobado`: aprobado y vigente (también con un reemplazo en revisión).
 * - `en-revision`: cargado, espera la revisión del equipo AMO.
 * - `por-corregir`: rechazado, vencido o aprobado antes del cambio de la
 *   identificación: hay que cargarlo de nuevo.
 * - `falta`: sin cargar.
 */
export type EstadoRequisito =
  "aprobado" | "en-revision" | "por-corregir" | "falta"

export interface RequisitoDocumental {
  /** El tipo exigido o `existencia` (el grupo «uno de» del exterior). */
  id: TipoDocumentoAnunciante | "existencia"
  /** Tipos que lo cumplen (uno solo, o los del grupo). */
  tipos: readonly TipoDocumentoAnunciante[]
  estado: EstadoRequisito
  /** Aprobado que vence dentro de `DIAS_AVISO_VENCIMIENTO` días. */
  porVencer: boolean
  /** Cómo se nombra en una frase («el RUT»). */
  enFrase: string
  /** Cómo se nombra en una lista («RUT»). */
  titulo: string
}

/** Nombre del grupo del exterior: el mismo que usa el `detail` de la BD. */
export const EXISTENCIA_EN_FRASE = "un documento de existencia de la empresa"

function estadoRequisito(situacion: Situacion): EstadoRequisito {
  switch (situacion.tipo) {
    case "aprobado":
      return "aprobado"
    case "en-revision":
      return situacion.vigente ? "aprobado" : "en-revision"
    case "rechazado":
    case "vencido":
    case "desactualizado":
      return "por-corregir"
    case "falta":
      return "falta"
  }
}

function porVencer(situacion: Situacion): boolean {
  return situacion.tipo === "aprobado" && situacion.porVencer
}

/** De mejor a peor: así un grupo «uno de» toma el mejor de sus documentos. */
const RANGO: Readonly<Record<EstadoRequisito, number>> = {
  aprobado: 0,
  "en-revision": 1,
  "por-corregir": 2,
  falta: 3,
}

/**
 * Lo que exige la verificación, en el orden en que se muestra: en Colombia un
 * requisito por documento (RUT y Cámara de Comercio); en el exterior, uno solo
 * que se cumple con cualquiera del grupo (su equivalente a la Cámara u «Otro»).
 */
export function requisitosDocumentales(
  pais: string,
  situaciones: SituacionesPorTipo
): RequisitoDocumental[] {
  const { todos, alguno } = documentosExigidos(pais)
  const individuales = todos.map((tipo): RequisitoDocumental => {
    const situacion = situacionDeTipo(situaciones, tipo)
    const ficha = fichaDocumento(tipo, pais)
    return {
      id: tipo,
      tipos: [tipo],
      estado: estadoRequisito(situacion),
      porVencer: porVencer(situacion),
      enFrase: ficha.enFrase,
      titulo: ficha.titulo,
    }
  })
  if (alguno.length === 0) return individuales
  const mejor = [...alguno]
    .map((tipo) => situacionDeTipo(situaciones, tipo))
    .sort((a, b) => RANGO[estadoRequisito(a)] - RANGO[estadoRequisito(b)])[0]
  const grupo: RequisitoDocumental = {
    id: "existencia",
    tipos: alguno,
    estado: mejor ? estadoRequisito(mejor) : "falta",
    porVencer: mejor ? porVencer(mejor) : false,
    enFrase: EXISTENCIA_EN_FRASE,
    titulo: "Documento de existencia",
  }
  return [...individuales, grupo]
}

// ── Resumen de la lista ──────────────────────────────────────────────────────

export interface ResumenDocumentos {
  /** Requisitos que exige la verificación. */
  total: number
  /** Aprobados y vigentes (también los que están por vencer). */
  aprobados: number
  enRevision: number
  /** Rechazados, vencidos o desactualizados: hay que cargarlos de nuevo. */
  porCorregir: number
  /** Sin ninguna carga. */
  faltan: number
  porVencer: number
  /** Todo lo exigido está aprobado y vigente. */
  completo: boolean
  /** Todo lo exigido está cargado (aprobado o en revisión): ya se puede enviar. */
  listoParaEnviar: boolean
  /** Lo que impide enviar (sin cargar, rechazado, vencido o desactualizado), en orden. */
  pendientes: readonly RequisitoDocumental[]
}

export function resumirDocumentos(
  requisitos: readonly RequisitoDocumental[]
): ResumenDocumentos {
  const contar = (estado: EstadoRequisito) =>
    requisitos.filter((requisito) => requisito.estado === estado).length
  const aprobados = contar("aprobado")
  const enRevision = contar("en-revision")
  const total = requisitos.length
  return {
    total,
    aprobados,
    enRevision,
    porCorregir: contar("por-corregir"),
    faltan: contar("falta"),
    porVencer: requisitos.filter((requisito) => requisito.porVencer).length,
    completo: total > 0 && aprobados === total,
    listoParaEnviar: total > 0 && aprobados + enRevision === total,
    pendientes: requisitos.filter(
      (requisito) =>
        requisito.estado === "falta" || requisito.estado === "por-corregir"
    ),
  }
}

/**
 * Tipos que se listan aparte de los exigidos: los opcionales del país y
 * cualquier otro que ya tenga cargas (p. ej. tras un cambio de país).
 */
export function tiposOpcionales(
  exigidos: readonly TipoDocumentoAnunciante[],
  opcionales: readonly TipoDocumentoAnunciante[],
  documentos: readonly DocumentoAnunciante[]
): TipoDocumentoAnunciante[] {
  const conCargas = new Set(documentos.map((documento) => documento.tipo))
  return (
    Object.keys(FICHAS_DOCUMENTO_ANUNCIANTE) as TipoDocumentoAnunciante[]
  ).filter(
    (tipo) =>
      !exigidos.includes(tipo) &&
      (opcionales.includes(tipo) || conCargas.has(tipo))
  )
}

// ── Presentación ─────────────────────────────────────────────────────────────

export type AccionDocumento = "cargar" | "cargar-de-nuevo" | "reemplazar"

export interface PresentacionSituacion {
  etiqueta: string
  tono: Tono
  /** Botón principal de la tarjeta. */
  accion: AccionDocumento
  /** La tarjeta pide atención (falta, rechazo, vencimiento). */
  requiereAccion: boolean
}

export const TEXTO_ACCION: Readonly<Record<AccionDocumento, string>> = {
  cargar: "Cargar",
  "cargar-de-nuevo": "Cargar de nuevo",
  reemplazar: "Reemplazar",
}

function textoVencimiento(dias: number): string {
  if (dias <= 0) return "Vence hoy"
  if (dias === 1) return "Vence mañana"
  return `Vence en ${dias} días`
}

/**
 * Etiqueta, tono y acción de la tarjeta. Un documento opcional sin cargar se
 * ofrece sin pedir atención.
 */
export function presentarSituacion(
  situacion: Situacion,
  { exigido = true }: { exigido?: boolean } = {}
): PresentacionSituacion {
  switch (situacion.tipo) {
    case "falta":
      return {
        etiqueta: exigido ? "Sin cargar" : "Opcional",
        tono: "neutro",
        accion: "cargar",
        requiereAccion: exigido,
      }
    case "en-revision":
      return {
        etiqueta: situacion.vigente ? "Reemplazo en revisión" : "En revisión",
        tono: "info",
        accion: "reemplazar",
        requiereAccion: false,
      }
    case "aprobado":
      return {
        etiqueta:
          situacion.porVencer && situacion.diasParaVencer !== null
            ? textoVencimiento(situacion.diasParaVencer)
            : "Aprobado",
        tono: situacion.porVencer ? "aviso" : "exito",
        accion: "reemplazar",
        requiereAccion: situacion.porVencer,
      }
    case "rechazado":
      return {
        etiqueta: "Rechazado",
        tono: "peligro",
        accion: "cargar-de-nuevo",
        requiereAccion: true,
      }
    case "vencido":
      return {
        etiqueta: "Vencido",
        tono: "peligro",
        accion: "cargar-de-nuevo",
        requiereAccion: exigido,
      }
    case "desactualizado":
      return {
        etiqueta: "Desactualizado",
        tono: "aviso",
        accion: "cargar-de-nuevo",
        requiereAccion: exigido,
      }
  }
}
