/**
 * Qué panel de Inicio ve cada persona y cómo se la saluda. Módulo puro.
 * El panel sale del TIPO de rol (interno, anunciante o medio) y exige además
 * el permiso del panel: un SUPERADMIN tiene los tres permisos, pero es interno.
 */
import type { ClavePermiso } from "@/lib/auth/permisos"
import type { TipoRol, UsuarioSesion } from "@/lib/auth/tipos"
import { type PresetAutomatico, ZONA } from "@/lib/fechas"

export type TipoPanel = "admin" | "anunciante" | "medio"

export const PERMISO_PANEL: Readonly<Record<TipoPanel, ClavePermiso>> = {
  admin: "inicio.admin",
  anunciante: "inicio.anunciante",
  medio: "inicio.medio",
}

const PANEL_POR_TIPO: Readonly<Record<TipoRol, TipoPanel>> = {
  ADMIN: "admin",
  ANUNCIANTE: "anunciante",
  MEDIO: "medio",
}

/** Lo que el medio revisa a diario es "lo de este mes"; el resto, 30 días. */
export const PRESET_POR_DEFECTO_PANEL: Readonly<
  Record<TipoPanel, PresetAutomatico>
> = {
  admin: "ultimos30",
  anunciante: "ultimos30",
  medio: "esteMes",
}

type UsuarioPanel = Pick<UsuarioSesion, "permisos"> & {
  rol: Pick<UsuarioSesion["rol"], "tipo">
}

/** Panel del tipo de rol si tiene su permiso; `null` si no le corresponde ninguno. */
export function panelPara(usuario: UsuarioPanel): TipoPanel | null {
  const panel = PANEL_POR_TIPO[usuario.rol.tipo]
  return usuario.permisos.includes(PERMISO_PANEL[panel]) ? panel : null
}

// ── Saludo ───────────────────────────────────────────────────────────────────

const horaBogota = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA,
  hour: "numeric",
  hourCycle: "h23",
})

const fechaBogota = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  weekday: "long",
  day: "numeric",
  month: "long",
})

export type Saludo = "Buenos días" | "Buenas tardes" | "Buenas noches"

/** Mañana de 5:00 a 11:59, tarde hasta las 18:59, noche el resto (Bogotá). */
export function saludoSegunHora(ahora: Date): Saludo {
  const hora = Number(horaBogota.format(ahora))
  if (hora >= 5 && hora < 12) return "Buenos días"
  if (hora >= 12 && hora < 19) return "Buenas tardes"
  return "Buenas noches"
}

/** "Ana María Pérez" → "Ana"; sin nombre, cadena vacía. */
export function primerNombre(nombre: string | null | undefined): string {
  return nombre?.trim().split(/\s+/)[0] ?? ""
}

/** "Buenos días, Ana" (o solo el saludo si la cuenta no tiene nombre). */
export function saludar(
  nombre: string | null | undefined,
  ahora: Date
): string {
  const saludo = saludoSegunHora(ahora)
  const nombrePila = primerNombre(nombre)
  return nombrePila ? `${saludo}, ${nombrePila}` : saludo
}

/** "Jueves, 1 de octubre" (Bogotá). */
export function fechaDeHoy(ahora: Date): string {
  const texto = fechaBogota.format(ahora)
  return texto.charAt(0).toLocaleUpperCase("es-CO") + texto.slice(1)
}
