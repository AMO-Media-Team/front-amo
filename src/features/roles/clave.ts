/**
 * Clave estable de un rol (`roles.clave`, CHECK `^[A-Z][A-Z0-9_]{1,39}$`):
 * se deriva del nombre mientras la persona no la edite. Es permanente tras
 * crear el rol (sin GRANT de UPDATE). Módulo puro.
 */
import { CLAVES_ROL_SISTEMA } from "@/lib/auth/permisos"

export const PATRON_CLAVE_ROL = /^[A-Z][A-Z0-9_]{1,39}$/
export const LONGITUD_MAXIMA_CLAVE = 40

/** "Analista de campañas" → "ANALISTA_DE_CAMPANAS" (ñ → N, sin tildes ni símbolos). */
export function derivarClave(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  if (!base) return ""
  const conLetra = /^[A-Z]/.test(base) ? base : `ROL_${base}`
  return conLetra.slice(0, LONGITUD_MAXIMA_CLAVE).replace(/_+$/, "")
}

/** Lo que se teclea en el campo de clave, llevado al formato permitido. */
export function normalizarClave(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, LONGITUD_MAXIMA_CLAVE)
}

export function esClaveDeSistema(clave: string): boolean {
  return (CLAVES_ROL_SISTEMA as readonly string[]).includes(clave)
}
