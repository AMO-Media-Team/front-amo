/**
 * Línea de tiempo de una solicitud del titular (CTA-007), módulo puro: sale de
 * la bitácora de `solicitudes_titular` (alta, cambios de estado, prórroga y
 * supresión, con el actor enmascarado). Quien no tiene acceso a la bitácora
 * ve los hitos que guarda la propia solicitud (sin actores y solo el último
 * de cada clase).
 *
 * «Titular» se decide por la persona, no por el rol: la bitácora guarda la
 * CLAVE del rol (un rol personalizado de anunciante no se llama ANUNCIANTE) y
 * alguien del equipo también puede radicar sobre sus propios datos. El
 * titular es el `perfil_id` de la solicitud o, si ya se suprimió, quien la
 * radicó (el alta siempre la hace el titular).
 */
import { DECISIONES, formatearDia } from "./presentacion"
import type {
  DecisionSolicitud,
  EventoSolicitud,
  LineaTiempoSolicitud,
  SolicitudBase,
} from "./tipos"

/** Una fila de la bitácora de la solicitud (lo que la consulta trae). */
export interface RegistroBitacora {
  id: number
  at: string
  accion: string
  estadoAnterior: string | null
  estadoNuevo: string | null
  actorId: string | null
  actorEmail: string | null
  actorRol: string | null
  cambios: unknown
}

function actorDe(registro: RegistroBitacora, titularId: string | null): string {
  if (!registro.actorId) return "Sistema"
  if (titularId && registro.actorId === titularId) return "Titular"
  return registro.actorEmail
    ? `Equipo AMO · ${registro.actorEmail}`
    : "Equipo AMO"
}

/** `cambios[columna].despues` de un UPDATE o una TRANSICION. */
function despues(cambios: unknown, columna: string): unknown {
  if (!cambios || typeof cambios !== "object") return undefined
  const cambio = (cambios as Record<string, unknown>)[columna]
  if (!cambio || typeof cambio !== "object") return undefined
  return (cambio as Record<string, unknown>).despues
}

function diaDe(valor: unknown): string | null {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? formatearDia(valor)
    : null
}

function decisionDe(valor: unknown): DecisionSolicitud | null {
  return typeof valor === "string" && valor in DECISIONES
    ? (valor as DecisionSolicitud)
    : null
}

function eventosDeRegistro(
  registro: RegistroBitacora,
  titularId: string | null
): EventoSolicitud[] {
  const base = { at: registro.at, actor: actorDe(registro, titularId) }
  const eventos: EventoSolicitud[] = []
  const clave = (sufijo: string) => `b${registro.id}-${sufijo}`

  if (registro.accion === "INSERT") {
    // En un INSERT los cambios son la fila completa (sin «antes» ni «después»).
    const fila =
      registro.cambios && typeof registro.cambios === "object"
        ? (registro.cambios as Record<string, unknown>)
        : {}
    const plazo = diaDe(fila.plazo_vence)
    eventos.push({
      ...base,
      id: clave("radicada"),
      tipo: "radicada",
      titulo: "Radicada",
      detalle: plazo ? `Plazo legal hasta el ${plazo}.` : null,
    })
    return eventos
  }

  if (registro.accion === "TRANSICION") {
    const hacia = registro.estadoNuevo
    const desde = registro.estadoAnterior
    if (hacia === "EN_TRAMITE" && desde === "REQUIERE_INFORMACION") {
      const vence = diaDe(despues(registro.cambios, "plazo_vence"))
      eventos.push({
        ...base,
        id: clave("aportada"),
        tipo: "aportada",
        titulo: "El titular aportó la información",
        detalle: vence
          ? `El plazo vuelve a contar: vence el ${vence}.`
          : "El plazo vuelve a contar.",
      })
    } else if (hacia === "EN_TRAMITE") {
      eventos.push({
        ...base,
        id: clave("tramite"),
        tipo: "tramite",
        titulo: "Tomada en trámite",
        detalle: null,
      })
    } else if (hacia === "REQUIERE_INFORMACION") {
      eventos.push({
        ...base,
        id: clave("requerida"),
        tipo: "requerida",
        titulo: "Se pidió información al titular",
        detalle: null,
      })
    } else if (hacia === "RESPONDIDA") {
      const decision = decisionDe(despues(registro.cambios, "decision"))
      eventos.push({
        ...base,
        id: clave("respondida"),
        tipo: "respondida",
        titulo: decision
          ? `Respondida: ${DECISIONES[decision].etiqueta.toLocaleLowerCase("es-CO")}`
          : "Respondida",
        detalle: null,
      })
    } else if (hacia === "DESISTIDA") {
      eventos.push({
        ...base,
        id: clave("desistida"),
        tipo: "desistida",
        titulo: "Desistida",
        detalle: registro.actorId
          ? "El titular desistió de la solicitud."
          : "El titular no respondió el requerimiento en el plazo legal.",
      })
    }
  }

  // Una prórroga puede llegar sola (UPDATE) o con el paso a En trámite.
  if (despues(registro.cambios, "prorrogada_at")) {
    const vence = diaDe(despues(registro.cambios, "plazo_vence"))
    eventos.push({
      ...base,
      id: clave("prorrogada"),
      tipo: "prorrogada",
      titulo: "Plazo prorrogado",
      detalle: vence ? `Nuevo vencimiento: ${vence}.` : null,
    })
  }
  if (despues(registro.cambios, "supresion_ejecutada_at")) {
    eventos.push({
      ...base,
      id: clave("supresion"),
      tipo: "supresion",
      titulo: "Supresión ejecutada",
      detalle:
        "Se borró la cuenta del titular y lo que la ley no obliga a conservar.",
    })
  }
  return eventos
}

