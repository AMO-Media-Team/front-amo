"use client"

import { useCallback, useEffect, useState } from "react"

import { type Subida, useSubida } from "@/components/archivos/use-subida"
import type { ElementoSubida } from "@/components/archivos/use-subidas"
import { COMPRESION_CAPTURA } from "@/lib/archivos/compresion"
import { categoriaDe, mimeDeArchivo } from "@/lib/archivos/mime"

import {
  confirmarCargaDocumentoAnunciante,
  prepararCargaDocumentoAnunciante,
} from "../actions"
import { REGLAS_DOCUMENTO } from "../reglas"
import type { TipoDocumentoAnunciante } from "../requisitos"
import type { DocumentoExpediente } from "../tipos"

interface Eleccion {
  archivo: File
  /** `blob:` local de una imagen, para revisarla antes de subirla. */
  vistaPrevia: string | null
}

export interface CargaInterna {
  subida: Subida<DocumentoExpediente>
  elegido: File | null
  vistaPrevia: string | null
  /** Lo que pinta `ListaSubidas` mientras hay una subida en marcha o fallida. */
  elemento: ElementoSubida<DocumentoExpediente> | null
  elegir: (archivo: File) => void
  /** Sube el elegido; el documento registrado o `null` si no terminó. */
  subir: () => Promise<DocumentoExpediente | null>
  reintentar: () => Promise<DocumentoExpediente | null>
  /** Cancela lo que esté en curso y suelta el archivo. */
  descartar: () => void
}

/**
 * Carga de un documento por cuenta de la empresa: elegir (con vista previa),
 * subir directo a Storage con `useSubida` (compresión de fotos, reintentos,
 * pausa sin conexión y reanudación) y confirmar. Cada subida conserva el
 * `tipo` que estaba elegido al empezar (`useSubida` lee sus opciones entonces).
 */
export function useCargaInterna(
  anuncianteId: string,
  tipo: TipoDocumentoAnunciante
): CargaInterna {
  const subida = useSubida<DocumentoExpediente>({
    preparar: (archivo) =>
      prepararCargaDocumentoAnunciante({ anuncianteId, tipo, archivo }),
    confirmar: (archivo) =>
      confirmarCargaDocumentoAnunciante({ anuncianteId, tipo, archivo }),
    comprimir: COMPRESION_CAPTURA,
    reglas: REGLAS_DOCUMENTO,
  })
  const [eleccion, setEleccion] = useState<Eleccion | null>(null)
  const {
    subir: subirArchivo,
    reintentar: reintentarSubida,
    reiniciar,
  } = subida

  // La vista previa se libera al cambiar de archivo y al salir.
  useEffect(() => {
    const url = eleccion?.vistaPrevia
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [eleccion])

  const elegir = useCallback(
    (archivo: File) => {
      reiniciar()
      const imagen = categoriaDe(mimeDeArchivo(archivo)) === "imagen"
      setEleccion({
        archivo,
        vistaPrevia: imagen ? URL.createObjectURL(archivo) : null,
      })
    },
    [reiniciar]
  )

  const descartar = useCallback(() => {
    reiniciar()
    setEleccion(null)
  }, [reiniciar])

  const terminar = useCallback(
    (
      resultado: { ok: true; datos: DocumentoExpediente } | { ok: false }
    ): DocumentoExpediente | null => {
      if (!resultado.ok) return null
      reiniciar()
      setEleccion(null)
      return resultado.datos
    },
    [reiniciar]
  )

  const archivo = eleccion?.archivo ?? null

  const subir = useCallback(async () => {
    if (!archivo) return null
    return terminar(await subirArchivo(archivo))
  }, [archivo, subirArchivo, terminar])

  const reintentar = useCallback(async () => {
    const resultado = await reintentarSubida()
    return resultado ? terminar(resultado) : null
  }, [reintentarSubida, terminar])

  const elemento: ElementoSubida<DocumentoExpediente> | null =
    eleccion && subida.estado !== "en-cola"
      ? {
          id: "carga-interna",
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
    elegido: archivo,
    vistaPrevia: eleccion?.vistaPrevia ?? null,
    elemento,
    elegir,
    subir,
    reintentar,
    descartar,
  }
}
