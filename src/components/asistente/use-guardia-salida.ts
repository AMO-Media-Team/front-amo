"use client"

import { useEffect, useEffectEvent } from "react"

function destinoInterno(evento: MouseEvent): string | null {
  if (
    evento.defaultPrevented ||
    evento.button !== 0 ||
    evento.metaKey ||
    evento.ctrlKey ||
    evento.shiftKey ||
    evento.altKey
  ) {
    return null
  }
  const objetivo = evento.target instanceof Element ? evento.target : null
  const enlace = objetivo?.closest<HTMLAnchorElement>("a[href]")
  if (
    !enlace ||
    enlace.target === "_blank" ||
    enlace.hasAttribute("download")
  ) {
    return null
  }
  const url = new URL(enlace.href, window.location.href)
  // Otro origen: lo cubre `beforeunload`. Misma ruta: no se sale de la página.
  if (url.origin !== window.location.origin) return null
  if (url.pathname === window.location.pathname) return null
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * Guardia de cambios sin guardar: mientras `activa`, avisa del navegador al
 * recargar o cerrar la pestaña (`beforeunload`) e intercepta los clics en
 * enlaces internos (fase de captura, antes que `next/link`) para que la
 * página pida confirmación con `onIntento(destino)`.
 */
export function useGuardiaSalida(
  activa: boolean,
  onIntento: (destino: string) => void
): void {
  const intentar = useEffectEvent(onIntento)

  useEffect(() => {
    if (!activa) return

    function antesDeDescargar(evento: BeforeUnloadEvent) {
      evento.preventDefault()
    }
    function alHacerClic(evento: MouseEvent) {
      const destino = destinoInterno(evento)
      if (!destino) return
      evento.preventDefault()
      evento.stopPropagation()
      intentar(destino)
    }

    window.addEventListener("beforeunload", antesDeDescargar)
    document.addEventListener("click", alHacerClic, true)
    return () => {
      window.removeEventListener("beforeunload", antesDeDescargar)
      document.removeEventListener("click", alHacerClic, true)
    }
  }, [activa])
}
