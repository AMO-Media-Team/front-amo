"use client"

import { useRef, useState } from "react"

import { tituloCola } from "../colas"

/** Atributo del botón «Revisar» de cada tarjeta (regreso del foco al cerrar). */
export const ATRIBUTO_REVISAR = "data-revisar"

/** Id del título de la hoja abierta (destino del foco tras decidir). */
export const ID_TITULO_HOJA = "titulo-hoja-validacion"

/** El título de la hoja si sigue abierta (no el de una que se está cerrando). */
export function tituloHoja(): HTMLElement | null {
  const titulo = document.getElementById(ID_TITULO_HOJA)
  return titulo?.closest("[data-open]") ? titulo : null
}

export interface Revisor<T> {
  /**
   * Lo que muestra la hoja. Sigue ahí mientras se cierra (la hoja sale con
   * su contenido, no vacía); `null` si nunca se abrió.
   */
  actual: T | null
  abierta: boolean
  /** El título de la hoja recibe el foco al montarse (se pasó al siguiente). */
  enfocar: boolean
  abrir: (elemento: T) => void
  cerrar: () => void
  /** Lo que se abre después de `id` (se calcula antes de decidir). */
  proximoDe: (id: string) => T | null
  /** Tras decidir `id`: abre `proximo` o cierra la hoja. */
  decidido: (id: string, proximo: T | null) => void
  /** El elemento `id` como lo trae la lista ahora (o `null` si ya no está). */
  vigenteDe: (id: string) => T | null
  /**
   * Muestra en la hoja la versión nueva de lo abierto (el medio lo cambió
   * mientras se revisaba); el título recibe el foco.
   */
  reabrir: (elemento: T) => void
  /** `focoAlCerrar` de la hoja. */
  focoAlCerrar: () => HTMLElement | null
  /** `focoAlCerrar` de los diálogos que se abren desde la hoja. */
  focoTrasDialogo: () => HTMLElement | null
}

/**
 * Una sola hoja para atender la cola de corrido: al decidir un elemento se
 * abre el siguiente de la lista (sin los ya decididos, aunque la lista aún no
 * se haya refrescado) y, al terminar, la hoja se cierra. La hoja guarda el
 * elemento que muestra: el refresco de la lista (la acción revalida la
 * página) no la cierra a mitad de camino ni le cambia lo que se está
 * revisando. Si el medio lo cambió mientras tanto, la BD no decide y la hoja
 * ofrece `reabrir` con la versión que trae la lista refrescada (`vigenteDe`).
 *
 * Foco: al pasar al siguiente, al título de la hoja; al cerrarla, al botón
 * «Revisar» que la abrió o, si ese elemento ya se decidió, al título de la
 * cola.
 */
export function useRevisor<T>(
  elementos: readonly T[],
  clave: (elemento: T) => string
): Revisor<T> {
  const [hoja, setHoja] = useState<{ actual: T | null; abierta: boolean }>({
    actual: null,
    abierta: false,
  })
  const [enfocar, setEnfocar] = useState(false)
  const decididos = useRef(new Set<string>())
  const ultimo = useRef<string | null>(null)

  function abrir(elemento: T) {
    ultimo.current = clave(elemento)
    setEnfocar(false)
    setHoja({ actual: elemento, abierta: true })
  }

  function proximoDe(id: string): T | null {
    const indice = elementos.findIndex((elemento) => clave(elemento) === id)
    return (
      elementos
        .slice(indice + 1)
        .find(
          (elemento) =>
            clave(elemento) !== id && !decididos.current.has(clave(elemento))
        ) ?? null
    )
  }

  function decidido(id: string, proximo: T | null) {
    decididos.current.add(id)
    if (proximo) ultimo.current = clave(proximo)
    setEnfocar(proximo !== null)
    setHoja((previa) =>
      proximo
        ? { actual: proximo, abierta: true }
        : { ...previa, abierta: false }
    )
  }

  function vigenteDe(id: string): T | null {
    return elementos.find((elemento) => clave(elemento) === id) ?? null
  }

  function reabrir(elemento: T) {
    ultimo.current = clave(elemento)
    setEnfocar(true)
    setHoja({ actual: elemento, abierta: true })
  }

  function focoAlCerrar(): HTMLElement | null {
    const id = ultimo.current
    const boton =
      id && !decididos.current.has(id)
        ? document.querySelector<HTMLElement>(`[${ATRIBUTO_REVISAR}="${id}"]`)
        : null
    return boton ?? tituloCola()
  }

  return {
    actual: hoja.actual,
    abierta: hoja.abierta,
    enfocar,
    abrir,
    cerrar: () => setHoja((previa) => ({ ...previa, abierta: false })),
    proximoDe,
    decidido,
    vigenteDe,
    reabrir,
    focoAlCerrar,
    focoTrasDialogo: () => tituloHoja() ?? tituloCola(),
  }
}
