"use client"

import { useCallback, useEffect, useState } from "react"

import { type Subida, useSubida } from "@/components/archivos/use-subida"
import type { ElementoSubida } from "@/components/archivos/use-subidas"
import { COMPRESION_CAPTURA } from "@/lib/archivos/compresion"
import { categoriaDe, mimeDeArchivo } from "@/lib/archivos/mime"

import { confirmarDocumento, prepararSubidaDocumento } from "../actions"
import { REGLAS_DOCUMENTO } from "../catalogo"
import type { DocumentoCargado, TipoDocumentoMedio } from "../tipos"

interface Eleccion {
  archivo: File
  /** `blob:` local de una imagen, para revisarla antes de subirla. */
  vistaPrevia: string | null
}

function elegirArchivo(archivo: File): Eleccion {
  const imagen = categoriaDe(mimeDeArchivo(archivo)) === "imagen"
  return { archivo, vistaPrevia: imagen ? URL.createObjectURL(archivo) : null }
}

export interface CargaDocumento {
  subida: Subida<DocumentoCargado>
  /** Archivo elegido que aún no se sube (o que se está subiendo). */
  elegido: File | null
  vistaPrevia: string | null
  /** Lo que pinta `ListaSubidas` mientras hay una subida en marcha o fallida. */
  elemento: ElementoSubida<DocumentoCargado> | null
  elegir: (archivo: File) => void
  /** Sube el elegido; `true` si quedó registrado. */
  subir: () => Promise<boolean>
  reintentar: () => Promise<boolean>
  /** Cancela lo que esté en curso y suelta el archivo. */
  descartar: () => void
}

type Resultado = { ok: true; datos: DocumentoCargado } | { ok: false }

/**
 * Una carga de documento: elegir (con vista previa), subir directo a Storage
 * con `useSubida` (compresión a WebP de las fotos, reintentos, pausa sin
 * conexión y reanudación) y confirmar. Vive en la tarjeta del documento, así
 * que cerrar la hoja no interrumpe la subida.
 */
export function useCargaDocumento(
  tipo: TipoDocumentoMedio,
  alCompletar: (documento: DocumentoCargado) => void
): CargaDocumento {
  const subida = useSubida<DocumentoCargado>({
    preparar: (archivo) => prepararSubidaDocumento({ tipo, archivo }),
    confirmar: (archivo) => confirmarDocumento({ tipo, archivo }),
    comprimir: COMPRESION_CAPTURA,
    reglas: REGLAS_DOCUMENTO,
  })
  const [eleccion, setEleccion] = useState<Eleccion | null>(null)
  const { subir: subirArchivo, reintentar: reintentarSubida, reiniciar } =
    subida

  // La vista previa se libera al cambiar de archivo y al salir de la página.
  useEffect(() => {
    const url = eleccion?.vistaPrevia
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [eleccion])

  const terminar = useCallback(
    (resultado: Resultado) => {
      if (!resultado.ok) return false
      reiniciar()
      setEleccion(null)
      alCompletar(resultado.datos)
      return true
    },
    [alCompletar, reiniciar]
  )

  const elegir = useCallback(
    (archivo: File) => {
      reiniciar()
      setEleccion(elegirArchivo(archivo))
    },
    [reiniciar]
  )

  const archivo = eleccion?.archivo ?? null

  const subir = useCallback(async () => {
    if (!archivo) return false
    return terminar(await subirArchivo(archivo))
  }, [archivo, subirArchivo, terminar])

  const reintentar = useCallback(async () => {
    const resultado = await reintentarSubida()
    return resultado ? terminar(resultado) : false
  }, [reintentarSubida, terminar])

  const descartar = useCallback(() => {
    reiniciar()
    setEleccion(null)
  }, [reiniciar])

  const elemento: ElementoSubida<DocumentoCargado> | null =
    eleccion && subida.estado !== "en-cola"
      ? {
          id: tipo,
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
