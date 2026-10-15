/**
 * Rutas del módulo (módulo puro: se importan desde Server y Client Components;
 * un valor exportado por un archivo "use client" no llega como tal al servidor).
 */
import type { Route } from "next"

export const RUTA_ROLES = "/administracion/roles" satisfies Route

export function rutaRol(id: string): Route {
  return `/administracion/roles/${id}` as Route
}

/** Listado de usuarios filtrado por un rol (`?rol=` de `estadoTablaUsuarios`). */
export function rutaUsuariosDelRol(id: string): Route {
  return `/administracion/usuarios?rol=${id}` as Route
}

export function rutaUsuario(id: string): Route {
  return `/administracion/usuarios/${id}` as Route
}
