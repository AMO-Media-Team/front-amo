/**
 * Datos que las consultas de la verificación de anunciantes entregan a la
 * interfaz. Nunca llevan la ruta de un archivo en Storage (se firma en el
 * servidor por id) ni datos de `anunciantes_privado`: solo el MIME, para
 * elegir cómo mostrarlo. La identificación tributaria de una empresa (NIT) es
 * pública (RUES, facturas) y se muestra completa a quien puede verificarla.
 */
import type { EstadoAnunciante } from "@/features/operacion/estados"

import type { DocumentoRequisito, Requisito } from "./requisitos"

/** Documento tal como se revisa: metadatos y el MIME del archivo (nunca su ruta). */
export interface DocumentoExpediente extends DocumentoRequisito {
  observaciones: string | null
  validadoAt: string | null
  mime: string | null
}

/** Lo que identifica a la empresa en la cola y en la revisión. */
export interface EmpresaResumen {
  id: string
  nombreComercial: string
  razonSocial: string
  /** NIT con DV («900.123.456-7») o identificación tributaria extranjera. */
  identificacion: string | null
  tipoIdentificacion: "NIT" | "Identificación tributaria"
  paisIso2: string
  pais: string
}

export interface AnuncianteEnCola extends EmpresaResumen {
  estado: EstadoAnunciante
  ciudad: string | null
  /** Desde cuándo espera (su envío o su documento más antiguo por revisar). */
  desde: string
  /** `null` si no está enviada (solo tiene documentos por revisar). */
  enviadoAt: string | null
  /** La rechazaron antes y la volvió a enviar. */
  reenvio: boolean
  documentosPorRevisar: number
  /** Lo exigido que la empresa aún debe cargar o corregir. */
  faltan: readonly Requisito["clave"][]
  /** Todo lo exigido está aprobado y vigente. */
  listos: boolean
}

export interface ColaAnunciantes {
  filas: AnuncianteEnCola[]
  total: number
  pagina: number
}

export interface ExpedienteAnunciante {
  anunciante: EmpresaResumen & {
    ciudad: string | null
    sector: string | null
    estado: EstadoAnunciante
    motivoEstado: string | null
    /** Envío a verificación vigente (solo mientras está PENDIENTE). */
    enviadoAt: string | null
    verificadoAt: string | null
    verificadoPor: string | null
    /**
     * Último cambio de su identificación antes de verificarla: lo aprobado
     * antes ya no la respalda (`validar_verificacion_anunciante`).
     */
    identificacionCambiadaAt: string | null
  }
  documentos: DocumentoExpediente[]
  /** `YYYY-MM-DD` de Bogotá con que se evalúan las vigencias. */
  hoy: string
}
