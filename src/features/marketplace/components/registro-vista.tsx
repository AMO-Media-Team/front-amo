"use client"

import { useEffect, useRef } from "react"

import { registrarVistaOferta } from "../actions"

/**
 * Registra la vista del detalle (MED-009 c2) cuando la ficha se muestra de
 * verdad, no cuando un enlace la precarga. Una vez por oferta y montaje (el
 * doble efecto del modo estricto conserva la referencia). Un fallo no se
 * muestra: la vista es un dato para la tasa de aceptación y la marca «Nueva».
 */
export function RegistroVista({ ofertaId }: { ofertaId: string }) {
  const registrada = useRef<string | null>(null)

  useEffect(() => {
    if (registrada.current === ofertaId) return
    registrada.current = ofertaId
    registrarVistaOferta({ ofertaId }).catch(() => {
      // Sin conexión: la próxima apertura la registra.
    })
  }, [ofertaId])

  return null
}
