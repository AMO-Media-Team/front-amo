/**
 * Nombres de los proyectos de Playwright (`playwright.config.ts`), para que
 * los specs decidan por tamaño de pantalla sin repetir literales.
 */
export const PROYECTO_PREPARACION = "preparacion"
export const PROYECTO_ESCRITORIO = "escritorio"
export const PROYECTO_TABLET = "tablet"
export const PROYECTO_MOVIL = "movil"

/**
 * Único proyecto donde corren las pruebas que cambian una cuenta o datos
 * reales: en paralelo con tablet y móvil se pisarían (verificar un TOTP cierra
 * las demás sesiones de la cuenta y cada preparación la restablece).
 */
export const PROYECTO_CON_CUENTAS = PROYECTO_ESCRITORIO

/**
 * Specs del alta del medio (`onboarding-medio-*`): sus pruebas que escriben
 * reinician y modifican el mismo «Medio Nuevo E2E», así que solo corren en este
 * proyecto de escritorio con un solo worker (una tras otra); las de solo lectura
 * corren también en escritorio, tablet y móvil.
 */
export const PROYECTO_ALTA_MEDIO = "alta-medio"
export const SPECS_ALTA_MEDIO = /onboarding-medio-.*\.spec\.ts/

/** Tablet y móvil emulan pantalla táctil (`hasTouch`). */
export function esTactil(proyecto: string): boolean {
  return proyecto === PROYECTO_TABLET || proyecto === PROYECTO_MOVIL
}
