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

/**
 * Specs del portal del anunciante que escriben (`anunciante-*`): empresa,
 * campañas, ofertas, creativos y moderación sobre «Anunciante E2E» y «Anunciante
 * Nuevo E2E». Igual que el alta del medio: sus pruebas que escriben corren solo
 * aquí, en serie; las de solo lectura, también en los demás proyectos.
 */
export const PROYECTO_ANUNCIANTE = "anunciante"
export const SPECS_ANUNCIANTE = /anunciante-.*\.spec\.ts/

/**
 * Specs de la pauta del medio que escriben (`pauta-medio-*`): marketplace,
 * aceptación, contenido, evidencia y métricas con «Medio E2E» y las ofertas de
 * las fábricas. En serie y solo aquí; patrón anclado para no tomar los
 * `onboarding-medio-*`.
 */
export const PROYECTO_PAUTA_MEDIO = "pauta-medio"
export const SPECS_PAUTA_MEDIO = /[\\/]pauta-medio-[^\\/]*\.spec\.ts$/

/**
 * Specs del equipo AMO que escriben (`validacion-*`, `disputas-*`): colas de
 * validación, verificación, cancelación, suspensión y disputas sobre asignaciones
 * de las fábricas. En serie y después de `pauta-medio` y `anunciante`, que
 * comparten el «Medio E2E».
 */
export const PROYECTO_VALIDACION = "validacion"
export const SPECS_VALIDACION =
  /[\\/](?:validacion|disputas)-[^\\/]*\.spec\.ts$/

/** Tablet y móvil emulan pantalla táctil (`hasTouch`). */
export function esTactil(proyecto: string): boolean {
  return proyecto === PROYECTO_TABLET || proyecto === PROYECTO_MOVIL
}
