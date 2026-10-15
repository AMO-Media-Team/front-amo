"use client"

import { MotionConfig } from "motion/react"
import { useTheme } from "next-themes"
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"

import { guardarPreferencias } from "../actions"
import {
  crearFormateadorNumeros,
  type FormateadorNumeros,
} from "../formato-numeros"
import {
  type CambiosPreferencias,
  type DensidadPreferida,
  PREFERENCIAS_POR_DEFECTO,
  type PreferenciasInterfaz,
} from "../preferencias"

/**
 * Preferencias de interfaz de la persona, aplicadas en caliente:
 * - `movimiento: "reducido"` impone movimiento reducido en toda la app aunque
 *   el sistema no lo pida (MotionConfig + CSS sobre `html[data-movimiento]`).
 * - `densidad` y `formatoNumeros` se exponen con `useDensidadPreferida` y
 *   `useFormatoNumeros` para tablas y cifras.
 * - `tema` lo aplica next-themes; aquí solo se trae el guardado en la cuenta
 *   cuando este navegador aún no eligió uno.
 *
 * Lo monta `(app)/layout.tsx` alrededor del AppShell, con las preferencias
 * guardadas en la cuenta: valen en todas las secciones.
 */

export type EstadoGuardado = "inactivo" | "guardando" | "guardado" | "error"

interface ValorPreferencias {
  preferencias: PreferenciasInterfaz
  estado: EstadoGuardado
  /** Aplica al instante y guarda en la cuenta; si falla, revierte y avisa. */
  actualizar: (cambios: CambiosPreferencias) => void
}

const ContextoPreferencias = createContext<ValorPreferencias | null>(null)

/** Clave de `localStorage` de next-themes (valor por defecto de la librería). */
const CLAVE_TEMA_LOCAL = "theme"

/**
 * CSS que neutraliza animaciones y transiciones cuando la persona pide
 * movimiento reducido en AMO (las reglas `prefers-reduced-motion` de
 * globals.css solo reaccionan a la preferencia del sistema).
 */
const CSS_MOVIMIENTO_REDUCIDO = `
html[data-movimiento="reducido"] *,
html[data-movimiento="reducido"] *::before,
html[data-movimiento="reducido"] *::after {
  animation-duration: 1ms !important;
  animation-delay: 0ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 1ms !important;
  transition-delay: 0ms !important;
  scroll-behavior: auto !important;
}
html[data-movimiento="reducido"]::view-transition-group(*),
html[data-movimiento="reducido"]::view-transition-old(*),
html[data-movimiento="reducido"]::view-transition-new(*) {
  animation: none !important;
}
`

function temaLocalElegido(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_TEMA_LOCAL) !== null
  } catch {
    return false
  }
}

/** Refleja movimiento y densidad en `<html>` para CSS y componentes ajenos. */
function useAtributosRaiz({ movimiento, densidad }: PreferenciasInterfaz) {
  useEffect(() => {
    const raiz = document.documentElement
    raiz.dataset.movimiento = movimiento
    raiz.dataset.densidad = densidad
    return () => {
      delete raiz.dataset.movimiento
      delete raiz.dataset.densidad
    }
  }, [movimiento, densidad])
}

/** El tema de la cuenta llega a un navegador nuevo (sin elección local). */
function useTemaDeLaCuenta(tema: PreferenciasInterfaz["tema"]) {
  const { setTheme } = useTheme()
  const aplicado = useRef(false)
  useEffect(() => {
    if (aplicado.current) return
    aplicado.current = true
    if (!temaLocalElegido()) setTheme(tema)
  }, [setTheme, tema])
}

export function ProveedorPreferencias({
  inicial,
  children,
}: {
  inicial: PreferenciasInterfaz
  children: ReactNode
}) {
  const [preferencias, setPreferencias] = useState(inicial)
  const [estado, setEstado] = useState<EstadoGuardado>("inactivo")
  const confirmadas = useRef(inicial)
  const pendientes = useRef(0)

  useAtributosRaiz(preferencias)
  useTemaDeLaCuenta(inicial.tema)

  const actualizar = useCallback((cambios: CambiosPreferencias) => {
    setPreferencias((actuales) => ({ ...actuales, ...cambios }))
    setEstado("guardando")
    pendientes.current += 1
    void guardarPreferencias(cambios).then((resultado) => {
      pendientes.current -= 1
      if (resultado.ok) {
        confirmadas.current = { ...confirmadas.current, ...cambios }
        if (pendientes.current === 0) setEstado("guardado")
        return
      }
      setPreferencias(confirmadas.current)
      setEstado("error")
      toast.error("No pudimos guardar tus preferencias", {
        description: resultado.error,
      })
    })
  }, [])

  const valor = useMemo(
    () => ({ preferencias, estado, actualizar }),
    [preferencias, estado, actualizar]
  )

  return (
    <ContextoPreferencias value={valor}>
      <style href="amo-movimiento-reducido" precedence="medium">
        {CSS_MOVIMIENTO_REDUCIDO}
      </style>
      <MotionConfig
        reducedMotion={
          preferencias.movimiento === "reducido" ? "always" : "user"
        }
      >
        {children}
      </MotionConfig>
    </ContextoPreferencias>
  )
}

/** Contexto crudo: `null` fuera de un `ProveedorPreferencias`. */
export function useContextoPreferencias(): ValorPreferencias | null {
  return use(ContextoPreferencias)
}

/** Preferencias efectivas (los valores por defecto fuera del proveedor). */
export function usePreferencias(): PreferenciasInterfaz {
  return use(ContextoPreferencias)?.preferencias ?? PREFERENCIAS_POR_DEFECTO
}

/** Densidad por defecto de las tablas (la tabla puede recordar otra por tabla). */
export function useDensidadPreferida(): DensidadPreferida {
  return usePreferencias().densidad
}

/** Formateadores de cifras con los separadores que eligió la persona. */
export function useFormatoNumeros(): FormateadorNumeros {
  const { formatoNumeros } = usePreferencias()
  return useMemo(
    () => crearFormateadorNumeros(formatoNumeros),
    [formatoNumeros]
  )
}
