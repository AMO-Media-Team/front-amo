"use client"

import { Hourglass } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { CuentaRegresiva } from "@/components/tiempo/cuenta-regresiva"
import { PASO_RELOJ_MS, useAhora } from "@/components/tiempo/use-ahora"

import type { TextoSituacion } from "../presentacion"

/** Primera espera entre reintentos; se duplica hasta el paso del reloj. */
const ESPERA_REINTENTO_MS = 2_000

/** Espera antes del reintento `intento` (0, 1, 2…): 2 s, 4 s, 8 s… hasta 30 s. */
function esperaReintento(intento: number): number {
  return Math.min(ESPERA_REINTENTO_MS * 2 ** intento, PASO_RELOJ_MS)
}

/**
 * Un corte que aún no se cumple: cuenta regresiva hasta que se habilita y,
 * al llegar la hora con la página abierta, se vuelve a pintar con el
 * formulario. La hora la decide el servidor: si el reloj del celular va
 * adelantado, el servidor aún lo ve bloqueado y vuelve a pintar esta espera,
 * así que se reintenta con una espera creciente mientras siga en pantalla.
 */
export function CorteEnEspera({
  desde,
  texto,
  ahoraServidor,
}: {
  desde: string
  texto: TextoSituacion
  ahoraServidor: number
}) {
  const router = useRouter()
  const ahora = useAhora(ahoraServidor)
  const llego = ahora.getTime() >= new Date(desde).getTime()

  useEffect(() => {
    if (!llego) return
    let intento = 0
    let temporizador: ReturnType<typeof setTimeout> | undefined
    const pedir = () => {
      router.refresh()
      temporizador = setTimeout(pedir, esperaReintento(intento))
      intento += 1
    }
    pedir()
    // Con el formulario pintado este componente se desmonta y deja de pedir.
    return () => clearTimeout(temporizador)
  }, [llego, router])

  return (
    <EstadoVacio
      titulo={texto.titulo}
      descripcion={texto.descripcion}
      icono={Hourglass}
    >
      <CuentaRegresiva
        venceAt={desde}
        ahoraServidor={ahoraServidor}
        etiqueta="Se habilita el corte"
        textos={{ pendiente: "Se habilita en", vencido: "Disponible hace" }}
        umbrales={{ criticaHoras: 0, prontoHoras: 0 }}
      />
    </EstadoVacio>
  )
}
