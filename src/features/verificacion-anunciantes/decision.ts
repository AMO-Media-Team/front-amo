/**
 * Decisión sobre una empresa anunciante (ADM-003), módulo puro: qué puede
 * hacer el equipo AMO según su estado y sus permisos (copia de
 * `private.transiciones_estado` vía `accionesPermitidas`) y qué significa ese
 * estado para quien decide. La transición en la BD tiene la última palabra.
 */
import type { EstadoAnunciante, Tono } from "@/features/operacion/estados"
import { cerrarFrase } from "@/features/operacion/formato"
import { accionesPermitidas } from "@/lib/negocio/acciones"

/** En el expediente: verificar o rechazar una empresa PENDIENTE (`anunciantes.verificar`). */
export type AccionDecision = "verificar" | "rechazar"

/** En la cabecera de la ficha: suspender o reactivar (`anunciantes.suspender`). */
export type AccionEstado = "suspender" | "reactivar"

function destinos(
  estado: EstadoAnunciante,
  permisos: Iterable<string>
): ReadonlySet<EstadoAnunciante> {
  return new Set(
    accionesPermitidas("anunciantes", estado, "ADMIN", permisos).map(
      (accion) => accion.hacia
    )
  )
}

export function accionesDecision(
  estado: EstadoAnunciante,
  permisos: Iterable<string>
): AccionDecision[] {
  if (estado !== "PENDIENTE") return []
  const hacia = destinos(estado, permisos)
  return [
    ...(hacia.has("VERIFICADO") ? (["verificar"] as const) : []),
    ...(hacia.has("RECHAZADO") ? (["rechazar"] as const) : []),
  ]
}

export function accionesEstado(
  estado: EstadoAnunciante,
  permisos: Iterable<string>
): AccionEstado[] {
  const hacia = destinos(estado, permisos)
  if (estado === "VERIFICADO" && hacia.has("SUSPENDIDO")) return ["suspender"]
  if (estado === "SUSPENDIDO" && hacia.has("VERIFICADO")) return ["reactivar"]
  return []
}

export interface SituacionDecision {
  tono: Tono
  titulo: string
  descripcion: string
}

/** Qué significa el estado de la empresa para quien la verifica (sin tiempos relativos). */
export function situacionDecision({
  estado,
  enviada,
  motivo,
}: {
  estado: EstadoAnunciante
  /** PENDIENTE y enviada a verificación por su equipo. */
  enviada: boolean
  motivo: string | null
}): SituacionDecision {
  const conMotivo = (texto: string) =>
    motivo?.trim() ? `Motivo: ${cerrarFrase(motivo.trim())} ${texto}` : texto
  switch (estado) {
    case "PENDIENTE":
      return enviada
        ? {
            tono: "info",
            titulo: "Espera tu decisión",
            descripcion:
              "La empresa envió sus documentos. Revísalos uno por uno y verifícala, o recházala con un motivo que le sirva para corregir.",
          }
        : {
            tono: "neutro",
            titulo: "Aún no la envía a verificación",
            descripcion:
              "Puedes revisar lo que ya cargó; lo usual es esperar a que la envíe. Si todo está al día, también puedes verificarla desde aquí.",
          }
    case "VERIFICADO":
      return {
        tono: "exito",
        titulo: "Empresa verificada",
        descripcion:
          "Puede activar campañas y enviar ofertas a revisión. Si carga documentos nuevos, aparecen aquí para revisarlos.",
      }
    case "RECHAZADO":
      return {
        tono: "peligro",
        titulo: "Verificación rechazada",
        descripcion: conMotivo(
          "Volverá a la cola cuando la empresa corrija y la envíe de nuevo."
        ),
      }
    case "SUSPENDIDO":
      return {
        tono: "aviso",
        titulo: "Empresa suspendida",
        descripcion: conMotivo(
          "Mientras siga suspendida no envía ofertas a revisión ni recibe aceptaciones nuevas."
        ),
      }
  }
}
