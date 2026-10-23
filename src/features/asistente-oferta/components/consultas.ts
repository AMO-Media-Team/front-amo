"use client"

/**
 * Consultas del asistente desde el navegador (React Query sobre las Server
 * Actions del estimador y del buscador de exclusiones). Los parámetros se
 * estabilizan unos instantes antes de consultar: escribir «20000» no pide
 * cinco estimaciones.
 */
import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"

import type { ResultadoAccion } from "@/lib/result"

import { buscarMediosExcluibles, estimarOferta } from "../actions"
import type { ParametrosEstimacion } from "../schemas"

export const MENSAJE_SIN_CONEXION =
  "No hay conexión con el servidor. Revisa tu red e intenta de nuevo."

/** Error con el mensaje listo para la interfaz (en español). */
export class ErrorConsultaOferta extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorConsultaOferta"
  }
}

export async function datosDe<T>(
  llamar: () => Promise<ResultadoAccion<T>>
): Promise<T> {
  let resultado: ResultadoAccion<T>
  try {
    resultado = await llamar()
  } catch {
    // Sin red la acción lanza (con un mensaje del navegador en inglés).
    throw new ErrorConsultaOferta(MENSAJE_SIN_CONEXION)
  }
  if (!resultado.ok) throw new ErrorConsultaOferta(resultado.error)
  return resultado.datos
}

/**
 * El valor tras `ms` sin cambios. Compara por contenido (JSON): un objeto
 * nuevo con los mismos datos no reinicia la espera. Solo para valores que
 * se pueden serializar (parámetros de consulta).
 */
export function useValorEstable<T>(valor: T, ms: number): T {
  const clave = JSON.stringify(valor) ?? "null"
  const [estable, setEstable] = useState(clave)
  useEffect(() => {
    if (clave === estable) return
    const temporizador = setTimeout(() => setEstable(clave), ms)
    return () => clearTimeout(temporizador)
  }, [clave, estable, ms])
  return useMemo(() => JSON.parse(estable) as T, [estable])
}

/** Solo se reintenta lo que falló por la red; un «no» del servidor no cambia al repetir. */
function reintentar(intentos: number, error: Error): boolean {
  return intentos < 1 && error.message === MENSAJE_SIN_CONEXION
}

const ESPERA_MS = 400
/** Las cifras cambian con las cuentas verificadas (despacio): un minuto sin volver a pedir. */
const VIGENCIA_MS = 60_000

export const CLAVES_ASISTENTE = {
  estimacion: (parametros: ParametrosEstimacion) =>
    ["asistente-oferta", "estimacion", parametros] as const,
  medios: (texto: string) => ["asistente-oferta", "medios", texto] as const,
}

/** Estimador por franja de un formato; `null` = aún no hay qué estimar. */
export function useEstimacion(parametros: ParametrosEstimacion | null) {
  const estables = useValorEstable(parametros, ESPERA_MS)
  return useQuery({
    queryKey: estables
      ? CLAVES_ASISTENTE.estimacion(estables)
      : ["asistente-oferta", "estimacion", "sin-parametros"],
    queryFn: estables
      ? () => datosDe(() => estimarOferta(estables))
      : skipToken,
    staleTime: VIGENCIA_MS,
    placeholderData: keepPreviousData,
    retry: reintentar,
  })
}

/** Medios verificados por nombre (al menos 3 letras), para excluirlos. */
export function useBusquedaMedios(texto: string, minimo: number) {
  const limpio = texto.trim()
  const estable = useValorEstable(limpio, 300)
  const habilitada = estable.length >= minimo
  return {
    ...useQuery({
      queryKey: CLAVES_ASISTENTE.medios(estable.toLocaleLowerCase("es-CO")),
      queryFn: habilitada
        ? () => datosDe(() => buscarMediosExcluibles({ texto: estable }))
        : skipToken,
      staleTime: VIGENCIA_MS,
      retry: reintentar,
    }),
    /** Aún no se consultó lo último que se escribió. */
    esperando: limpio !== estable && limpio.length >= minimo,
    consultado: estable,
  }
}
