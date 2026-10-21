"use client"

import { useCallback, useSyncExternalStore } from "react"

const CLAVE = "amo.mapa.giro.v1"
const EVENTO = "amo:giro-mapa"
const PAUSADO = "0"

/** Última elección de esta pestaña: vale aunque el almacenamiento esté bloqueado. */
let elegidoEnMemoria: boolean | null = null

function leerGuardado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) !== PAUSADO
  } catch {
    // Modo privado o almacenamiento bloqueado: el giro queda encendido.
    return true
  }
}

function suscribir(notificar: () => void): () => void {
  window.addEventListener("storage", notificar)
  window.addEventListener(EVENTO, notificar)
  return () => {
    window.removeEventListener("storage", notificar)
    window.removeEventListener(EVENTO, notificar)
  }
}

function leerElegido(): boolean {
  return elegidoEnMemoria ?? leerGuardado()
}

/**
 * Si la persona quiere que el globo gire solo en la vista mundial (por
 * defecto, sí) y cómo cambiarlo. La elección se recuerda en el navegador.
 */
export function useGiroPreferido(): readonly [boolean, () => void] {
  const girar = useSyncExternalStore(suscribir, leerElegido, () => true)

  const alternar = useCallback(() => {
    const siguiente = !leerElegido()
    elegidoEnMemoria = siguiente
    try {
      window.localStorage.setItem(CLAVE, siguiente ? "1" : PAUSADO)
    } catch {
      // Sin almacenamiento, la elección dura lo que dure la pestaña.
    }
    window.dispatchEvent(new Event(EVENTO))
  }, [])

  return [girar, alternar]
}
