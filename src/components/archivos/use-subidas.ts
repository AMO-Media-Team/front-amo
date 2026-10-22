"use client"

import { type RefObject, useEffect, useState } from "react"

import { categoriaDe, mimeDeArchivo } from "@/lib/archivos/mime"
import type { ArchivoSubido } from "@/lib/archivos/tipos"

import { ENTORNO_NAVEGADOR } from "./entorno-navegador"
import {
  type ControladorSubida,
  crearSubida,
  type EntornoSubida,
  ESTADOS_ACTIVOS,
  INSTANTANEA_INICIAL,
  type InstantaneaSubida,
  type OpcionesSubida,
} from "./motor-subida"
import { useOpcionesActuales } from "./use-subida"

/** Lo que pinta `ListaSubidas` de cada archivo. */
export interface ElementoSubida<T = unknown> extends InstantaneaSubida {
  id: string
  nombre: string
  tamano: number
  tipo: string
  /** `blob:` de la imagen original para la vista previa (se revoca al quitarla). */
  vistaPrevia: string | null
  /** Lo que devolvió `confirmar`, cuando la subida terminó. */
  resultado: T | null
}

export interface OpcionesSubidas<T> extends OpcionesSubida<T> {
  /** Subidas simultáneas (2 por defecto: en un celular, más no termina antes). */
  concurrencia?: number
  /** Al completar cada archivo (p. ej. para refrescar la lista del servidor). */
  alCompletar?: (datos: T, archivo: ArchivoSubido) => void
}

export interface AccionesCola {
  /** Encola los archivos (ya validados por `ZonaArchivos`) y empieza a subir. */
  agregar: (archivos: readonly File[]) => void
  reintentar: (id: string) => void
  /** Cancela si está en curso; si aún no empezó, la quita de la lista. */
  cancelar: (id: string) => void
  quitar: (id: string) => void
  quitarCompletadas: () => void
  /** Cancela todo y libera las vistas previas (al desmontar). */
  descartarTodo: () => void
}

export interface Subidas<T> extends Omit<AccionesCola, "descartarTodo"> {
  elementos: readonly ElementoSubida<T>[]
  /** Hay algo en cola, procesando, subiendo o confirmando. */
  ocupadas: boolean
}

interface Registro<T> {
  controlador: ControladorSubida<T>
  iniciado: boolean
  vistaPrevia: string | null
}

type Fijar<T> = (
  cambio: (previos: ElementoSubida<T>[]) => ElementoSubida<T>[]
) => void

const CONCURRENCIA_POR_DEFECTO = 2

function vistaPreviaDe(archivo: File): string | null {
  return categoriaDe(mimeDeArchivo(archivo)) === "imagen"
    ? URL.createObjectURL(archivo)
    : null
}

/**
 * Cola sin React: un motor por archivo, con un máximo de subidas simultáneas.
 * `fijar` refleja cada cambio en el estado que pinta la lista.
 */
export function crearColaSubidas<T>(
  opciones: RefObject<OpcionesSubidas<T>>,
  fijar: Fijar<T>,
  entorno: EntornoSubida = ENTORNO_NAVEGADOR
): AccionesCola {
  const registros = new Map<string, Registro<T>>()

  const actualizar = (id: string, cambios: Partial<ElementoSubida<T>>) =>
    fijar((previos) =>
      previos.map((elemento) =>
        elemento.id === id ? { ...elemento, ...cambios } : elemento
      )
    )

  function iniciar(id: string, registro: Registro<T>) {
    registro.iniciado = true
    void registro.controlador.iniciar().then((final) => {
      if (final.ok && registros.has(id)) {
        actualizar(id, { resultado: final.datos })
        opciones.current.alCompletar?.(final.datos, final.archivo)
      }
      bombear()
    })
  }

  function bombear() {
    const limite = Math.max(
      1,
      opciones.current.concurrencia ?? CONCURRENCIA_POR_DEFECTO
    )
    let activos = [...registros.values()].filter(
      (registro) =>
        registro.iniciado &&
        ESTADOS_ACTIVOS.has(registro.controlador.instantanea().estado)
    ).length
    for (const [id, registro] of registros) {
      if (activos >= limite) return
      if (registro.iniciado) continue
      activos += 1
      iniciar(id, registro)
    }
  }

  function quitar(id: string) {
    const registro = registros.get(id)
    if (!registro) return
    registro.controlador.cancelar()
    if (registro.vistaPrevia) URL.revokeObjectURL(registro.vistaPrevia)
    registros.delete(id)
    fijar((previos) => previos.filter((elemento) => elemento.id !== id))
    bombear()
  }

  return {
    agregar(archivos) {
      const nuevos = archivos.map((archivo): ElementoSubida<T> => {
        const id = crypto.randomUUID()
        const vistaPrevia = vistaPreviaDe(archivo)
        const controlador = crearSubida(
          archivo,
          opciones.current,
          entorno,
          (instantanea) => actualizar(id, instantanea)
        )
        registros.set(id, { controlador, iniciado: false, vistaPrevia })
        return {
          ...INSTANTANEA_INICIAL,
          id,
          nombre: archivo.name,
          tamano: archivo.size,
          tipo: mimeDeArchivo(archivo),
          vistaPrevia,
          resultado: null,
        }
      })
      fijar((previos) => [...previos, ...nuevos])
      bombear()
    },
    reintentar(id) {
      const registro = registros.get(id)
      if (!registro) return
      const estado = registro.controlador.instantanea().estado
      // Una completada no se repite: quedaría «En espera» y avisaría dos veces.
      if (estado === "completada" || ESTADOS_ACTIVOS.has(estado)) return
      registro.iniciado = false
      actualizar(id, { estado: "en-cola", error: null, reanudaEn: null })
      bombear()
    },
    cancelar(id) {
      const registro = registros.get(id)
      if (registro?.iniciado) registro.controlador.cancelar()
      else quitar(id)
    },
    quitar,
    quitarCompletadas() {
      for (const [id, registro] of registros) {
        if (registro.controlador.instantanea().estado === "completada") {
          quitar(id)
        }
      }
    },
    descartarTodo() {
      for (const registro of registros.values()) {
        registro.controlador.cancelar()
        if (registro.vistaPrevia) URL.revokeObjectURL(registro.vistaPrevia)
      }
      registros.clear()
    },
  }
}

/**
 * Varias subidas a la vez para `ZonaArchivos` + `ListaSubidas`: cada archivo
 * pasa por el mismo motor que `useSubida` (reintentos, pausa sin conexión,
 * reanudación). Al desmontar se cancela lo que siga en curso.
 */
export function useSubidas<T>(opciones: OpcionesSubidas<T>): Subidas<T> {
  const actuales = useOpcionesActuales(opciones)
  const [elementos, setElementos] = useState<ElementoSubida<T>[]>([])
  const [cola] = useState(() => crearColaSubidas(actuales, setElementos))

  useEffect(() => () => cola.descartarTodo(), [cola])

  return {
    elementos,
    agregar: cola.agregar,
    reintentar: cola.reintentar,
    cancelar: cola.cancelar,
    quitar: cola.quitar,
    quitarCompletadas: cola.quitarCompletadas,
    ocupadas: elementos.some(
      (elemento) =>
        elemento.estado === "en-cola" || ESTADOS_ACTIVOS.has(elemento.estado)
    ),
  }
}
