/**
 * Enlaces de acceso que genera un administrador. Apuntan a `/auth/confirm`,
 * una página cuyo GET no consume el token (inmune a los previsualizadores de
 * correo y chat): la persona pulsa "Continuar" y la Server Action lo verifica.
 */

export type TipoEnlace = "invite" | "recovery"

/**
 * @param sitio `NEXT_PUBLIC_SITE_URL` (nunca el `Host` de la solicitud, que se
 *   puede falsificar).
 * @param tokenHash `properties.hashed_token` de `auth.admin.generateLink`.
 */
export function enlaceConfirmacion(
  sitio: string,
  tokenHash: string,
  tipo: TipoEnlace
): string {
  const url = new URL("/auth/confirm", sitio)
  url.search = new URLSearchParams({
    token_hash: tokenHash,
    type: tipo,
  }).toString()
  return url.toString()
}
