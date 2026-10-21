/**
 * Historial de un rol a partir de la bitácora (`roles` y `rol_permisos`,
 * auditadas por `fn_auditar` con `entidad_id = rol_id`). Cada permiso otorgado
 * o retirado es una fila; aquí se agrupan en "cambios de permisos" por actor y
 * cercanía en el tiempo, como los hizo la persona al guardar. Módulo puro.
 */
import { type ClavePermiso, esPermisoValido } from "@/lib/auth/permisos"

import { permisosValidos } from "./catalogo"
import type { EventoBitacoraRol } from "./tipos"

/**
 * Un guardado son una o dos solicitudes (retirar y otorgar) con milisegundos
 * de diferencia. La ventana es corta a propósito: si una red lenta separa un
 * guardado en dos entradas, la información sigue siendo correcta; fundir dos
 * guardados distintos (p. ej. la copia al crear el rol y el primer ajuste de
 * la matriz) la falsearía.
 */
export const VENTANA_AGRUPACION_MS = 2_000

export type ActorEvento = {
  id: string | null
  email: string | null
  rol: string | null
}

export const CAMPOS_ROL = {
  nombre: "Nombre",
  descripcion: "Descripción",
  color: "Color",
  requiere_mfa: "Verificación en dos pasos",
} as const

export type CampoRolAuditado = keyof typeof CAMPOS_ROL

export type CambioCampo = {
  campo: CampoRolAuditado
  antes: unknown
  despues: unknown
}

type Base = { id: string; at: string; actor: ActorEvento; origen: string }

export type EntradaHistorial =
  | (Base & { tipo: "creado"; clave: string | null; nombre: string | null })
  | (Base & { tipo: "editado"; cambios: CambioCampo[] })
  | (Base & {
      tipo: "permisos"
      agregados: ClavePermiso[]
      quitados: ClavePermiso[]
    })

function actorDe(evento: EventoBitacoraRol): ActorEvento {
  return { id: evento.actorId, email: evento.actorEmail, rol: evento.actorRol }
}

function base(evento: EventoBitacoraRol): Base {
  return {
    id: String(evento.id),
    at: evento.at,
    actor: actorDe(evento),
    origen: evento.origen,
  }
}

function comoTexto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null
}

function comoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

function cambiosDeCampos(cambios: Record<string, unknown>): CambioCampo[] {
  return (Object.keys(CAMPOS_ROL) as CampoRolAuditado[]).flatMap((campo) => {
    const cambio = comoObjeto(cambios[campo])
    return "despues" in cambio
      ? [
          {
            campo,
            antes: cambio.antes ?? null,
            despues: cambio.despues ?? null,
          },
        ]
      : []
  })
}

function entradaDeRol(evento: EventoBitacoraRol): EntradaHistorial | null {
  if (evento.accion === "INSERT") {
    return {
      ...base(evento),
      tipo: "creado",
      clave: comoTexto(evento.cambios.clave),
      nombre: comoTexto(evento.cambios.nombre),
    }
  }
  if (evento.accion === "UPDATE") {
    const cambios = cambiosDeCampos(evento.cambios)
    return cambios.length > 0
      ? { ...base(evento), tipo: "editado", cambios }
      : null
  }
  return null
}

type GrupoPermisos = Extract<EntradaHistorial, { tipo: "permisos" }> & {
  /** Instante del evento más antiguo del grupo (los eventos llegan del más nuevo al más viejo). */
  desde: number
}

function mismoGuardado(
  grupo: GrupoPermisos,
  evento: EventoBitacoraRol
): boolean {
  return (
    grupo.actor.id === evento.actorId &&
    grupo.desde - Date.parse(evento.at) <= VENTANA_AGRUPACION_MS
  )
}

function nuevoGrupo(evento: EventoBitacoraRol): GrupoPermisos {
  return {
    ...base(evento),
    tipo: "permisos",
    agregados: [],
    quitados: [],
    desde: Date.parse(evento.at),
  }
}

function sumarAlGrupo(grupo: GrupoPermisos, evento: EventoBitacoraRol): void {
  const clave = comoTexto(evento.cambios.permiso_clave)
  if (!clave || !esPermisoValido(clave)) return
  if (evento.accion === "INSERT") grupo.agregados.push(clave)
  if (evento.accion === "DELETE") grupo.quitados.push(clave)
  grupo.desde = Math.min(grupo.desde, Date.parse(evento.at))
}

/** Si un permiso se otorgó y retiró dentro del mismo grupo, no cambió nada. */
function cerrarGrupo({
  desde: _desde,
  ...grupo
}: GrupoPermisos): EntradaHistorial | null {
  const agregados = new Set(grupo.agregados)
  const quitados = new Set(grupo.quitados)
  const netos = {
    agregados: permisosValidos([...agregados].filter((c) => !quitados.has(c))),
    quitados: permisosValidos([...quitados].filter((c) => !agregados.has(c))),
  }
  if (netos.agregados.length + netos.quitados.length === 0) return null
  return { ...grupo, ...netos }
}

/**
 * Entradas del historial, de la más reciente a la más antigua. `eventos` debe
 * venir ordenado por `id` descendente (como lo devuelve la consulta).
 */
export function construirHistorial(
  eventos: readonly EventoBitacoraRol[]
): EntradaHistorial[] {
  const entradas: (EntradaHistorial | GrupoPermisos)[] = []
  for (const evento of eventos) {
    if (evento.entidad === "rol_permisos") {
      const ultima = entradas.at(-1)
      if (ultima && "desde" in ultima && mismoGuardado(ultima, evento)) {
        sumarAlGrupo(ultima, evento)
      } else {
        const grupo = nuevoGrupo(evento)
        sumarAlGrupo(grupo, evento)
        entradas.push(grupo)
      }
      continue
    }
    if (evento.entidad === "roles") {
      const entrada = entradaDeRol(evento)
      if (entrada) entradas.push(entrada)
    }
  }
  return entradas.flatMap((entrada) => {
    if (!("desde" in entrada)) return [entrada]
    const cerrado = cerrarGrupo(entrada)
    return cerrado ? [cerrado] : []
  })
}
