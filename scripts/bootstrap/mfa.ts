/**
 * Verificación en dos pasos como la haría la persona (enrolar un TOTP y
 * verificarlo en su sesión), para los scripts de arranque y las pruebas.
 */
import { type ClienteSupabase, ErrorBootstrap } from "./supabase"
import { codigoTotp, segundosRestantesTotp } from "./totp"

/** Espera al siguiente código si al vigente le quedan pocos segundos. */
export async function codigoTotpEstable(secreto: string): Promise<string> {
  if (segundosRestantesTotp() < 4) {
    await new Promise((resolver) =>
      setTimeout(resolver, segundosRestantesTotp() * 1000 + 250)
    )
  }
  return codigoTotp(secreto)
}

/**
 * Enrola y verifica un TOTP en la sesión del cliente, que queda en aal2.
 * Devuelve la clave base32 del factor.
 */
export async function enrolarTotpEnSesion(
  cliente: ClienteSupabase,
  nombreFactor: string
): Promise<string> {
  const { data, error } = await cliente.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: nombreFactor,
    issuer: "AMO",
  })
  if (error) {
    throw new ErrorBootstrap(`No se pudo enrolar el TOTP: ${error.message}`)
  }
  const verificacion = await cliente.auth.mfa.challengeAndVerify({
    factorId: data.id,
    code: await codigoTotpEstable(data.totp.secret),
  })
  if (verificacion.error) {
    throw new ErrorBootstrap(
      `No se pudo verificar el TOTP: ${verificacion.error.message}`
    )
  }
  return data.totp.secret
}
