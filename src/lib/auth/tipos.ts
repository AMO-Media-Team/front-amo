/**
 * DTO de sesión que el servidor entrega a la interfaz (AppShell, menús).
 * Solo lleva lo necesario para pintar y filtrar la navegación: nada de
 * tokens, celular, estado de la cuenta ni datos de terceros. La autorización
 * real se decide en el DAL y en la base de datos, no con este objeto.
 */
import type { ClavePermiso, TipoRol } from "./permisos"

export type { TipoRol } from "./permisos"

/** Nivel de autenticación del JWT: `aal2` tras verificar el segundo factor. */
export type NivelAutenticacion = "aal1" | "aal2"

export interface RolSesion {
  id: string
  /** Clave estable (`SUPERADMIN`, `ADMIN`, `MEDIO`…). */
  clave: string
  nombre: string
  tipo: TipoRol
  /** HEX `#RRGGBB` para el distintivo del rol. */
  color: string
  requiereMfa: boolean
}

export interface UsuarioSesion {
  id: string
  email: string
  nombre: string
  /** URL firmada y de corta duración del avatar; `null` sin foto. */
  avatarUrl: string | null
  rol: RolSesion
  permisos: readonly ClavePermiso[]
  anuncianteId: string | null
  medioId: string | null
  aal: NivelAutenticacion
}
