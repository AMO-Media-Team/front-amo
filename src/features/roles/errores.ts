/**
 * Errores de la BD al escribir `roles` y `rol_permisos` → mensaje para la
 * persona y, si corresponde, el campo del formulario. Las guardas lanzan
 * `AMO_*` con un `detail` en español (§1.7); las restricciones y la RLS se
 * reconocen por su código y nombre. Nunca se muestra el mensaje técnico.
 */
import {
  codigoNegocio,
  type ErrorBd,
  MENSAJE_INESPERADO,
} from "@/features/usuarios/errores"
import { esPermisoValido, PERMISOS } from "@/lib/auth/permisos"

export type ErrorBdRol = ErrorBd & { hint?: string | null }

export type CampoRol = "nombre" | "clave" | "descripcion" | "color"

export interface ErrorRolInterpretado {
  mensaje: string
  campo?: CampoRol
}

const MENSAJES_NEGOCIO: Readonly<Record<string, string>> = {
  AMO_NO_AUTORIZADO:
    "No tienes permiso para esta acción o tu sesión ya no es válida. Vuelve a ingresar si el problema continúa.",
  AMO_ROL_SISTEMA:
    "Los roles de sistema solo cambian con una actualización de la plataforma.",
  AMO_ROL_PROPIO: "No puedes cambiar los permisos de tu propio rol.",
  AMO_ESCALADA_PERMISOS:
    "No puedes otorgar ni retirar un permiso que tú no tienes.",
  AMO_PERMISO_NO_APLICABLE:
    "Ese permiso no aplica a este tipo de rol: los roles de anunciante y de medio solo admiten los permisos de su portal.",
}

const RESTRICCIONES: readonly (ErrorRolInterpretado & { nombre: string })[] = [
  {
    nombre: "roles_clave_key",
    mensaje: "Ya existe un rol con esa clave.",
    campo: "clave",
  },
  {
    nombre: "roles_clave_chk",
    mensaje:
      "La clave debe ir en MAYÚSCULAS, con números y guion bajo (2 a 40).",
    campo: "clave",
  },
  {
    nombre: "roles_nombre_chk",
    mensaje: "El nombre debe tener entre 2 y 60 caracteres.",
    campo: "nombre",
  },
  {
    nombre: "roles_descripcion_chk",
    mensaje: "La descripción admite hasta 300 caracteres.",
    campo: "descripcion",
  },
  {
    nombre: "roles_color_chk",
    mensaje: "Elige un color de la paleta.",
    campo: "color",
  },
  {
    nombre: "roles_mfa_interno_chk",
    mensaje: "Los roles del equipo interno exigen verificación en dos pasos.",
  },
  {
    nombre: "perfiles_rol_id_fkey",
    mensaje:
      "El rol aún tiene cuentas asignadas (incluidas cuentas desactivadas). Reasígnalas antes de eliminarlo.",
  },
]

const SIN_PERMISO_RLS =
  "No tienes permiso para gestionar roles o tu sesión necesita verificarse de nuevo."

function mensajeEscalada(error: ErrorBdRol): string {
  const clave = error.hint?.trim()
  if (clave && esPermisoValido(clave)) {
    return `No puedes otorgar ni retirar «${PERMISOS[clave].descripcion}»: tú no tienes ese permiso.`
  }
  return MENSAJES_NEGOCIO.AMO_ESCALADA_PERMISOS
}

/**
 * Un rol de anunciante o de medio solo admite los permisos de su rol de
 * sistema. El `hint` trae el permiso rechazado (el primero, si eran varios):
 * se nombra para que la persona sepa cuál quitar de la selección.
 */
function mensajeNoAplicable(error: ErrorBdRol): string {
  const clave = error.hint?.trim()
  if (clave && esPermisoValido(clave)) {
    return `«${PERMISOS[clave].descripcion}» no aplica a este tipo de rol: los roles de anunciante y de medio solo admiten los permisos de su portal.`
  }
  return error.details?.trim() || MENSAJES_NEGOCIO.AMO_PERMISO_NO_APLICABLE
}

export function interpretarErrorRol(error: ErrorBdRol): ErrorRolInterpretado {
  const codigo = codigoNegocio(error)
  if (codigo === "AMO_ESCALADA_PERMISOS")
    return { mensaje: mensajeEscalada(error) }
  if (codigo === "AMO_PERMISO_NO_APLICABLE")
    return { mensaje: mensajeNoAplicable(error) }
  if (codigo) {
    return {
      mensaje:
        error.details?.trim() || MENSAJES_NEGOCIO[codigo] || MENSAJE_INESPERADO,
    }
  }
  const texto = `${error.message ?? ""} ${error.details ?? ""}`
  const restriccion = RESTRICCIONES.find(({ nombre }) => texto.includes(nombre))
  if (restriccion) {
    const { mensaje, campo } = restriccion
    return campo ? { mensaje, campo } : { mensaje }
  }
  if (error.code === "42501") return { mensaje: SIN_PERMISO_RLS }
  return { mensaje: MENSAJE_INESPERADO }
}

/** ¿Es una regla de negocio o una restricción conocida (no hace falta registrarla)? */
export function esErrorEsperado(error: ErrorBdRol): boolean {
  return interpretarErrorRol(error).mensaje !== MENSAJE_INESPERADO
}
