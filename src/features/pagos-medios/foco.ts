/**
 * Destino del foco tras registrar un pago o generar un archivo (módulo sin
 * React). Al pagar, la fila sale de «Por pagar» o la ficha cambia a «Pagada»
 * y el botón que abrió el diálogo desaparece: el foco no debe quedar en
 * `<body>`. Las vistas que listan liquidaciones ponen este id (con
 * `tabIndex={-1}`) en su título; si no hay, va al contenido principal.
 */
import { ID_CONTENIDO } from "@/components/feedback/salto-contenido"

export const ID_DESTINO_FOCO_PAGOS = "destino-foco-pagos"

export function destinoFocoPagos(): HTMLElement | null {
  return (
    document.getElementById(ID_DESTINO_FOCO_PAGOS) ??
    document.getElementById(ID_CONTENIDO)
  )
}

const CUADROS_DE_ESPERA = 30

/**
 * Si tras el cambio el foco cae en `<body>` (el control que lo tenía se
 * desmontó al refrescarse la página), lo lleva al destino. Espera unos
 * cuadros: el refresco del servidor llega en la misma transición.
 */
export function rescatarFoco(
  destino: () => HTMLElement | null = destinoFocoPagos
): void {
  let restantes = CUADROS_DE_ESPERA
  const revisar = () => {
    const activo = document.activeElement
    if (!activo || activo === document.body) {
      destino()?.focus()
      return
    }
    restantes -= 1
    if (restantes > 0) requestAnimationFrame(revisar)
  }
  requestAnimationFrame(revisar)
}
