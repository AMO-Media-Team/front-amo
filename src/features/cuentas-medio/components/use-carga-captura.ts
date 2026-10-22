"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { type Subida, useSubida } from "@/components/archivos/use-subida"
import type { ElementoSubida } from "@/components/archivos/use-subidas"
import { COMPRESION_CAPTURA } from "@/lib/archivos/compresion"
import { categoriaDe, mimeDeArchivo } from "@/lib/archivos/mime"
import type { ArchivoSubido } from "@/lib/archivos/tipos"
import { fallo, type ResultadoAccion } from "@/lib/result"

import {
  enviarCapturaCodigo,
  enviarVerificacionManual,
  prepararCaptura,
} from "../actions"
import { REGLAS_CAPTURA } from "../schemas"
import type { VerificacionEnviada } from "../tipos"

/** A qué verificación va la captura que se sube. */
export type DestinoCaptura =
  | {
      metodo: "MANUAL"
      /** Tal como se escribió: el servidor aplica el mismo esquema. */
      seguidores: string
    }
  | { metodo: "CODIGO_HISTORIA"; verificacionId: string }

interface Eleccion {
  archivo: File
  /** `blob:` local, para revisar la captura antes de enviarla. */
  vistaPrevia: string | null
}

function elegirArchivo(archivo: File): Eleccion {
  const imagen = categoriaDe(mimeDeArchivo(archivo)) === "imagen"
  return { archivo, vistaPrevia: imagen ? URL.createObjectURL(archivo) : null }
}

export interface CargaCaptura {
  subida: Subida<VerificacionEnviada>
  /** Captura elegida que aún no se envía (o que se está enviando). */
  elegida: File | null
  vistaPrevia: string | null
  /** Lo que pinta `ListaSubidas` mientras hay un envío en marcha o fallido. */
  elemento: ElementoSubida<VerificacionEnviada> | null
  elegir: (archivo: File) => void
  /** Sube la elegida y la entrega a su verificación; `true` si quedó guardada. */
  enviar: (destino: DestinoCaptura) => Promise<boolean>
  reintentar: () => Promise<boolean>
  /** Cancela lo que esté en curso y suelta la captura. */
  descartar: () => void
}

type Resultado = { ok: true } | { ok: false }

const SIN_DESTINO =
  "No sabemos a qué verificación corresponde la captura. Cierra y vuelve a empezar."

function entregar(
  cuentaId: string,
  destino: DestinoCaptura,
  captura: ArchivoSubido
): Promise<ResultadoAccion<VerificacionEnviada>> {
  return destino.metodo === "MANUAL"
    ? enviarVerificacionManual({
        cuentaId,
        seguidores: destino.seguidores,
        captura,
      })
    : enviarCapturaCodigo({ verificacionId: destino.verificacionId, captura })
}

/**
 * La captura de una verificación: elegir (con vista previa), subir directo a
 * Storage con `useSubida` (compresión a WebP en el celular, reintentos, pausa
 * sin conexión y reanudación) y entregarla a su verificación (la acción es
 * idempotente por ruta). Vive en la tarjeta de la cuenta: cerrar la hoja no
 * interrumpe el envío.
 */
export function useCargaCaptura(
  cuentaId: string,
  alCompletar: () => void
): CargaCaptura {
  const destino = useRef<DestinoCaptura | null>(null)
  const subida = useSubida<VerificacionEnviada>({
    preparar: (descripcion) => prepararCaptura({ cuentaId, descripcion }),
    confirmar: (captura) => {
      const actual = destino.current
      return actual
        ? entregar(cuentaId, actual, captura)
        : Promise.resolve(fallo(SIN_DESTINO))
    },
    comprimir: COMPRESION_CAPTURA,
    reglas: REGLAS_CAPTURA,
  })
  const [eleccion, setEleccion] = useState<Eleccion | null>(null)
  const { subir, reintentar: reintentarSubida, reiniciar } = subida

  // La vista previa se libera al cambiar de captura y al salir de la página.
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
      destino.current = null
      alCompletar()
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

  const enviar = useCallback(
    async (nuevo: DestinoCaptura) => {
      if (!archivo) return false
      destino.current = nuevo
      return terminar(await subir(archivo))
    },
    [archivo, subir, terminar]
  )

  const reintentar = useCallback(async () => {
    const resultado = await reintentarSubida()
    return resultado ? terminar(resultado) : false
  }, [reintentarSubida, terminar])

  const descartar = useCallback(() => {
    reiniciar()
    setEleccion(null)
  }, [reiniciar])

  const elemento: ElementoSubida<VerificacionEnviada> | null =
    eleccion && subida.estado !== "en-cola"
      ? {
          id: cuentaId,
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
    elemento,
    elegir,
    enviar,
    reintentar,
    descartar,
  }
}
