"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { useEstadoConexion } from "@/hooks/use-estado-conexion"

const ID_AVISO = "estado-conexion"

/**
 * Avisa con un toast persistente cuando el navegador pierde la conexión y lo
 * sustituye por una confirmación al recuperarla. No renderiza nada propio.
 */
export function IndicadorConexion() {
  const enLinea = useEstadoConexion()
  const anterior = useRef(enLinea)

  useEffect(() => {
    if (anterior.current === enLinea) return
    anterior.current = enLinea

    if (enLinea) {
      toast.success("Conexión restablecida", { id: ID_AVISO, duration: 3000 })
    } else {
      toast.warning("Sin conexión a internet", {
        id: ID_AVISO,
        description:
          "Los cambios no se guardarán hasta que vuelva la conexión.",
        duration: Number.POSITIVE_INFINITY,
      })
    }
  }, [enLinea])

  return null
}
