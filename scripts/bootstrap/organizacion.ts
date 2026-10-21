/**
 * Organización a la que pertenece una cuenta de prueba (módulo puro). Un
 * perfil externo activo exige la suya: `anunciante_id` para el rol ANUNCIANTE
 * y `medio_id` para el rol MEDIO; los roles internos no llevan ninguna
 * (`perfiles_organizacion_chk` admite como mucho una).
 */

/**
 * Organización ficticia de los anunciantes E2E. La tabla `anunciantes` la
 * siembra (es_demo) la migración de actores.
 */
export const ANUNCIANTE_E2E_ID = "e2e00000-0000-4000-8000-00000000a001"

export type RolCuentaPrueba = "SUPERADMIN" | "ADMIN" | "ANUNCIANTE" | "MEDIO"

export interface OrganizacionPerfil {
  anunciante_id: string | null
  medio_id: string | null
}

export class ErrorOrganizacion extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorOrganizacion"
  }
}

/**
 * Columnas de organización del perfil según el rol. Un MEDIO necesita saber a
 * qué medio pertenece: no hay uno «de pruebas» fijo, lo indica quien crea la
 * cuenta (un medio de los datos demo).
 */
export function organizacionDe(cuenta: {
  rol: RolCuentaPrueba
  medioId?: string | null
}): OrganizacionPerfil {
  switch (cuenta.rol) {
    case "ANUNCIANTE":
      return { anunciante_id: ANUNCIANTE_E2E_ID, medio_id: null }
    case "MEDIO":
      if (!cuenta.medioId) {
        throw new ErrorOrganizacion(
          "Una cuenta de rol MEDIO necesita el medio al que pertenece."
        )
      }
      return { anunciante_id: null, medio_id: cuenta.medioId }
    case "SUPERADMIN":
    case "ADMIN":
      return { anunciante_id: null, medio_id: null }
  }
}

/** Roles internos: exigen verificación en dos pasos (se enrola un TOTP). */
export function exigeTotp(rol: RolCuentaPrueba): boolean {
  return rol === "SUPERADMIN" || rol === "ADMIN"
}
