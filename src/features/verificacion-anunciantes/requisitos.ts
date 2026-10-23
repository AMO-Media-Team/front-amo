/**
 * Requisitos para verificar una empresa anunciante (ADM-003), módulo puro, con
 * las mismas reglas que `private.validar_verificacion_anunciante`:
 *
 * - en Colombia, el RUT y la Cámara de Comercio en `APROBADO` y vigentes
 *   (`fecha_vencimiento` nula o desde hoy);
 * - en el exterior, un documento de existencia de la empresa: Cámara de
 *   Comercio u «Otro documento» equivalente (un certificado bancario no lo es);
 * - en ambos casos, aprobado DESPUÉS del último cambio de la identificación de
 *   la empresa (`identificacion_cambiada_at`): lo aprobado antes ya no la
 *   respalda y debe cargarse y aprobarse de nuevo («desactualizado»).
 *
 * Lo exigido sale de `documentosExigidos(pais)` (contrato del paquete EM). La
 * interfaz solo orienta: la autoridad es la transición en la BD, cuyo detalle
 * dice qué falta.
 */
import {
  documentosExigidos,
  FICHAS_DOCUMENTO_ANUNCIANTE,
  type TipoDocumentoAnunciante,
} from "@/features/documentos-anunciante/catalogo"
import type { SituacionRequisito } from "@/features/verificacion/requisitos"
import type { Database } from "@/types/database.types"

export type { TipoDocumentoAnunciante }

/**
 * Situación de un requisito del anunciante: las de cualquier verificación más
 * `desactualizado` (aprobado antes del último cambio de la identificación).
 */
export type SituacionRequisitoAnunciante = SituacionRequisito | "desactualizado"

export type EstadoDocumento = Database["public"]["Enums"]["documento_estado"]

export interface DocumentoRequisito {
  id: string
  tipo: TipoDocumentoAnunciante
  estado: EstadoDocumento
  /** `YYYY-MM-DD` o `null` si no vence. */
  venceAt: string | null
  subidoAt: string
  /** Cuándo se aprobó o rechazó (lo compara con el cambio de identificación). */
  validadoAt?: string | null
}

/** Orden en que se listan los tipos (el del catálogo de la BD). */
export const ORDEN_TIPOS: readonly TipoDocumentoAnunciante[] = [
  "RUT",
  "CAMARA_COMERCIO",
  "CERT_BANCARIA",
  "OTRO",
]

/** Requisito del exterior: cualquiera de los tipos de `alguno`. */
export const CLAVE_EXISTENCIA = "EXISTENCIA"

export interface Requisito<T extends DocumentoRequisito = DocumentoRequisito> {
  clave: TipoDocumentoAnunciante | typeof CLAVE_EXISTENCIA
  tipos: readonly TipoDocumentoAnunciante[]
  situacion: SituacionRequisitoAnunciante
  /** Documento que decide la situación (el vigente, el que espera o el último). */
  documento: T | null
}

export const TITULO_EXISTENCIA = "Documento de existencia de la empresa"

/** «RUT», «Cámara de Comercio» o «Documento de existencia de la empresa». */
export function tituloRequisito(clave: Requisito["clave"]): string {
  return clave === CLAVE_EXISTENCIA
    ? TITULO_EXISTENCIA
    : FICHAS_DOCUMENTO_ANUNCIANTE[clave].titulo
}

/**
 * ¿Aprobado antes del último cambio de la identificación (`cambioAt`, ISO;
 * `null` si nunca cambió)? Sin fecha de aprobación tampoco consta que sea
 * posterior (así lo trata la BD).
 */
export function aprobadoAntesDelCambio(
  documento: DocumentoRequisito,
  cambioAt: string | null
): boolean {
  if (documento.estado !== "APROBADO" || cambioAt === null) return false
  return (
    !documento.validadoAt ||
    Date.parse(documento.validadoAt) < Date.parse(cambioAt)
  )
}

function sinVencer(documento: DocumentoRequisito, hoy: string): boolean {
  return (
    documento.estado === "APROBADO" &&
    (documento.venceAt === null || documento.venceAt >= hoy)
  )
}

