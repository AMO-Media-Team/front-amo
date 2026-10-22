/**
 * Documentos que exige cada nivel de verificación del medio y en qué va cada
 * uno (módulo puro). Replica la regla de `private.validar_verificacion_medio`:
 * para verificar en un nivel hacen falta, aprobados y vigentes, los
 * `documentos_requeridos` del nivel más el certificado del medio de pago
 * (bancario o de billetera). La BD vuelve a validarlo todo al decidir.
 */
import type { Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

export type TipoDocumentoMedio = Enums["documento_medio_tipo"]
export type EstadoDocumento = Enums["documento_estado"]
export type EstadoMedio = Enums["medio_estado"]
export type MetodoPago = Enums["metodo_pago"]

/** Niveles de `niveles_verificacion` (CHECK `medios_nivel_chk`: 0–3). */
export const NIVEL_MAXIMO = 3

/**
 * Prueba de vida: dato biométrico facultativo. Se puede reemplazar por una
 * videollamada con el equipo AMO, que la registra durante la revisión.
 */
export const DOCUMENTO_FACULTATIVO: TipoDocumentoMedio = "PRUEBA_VIDA"

/** Días antes del vencimiento desde los que un documento se marca «por vencer». */
export const DIAS_AVISO_VENCIMIENTO = 30

const CERTIFICADO_POR_METODO: Readonly<Record<MetodoPago, TipoDocumentoMedio>> =
  {
    BANCARIO: "CERT_BANCARIA",
    BILLETERA: "CERT_BILLETERA",
  }

/** Certificado que exige la verificación según el medio de pago registrado. */
export function certificadoDePago(
  metodo: MetodoPago | null
): TipoDocumentoMedio | null {
  return metodo ? CERTIFICADO_POR_METODO[metodo] : null
}

export interface DocumentosExigidos {
  tipos: TipoDocumentoMedio[]
  /** Sin método de pago aún no se sabe qué certificado pedir. */
  faltaMetodoPago: boolean
}

/** Los del nivel y, al final, el certificado del medio de pago (sin repetir). */
export function documentosExigidos(
  documentosNivel: readonly TipoDocumentoMedio[],
  metodo: MetodoPago | null
): DocumentosExigidos {
  const certificado = certificadoDePago(metodo)
  const tipos = [...new Set(documentosNivel)]
  if (certificado && !tipos.includes(certificado)) tipos.push(certificado)
  return { tipos, faltaMetodoPago: certificado === null }
}

/**
 * Nivel para el que el medio reúne documentos: el 1 mientras no esté
 * verificado (es el que lo habilita) y el siguiente al actual después.
 */
export function nivelObjetivo(estado: EstadoMedio, nivelActual: number): number {
  if (estado === "PENDIENTE" || estado === "RECHAZADO" || nivelActual < 1) {
    return 1
  }
  return Math.min(NIVEL_MAXIMO, nivelActual + 1)
}

/** Fila de `documentos_medio` con lo que necesita la interfaz. */
export interface DocumentoRegistrado {
  tipo: TipoDocumentoMedio
  estado: EstadoDocumento
  /** 'YYYY-MM-DD' o `null` sin vencimiento. */
  fechaVencimiento: string | null
  metodo: "ARCHIVO" | "VIDEOLLAMADA"
  observaciones: string | null
  creadoAt: string
}

export type SituacionDocumento =
  | "aprobado"
  | "en-revision"
  | "rechazado"
  | "vencido"
  | "falta"

export interface EstadoRequisito {
  tipo: TipoDocumentoMedio
  situacion: SituacionDocumento
  /** Vigencia del aprobado (o del último vencido). */
  fechaVencimiento: string | null
  /** Aprobado que vence dentro de `DIAS_AVISO_VENCIMIENTO` días. */
  porVencer: boolean
  /** Observaciones del último rechazo (para corregirlo). */
  observaciones: string | null
  /** Aprobado por videollamada con el equipo AMO (prueba de vida). */
  porVideollamada: boolean
  /** Hay una carga nueva en revisión además del aprobado vigente. */
  renovacionEnRevision: boolean
}

const MS_DIA = 86_400_000

/** Días de calendario entre dos fechas 'YYYY-MM-DD' (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_DIA)
}

function vigente(documento: DocumentoRegistrado, hoy: string): boolean {
  return (
    documento.estado === "APROBADO" &&
    (documento.fechaVencimiento === null || documento.fechaVencimiento >= hoy)
  )
}

/** Más reciente primero (las cargas nuevas reemplazan a las anteriores). */
function porRecientes(
  a: DocumentoRegistrado,
  b: DocumentoRegistrado
): number {
  return b.creadoAt.localeCompare(a.creadoAt)
}

/**
 * Estado de un tipo de documento con la misma regla que la BD: cuenta el
 * aprobado vigente aunque después se haya cargado otro (una renovación en
 * revisión no lo invalida). Sin aprobado vigente manda la carga más reciente.
 */
export function estadoRequisito(
  tipo: TipoDocumentoMedio,
  documentos: readonly DocumentoRegistrado[],
  hoy: string
): EstadoRequisito {
  const delTipo = documentos.filter((d) => d.tipo === tipo).sort(porRecientes)
  const aprobado = delTipo.find((d) => vigente(d, hoy))
  const reciente = delTipo.at(0)
  const base = {
    tipo,
    porVencer: false,
    observaciones: null,
    porVideollamada: false,
    renovacionEnRevision: false,
  }

  if (aprobado) {
    const vence = aprobado.fechaVencimiento
    return {
      ...base,
      situacion: "aprobado",
      fechaVencimiento: vence,
      porVencer: vence !== null && diasEntre(hoy, vence) <= DIAS_AVISO_VENCIMIENTO,
      porVideollamada: aprobado.metodo === "VIDEOLLAMADA",
      renovacionEnRevision: delTipo.some(
        (d) => d.estado === "PENDIENTE" && d.creadoAt > aprobado.creadoAt
      ),
    }
  }
  if (!reciente) return { ...base, situacion: "falta", fechaVencimiento: null }
  switch (reciente.estado) {
    case "PENDIENTE":
      return {
        ...base,
        situacion: "en-revision",
        fechaVencimiento: reciente.fechaVencimiento,
      }
    case "RECHAZADO":
      return {
        ...base,
        situacion: "rechazado",
        fechaVencimiento: null,
        observaciones: reciente.observaciones?.trim() || null,
      }
    case "APROBADO":
    case "VENCIDO":
      return {
        ...base,
        situacion: "vencido",
        fechaVencimiento: reciente.fechaVencimiento,
      }
  }
}

export function estadoRequisitos(
  tipos: readonly TipoDocumentoMedio[],
  documentos: readonly DocumentoRegistrado[],
  hoy: string
): EstadoRequisito[] {
  return tipos.map((tipo) => estadoRequisito(tipo, documentos, hoy))
}

/** Cargado y vivo: aprobado vigente o esperando la revisión de AMO. */
export function requisitoCubierto(requisito: EstadoRequisito): boolean {
  return (
    requisito.situacion === "aprobado" || requisito.situacion === "en-revision"
  )
}

/** Lo que se puede enviar a verificación: todo cubierto salvo lo facultativo. */
export function requisitosParaEnviar(
  requisitos: readonly EstadoRequisito[]
): EstadoRequisito[] {
  return requisitos.filter((r) => r.tipo !== DOCUMENTO_FACULTATIVO)
}
