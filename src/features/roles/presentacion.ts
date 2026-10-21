/**
 * Textos, orden y filtrado del listado de roles (módulo puro).
 */
import { TIPOS_ROL_ETIQUETA } from "@/features/usuarios/presentacion"
import { CLAVES_ROL_SISTEMA } from "@/lib/auth/permisos"
import { formatearNumero } from "@/lib/format"

import { normalizarBusqueda } from "./catalogo"
import type { RolListado, TipoRol } from "./tipos"

export { TIPOS_ROL_ETIQUETA }

export const DESCRIPCION_TIPO: Readonly<Record<TipoRol, string>> = {
  ADMIN:
    "Personas de AMO. Su alcance es toda la plataforma, según sus permisos.",
  ANUNCIANTE: "Empresas que pautan. Solo ven los datos de su anunciante.",
  MEDIO: "Medios hiperlocales. Solo ven su medio y las ofertas elegibles.",
}

export const ORDEN_TIPOS: readonly TipoRol[] = ["ADMIN", "ANUNCIANTE", "MEDIO"]

const ORDEN_SISTEMA = new Map<string, number>(
  CLAVES_ROL_SISTEMA.map((clave, indice) => [clave, indice])
)

/** Primero los de sistema en su orden canónico; luego los personalizados por nombre. */
export function ordenarRoles<
  T extends Pick<RolListado, "clave" | "nombre" | "esSistema">,
>(roles: readonly T[]): T[] {
  return [...roles].sort((a, b) => {
    if (a.esSistema !== b.esSistema) return a.esSistema ? -1 : 1
    if (a.esSistema) {
      return (
        (ORDEN_SISTEMA.get(a.clave) ?? 99) - (ORDEN_SISTEMA.get(b.clave) ?? 99)
      )
    }
    return a.nombre.localeCompare(b.nombre, "es-CO", { sensitivity: "base" })
  })
}

export type FiltroTipo = TipoRol | "TODOS"

/** Búsqueda sin tildes por nombre, clave o descripción, y filtro por tipo. */
export function filtrarRoles<
  T extends Pick<RolListado, "nombre" | "clave" | "descripcion" | "tipo">,
>(roles: readonly T[], { q, tipo }: { q: string; tipo: FiltroTipo }): T[] {
  const palabras = normalizarBusqueda(q).split(/\s+/).filter(Boolean)
  return roles.filter((rol) => {
    if (tipo !== "TODOS" && rol.tipo !== tipo) return false
    const texto = normalizarBusqueda(
      `${rol.nombre} ${rol.clave} ${rol.descripcion ?? ""}`
    )
    return palabras.every((palabra) => texto.includes(palabra))
  })
}

export function pluralizar(
  cantidad: number,
  singular: string,
  plural: string
): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? singular : plural}`
}