type Hitos = Pick<
  SolicitudBase,
  | "recibidaAt"
  | "plazoVence"
  | "enTramiteAt"
  | "requeridaAt"
  | "informacionAt"
  | "prorrogadaAt"
  | "respondidaAt"
  | "decision"
  | "desistidaAt"
  | "supresionEjecutadaAt"
>

/** Sin bitácora: los hitos que guarda la solicitud (el último de cada clase). */
function eventosDeHitos(solicitud: Hitos): EventoSolicitud[] {
  const candidatos: (EventoSolicitud | null)[] = [
    {
      id: "h-radicada",
      at: solicitud.recibidaAt,
      tipo: "radicada",
      titulo: "Radicada",
      detalle: null,
      actor: "Titular",
    },
    solicitud.enTramiteAt
      ? {
          id: "h-tramite",
          at: solicitud.enTramiteAt,
          tipo: "tramite",
          titulo: "Tomada en trámite",
          detalle: null,
          actor: null,
        }
      : null,
    solicitud.requeridaAt
      ? {
          id: "h-requerida",
          at: solicitud.requeridaAt,
          tipo: "requerida",
          titulo: "Se pidió información al titular",
          detalle: null,
          actor: null,
        }
      : null,
    solicitud.informacionAt
      ? {
          id: "h-aportada",
          at: solicitud.informacionAt,
          tipo: "aportada",
          titulo: "El titular aportó la información",
          detalle: null,
          actor: "Titular",
        }
      : null,
    solicitud.prorrogadaAt
      ? {
          id: "h-prorrogada",
          at: solicitud.prorrogadaAt,
          tipo: "prorrogada",
          titulo: "Plazo prorrogado",
          detalle: `Nuevo vencimiento: ${formatearDia(solicitud.plazoVence)}.`,
          actor: null,
        }
      : null,
    solicitud.respondidaAt
      ? {
          id: "h-respondida",
          at: solicitud.respondidaAt,
          tipo: "respondida",
          titulo: solicitud.decision
            ? `Respondida: ${DECISIONES[solicitud.decision].etiqueta.toLocaleLowerCase("es-CO")}`
            : "Respondida",
          detalle: null,
          actor: null,
        }
      : null,
    solicitud.desistidaAt
      ? {
          id: "h-desistida",
          at: solicitud.desistidaAt,
          tipo: "desistida",
          titulo: "Desistida",
          detalle: null,
          actor: null,
        }
      : null,
    solicitud.supresionEjecutadaAt
      ? {
          id: "h-supresion",
          at: solicitud.supresionEjecutadaAt,
          tipo: "supresion",
          titulo: "Supresión ejecutada",
          detalle: null,
          actor: null,
        }
      : null,
  ]
  return candidatos.filter(
    (evento): evento is EventoSolicitud => evento !== null
  )
}

function cronologico(a: EventoSolicitud, b: EventoSolicitud): number {
  const diferencia = new Date(a.at).getTime() - new Date(b.at).getTime()
  return diferencia !== 0 ? diferencia : a.id.localeCompare(b.id)
}

/**
 * Del más antiguo al más reciente. Con bitácora, un evento por cambio (en el
 * orden de la bitácora); sin ella (`registros` vacío), los hitos de la fila.
 * `titularId` es el `perfil_id` de la solicitud (`null` tras la supresión: se
 * toma quien la radicó).
 */
export function construirLineaTiempo(
  solicitud: Hitos,
  registros: readonly RegistroBitacora[],
  { titularId = null }: { titularId?: string | null } = {}
): LineaTiempoSolicitud {
  if (registros.length === 0) {
    return {
      eventos: eventosDeHitos(solicitud).sort(cronologico),
      soloHitos: true,
    }
  }
  const ordenados = [...registros].sort((a, b) => a.id - b.id)
  const titular =
    titularId ??
    ordenados.find((registro) => registro.accion === "INSERT")?.actorId ??
    null
  const eventos = ordenados.flatMap((registro) =>
    eventosDeRegistro(registro, titular)
  )
  return { eventos, soloHitos: false }
}
