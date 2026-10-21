"use client"

import { createContext, use, useMemo, useSyncExternalStore } from "react"

import type { ModoTema } from "./paleta"
import { construirTemaGraficos, type TemaGraficos } from "./tema"

const CONSULTA_MOVIMIENTO = "(prefers-reduced-motion: reduce)"
const SEPARADOR = "|"

/**
 * Se re-renderiza cuando cambia la clase de <html> (next-themes y la
 * transición circular del tema la alternan) o la preferencia de movimiento.
 */
function suscribir(aviso: () => void): () => void {
  const observador = new MutationObserver(aviso)
  observador.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  })
  const movimiento = window.matchMedia(CONSULTA_MOVIMIENTO)
  movimiento.addEventListener("change", aviso)
  return () => {
    observador.disconnect()
    movimiento.removeEventListener("change", aviso)
  }
}

function modoDelDocumento(): ModoTema {
  return document.documentElement.classList.contains("dark")
    ? "oscuro"
    : "claro"
}

/** Instantánea primitiva (estable entre lecturas): "oscuro|0". */
function instantanea(): string {
  const reducido = window.matchMedia(CONSULTA_MOVIMIENTO).matches
  return [modoDelDocumento(), reducido ? "1" : "0"].join(SEPARADOR)
}

/** El tema principal es el oscuro: es el que se asume al renderizar en servidor. */
const instantaneaServidor = () => ["oscuro", "0"].join(SEPARADOR)

/**
 * Tema de una instantánea. Los tokens del documento solo se leen cuando son
 * los del modo pedido: al hidratar, React repite la instantánea del servidor
 * (oscuro) aunque `<html>` ya esté en claro; leer ahí los tokens claros daría
 * un primer render distinto al del servidor (aviso de hidratación) y, peor,
 * React no corregiría después los estilos en línea porque para él no
 * cambiaron. Con las constantes —espejo de globals.css— el primer render es
 * idéntico en ambos lados y el siguiente ya pinta el tema real.
 */
export function temaDeInstantanea(clave: string): TemaGraficos {
  const [modo, reducido] = clave.split(SEPARADOR) as [ModoTema, string]
  const reducirMovimiento = reducido === "1"
  if (typeof document === "undefined" || modoDelDocumento() !== modo) {
    return construirTemaGraficos({ modo, reducirMovimiento })
  }
  const estilos = getComputedStyle(document.documentElement)
  return construirTemaGraficos({
    modo,
    leer: (variable) => estilos.getPropertyValue(variable),
    fuente: estilos.getPropertyValue("--font-geist-sans"),
    reducirMovimiento,
  })
}

/**
 * Tema impuesto a un subárbol, sin importar el del documento: lo usa la
 * captura de gráficos para documentos (PDF en claro aunque la app esté en
 * oscuro), sin animación y con la densidad de píxeles pedida.
 */
export interface TemaForzado {
  modo: ModoTema
  /** `devicePixelRatio` del lienzo (2 = nítido al imprimir). */
  densidad?: number
}

export const ContextoTemaForzado = createContext<TemaForzado | null>(null)

function temaForzado({ modo, densidad }: TemaForzado): TemaGraficos {
  const fuente =
    typeof document === "undefined"
      ? undefined
      : getComputedStyle(document.documentElement).getPropertyValue(
          "--font-geist-sans"
        )
  // Sin lector de tokens: los del documento pueden ser del otro tema; las
  // constantes reflejan globals.css (lo vigila paleta.test.ts).
  return {
    ...construirTemaGraficos({ modo, fuente, reducirMovimiento: true }),
    densidad,
    captura: true,
  }
}

/**
 * Tema vigente de los gráficos (HEX), reactivo a claro/oscuro y a
 * `prefers-reduced-motion`. Devuelve el mismo objeto mientras nada cambie, así
 * las opciones memorizadas de Chart.js no se recalculan en cada render.
 */
export function useTemaGraficos(): TemaGraficos {
  const clave = useSyncExternalStore(
    suscribir,
    instantanea,
    instantaneaServidor
  )
  const forzado = use(ContextoTemaForzado)
  return useMemo(
    () => (forzado ? temaForzado(forzado) : temaDeInstantanea(clave)),
    [clave, forzado]
  )
}