/**
 * ¿Aprobado, sin vencer a la fecha `hoy` (`YYYY-MM-DD` de Bogotá) y posterior
 * al último cambio de la identificación (`cambioAt`)?
 */
export function vigenteEn(
  documento: DocumentoRequisito,
  hoy: string,
  cambioAt: string | null = null
): boolean {
  return (
    sinVencer(documento, hoy) && !aprobadoAntesDelCambio(documento, cambioAt)
  )
}

function masReciente<T extends DocumentoRequisito>(
  documentos: readonly T[]
): T | null {
  return documentos.reduce<T | null>(
    (elegido, documento) =>
      !elegido || documento.subidoAt > elegido.subidoAt ? documento : elegido,
    null
  )
}

/**
 * Situación de un requisito que se cumple con cualquiera de `tipos`.
 * `cambioAt`: último cambio de la identificación de la empresa (ISO).
 */
export function situacionRequisito<T extends DocumentoRequisito>(
  tipos: readonly TipoDocumentoAnunciante[],
  documentos: readonly T[],
  hoy: string,
  cambioAt: string | null = null
): { situacion: SituacionRequisitoAnunciante; documento: T | null } {
  const delTipo = documentos.filter((documento) =>
    tipos.includes(documento.tipo)
  )
  const vigente = masReciente(
    delTipo.filter((d) => vigenteEn(d, hoy, cambioAt))
  )
  if (vigente) return { situacion: "aprobado", documento: vigente }
  const pendiente = masReciente(delTipo.filter((d) => d.estado === "PENDIENTE"))
  if (pendiente) return { situacion: "por_revisar", documento: pendiente }
  const desactualizado = masReciente(
    delTipo.filter(
      (d) => sinVencer(d, hoy) && aprobadoAntesDelCambio(d, cambioAt)
    )
  )
  if (desactualizado) {
    return { situacion: "desactualizado", documento: desactualizado }
  }
  const ultimo = masReciente(delTipo)
  if (!ultimo) return { situacion: "falta", documento: null }
  return {
    situacion: ultimo.estado === "RECHAZADO" ? "rechazado" : "vencido",
    documento: ultimo,
  }
}

/**
 * Requisitos documentales de la empresa según su país. `cambioAt`: último
 * cambio de su identificación (`identificacion_cambiada_at`).
 */
export function requisitosAnunciante<T extends DocumentoRequisito>(
  pais: string,
  documentos: readonly T[],
  hoy: string,
  cambioAt: string | null = null
): Requisito<T>[] {
  const { todos, alguno } = documentosExigidos(pais)
  const requisitos: Requisito<T>[] = todos.map((tipo) => ({
    clave: tipo,
    tipos: [tipo],
    ...situacionRequisito([tipo], documentos, hoy, cambioAt),
  }))
  if (alguno.length > 0) {
    requisitos.push({
      clave: CLAVE_EXISTENCIA,
      tipos: alguno,
      ...situacionRequisito(alguno, documentos, hoy, cambioAt),
    })
  }
  return requisitos
}

export interface ResumenRequisitos {
  cumplidos: number
  total: number
  /** Todo lo exigido está aprobado y vigente: la BD dejará verificar. */
  listos: boolean
  /** Lo exigido que la empresa aún debe cargar o corregir (sin cargar, rechazado, vencido o desactualizado). */
  faltan: readonly Requisito["clave"][]
  /** Lo exigido que espera la revisión del equipo AMO. */
  porRevisar: readonly Requisito["clave"][]
  /** Lo exigido que se aprobó antes del último cambio de la identificación. */
  desactualizados: readonly Requisito["clave"][]
}

export function resumirRequisitos(
  requisitos: readonly Requisito[]
): ResumenRequisitos {
  const cumplidos = requisitos.filter((r) => r.situacion === "aprobado").length
  return {
    cumplidos,
    total: requisitos.length,
    listos: cumplidos === requisitos.length,
    faltan: requisitos
      .filter(
        (r) => r.situacion !== "aprobado" && r.situacion !== "por_revisar"
      )
      .map((r) => r.clave),
    porRevisar: requisitos
      .filter((r) => r.situacion === "por_revisar")
      .map((r) => r.clave),
    desactualizados: requisitos
      .filter((r) => r.situacion === "desactualizado")
      .map((r) => r.clave),
  }
}

