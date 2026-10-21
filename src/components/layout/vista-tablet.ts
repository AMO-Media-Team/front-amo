/**
 * Pista para el servidor sobre el ancho de la ventana (módulo puro: lo leen
 * el layout en el servidor y el shell en el navegador). El servidor no conoce
 * el ancho; sin la pista pintaba siempre la barra lateral abierta y, en
 * tablet, se plegaba al hidratar (un salto de diseño con la barra a medio
 * plegar). No es una preferencia: el navegador la reescribe en cada visita.
 */

/** Tablet: entre el cambio a panel móvil (768 px) y el escritorio amplio. */
export const CONSULTA_TABLET = "(min-width: 768px) and (max-width: 1279px)"

export const COOKIE_VISTA_TABLET = "amo_vista_tablet"

const VIGENCIA_S = 60 * 60 * 24 * 365

/** Interpreta la cookie (`undefined` en la primera visita: se asume que no). */
export function pistaVistaTablet(valor: string | undefined): boolean {
  return valor === "1"
}

/** Texto para `document.cookie` con el ancho real de esta visita. */
export function cookieVistaTablet(tablet: boolean): string {
  return `${COOKIE_VISTA_TABLET}=${tablet ? "1" : "0"}; path=/; max-age=${VIGENCIA_S}; samesite=lax`
}
