/**
 * DTO que el servidor entrega a las pantallas de «Mi cuenta». Solo datos de la
 * propia persona, ya resumidos: nada de tokens, secretos TOTP ni IP completas.
 */
import type { Dispositivo } from "@/lib/auth/agente-usuario"
import type { RolSesion } from "@/lib/auth/tipos"

export interface PerfilPropio {
  id: string
  nombre: string | null
  email: string
  celular: string | null
  /** URL firmada de corta duración; `null` sin foto o sin bucket. */
  avatarUrl: string | null
  tieneAvatar: boolean
  rol: RolSesion
  /** Anunciante o medio al que pertenece; `null` para internos. */
  organizacion: { tipo: "ANUNCIANTE" | "MEDIO"; nombre: string | null } | null
  miembroDesde: string
  ultimoAccesoAt: string | null
}

export interface FactorPropio {
  id: string
  nombre: string
  creadoAt: string
  ultimoUsoAt: string | null
}

export interface SeguridadPropia {
  factores: FactorPropio[]
  /** El rol exige verificación en dos pasos (no se puede desactivar). */
  mfaObligatoria: boolean
  /** Último cambio registrado en `accesos` (CONTRASENA_CAMBIADA). */
  contrasenaCambiadaAt: string | null
}

export interface SesionPropia {
  id: string
  esActual: boolean
  navegador: string | null
  dispositivo: Dispositivo
  /** Ya enmascarada (`181.51.•••.•••`). */
  ip: string | null
  ubicacion: string | null
  iniciadaAt: string
  ultimaActividadAt: string | null
  conVerificacion: boolean
}

export type EstadoSesiones =
  | { disponible: true; sesiones: SesionPropia[] }
  /** La BD aún no expone las sesiones propias a este rol (ver `mis_sesiones`). */
  | { disponible: false; actual: SesionPropia }

export interface ActividadPropia {
  id: number
  at: string
  accion: string
  entidad: string
  entidadId: string | null
  ip: string | null
  ubicacion: string | null
  navegador: string | null
  dispositivo: Dispositivo
}

export interface PaginaActividad {
  eventos: ActividadPropia[]
  /** `id` del último evento si puede haber más (paginación por cursor). */
  siguiente: number | null
}
