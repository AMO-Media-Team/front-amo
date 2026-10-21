"use client"

import { useEffect } from "react"

import { esAbortoDeTransicion } from "./abortos-transicion"

/**
 * Red de seguridad para las transiciones que inicia React (`<ViewTransition>`
 * al navegar): sus promesas no están a nuestro alcance, así que el descarte de
 * una transición (cambió el tamaño de la ventana, la pestaña quedó oculta)
 * llegaba a la consola como «Uncaught InvalidStateError: Transition was
 * aborted…». Llega por dos vías:
 *
 * - `error`: React entrega el rechazo de `transition.ready` a
 *   `onRecoverableError` y Next lo publica con `reportError` (React solo
 *   descarta por su cuenta los mensajes que conoce; el navegador ya usa otros).
 * - `unhandledrejection`: cualquier promesa de la transición sin manejador.
 *
 * Marca como atendidos solo esos abortos (el navegador ya no los reporta);
 * cualquier otro error sigue su curso. Se monta una vez, en los proveedores
 * globales.
 */
export function GuardiaTransiciones() {
  useEffect(() => {
    const alRechazar = (evento: PromiseRejectionEvent) => {
      if (esAbortoDeTransicion(evento.reason)) evento.preventDefault()
    }
    const alFallar = (evento: ErrorEvent) => {
      if (esAbortoDeTransicion(evento.error)) evento.preventDefault()
    }
    window.addEventListener("unhandledrejection", alRechazar)
    window.addEventListener("error", alFallar)
    return () => {
      window.removeEventListener("unhandledrejection", alRechazar)
      window.removeEventListener("error", alFallar)
    }
  }, [])
  return null
}
