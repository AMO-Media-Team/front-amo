/**
 * Qué puede cambiar quien mira la página de configuración (módulo puro). La
 * interfaz solo ofrece lo permitido; la BD vuelve a exigirlo todo (RLS +
 * contexto confiable + triggers).
 */
import type { ClavePermiso } from "@/lib/auth/permisos"

import { exigeComisiones } from "./parametros"
import type { Seccion } from "./secciones"
import type { PermisosConfiguracion } from "./tipos"

export function permisosConfiguracion(
  permisos: readonly ClavePermiso[]
): PermisosConfiguracion {
  const tiene = (permiso: ClavePermiso) => permisos.includes(permiso)
  return {
    editar: tiene("configuracion.editar"),
    comisiones: tiene("configuracion.comisiones"),
    tarifas: tiene("configuracion.tarifas"),
    tributario: tiene("configuracion.tributario"),
    catalogos: tiene("configuracion.catalogos"),
    verAuditoria: tiene("auditoria.ver"),
    datosSensibles: tiene("datos_sensibles.ver"),
  }
}

/** Un parámetro de `configuracion`: `configuracion.editar` y, si es de comisión, también `configuracion.comisiones`. */
export function puedeEditarParametro(
  clave: string,
  permisos: PermisosConfiguracion
): boolean {
  return permisos.editar && (!exigeComisiones(clave) || permisos.comisiones)
}

/** ¿Hay algo que quien mira pueda cambiar en la sección? (para el aviso de solo lectura). */
export function seccionEditable(
  seccion: Seccion,
  permisos: PermisosConfiguracion
): boolean {
  switch (seccion) {
    case "comercial":
      return permisos.editar || permisos.comisiones
    case "precios":
      return permisos.editar || permisos.tarifas || permisos.catalogos
    case "tributario":
      return permisos.editar || permisos.tributario
    case "catalogos":
    case "legal":
    case "plantillas":
      return permisos.catalogos
    default:
      return permisos.editar
  }
}
