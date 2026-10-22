/**
 * Decisión sobre un medio (ADM-001), módulo puro: qué puede hacer quien
 * verifica según el estado del medio y qué tan listo está para el nivel que
 * evalúa. Refleja `private.transiciones_estado` y
 * `private.validar_verificacion_medio`; la interfaz solo orienta y la
 * transición en la BD tiene la última palabra (su `detail` dice qué falta).
 */
import type { VigenciaVerificacion } from "@/features/operacion/calculos"
import type { EstadoMedio, Tono } from "@/features/operacion/estados"
import { cerrarFrase } from "@/features/operacion/formato"

import {
  type DocumentoRequisito,
  type NivelRequisitos,
  type Requisito,
  requisitosDelNivel,
  resumirRequisitos,
} from "./requisitos"

export type AccionDecision = "verificar" | "rechazar" | "cambiar_nivel"

/**
 * Transiciones del equipo AMO con `medios.verificar`: PENDIENTE → VERIFICADO
 * o RECHAZADO, y VERIFICADO → VERIFICADO con otro nivel. Un RECHAZADO vuelve
 * a la cola cuando el medio lo reenvía; un SUSPENDIDO se reactiva aparte.
 */
export function accionesDecision(
  estado: EstadoMedio
): readonly AccionDecision[] {
  switch (estado) {
    case "PENDIENTE":
      return ["verificar", "rechazar"]
    case "VERIFICADO":
      return ["cambiar_nivel"]
    case "RECHAZADO":
    case "SUSPENDIDO":
      return []
  }
}

/** `private.cuenta_vigente`: verificada y dentro de la vigencia más la gracia. */
const VIGENCIAS_ELEGIBLES: ReadonlySet<VigenciaVerificacion> = new Set([
  "vigente",
  "por_vencer",
  "en_gracia",
])

export function cuentaElegible(vigencia: VigenciaVerificacion): boolean {
  return VIGENCIAS_ELEGIBLES.has(vigencia)
}

export interface EvaluacionNivel {
  nivel: number
  /** `null`: sin `datos_sensibles.ver` no se ven los documentos. */
  requisitos: Requisito[] | null
  /** Solo al verificar desde PENDIENTE se exige una cuenta vigente. */
  exigeCuenta: boolean
  cuentaVigente: boolean
  /** Requisitos visibles cumplidos y en total (documentos y, si aplica, la cuenta). */
  cumplidos: number | null
  total: number | null
  /**
   * Todo lo visible está al día. `null` si no se pueden ver los documentos:
   * la BD lo comprobará igual al decidir.
   */
  listo: boolean | null
}

export function evaluarNivel({
  nivel,
  documentos,
  cuentas,
  estado,
  hoy,
}: {
  nivel: NivelRequisitos
  documentos: readonly DocumentoRequisito[] | null
  cuentas: readonly { vigencia: VigenciaVerificacion }[]
  estado: EstadoMedio
  hoy: string
}): EvaluacionNivel {
  const exigeCuenta = estado === "PENDIENTE"
  const cuentaVigente = cuentas.some((cuenta) =>
    cuentaElegible(cuenta.vigencia)
  )
  const cuentaPendiente = exigeCuenta && !cuentaVigente
  if (!documentos) {
    return {
      nivel: nivel.nivel,
      requisitos: null,
      exigeCuenta,
      cuentaVigente,
      cumplidos: null,
      total: null,
      listo: cuentaPendiente ? false : null,
    }
  }
  const requisitos = requisitosDelNivel(nivel, documentos, hoy)
  const resumen = resumirRequisitos(requisitos)
  const extra = exigeCuenta ? 1 : 0
  return {
    nivel: nivel.nivel,
    requisitos,
    exigeCuenta,
    cuentaVigente,
    cumplidos: resumen.cumplidos + (exigeCuenta && cuentaVigente ? 1 : 0),
    total: resumen.total + extra,
    listo: resumen.documentosListos && !cuentaPendiente,
  }
}

export interface SituacionDecision {
  tono: Tono
  titulo: string
  descripcion: string
}

/** Qué significa el estado del medio para quien decide (sin tiempos relativos). */
export function situacionDecision({
  estado,
  nivel,
  enviado,
  motivo,
}: {
  estado: EstadoMedio
  nivel: number
  enviado: boolean
  motivo: string | null
}): SituacionDecision {
  switch (estado) {
    case "PENDIENTE":
      return enviado
        ? {
            tono: "info",
            titulo: "Espera tu decisión",
            descripcion:
              "El medio envió su perfil. Revisa sus documentos y cuentas, y decide el nivel o rechaza con un motivo que le sirva para corregir.",
          }
        : {
            tono: "neutro",
            titulo: "Aún no envía su perfil",
            descripcion:
              "Lo usual es esperar a que lo envíe; si ya tiene todo al día puedes verificarlo desde aquí.",
          }
    case "VERIFICADO":
      return {
        tono: "exito",
        titulo: `Verificado en el nivel ${nivel}`,
        descripcion:
          "Para cambiarlo, elige otro nivel y escribe el motivo: el medio recibe un aviso.",
      }
    case "RECHAZADO":
      return {
        tono: "peligro",
        titulo: "Verificación rechazada",
        descripcion: motivo
          ? `Motivo: ${cerrarFrase(motivo.trim())} Volverá a la cola cuando el medio corrija y lo envíe de nuevo.`
          : "Volverá a la cola cuando el medio corrija y lo envíe de nuevo.",
      }
    case "SUSPENDIDO":
      return {
        tono: "aviso",
        titulo: "Medio suspendido",
        descripcion:
          "Mientras siga suspendido no se puede cambiar su verificación. Reactívalo primero.",
      }
  }
}
