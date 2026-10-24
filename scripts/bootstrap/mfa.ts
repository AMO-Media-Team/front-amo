/**
 * Verificación en dos pasos como la haría la persona (enrolar un TOTP y
 * verificarlo en su sesión), para los scripts de arranque y las pruebas.
 */
import { type ClienteSupabase, ErrorBootstrap } from "./supabase"
import { codigoTotp, PASO_TOTP_SEGUNDOS, segundosRestantesTotp } from "./totp"

/** Espera al siguiente código si al vigente le quedan pocos segundos. */
export async function codigoTotpEstable(secreto: string): Promise<string> {
  if (segundosRestantesTotp() < 4) {
    await new Promise((resolver) =>
      setTimeout(resolver, segundosRestantesTotp() * 1000 + 250)
    )
  }
  return codigoTotp(secreto)
}

const pasoTotpActual = () => Math.floor(Date.now() / 1000 / PASO_TOTP_SEGUNDOS)

/**
 * Último periodo TOTP gastado con cada secreto en este proceso: Supabase no
 * acepta el mismo código dos veces. Lo comparten las fábricas
 * (`fabricas-finanzas.ts`) y los ingresos de los specs (`e2e/utilidades`), que
 * corren en el mismo proceso de Playwright.
 */
const ultimoPasoTotp = new Map<string, number>()

/** Marca el periodo actual como gastado (p. ej. tras enrolar un factor). */
export function marcarTotpUsado(secreto: string): void {
  ultimoPasoTotp.set(secreto, pasoTotpActual())
}

/**
 * Código de un periodo posterior al último usado con ese secreto en este
 * proceso (espera hasta 30 s si hace falta) y lo marca como gastado.
 */
export async function codigoTotpNuevo(secreto: string): Promise<string> {
  while (pasoTotpActual() <= (ultimoPasoTotp.get(secreto) ?? -1)) {
    await new Promise((resolver) => setTimeout(resolver, 1000))
  }
  const codigo = await codigoTotpEstable(secreto)
  marcarTotpUsado(secreto)
  return codigo
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
