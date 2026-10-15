"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

import { CONSULTA_TABLET, cookieVistaTablet } from "./vista-tablet"

function suscribir(notificar: () => void): () => void {
  const consulta = window.matchMedia(CONSULTA_TABLET)
  consulta.addEventListener("change", notificar)
  return () => consulta.removeEventListener("change", notificar)
}

const esTablet = () => window.matchMedia(CONSULTA_TABLET).matches

/**
 * Estado abierto/colapsado de la barra lateral. Manda la preferencia guardada
 * en la cookie `sidebar_state` (la escribe el SidebarProvider al alternar);
 * sin preferencia, en tablet arranca colapsada para dar espacio al contenido.
 *
 * `tabletInicial` es la pista de la visita anterior (`vista-tablet`): el
 * servidor y la hidratación pintan con ella y, ya en el navegador, manda el
 * ancho real, que queda anotado para la próxima visita. `asentada` pasa a
 * `true` tras el primer pintado: hasta entonces la barra no debe animarse (si
 * la pista falló, la corrección es un cambio seco, no una barra a medio
 * plegar).
 */
export function useEstadoBarraLateral(
  preferenciaInicial: boolean | null,
  tabletInicial: boolean
) {
  const [preferencia, setPreferencia] = useState(preferenciaInicial)
  const [asentada, setAsentada] = useState(false)
  const tablet = useSyncExternalStore(suscribir, esTablet, () => tabletInicial)

  useEffect(() => {
    document.cookie = cookieVistaTablet(tablet)
  }, [tablet])
  useEffect(() => {
    const cuadro = requestAnimationFrame(() => setAsentada(true))
    return () => cancelAnimationFrame(cuadro)
  }, [])

  return {
    abierta: preferencia ?? !tablet,
    setAbierta: setPreferencia,
    asentada,
  }
}
