/**
 * Rejilla del marco de Configuración (navegación + contenido), dentro de un
 * elemento `@container`. Vive en un módulo sin "use client" porque también la
 * usa `loading.tsx` (servidor): así el esqueleto ocupa lo mismo que la página.
 * La navegación pasa a la izquierda cuando el área de la página mide 56rem.
 */
export const REJILLA_MARCO =
  "grid gap-6 @4xl:grid-cols-[15rem_minmax(0,1fr)] @4xl:gap-10"