// ── Documentos del expediente, por tipo ──────────────────────────────────────

/**
 * - `obligatorio`: lo exige la verificación (RUT y Cámara en Colombia).
 * - `alguno`: basta uno de los de su grupo (Cámara u «Otro» en el exterior).
 * - `adicional`: la empresa lo cargó, pero no se exige.
 */
export type Exigencia = "obligatorio" | "alguno" | "adicional"

export interface FilaDocumentos<T extends DocumentoRequisito> {
  tipo: TipoDocumentoAnunciante
  exigencia: Exigencia
  situacion: SituacionRequisitoAnunciante
  /** Documento que decide la situación (`null` si no hay ninguno). */
  principal: T | null
  /**
   * Carga más reciente que espera revisión. Puede no ser la principal: un
   * reemplazo de un documento aún vigente queda por revisar sin cambiar la
   * situación del tipo.
   */
  porRevisar: T | null
  /** Las demás cargas del tipo, de la más reciente a la más antigua. */
  historial: T[]
}

function filaDocumentos<T extends DocumentoRequisito>(
  tipo: TipoDocumentoAnunciante,
  exigencia: Exigencia,
  documentos: readonly T[],
  hoy: string,
  cambioAt: string | null
): FilaDocumentos<T> {
  const delTipo = documentos
    .filter((documento) => documento.tipo === tipo)
    .sort((a, b) => b.subidoAt.localeCompare(a.subidoAt))
  const { situacion, documento: principal } = situacionRequisito(
    [tipo],
    delTipo,
    hoy,
    cambioAt
  )
  const porRevisar = masReciente(
    delTipo.filter((documento) => documento.estado === "PENDIENTE")
  )
  return {
    tipo,
    exigencia,
    situacion,
    principal,
    porRevisar,
    historial: delTipo.filter(
      (documento) => documento !== principal && documento !== porRevisar
    ),
  }
}

/**
 * Una fila por tipo: primero lo exigido (todos y luego los «alguno»), después
 * lo demás que la empresa cargó, cada grupo en el orden del catálogo.
 */
export function filasDocumentos<T extends DocumentoRequisito>(
  pais: string,
  documentos: readonly T[],
  hoy: string,
  cambioAt: string | null = null
): FilaDocumentos<T>[] {
  const { todos, alguno } = documentosExigidos(pais)
  const cargados = new Set(documentos.map((documento) => documento.tipo))
  const exigencia = (tipo: TipoDocumentoAnunciante): Exigencia | null => {
    if (todos.includes(tipo)) return "obligatorio"
    if (alguno.includes(tipo)) return "alguno"
    return cargados.has(tipo) ? "adicional" : null
  }
  const orden: Exigencia[] = ["obligatorio", "alguno", "adicional"]
  return ORDEN_TIPOS.flatMap((tipo) => {
    const valor = exigencia(tipo)
    return valor ? [{ tipo, exigencia: valor }] : []
  })
    .sort((a, b) => orden.indexOf(a.exigencia) - orden.indexOf(b.exigencia))
    .map(({ tipo, exigencia: valor }) =>
      filaDocumentos(tipo, valor, documentos, hoy, cambioAt)
    )
}

/** Primer tipo exigido que la empresa aún debe cargar (para proponerlo al cargar). */
export function tipoSugerido(
  pais: string,
  documentos: readonly DocumentoRequisito[],
  hoy: string,
  cambioAt: string | null = null
): TipoDocumentoAnunciante {
  const pendiente = requisitosAnunciante(pais, documentos, hoy, cambioAt).find(
    (requisito) =>
      requisito.situacion !== "aprobado" &&
      requisito.situacion !== "por_revisar"
  )
  return pendiente?.tipos[0] ?? ORDEN_TIPOS[0]
}
