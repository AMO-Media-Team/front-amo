"use client"

import { type RefObject, useCallback, useEffect, useRef, useState } from "react"

import { ENTORNO_NAVEGADOR } from "./entorno-navegador"
import {
  type ControladorSubida,
  crearSubida,
  ESTADOS_ACTIVOS,
  INSTANTANEA_INICIAL,
  type InstantaneaSubida,
  type OpcionesSubida,
  type ResultadoSubida,
} from "./motor-subida"

export {
  ESTADOS_ACTIVOS,
  type EstadoSubida,
  type InstantaneaSubida,
  type OpcionesSubida,
  type ResultadoSubida,
} from "./motor-subida"

/**
 * Las opciones del último render, para leerlas al iniciar una subida. Cada
 * subida conserva las que tenía al empezar: sus Server Actions y los ids que
 * cierran son los del contexto en que la persona eligió el archivo.
 */
export function useOpcionesActuales<O>(opciones: O): RefObject<O> {
  const referencia = useRef(opciones)
  useEffect(() => {
    referencia.current = opciones
  })
  return referencia
}

export interface Subida<T> extends InstantaneaSubida {
  /** Sube un archivo (cancela el anterior si seguía en curso). */
  subir: (archivo: File) => Promise<ResultadoSubida<T>>
  /** Retoma tras un error o una cancelación, desde la etapa que falló. */
  reintentar: () => Promise<ResultadoSubida<T> | null>
  cancelar: () => void
  /** Vuelve al estado inicial (tras cancelar o al cerrar el formulario). */
  reiniciar: () => void
  activa: boolean
}

/**
 * Sube UN archivo a Storage: `preparar` (Server Action que firma la ruta),
 * transferencia directa (URL firmada ≤ 6 MB o TUS) con reintentos de espera
 * creciente, pausa sin conexión y reanudación, y `confirmar` (Server Action
 * que verifica el objeto y guarda la fila). Al desmontar se cancela.
 */
export function useSubida<T>(opciones: OpcionesSubida<T>): Subida<T> {
  const actuales = useOpcionesActuales(opciones)
  const [instantanea, setInstantanea] =
    useState<InstantaneaSubida>(INSTANTANEA_INICIAL)
  const controlador = useRef<ControladorSubida<T> | null>(null)

  const subir = useCallback(
    (archivo: File) => {
      controlador.current?.cancelar()
      const propio: ControladorSubida<T> = crearSubida(
        archivo,
        actuales.current,
        ENTORNO_NAVEGADOR,
        (nueva) => {
          // Un motor reemplazado ya no pinta.
          if (controlador.current === propio) setInstantanea(nueva)
        }
      )
      controlador.current = propio
      return propio.iniciar()
    },
    [actuales]
  )

  const reintentar = useCallback(
    async () => (await controlador.current?.iniciar()) ?? null,
    []
  )
  const cancelar = useCallback(() => controlador.current?.cancelar(), [])
  const reiniciar = useCallback(() => {
    controlador.current?.cancelar()
    controlador.current = null
    setInstantanea(INSTANTANEA_INICIAL)
  }, [])

  useEffect(() => () => controlador.current?.cancelar(), [])

  return {
    ...instantanea,
    subir,
    reintentar,
    cancelar,
    reiniciar,
    activa: ESTADOS_ACTIVOS.has(instantanea.estado),
  }
}
