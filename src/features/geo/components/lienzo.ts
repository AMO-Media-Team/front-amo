/**
 * Alto del explorador dentro del AppShell: la ventana menos la barra superior
 * (3,5 rem) y, desde `md`, los márgenes del contenedor "inset" (2 × 0,5 rem).
 */
export const CLASE_LIENZO =
  "h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-4.5rem)] md:rounded-b-xl"

/** Panel flotante de vidrio sobre el mapa. */
export const CLASE_PANEL =
  "vidrio pointer-events-auto rounded-2xl shadow-[0_12px_40px_-16px_rgb(0_0_0/0.45)]"

/**
 * Alto máximo de la hoja de detalle (móvil y tableta): 60 % de la ventana, con
 * tope de 34 rem. La clase y `altoHojaDetalle` describen la misma medida: si
 * cambia una, cambia la otra.
 */
export const CLASE_ALTO_HOJA_DETALLE =
  "data-[swipe-axis=y]:[--drawer-content-max-height:min(60dvh,34rem)]"

const FRACCION_HOJA_DETALLE = 0.6
const ALTO_MAXIMO_HOJA_DETALLE_PX = 34 * 16
/** Lo que la ventana mide de más sobre el explorador: la barra superior (3,5 rem). */
const ALTO_BARRA_SUPERIOR_PX = 56

/**
 * Píxeles del explorador que tapa la hoja de detalle abierta, para que la
 * cámara deje la zona seleccionada en el área que sigue a la vista. En
 * pantalla completa el explorador ya mide toda la ventana.
 */
export function altoHojaDetalle(
  altoExplorador: number,
  pantallaCompleta = false
): number {
  const altoVentana =
    altoExplorador + (pantallaCompleta ? 0 : ALTO_BARRA_SUPERIOR_PX)
  return Math.min(
    Math.round(altoVentana * FRACCION_HOJA_DETALLE),
    ALTO_MAXIMO_HOJA_DETALLE_PX
  )
}
