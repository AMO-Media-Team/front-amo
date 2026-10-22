"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { momentoRenovacion } from "@/lib/archivos/subida"
import type { UrlFirmada } from "@/lib/archivos/tipos"
import type { ResultadoAccion } from "@/lib/result"

export type EstadoUrlFirmada =
  | { tipo: "cargando" }
  | {
      tipo: "lista"
      url: string
      /** Hora local de recepción: la vigencia se cuenta desde aquí (no desde el reloj del servidor). */
      recibidaEn: number
      vigenciaSegundos: number
    }
  | { tipo: "error"; mensaje: string }

const MENSAJE_INESPERADO = "No pudimos abrir el archivo. Inténtalo de nuevo."

export interface UrlFirmadaViva {
  estado: EstadoUrlFirmada
  /** URL vigente (o `null` mientras carga o si falló). */
  url: string | null
  /** Pide una URL nueva sin quitar la actual (p. ej. si el `<video>` falló a mitad). */
  renovar: () => void
  /** Tras un error: vuelve a «cargando» y pide otra. */
  reintentar: () => void
}

/**
 * Pide la URL firmada al montar y la renueva antes de que venza (al 80 % de
 * su vida, como `useFirmas` de operación), solo mientras la pestaña está
 * visible: al volver a ella, si ya caducó, se pide otra. Así un enlace «Abrir»
 * siempre lleva una URL vigente sin esperar al servidor en el clic (que el
 * bloqueador de ventanas emergentes de Safari exige).
 */
export function useUrlFirmada(
  firmar: () => Promise<ResultadoAccion<UrlFirmada>>
): UrlFirmadaViva {
  const [estado, setEstado] = useState<EstadoUrlFirmada>({ tipo: "cargando" })
  const firmarActual = useRef(firmar)
  const solicitud = useRef(0)

  useEffect(() => {
    firmarActual.current = firmar
  })

  const renovar = useCallback(() => {
    const numero = ++solicitud.current
    void firmarActual
      .current()
      .then(
        (resultado): EstadoUrlFirmada =>
          resultado.ok
            ? {
                tipo: "lista",
                url: resultado.datos.url,
                recibidaEn: Date.now(),
                vigenciaSegundos: resultado.datos.vigenciaSegundos,
              }
            : { tipo: "error", mensaje: resultado.error },
        (): EstadoUrlFirmada => ({ tipo: "error", mensaje: MENSAJE_INESPERADO })
      )
      .then((nuevo) => {
        // Una respuesta lenta no pisa a una más reciente.
        if (numero === solicitud.current) setEstado(nuevo)
      })
  }, [])

  useEffect(() => {
    renovar()
  }, [renovar])

  useEffect(() => {
    if (estado.tipo !== "lista") return
    const renovarEn = momentoRenovacion(
      estado.recibidaEn,
      estado.vigenciaSegundos
    )
    const siVisible = () => {
      if (document.visibilityState === "visible" && Date.now() >= renovarEn) {
        renovar()
      }
    }
    const temporizador = setTimeout(
      siVisible,
      Math.max(0, renovarEn - Date.now())
    )
    document.addEventListener("visibilitychange", siVisible)
    return () => {
      clearTimeout(temporizador)
      document.removeEventListener("visibilitychange", siVisible)
    }
  }, [estado, renovar])

  const reintentar = useCallback(() => {
    setEstado({ tipo: "cargando" })
    renovar()
  }, [renovar])

  return {
    estado,
    url: estado.tipo === "lista" ? estado.url : null,
    renovar,
    reintentar,
  }
}
