/**
 * Cola de verificación de anunciantes (ADM-003), módulo puro: qué empresas
 * entran, en qué orden y adónde lleva cada una. Entran las que enviaron su
 * empresa a verificación (PENDIENTE con `enviado_verificacion_at`) y las que
 * tienen documentos por revisar (p. ej. una verificada que renovó su Cámara de
 * Comercio). Se atiende primero lo que lleva más tiempo esperando.
 */
import type { Route } from "next"

import { PESTANA_VERIFICACION } from "@/features/verificacion/colas"

export interface EmpresaEnviada {
  id: string
  /** `enviado_verificacion_at` (ISO). */
  enviadoAt: string
}

export interface DocumentoPorRevisar {
  anuncianteId: string
  /** `created_at` del documento (ISO). */
  subidoAt: string
}

export interface EntradaCola {
  anuncianteId: string
  /** Desde cuándo espera: el envío o, si no lo envió, su documento más antiguo. */
  desde: string
  /** Envío vigente (PENDIENTE y enviada); `null` si solo tiene documentos. */
  enviadoAt: string | null
  documentosPorRevisar: number
}

/**
 * Une las dos fuentes en una entrada por empresa y las ordena por lo que más
 * lleva esperando (a igual instante, por id, para que la paginación sea
 * estable). Los instantes son ISO de la BD: se comparan como texto.
 */
export function ordenarCola(
  enviadas: readonly EmpresaEnviada[],
  documentos: readonly DocumentoPorRevisar[]
): EntradaCola[] {
  const porEmpresa = new Map<
    string,
    { enviadoAt: string | null; primerDocumento: string | null; total: number }
  >()
  for (const { id, enviadoAt } of enviadas) {
    porEmpresa.set(id, { enviadoAt, primerDocumento: null, total: 0 })
  }
  for (const { anuncianteId, subidoAt } of documentos) {
    const actual = porEmpresa.get(anuncianteId) ?? {
      enviadoAt: null,
      primerDocumento: null,
      total: 0,
    }
    actual.total += 1
    if (!actual.primerDocumento || subidoAt < actual.primerDocumento) {
      actual.primerDocumento = subidoAt
    }
    porEmpresa.set(anuncianteId, actual)
  }
  return [...porEmpresa]
    .map(
      ([anuncianteId, { enviadoAt, primerDocumento, total }]): EntradaCola => ({
        anuncianteId,
        desde: (enviadoAt ?? primerDocumento) as string,
        enviadoAt,
        documentosPorRevisar: total,
      })
    )
    .sort(
      (a, b) =>
        a.desde.localeCompare(b.desde) ||
        a.anuncianteId.localeCompare(b.anuncianteId)
    )
}

/** Expediente de una empresa: pestaña «Verificación» de su ficha (contrato de `/ir`). */
export function rutaRevisionAnunciante(anuncianteId: string): Route {
  return `/operacion/anunciantes/${anuncianteId}?pestana=${PESTANA_VERIFICACION}` as Route
}
