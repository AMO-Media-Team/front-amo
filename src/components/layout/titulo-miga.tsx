"use client"

import { usePathname } from "next/navigation"
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  use,
  useLayoutEffect,
  useMemo,
  useState,
} from "react"

/** Título que una página fijó para la última miga, atado a su ruta. */
interface TituloDeRuta {
  ruta: string
  titulo: string
}

type FijarTitulo = Dispatch<SetStateAction<TituloDeRuta | null>>

// Dos contextos: quien fija el título (cada ficha) no se vuelve a pintar
// cuando cambia, y quien lo lee (las migas) no depende de quién lo fija.
const ContextoTitulo = createContext<TituloDeRuta | null>(null)
const ContextoFijar = createContext<FijarTitulo | null>(null)

/** Guarda el título de la última miga; lo monta el AppShell. */
export function ProveedorTituloMiga({ children }: { children: ReactNode }) {
  const [titulo, setTitulo] = useState<TituloDeRuta | null>(null)
  return (
    <ContextoFijar value={setTitulo}>
      <ContextoTitulo value={titulo}>{children}</ContextoTitulo>
    </ContextoFijar>
  )
}

/**
 * Título propio de la última miga para la ruta dada, si la página lo fijó. Se
 * ignora el de otra ruta: al navegar, la miga nunca muestra el nombre del
 * registro anterior mientras llega la página nueva.
 */
export function useTituloMiga(rutaActual: string): string | null {
  const titulo = use(ContextoTitulo)
  return titulo?.ruta === rutaActual ? titulo.titulo : null
}

/**
 * Nombra la última miga de la barra superior desde la propia página: una
 * ficha muestra «Operación › Medios › Radio Pasto» en lugar de «Detalle».
 * No pinta nada. Va en cualquier parte de la página (también dentro de un
 * Server Component): `<TituloMiga titulo={medio.nombre} />`.
 */
export function TituloMiga({ titulo }: { titulo: string }) {
  const fijar = use(ContextoFijar)
  const ruta = usePathname()
  const valor = useMemo(() => ({ ruta, titulo }), [ruta, titulo])

  // Efecto de diseño: en las navegaciones del cliente la barra ya sale con el
  // nombre en el primer pintado (el HTML del servidor trae la miga genérica y
  // se corrige al hidratar).
  useLayoutEffect(() => {
    if (!fijar) return
    fijar(valor)
    // Solo se retira el título propio: si otra página ya fijó el suyo (su
    // montaje puede adelantarse a este desmontaje), se respeta.
    return () => fijar((actual) => (actual === valor ? null : actual))
  }, [fijar, valor])

  return null
}
