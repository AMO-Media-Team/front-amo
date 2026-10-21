"use client"

import { debounce, type ParserMap, useQueryStates, type Values } from "nuqs"
import { useMemo, useTransition } from "react"

import type { DefinicionEstadoTabla, Orden, TamanoPagina } from "./estado-url"

/** Espera tras la última tecla antes de consultar al servidor. */
const ESPERA_BUSQUEDA_MS = 350

/** Parámetros comunes a toda tabla (los filtros se leen con `valoresFiltro`). */
export interface EstadoBaseTabla<C extends string> {
  q: string
  pagina: number
  tamano: TamanoPagina
  orden: Orden<C>
}

export interface ControlEstadoTabla<C extends string> {
  estado: EstadoBaseTabla<C>
  /** `true` mientras el servidor responde a un cambio de la URL. */
  cargando: boolean
  buscar: (texto: string) => void
  valoresFiltro: (clave: string) => readonly string[]
  filtrar: (clave: string, valores: readonly string[]) => void
  /** `null` vuelve al orden por defecto. */
  ordenar: (orden: Orden<C> | null) => void
  irAPagina: (pagina: number) => void
  cambiarTamano: (tamano: TamanoPagina) => void
  /** Quita búsqueda y filtros (conserva orden y tamaño). */
  limpiarFiltros: () => void
}

/**
 * Lee y escribe el estado de una tabla en la URL. Cada cambio navega sin
 * scroll (`shallow: false`): el Server Component vuelve a consultar con los
 * mismos parsers y React conserva la vista anterior mientras llega la nueva
 * (`cargando`). Cambiar búsqueda, filtros, orden o tamaño vuelve a la página 1.
 */
export function useEstadoTabla<C extends string, F extends ParserMap>(
  definicion: DefinicionEstadoTabla<C, F>
): ControlEstadoTabla<C> {
  const [cargando, iniciarTransicion] = useTransition()
  const [estado, fijar] = useQueryStates(definicion.parsers, {
    shallow: false,
    scroll: false,
    startTransition: iniciarTransicion,
  })

  const acciones = useMemo(() => {
    // Las claves de filtro son dinámicas (las define cada dominio): se
    // escriben con un objeto indexado, validado por los parsers al serializar.
    type Cambios = Parameters<typeof fijar>[0]
    const cambiar = (
      cambios: Record<string, unknown>,
      opciones?: Parameters<typeof fijar>[1]
    ) => void fijar({ pagina: null, ...cambios } as Cambios, opciones)

    return {
      buscar: (texto: string) =>
        cambiar(
          { q: texto.trim() ? texto : null },
          {
            limitUrlUpdates: texto.trim()
              ? debounce(ESPERA_BUSQUEDA_MS)
              : undefined,
          }
        ),
      filtrar: (clave: string, valores: readonly string[]) =>
        cambiar({ [clave]: valores.length > 0 ? [...valores] : null }),
      ordenar: (orden: Orden<C> | null) => cambiar({ orden }),
      irAPagina: (pagina: number) =>
        void fijar({ pagina: Math.max(1, pagina) } as Cambios),
      cambiarTamano: (tamano: TamanoPagina) => cambiar({ tamano }),
      limpiarFiltros: () =>
        cambiar(
          Object.fromEntries(
            ["q", ...definicion.clavesFiltro].map((clave) => [clave, null])
          )
        ),
    }
  }, [fijar, definicion.clavesFiltro])

  // Con `F` genérico TypeScript no resuelve los tipos de los parsers base; sus
  // valores por defecto (`withDefault`) garantizan que nunca son nulos.
  const valores = estado as Values<DefinicionEstadoTabla<C, F>["parsers"]> &
    Record<string, unknown>
  const base: EstadoBaseTabla<C> = {
    q: valores.q as string,
    pagina: valores.pagina as number,
    tamano: valores.tamano as TamanoPagina,
    orden: valores.orden as Orden<C>,
  }

  const valoresFiltro = (clave: string): readonly string[] => {
    const valor = valores[clave]
    return Array.isArray(valor) ? valor.map(String) : []
  }

  return { estado: base, cargando, valoresFiltro, ...acciones }
}
