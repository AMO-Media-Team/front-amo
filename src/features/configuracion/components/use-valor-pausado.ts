"use client"

import { useEffect, useState } from "react"

/** Pausa por defecto entre la última tecla y la consulta al servidor. */
export const PAUSA_BUSQUEDA_MS = 250

/**
 * Devuelve `valor` cuando lleva `espera` ms sin cambiar. Las búsquedas que
 * consultan al servidor lo usan para no lanzar una Server Action por tecla:
 * Next las despacha en fila, así que ocho letras eran ocho viajes seguidos y
 * el resultado llegaba con segundos de retraso.
 */
export function useValorPausado<T>(valor: T, espera = PAUSA_BUSQUEDA_MS): T {
  const [pausado, setPausado] = useState(valor)
  useEffect(() => {
    const temporizador = setTimeout(() => setPausado(valor), espera)
    return () => clearTimeout(temporizador)
  }, [valor, espera])
  return pausado
}
