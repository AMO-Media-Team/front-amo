import { useSyncExternalStore } from "react"

const MOBILE_BREAKPOINT = 768
const CONSULTA = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function suscribir(notificar: () => void): () => void {
  const mql = window.matchMedia(CONSULTA)
  mql.addEventListener("change", notificar)
  return () => mql.removeEventListener("change", notificar)
}

const esMovil = () => window.matchMedia(CONSULTA).matches
// En el servidor se asume escritorio; el cliente corrige tras hidratar.
const esMovilServidor = () => false

/** `true` por debajo de 768 px (lo usa el Sidebar de shadcn para cambiar a Sheet). */
export function useIsMobile(): boolean {
  return useSyncExternalStore(suscribir, esMovil, esMovilServidor)
}
