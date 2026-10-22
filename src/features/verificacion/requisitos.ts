/**
 * Lista de requisitos para verificar un medio en un nivel (módulo puro), con
 * las mismas reglas que `private.validar_verificacion_medio`:
 *
 * - cada documento de `niveles_verificacion.documentos_requeridos` en
 *   `APROBADO` y vigente (`fecha_vencimiento` nula o desde hoy),
 * - el certificado del medio de pago (bancario o de billetera) en las mismas
 *   condiciones, y
 * - al aprobar desde PENDIENTE, una cuenta social verificada y vigente.
 *
 * El equipo AMO no lee el método de pago sin revelarlo (bitácora), así que
 * aquí cualquiera de los dos certificados cuenta; si no es el de su método, la
 * BD lo rechaza y su detalle lo dice. La interfaz solo orienta: la autoridad
 * es la transición en la BD.
 */
import type { Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

export type TipoDocumentoMedio = Enums["documento_medio_tipo"]
export type EstadoDocumento = Enums["documento_estado"]
export type MetodoDocumento = "ARCHIVO" | "VIDEOLLAMADA"

export interface DocumentoRequisito {
  id: string
  tipo: TipoDocumentoMedio
  estado: EstadoDocumento
  metodo: MetodoDocumento
  /** `YYYY-MM-DD` o `null` si no vence. */
  venceAt: string | null
  subidoAt: string
}

export interface NivelRequisitos {
  nivel: number
  nombre: string
  documentosRequeridos: readonly TipoDocumentoMedio[]
}

export type SituacionRequisito =
  | "aprobado"
  | "por_revisar"
  | "rechazado"
  | "vencido"
  | "falta"

export const CLAVE_CERTIFICADO_PAGO = "CERT_PAGO"

export const TIPOS_CERTIFICADO_PAGO: readonly TipoDocumentoMedio[] = [
  "CERT_BANCARIA",
  "CERT_BILLETERA",
]

export interface Requisito {
  /** Tipo de documento o `CERT_PAGO` (cualquiera de los dos certificados). */
  clave: TipoDocumentoMedio | typeof CLAVE_CERTIFICADO_PAGO
  tipos: readonly TipoDocumentoMedio[]
  situacion: SituacionRequisito
  /** Documento que decide la situación (el vigente, el que espera o el último). */
  documento: DocumentoRequisito | null
}

/** ¿Aprobado y sin vencer a la fecha `hoy` (`YYYY-MM-DD` de Bogotá)? */
export function vigenteEn(documento: DocumentoRequisito, hoy: string): boolean {
  return (
    documento.estado === "APROBADO" &&
    (documento.venceAt === null || documento.venceAt >= hoy)
  )
}

function masReciente(
  documentos: readonly DocumentoRequisito[]
): DocumentoRequisito | null {
  return documentos.reduce<DocumentoRequisito | null>(
    (elegido, documento) =>
      !elegido || documento.subidoAt > elegido.subidoAt ? documento : elegido,
    null
  )
}

/** Situación de un requisito que se cumple con cualquiera de `tipos`. */
export function situacionRequisito(
  tipos: readonly TipoDocumentoMedio[],
  documentos: readonly DocumentoRequisito[],
  hoy: string
): Pick<Requisito, "situacion" | "documento"> {
  const delTipo = documentos.filter((documento) =>
    tipos.includes(documento.tipo)
  )
  const vigente = masReciente(delTipo.filter((d) => vigenteEn(d, hoy)))
  if (vigente) return { situacion: "aprobado", documento: vigente }
  const pendiente = masReciente(delTipo.filter((d) => d.estado === "PENDIENTE"))
  if (pendiente) return { situacion: "por_revisar", documento: pendiente }
  const ultimo = masReciente(delTipo)
  if (!ultimo) return { situacion: "falta", documento: null }
  return {
    situacion: ultimo.estado === "RECHAZADO" ? "rechazado" : "vencido",
    documento: ultimo,
  }
}

/** Requisitos documentales de un nivel, en el orden de la configuración. */
export function requisitosDelNivel(
  nivel: NivelRequisitos,
  documentos: readonly DocumentoRequisito[],
  hoy: string
): Requisito[] {
  const porTipo = nivel.documentosRequeridos.map(
    (tipo): Requisito => ({
      clave: tipo,
      tipos: [tipo],
      ...situacionRequisito([tipo], documentos, hoy),
    })
  )
  return [
    ...porTipo,
    {
      clave: CLAVE_CERTIFICADO_PAGO,
      tipos: TIPOS_CERTIFICADO_PAGO,
      ...situacionRequisito(TIPOS_CERTIFICADO_PAGO, documentos, hoy),
    },
  ]
}

export interface ResumenRequisitos {
  cumplidos: number
  total: number
  pendientes: readonly Requisito[]
  /** Documentos al día; la cuenta vigente se evalúa aparte. */
  documentosListos: boolean
}

export function resumirRequisitos(
  requisitos: readonly Requisito[]
): ResumenRequisitos {
  const pendientes = requisitos.filter((r) => r.situacion !== "aprobado")
  return {
    cumplidos: requisitos.length - pendientes.length,
    total: requisitos.length,
    pendientes,
    documentosListos: pendientes.length === 0,
  }
}

/** Nivel más alto cuyos documentos ya están al día (`null` si ninguno). */
export function nivelMaximoListo(
  niveles: readonly NivelRequisitos[],
  documentos: readonly DocumentoRequisito[],
  hoy: string
): number | null {
  const listos = niveles
    .filter(
      (nivel) =>
        resumirRequisitos(requisitosDelNivel(nivel, documentos, hoy))
          .documentosListos
    )
    .map((nivel) => nivel.nivel)
  return listos.length > 0 ? Math.max(...listos) : null
}

/**
 * Nivel que se propone al abrir la decisión: el actual si ya está verificado
 * (para cambiarlo hay que elegir otro), si no el más alto listo o el 1.
 */
export function nivelPropuesto(
  niveles: readonly NivelRequisitos[],
  documentos: readonly DocumentoRequisito[],
  hoy: string,
  nivelActual: number
): number {
  const listo = nivelMaximoListo(niveles, documentos, hoy)
  if (nivelActual > 0) {
    const otros = niveles.filter((nivel) => nivel.nivel !== nivelActual)
    return (
      otros.find((nivel) => nivel.nivel === listo)?.nivel ??
      otros[0]?.nivel ??
      nivelActual
    )
  }
  return listo ?? niveles[0]?.nivel ?? 1
}

/** ¿Hay una prueba de vida aprobada y vigente (por archivo o videollamada)? */
export function tienePruebaDeVida(
  documentos: readonly DocumentoRequisito[],
  hoy: string
): boolean {
  return documentos.some(
    (documento) => documento.tipo === "PRUEBA_VIDA" && vigenteEn(documento, hoy)
  )
}
