"use client"

import { useSyncExternalStore } from "react"

function suscribir(notificar: () => void): () => void {
  window.addEventListener("online", notificar)
  window.addEventListener("offline", notificar)
  return () => {
    window.removeEventListener("online", notificar)
    window.removeEventListener("offline", notificar)
  }
}

const leerEnLinea = () => navigator.onLine
// En el servidor se asume conexión para no pintar avisos falsos al hidratar.
const leerEnLineaServidor = () => true

/** `true` si el navegador reporta conexión (navigator.onLine). */
export function useEstadoConexion(): boolean {
  return useSyncExternalStore(suscribir, leerEnLinea, leerEnLineaServidor)
}
