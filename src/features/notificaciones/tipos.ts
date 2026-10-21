/**
 * Tipos del módulo de notificaciones.
 *
 * TEMPORAL (migración 8 `notificaciones`): la tabla aún no está en
 * `src/types/database.types.ts`, así que la fila se declara aquí según
 * docs/modelo-datos.md §3.7 y se valida con zod (`esquemas.ts`). Al regenerar
 * los tipos, reemplazar `FilaNotificacion` por
 * `Database["public"]["Tables"]["notificaciones"]["Row"]` y quitar los
 * `as unknown as SupabaseClient` de `queries.ts`, `actions.ts` y `fuente.ts`.
 */

/** TEMPORAL — `public.notificaciones` (§3.7). */
export interface FilaNotificacion {
  id: number
  usuario_id: string
  /** Clave de plantilla: `oferta.nueva_elegible`, `liquidacion.pagada`… */
  tipo: string
  titulo: string
  mensaje: string
  entidad: string | null
  entidad_id: string | null
  /** Ruta interna relativa (`^/[^/]`). */
  url: string | null
  /** 0 normal · 1 importante · 2 urgente. */
  prioridad: number
  canal: "APP" | "EMAIL" | "WHATSAPP" | "PUSH"
  leida: boolean
  leida_at: string | null
  created_at: string
}

/** Columnas que lee la interfaz (nunca `usuario_id` ni datos de envío). */
export const COLUMNAS_NOTIFICACION =
  "id, tipo, titulo, mensaje, entidad, entidad_id, url, prioridad, leida, leida_at, created_at" as const

export type Prioridad = "normal" | "importante" | "urgente"

/** DTO para la interfaz: URL ya validada como ruta interna. */
export interface Notificacion {
  id: number
  tipo: string
  titulo: string
  mensaje: string
  /** Ruta interna segura o `null` (sin enlace). */
  url: string | null
  prioridad: Prioridad
  leida: boolean
  creadaAt: string
}

export interface PaginaNotificaciones {
  /** `false` mientras la tabla no exista en la BD (migración 8 pendiente). */
  disponible: boolean
  notificaciones: Notificacion[]
  /** `id` desde el que pedir la página siguiente, o `null` si no hay más. */
  siguiente: number | null
}

export interface ConteoNoLeidas {
  disponible: boolean
  total: number
}
