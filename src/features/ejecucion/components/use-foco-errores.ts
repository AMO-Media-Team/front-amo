"use client"

import { type RefObject, useCallback, useEffect, useRef, useState } from "react"

/** Controles con error: los campos (`aria-invalid`) y la zona de la captura. */
const CON_ERROR = '[aria-invalid="true"], [data-foco-error]'
/** El error general del formulario, junto al pie de acciones. */
const ERROR_GENERAL = "[data-error-general]"

/**
 * Lleva a la vista el primer error del formulario, en el orden de la página:
 * el control recibe el foco y queda centrado (el pie de acciones fijo tapa el
 * borde inferior de la pantalla del celular); si solo hay un error general,
 * se desplaza hasta él.
 */
export function mostrarPrimerError(contenedor: HTMLElement | null): void {
  const control = contenedor?.querySelector<HTMLElement>(CON_ERROR) ?? null
  const destino =
    control ?? contenedor?.querySelector<HTMLElement>(ERROR_GENERAL) ?? null
  if (!destino) return
  if (control && document.activeElement !== control) {
    control.focus({ preventScroll: true })
  }
  const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  destino.scrollIntoView({
    block: "center",
    behavior: reducido ? "auto" : "smooth",
  })
}

/**
 * Mientras se envía, los campos están deshabilitados y no aceptan el foco (el
 * `shouldFocus` de `setError` no hace nada en ese momento): lo que se pide con
 * la función que devuelve se cumple cuando el envío termina, con los campos
 * ya habilitados y los errores pintados. Fuera de un envío, en el render
 * siguiente.
 */
export function useFocoErrores(
  pendiente: boolean,
  contenedor: RefObject<HTMLElement | null>
): () => void {
  const [pedidos, setPedidos] = useState(0)
  const atendidos = useRef(0)

  useEffect(() => {
    if (pendiente || pedidos === atendidos.current) return
    atendidos.current = pedidos
    mostrarPrimerError(contenedor.current)
  }, [pendiente, pedidos, contenedor])

  return useCallback(() => setPedidos((total) => total + 1), [])
}
