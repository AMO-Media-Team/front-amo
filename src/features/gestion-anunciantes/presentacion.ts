/**
 * Pestaña «Usuarios» e invitación desde la ficha del anunciante (módulo puro).
 */
import type { OrganizacionFija, TipoRol } from "@/features/usuarios/tipos"
import { formatearNumero } from "@/lib/format"

import type { UsuarioVinculado } from "./tipos"

/**
 * Empresa a la que se invita desde su ficha, o `null` si quien mira no puede
 * asignar ningún rol de anunciante (la hoja de alta quedaría sin roles).
 */
export function organizacionParaInvitar(
  rolesAsignables: readonly { tipo: TipoRol }[] | null,
  anunciante: { id: string; nombreComercial: string }
): OrganizacionFija | null {
  return rolesAsignables?.some((rol) => rol.tipo === "ANUNCIANTE")
    ? {
        tipo: "ANUNCIANTE",
        id: anunciante.id,
        nombre: anunciante.nombreComercial,
      }
    : null
}

function contar(cantidad: number, singular: string, plural: string): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? singular : plural}`
}

/**
 * "3 personas vinculadas · 1 invitación pendiente · 1 suspendida": lo que
 * conviene atender primero (invitaciones sin activar, cuentas suspendidas).
 */
export function resumenUsuarios(
  usuarios: readonly Pick<UsuarioVinculado, "estado">[]
): string {
  const invitados = usuarios.filter((u) => u.estado === "INVITADO").length
  const suspendidos = usuarios.filter((u) => u.estado === "SUSPENDIDO").length
  return [
    contar(usuarios.length, "persona vinculada", "personas vinculadas"),
    invitados > 0
      ? contar(invitados, "invitación pendiente", "invitaciones pendientes")
      : null,
    suspendidos > 0 ? contar(suspendidos, "suspendida", "suspendidas") : null,
  ]
    .filter(Boolean)
    .join(" · ")
}
