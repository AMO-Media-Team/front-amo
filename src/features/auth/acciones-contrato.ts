/**
 * Contrato entre las pantallas de autenticación y sus Server Actions
 * (`./actions.ts`). Solo tipos: la pista de integración implementa las
 * acciones respetando estas firmas y nombres de campo, y la interfaz no
 * necesita cambiar.
 *
 * Reglas para las implementaciones:
 * - Errores esperados como `fallo(mensaje, erroresCampo?)`, nunca lanzados.
 * - Mensajes genéricos que no revelen si un correo existe (sin enumeración).
 * - `redirigirA` siempre es una ruta interna (la interfaz la vuelve a validar
 *   con `rutaInternaSegura` antes de navegar).
 */
import type { ResultadoAccion } from "@/lib/result"

/** Resultado exitoso: a dónde navegar y, si aplica, un aviso para la persona. */
export interface ExitoFormulario {
  redirigirA?: string
  /** Texto informativo que la pantalla muestra junto a la confirmación. */
  aviso?: string
}

/** Estado de `useActionState` en los formularios de autenticación. */
export type EstadoFormulario = ResultadoAccion<ExitoFormulario> | null

export type AccionFormulario = (
  estadoPrevio: EstadoFormulario,
  datos: FormData
) => Promise<EstadoFormulario>

/** Nombres de los campos que cada acción lee del `FormData`. */
export interface CamposFormularioAuth {
  /** `next`: ruta interna a la que volver tras ingresar (opcional). */
  iniciarSesion: "email" | "password" | "next"
  solicitarRecuperacion: "email"
  restablecerContrasena: "password" | "confirmacion"
  cambiarContrasenaObligatoria: "password" | "confirmacion"
  /**
   * `factorId` opcional: sin él, la acción usa el factor TOTP verificado.
   * `next`: ruta interna a la que continuar tras verificar (opcional).
   */
  verificarMfa: "codigo" | "factorId" | "next"
  /** `type`: `invite`, `recovery`, `email_change`… (EmailOtpType de Supabase). */
  confirmarEnlace: "token_hash" | "type" | "next"
}

export interface EnrolamientoMfa {
  factorId: string
  /** Código QR como URL de datos (`data:image/svg+xml;…`), listo para `<img src>`. */
  qrSvg: string
  /** Clave TOTP en base32 para ingresarla a mano. */
  secreto: string
  /** URI `otpauth://` (abre la app autenticadora en el celular). */
  uri: string
}

export interface ContratoAccionesAuth {
  iniciarSesion: AccionFormulario
  solicitarRecuperacion: AccionFormulario
  restablecerContrasena: AccionFormulario
  cambiarContrasenaObligatoria: AccionFormulario
  iniciarEnrolamientoMfa: () => Promise<ResultadoAccion<EnrolamientoMfa>>
  verificarMfa: AccionFormulario
  confirmarEnlace: AccionFormulario
  cerrarSesion: () => Promise<ResultadoAccion<null>>
}
