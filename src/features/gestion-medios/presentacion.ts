/**
 * Presentación del registro de medios (módulo puro): rutas, parámetros de la
 * URL y el orden de las personas vinculadas a un medio.
 */
import type { Route } from "next"

import { rutaMedio } from "@/features/operacion/rutas"
import type { EstadoPerfil } from "@/features/usuarios/tipos"
import { formatearNumero } from "@/lib/format"

import type { PersonaMedio } from "./tipos"

function contar(cantidad: number, singular: string, plural: string): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? singular : plural}`
}

/** `?registrar=1` en el listado abre la hoja de registro al llegar. */
export const PARAMETRO_REGISTRAR = "registrar"
export const VALOR_REGISTRAR = "1"

/** Pestaña de la ficha con las personas del medio (`?pestana=usuarios`). */
export const PESTANA_USUARIOS = "usuarios"

/**
 * Ficha a la que se llega tras registrar un medio: si quien lo registró ve e
 * invita usuarios, directo a la pestaña «Usuarios», que invita a crear el
 * primero; si no, al resumen (no se le ofrece un paso que no puede dar).
 */
export function rutaTrasRegistro(
  id: string,
  invitarTrasRegistro: boolean
): Route {
  const ficha = rutaMedio(id)
  return invitarTrasRegistro
    ? (`${ficha}?pestana=${PESTANA_USUARIOS}` as Route)
    : ficha
}

export function rutaUsuario(id: string): Route {
  return `/administracion/usuarios/${id}` as Route
}

const PRIORIDAD_ESTADO: Readonly<Record<EstadoPerfil, number>> = {
  ACTIVO: 0,
  INVITADO: 1,
  SUSPENDIDO: 2,
  DESACTIVADO: 3,
}

function nombreOrden(persona: Pick<PersonaMedio, "nombre" | "email">): string {
  return persona.nombre?.trim() || persona.email
}

/** Primero quienes operan (activos, luego invitados) y al final las cuentas de baja; por nombre. */
export function ordenarPersonas<
  T extends Pick<PersonaMedio, "nombre" | "email" | "estado">,
>(personas: readonly T[]): T[] {
  return [...personas].sort(
    (a, b) =>
      PRIORIDAD_ESTADO[a.estado] - PRIORIDAD_ESTADO[b.estado] ||
      nombreOrden(a).localeCompare(nombreOrden(b), "es", {
        sensitivity: "base",
      })
  )
}

/** «3 personas · 2 activas» para el encabezado de la pestaña. */
export function resumenPersonas(
  personas: readonly Pick<PersonaMedio, "estado">[]
): string {
  const enEstado = (estado: EstadoPerfil) =>
    personas.filter((persona) => persona.estado === estado).length
  const activas = enEstado("ACTIVO")
  const invitadas = enEstado("INVITADO")
  return [
    contar(personas.length, "persona", "personas"),
    activas > 0 ? contar(activas, "activa", "activas") : null,
    invitadas > 0
      ? contar(invitadas, "invitación pendiente", "invitaciones pendientes")
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
}
