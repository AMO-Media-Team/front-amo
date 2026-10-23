"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  type OpcionesCompresion,
  COMPRESION_CAPTURA,
} from "@/lib/archivos/compresion"
import { categoriaDe, mimeDeArchivo } from "@/lib/archivos/mime"
import type {
  ArchivoSubido,
  DescripcionArchivo,
  SubidaPreparada,
} from "@/lib/archivos/tipos"
import type { ReglasArchivo } from "@/lib/archivos/validar"
import type { ResultadoAccion } from "@/lib/result"

import type { ResultadoSubida } from "./motor-subida"
import { type Subida, useSubida } from "./use-subida"
import type { ElementoSubida } from "./use-subidas"

export interface OpcionesCargaCaptura {
  /** Server Action que autoriza y firma la ruta (`prepararSubidaFirmada`). */
  preparar: (
    descripcion: DescripcionArchivo
  ) => Promise<ResultadoAccion<SubidaPreparada>>
  /**
   * Server Action que comprueba que la ruta es de su carpeta y que el objeto
   * existe (`archivoPerteneceA` + `confirmarObjeto`). NO guarda la fila de
   * negocio: eso lo hace el envío del formulario con la captura ya lista, así
   * un error del formulario (un enlace mal copiado) no obliga a subirla otra
   * vez. Idempotente por ruta.
   */
  confirmar: (captura: ArchivoSubido) => Promise<ResultadoAccion<unknown>>
  /** Lo que exige el archivo final, ya comprimido. */
  reglas: ReglasArchivo
  /** `COMPRESION_CAPTURA` (≤ 1600 px, WebP) por omisión. */
  comprimir?: OpcionesCompresion
  /** Miniatura de ≤ 320 px para listas (sí por omisión). */
  miniatura?: boolean
}

/** Resultado de esperar la captura al enviar el formulario. */
export type CapturaLista =
  { ok: true; captura: ArchivoSubido } | { ok: false; error: string }

export interface CargaCaptura {
  subida: Subida<unknown>
  /** Captura elegida (subiéndose, lista o con error). */
  elegida: File | null
  /** `blob:` local para revisarla mientras sube. */
  vistaPrevia: string | null
  /** Ya está en Storage y verificada: se puede enviar con el formulario. */
  lista: ArchivoSubido | null
  /** Lo que pinta `ListaSubidas` mientras sube o si falló. */
  elemento: ElementoSubida | null
  /** Elige una captura y empieza a subirla de inmediato. */
  elegir: (archivo: File) => void
  /** Cancela lo que esté en curso y suelta la captura. */
  descartar: () => void
  /** Retoma tras un error o una cancelación, desde la etapa que falló. */
  reintentar: () => void
  /**
   * Espera la subida en curso (o la retoma si había fallado) y entrega la
   * captura verificada; `null` si no hay ninguna elegida.
   */
  obtener: () => Promise<CapturaLista | null>
}

interface Eleccion {
  archivo: File
  vistaPrevia: string | null
}

type Pendiente = Promise<ResultadoSubida<unknown> | null>

const MENSAJE_SIN_RESULTADO =
  "La captura no terminó de subir. Inténtalo de nuevo."
const MENSAJE_CAMBIADA =
  "Cambiaste la captura mientras se enviaba. Revísala y vuelve a enviar."

function elegirArchivo(archivo: File): Eleccion {
  const imagen = categoriaDe(mimeDeArchivo(archivo)) === "imagen"
  return { archivo, vistaPrevia: imagen ? URL.createObjectURL(archivo) : null }
}

function comoLista(resultado: ResultadoSubida<unknown> | null): CapturaLista {
  if (!resultado) return { ok: false, error: MENSAJE_SIN_RESULTADO }
  return resultado.ok
    ? { ok: true, captura: resultado.archivo }
    : { ok: false, error: resultado.error }
}

/**
 * Una captura de pantalla (panel de estadísticas, publicación) que se sube EN
 * CUANTO se elige, mientras la persona completa el resto del formulario:
 * compresión a WebP en el celular, miniatura, reintentos, pausa sin conexión
 * y verificación en el servidor (`useSubida`). Al enviar, `obtener()` espera
 * lo que falte y entrega la captura lista para la Server Action del
 * formulario, que vuelve a comprobarla antes de guardar la fila.
 */
export function useCargaCaptura({
  preparar,
  confirmar,
  reglas,
  comprimir = COMPRESION_CAPTURA,
  miniatura = true,
}: OpcionesCargaCaptura): CargaCaptura {
  const subida = useSubida<unknown>({
    preparar,
    confirmar,
    reglas,
    comprimir,
    miniatura,
  })
  const { subir, reintentar: reintentarSubida, reiniciar } = subida
  const [eleccion, setEleccion] = useState<Eleccion | null>(null)
  const [lista, setLista] = useState<ArchivoSubido | null>(null)
  /** La subida vigente: una anterior que termina tarde ya no cuenta. */
  const pendiente = useRef<Pendiente | null>(null)

  // La vista previa se libera al cambiar de captura y al salir de la página.
  useEffect(() => {
    const url = eleccion?.vistaPrevia
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [eleccion])

  const seguir = useCallback((promesa: Pendiente): Pendiente => {
    pendiente.current = promesa
    void promesa.then((resultado) => {
      if (pendiente.current === promesa && resultado?.ok) {
        setLista(resultado.archivo)
      }
    })
    return promesa
  }, [])

  const elegir = useCallback(
    (archivo: File) => {
      reiniciar()
      setLista(null)
      setEleccion(elegirArchivo(archivo))
      seguir(subir(archivo))
    },
    [reiniciar, seguir, subir]
  )

  const descartar = useCallback(() => {
    pendiente.current = null
    reiniciar()
    setLista(null)
    setEleccion(null)
  }, [reiniciar])

  const reintentar = useCallback(() => {
    seguir(reintentarSubida())
  }, [reintentarSubida, seguir])

  const archivo = eleccion?.archivo ?? null

  const obtener = useCallback(async (): Promise<CapturaLista | null> => {
    if (!archivo) return null
    const enCurso = pendiente.current ?? seguir(subir(archivo))
    const resultado = await enCurso
    // Mientras esperaba, la persona cambió o quitó la captura.
    if (pendiente.current !== enCurso) {
      return { ok: false, error: MENSAJE_CAMBIADA }
    }
    if (resultado?.ok) return comoLista(resultado)
    // Falló o se canceló: al enviar se retoma desde la etapa que falló.
    return comoLista(await seguir(reintentarSubida()))
  }, [archivo, reintentarSubida, seguir, subir])

  const elemento: ElementoSubida | null =
    eleccion && subida.estado !== "en-cola" && subida.estado !== "completada"
      ? {
          id: "captura",
          nombre: eleccion.archivo.name,
          tamano: eleccion.archivo.size,
          tipo: mimeDeArchivo(eleccion.archivo),
          vistaPrevia: eleccion.vistaPrevia,
          resultado: null,
          estado: subida.estado,
          progreso: subida.progreso,
          error: subida.error,
          intento: subida.intento,
          reanudaEn: subida.reanudaEn,
        }
      : null

  return {
    subida,
    elegida: archivo,
    vistaPrevia: eleccion?.vistaPrevia ?? null,
    lista,
    elemento,
    elegir,
    descartar,
    reintentar,
    obtener,
  }
}
