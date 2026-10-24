"use client"

import { useCallback, useRef, useState } from "react"

import type { ResultadoSubida } from "@/components/archivos/motor-subida"
import { useSubida } from "@/components/archivos/use-subida"
import type { ElementoSubida } from "@/components/archivos/use-subidas"
import { mimeDeArchivo } from "@/lib/archivos/mime"
import type {
  ArchivoSubido,
  DescripcionArchivo,
  SubidaPreparada,
} from "@/lib/archivos/tipos"
import type { ReglasArchivo } from "@/lib/archivos/validar"
import type { ResultadoAccion } from "@/lib/result"

export interface OpcionesArchivoSoporte {
  preparar: (
    descripcion: DescripcionArchivo
  ) => Promise<ResultadoAccion<SubidaPreparada>>
  confirmar: (archivo: ArchivoSubido) => Promise<ResultadoAccion<unknown>>
  reglas: ReglasArchivo
}

export type ArchivoListo =
  { ok: true; ruta: string } | { ok: false; error: string }

export interface ArchivoSoporte {
  elegido: File | null
  /** Ya está en Storage y verificado. */
  lista: ArchivoSubido | null
  /** Lo que pinta `ListaSubidas` mientras sube o si falló. */
  elemento: ElementoSubida | null
  activa: boolean
  elegir: (archivo: File) => void
  descartar: () => void
  reintentar: () => void
  cancelar: () => void
  /** Espera la subida (o la retoma si falló) y entrega la ruta verificada. */
  obtener: () => Promise<ArchivoListo | null>
}

type Pendiente = Promise<ResultadoSubida<unknown> | null>

const MENSAJE_SIN_RESULTADO =
  "El archivo no terminó de subir. Inténtalo de nuevo."
const MENSAJE_CAMBIADO =
  "Cambiaste el archivo mientras se enviaba. Revísalo y vuelve a enviar."

function comoListo(resultado: ResultadoSubida<unknown> | null): ArchivoListo {
  if (!resultado) return { ok: false, error: MENSAJE_SIN_RESULTADO }
  return resultado.ok
    ? { ok: true, ruta: resultado.archivo.ruta }
    : { ok: false, error: resultado.error }
}

/**
 * Un PDF o una foto de soporte (factura, nota crédito, comprobante de pago)
 * que se sube EN CUANTO se elige, mientras la persona completa el resto del
 * formulario. A diferencia de las capturas, no se recomprime: el bucket
 * `soportes` admite PDF, JPEG y PNG tal cual (no WebP). Al enviar, `obtener()`
 * espera lo que falte y entrega la ruta para la Server Action, que vuelve a
 * comprobarla antes de registrar.
 */
export function useArchivoSoporte({
  preparar,
  confirmar,
  reglas,
}: OpcionesArchivoSoporte): ArchivoSoporte {
  const subida = useSubida<unknown>({
    preparar,
    confirmar,
    reglas,
    miniatura: false,
  })
  const { subir, reintentar: reintentarSubida, reiniciar, cancelar } = subida
  const [elegido, setElegido] = useState<File | null>(null)
  const [lista, setLista] = useState<ArchivoSubido | null>(null)
  const pendiente = useRef<Pendiente | null>(null)

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
      setElegido(archivo)
      seguir(subir(archivo))
    },
    [reiniciar, seguir, subir]
  )

  const descartar = useCallback(() => {
    pendiente.current = null
    reiniciar()
    setLista(null)
    setElegido(null)
  }, [reiniciar])

  const reintentar = useCallback(() => {
    seguir(reintentarSubida())
  }, [reintentarSubida, seguir])

  const obtener = useCallback(async (): Promise<ArchivoListo | null> => {
    if (!elegido) return null
    const enCurso = pendiente.current ?? seguir(subir(elegido))
    const resultado = await enCurso
    if (pendiente.current !== enCurso) {
      return { ok: false, error: MENSAJE_CAMBIADO }
    }
    if (resultado?.ok) return comoListo(resultado)
    return comoListo(await seguir(reintentarSubida()))
  }, [elegido, reintentarSubida, seguir, subir])

  const elemento: ElementoSubida | null =
    elegido && subida.estado !== "en-cola"
      ? {
          id: "soporte",
          nombre: elegido.name,
          tamano: elegido.size,
          tipo: mimeDeArchivo(elegido),
          vistaPrevia: null,
          resultado: null,
          estado: subida.estado,
          progreso: subida.progreso,
          error: subida.error,
          intento: subida.intento,
          reanudaEn: subida.reanudaEn,
        }
      : null

  return {
    elegido,
    lista,
    elemento,
    activa: subida.activa,
    elegir,
    descartar,
    reintentar,
    cancelar,
    obtener,
  }
}
