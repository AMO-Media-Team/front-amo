/**
 * «Mi empresa › Equipo» (ANU-002; módulo puro): nombre del rol de cada
 * compañero, orden de la lista y resumen. La empresa solo puede leer su propio
 * rol (`roles: select`): el de un compañero con otro rol se nombra a partir de
 * su clave.
 */
import { formatearNumero } from "@/lib/format"

import type { MiembroEquipo } from "./tipos"

export interface RolPropio {
  clave: string
  nombre: string
  color: string
}

/** «ANUNCIANTE_COMPRAS» → «Anunciante compras». */
export function humanizarClave(clave: string): string {
  const texto = clave.replace(/[_-]+/g, " ").trim().toLocaleLowerCase("es-CO")
  return texto ? texto[0].toLocaleUpperCase("es-CO") + texto.slice(1) : clave
}

/** Rol para la insignia: el propio con su nombre y color; otro, por su clave. */
export function rolDeMiembro(
  rolClave: string | null,
  propio: RolPropio
): { nombre: string; color: string } | null {
  if (!rolClave) return null
  return rolClave === propio.clave
    ? { nombre: propio.nombre, color: propio.color }
    : { nombre: humanizarClave(rolClave), color: "#8C66EE" }
}

/** La persona de la sesión primero; el resto, como lo ordena la BD (por nombre). */
export function ordenarEquipo(
  miembros: readonly MiembroEquipo[],
  yoId: string
): MiembroEquipo[] {
  const yo = miembros.filter((miembro) => miembro.id === yoId)
  return [...yo, ...miembros.filter((miembro) => miembro.id !== yoId)]
}

function contar(cantidad: number, singular: string, plural: string): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? singular : plural}`
}

/** «3 personas · 1 invitación pendiente · 1 suspendida». */
export function resumenEquipo(
  miembros: readonly Pick<MiembroEquipo, "estado">[]
): string {
  const invitados = miembros.filter((m) => m.estado === "INVITADO").length
  const suspendidos = miembros.filter((m) => m.estado === "SUSPENDIDO").length
  return [
    contar(miembros.length, "persona", "personas"),
    invitados > 0
      ? contar(invitados, "invitación pendiente", "invitaciones pendientes")
      : null,
    suspendidos > 0 ? contar(suspendidos, "suspendida", "suspendidas") : null,
  ]
    .filter(Boolean)
    .join(" · ")
}
