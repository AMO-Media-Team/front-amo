/**
 * Formulario público `/vincular` (módulo puro): qué errores del servidor
 * corresponden a un campo del formulario. El cliente valida con el mismo
 * esquema, así que un error de campo del servidor es raro (municipio
 * inhabilitado entre tanto, o un envío manipulado); lo que no sea un campo
 * conocido se muestra como mensaje general.
 */
import type { FieldPath } from "react-hook-form"

import { MAXIMO_CUENTAS } from "./cuentas"
import type { EntradaSolicitudVinculacion } from "./schemas"

export type CampoSolicitud = FieldPath<EntradaSolicitudVinculacion>

const CAMPOS_RAIZ: ReadonlySet<string> = new Set([
  "nombreMedio",
  "tipo",
  "municipioCodigo",
  "cuentas",
  "contactoNombre",
  "email",
  "celular",
  "mensaje",
  "autorizaDatos",
] satisfies CampoSolicitud[])

const CAMPO_CUENTA = /^cuentas\.(\d+)\.(plataforma|usuario|seguidores)$/

/** ¿La ruta (`"email"`, `"cuentas.0.usuario"`) es un campo del formulario? */
export function esCampoSolicitud(ruta: string): ruta is CampoSolicitud {
  if (CAMPOS_RAIZ.has(ruta)) return true
  const cuenta = CAMPO_CUENTA.exec(ruta)
  return cuenta !== null && Number(cuenta[1]) < MAXIMO_CUENTAS
}

/** Campos del formulario con error en la respuesta del servidor. */
export function camposConError(
  erroresCampo: Readonly<Record<string, readonly string[]>> | undefined
): CampoSolicitud[] {
  return Object.keys(erroresCampo ?? {}).filter(esCampoSolicitud)
}
