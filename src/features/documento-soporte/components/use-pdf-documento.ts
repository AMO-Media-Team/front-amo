"use client"

import { useCallback, useRef, useState } from "react"

import { type Subida, useSubida } from "@/components/archivos/use-subida"
import type { ElementoSubida } from "@/components/archivos/use-subidas"
import { mimeDeArchivo } from "@/lib/archivos/mime"

import {
  confirmarPdfDocumentoSoporte,
  type PdfCargado,
  prepararPdfDocumentoSoporte,
} from "../actions"
import { LIMITES_PDF, MENSAJES_CAMPOS, type UsoPdf } from "../schemas"

export type CargaPdf =
  | { ok: true; datos: PdfCargado }
  | { ok: false; error: string; cancelada: boolean }

export interface PdfDocumento {
  subida: Subida<PdfCargado>
  archivo: File | null
  /** Lo que pinta `ListaSubidas` mientras sube o si falló. */
  elemento: ElementoSubida<PdfCargado> | null
  elegir: (archivo: File) => void
  /** Suelta el archivo (y cancela la subida si seguía). */
  quitar: () => void
  /**
   * Sube el elegido si aún no subió (o si la BD dijo que no estaba cargado) y devuelve dónde quedó; si no
   * terminó, por qué (el motivo también queda en `elemento`, junto al archivo).
   */
  asegurar: () => Promise<CargaPdf>
  /** Olvida la subida hecha: el próximo `asegurar` vuelve a subirlo. */
  olvidarCarga: () => void
}

/**
 * El PDF de un diálogo del documento soporte (el documento del proveedor o la nota de ajuste): elegirlo,
 * subirlo directo a Storage con `useSubida` (reintentos, pausa sin conexión, reanudación) y confirmarlo.
 * Lo ya subido se reutiliza si el registro falla por otro campo: corregir el número no obliga a subirlo
 * de nuevo.
 */
export function usePdfDocumento(
  liquidacionId: string,
  uso: UsoPdf
): PdfDocumento {
  const subida = useSubida<PdfCargado>({
    preparar: (archivo) =>
      prepararPdfDocumentoSoporte({ liquidacionId, uso, archivo }),
    confirmar: (archivo) =>
      confirmarPdfDocumentoSoporte({ liquidacionId, uso, archivo }),
    reglas: LIMITES_PDF,
    miniatura: false,
  })
  const { subir, reintentar, reiniciar, estado } = subida
  const [archivo, setArchivo] = useState<File | null>(null)
  const cargado = useRef<{ archivo: File; resultado: PdfCargado } | null>(null)

  const elegir = useCallback(
    (nuevo: File) => {
      reiniciar()
      cargado.current = null
      setArchivo(nuevo)
    },
    [reiniciar]
  )

  const quitar = useCallback(() => {
    reiniciar()
    cargado.current = null
    setArchivo(null)
  }, [reiniciar])

  const asegurar = useCallback(async (): Promise<CargaPdf> => {
    if (!archivo) {
      return {
        ok: false,
        error: MENSAJES_CAMPOS.archivoRequerido,
        cancelada: false,
      }
    }
    if (cargado.current?.archivo === archivo) {
      return { ok: true, datos: cargado.current.resultado }
    }
    // Tras un fallo se retoma desde la etapa que falló (no repite lo ya subido).
    const resultado =
      (estado === "error" || estado === "cancelada"
        ? await reintentar()
        : null) ?? (await subir(archivo))
    if (!resultado.ok) {
      return {
        ok: false,
        error: resultado.error,
        cancelada: resultado.cancelada,
      }
    }
    cargado.current = { archivo, resultado: resultado.datos }
    return { ok: true, datos: resultado.datos }
  }, [archivo, estado, reintentar, subir])

  const olvidarCarga = useCallback(() => {
    cargado.current = null
    reiniciar()
  }, [reiniciar])

  const elemento: ElementoSubida<PdfCargado> | null =
    archivo && subida.estado !== "en-cola" && subida.estado !== "completada"
      ? {
          id: "pdf-documento-soporte",
          nombre: archivo.name,
          tamano: archivo.size,
          tipo: mimeDeArchivo(archivo),
          vistaPrevia: null,
          resultado: null,
          estado: subida.estado,
          progreso: subida.progreso,
          error: subida.error,
          intento: subida.intento,
          reanudaEn: subida.reanudaEn,
        }
      : null

  return { subida, archivo, elemento, elegir, quitar, asegurar, olvidarCarga }
}
