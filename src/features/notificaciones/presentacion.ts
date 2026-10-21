/**
 * Presentación de notificaciones: categorías por prefijo de la plantilla,
 * agrupación por día (zona de Bogotá) y saneamiento de enlaces. Módulo puro.
 */
import { tz } from "@date-fns/tz"
import { differenceInCalendarDays } from "date-fns"

import { rutaInternaSegura } from "@/lib/auth/navegacion"
import { ZONA } from "@/lib/fechas"

import type { FilaNotificacion, Notificacion, Prioridad } from "./tipos"

export const CLAVES_CATEGORIA = [
  "ofertas",
  "asignaciones",
  "ejecucion",
  "pagos",
  "cuentas",
  "disputas",
  "seguridad",
] as const

export type ClaveCategoria = (typeof CLAVES_CATEGORIA)[number]

/**
 * Categorías que ve la persona. Cada una agrupa uno o más prefijos de
 * `plantillas_notificacion.clave` (docs/modelo-datos.md §3.4).
 */
export const CATEGORIAS: Readonly<
  Record<ClaveCategoria, { etiqueta: string; prefijos: readonly string[] }>
> = {
  ofertas: { etiqueta: "Ofertas", prefijos: ["oferta", "creativo"] },
  asignaciones: { etiqueta: "Asignaciones", prefijos: ["asignacion"] },
  ejecucion: {
    etiqueta: "Evidencias y métricas",
    prefijos: ["evidencia", "metricas"],
  },
  pagos: {
    etiqueta: "Pagos y tarifas",
    prefijos: ["liquidacion", "multiplicador"],
  },
  cuentas: { etiqueta: "Cuentas sociales", prefijos: ["cuenta"] },
  disputas: { etiqueta: "Disputas", prefijos: ["disputa"] },
  seguridad: { etiqueta: "Seguridad", prefijos: ["seguridad", "usuario"] },
}

export type Categoria = ClaveCategoria | "otras"

export function categoriaDe(tipo: string): Categoria {
  const prefijo = tipo.split(".")[0] ?? ""
  const encontrada = CLAVES_CATEGORIA.find((clave) =>
    CATEGORIAS[clave].prefijos.includes(prefijo)
  )
  return encontrada ?? "otras"
}

/** Nombre visible de la categoría de una plantilla («General» si no se reconoce). */
export function etiquetaCategoria(tipo: string): string {
  const categoria = categoriaDe(tipo)
  return categoria === "otras" ? "General" : CATEGORIAS[categoria].etiqueta
}

/** Filtro PostgREST (`or`) para una categoría: `tipo.like.oferta.%,tipo.like.creativo.%`. */
export function filtroCategoria(categoria: ClaveCategoria): string {
  return CATEGORIAS[categoria].prefijos
    .map((prefijo) => `tipo.like.${prefijo}.%`)
    .join(",")
}

function prioridadDe(valor: number): Prioridad {
  if (valor >= 2) return "urgente"
  if (valor === 1) return "importante"
  return "normal"
}

type FilaLeida = Pick<
  FilaNotificacion,
  | "id"
  | "tipo"
  | "titulo"
  | "mensaje"
  | "url"
  | "prioridad"
  | "leida"
  | "created_at"
>

/** Fila → DTO. Un enlace que no sea ruta interna se descarta (nunca redirige fuera). */
export function aNotificacion(fila: FilaLeida): Notificacion {
  return {
    id: fila.id,
    tipo: fila.tipo,
    titulo: fila.titulo,
    mensaje: fila.mensaje,
    url: rutaInternaSegura(fila.url),
    prioridad: prioridadDe(fila.prioridad),
    leida: fila.leida,
    creadaAt: fila.created_at,
  }
}

// ── Agrupación por día ───────────────────────────────────────────────────────

export type ClaveGrupo = "hoy" | "ayer" | "semana" | "anteriores"

export const TITULOS_GRUPO: Record<ClaveGrupo, string> = {
  hoy: "Hoy",
  ayer: "Ayer",
  semana: "Últimos 7 días",
  anteriores: "Anteriores",
}

export interface GrupoNotificaciones {
  clave: ClaveGrupo
  titulo: string
  notificaciones: Notificacion[]
}

function grupoDe(creadaAt: string, ahora: Date): ClaveGrupo {
  const dias = differenceInCalendarDays(ahora, new Date(creadaAt), {
    in: tz(ZONA),
  })
  if (dias <= 0) return "hoy"
  if (dias === 1) return "ayer"
  if (dias < 7) return "semana"
  return "anteriores"
}

/** Grupos en orden (sin vacíos), conservando el orden de la lista (recientes primero). */
export function agruparPorDia(
  notificaciones: readonly Notificacion[],
  ahora: Date = new Date()
): GrupoNotificaciones[] {
  const grupos = new Map<ClaveGrupo, Notificacion[]>()
  for (const notificacion of notificaciones) {
    const clave = grupoDe(notificacion.creadaAt, ahora)
    grupos.set(clave, [...(grupos.get(clave) ?? []), notificacion])
  }
  return (Object.keys(TITULOS_GRUPO) as ClaveGrupo[])
    .filter((clave) => grupos.has(clave))
    .map((clave) => ({
      clave,
      titulo: TITULOS_GRUPO[clave],
      notificaciones: grupos.get(clave) ?? [],
    }))
}
