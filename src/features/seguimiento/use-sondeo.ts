"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"

/** Cada cuánto se vuelve a consultar el seguimiento (ANU-011: 60 segundos). */
export const INTERVALO_SONDEO_MS = 60_000

/**
 * Una consulta en curso. `aMano` dice si la pidió la persona («Actualizar»);
 * pasa a `true` si la pide mientras corre una automática, que así se vuelve
 * suya: quien consulta debe leerlo al terminar, no al empezar.
 */
export interface Consulta {
  aMano: boolean
}

export interface Sondeo {
  /** Hay una consulta en curso (automática o pedida). */
  consultando: boolean
  /**
   * La consulta en curso la pidió la persona. Solo entonces «Actualizar»
   * muestra que carga: la automática no lo toca ni le quita el foco a nadie.
   */
  actualizandoAMano: boolean
  /** Consulta ya, sin esperar al minuto (botón «Actualizar»). */
  consultarAhora: () => void
}

/**
 * Repite `consultar` cada `intervaloMs` contados desde la última consulta,
 * solo mientras la página está a la vista: con la pestaña del navegador
 * oculta no consulta y, al volver, lo hace enseguida si ya pasó el minuto.
 * Quien lo usa se desmonta con la pestaña de la ficha (Base UI no monta los
 * paneles ocultos), así que tampoco consulta con otra pestaña abierta. Nunca
 * superpone dos consultas.
 *
 * Cada consulta corre en una transición: `consultar` devuelve sus errores
 * esperados como estado y solo deja escapar los de Next (sesión vencida,
 * permiso retirado), que así llegan a su límite y redirigen.
 */
export function useSondeo(
  consultar: (consulta: Consulta) => Promise<void>,
  {
    ultimaConsulta,
    intervaloMs = INTERVALO_SONDEO_MS,
  }: {
    /** Instante (ms) de los datos con que se monta. */
    ultimaConsulta: number
    intervaloMs?: number
  }
): Sondeo {
  const consultarActual = useRef(consultar)
  const enCurso = useRef<Consulta | null>(null)
  const [marca, setMarca] = useState(ultimaConsulta)
  const [aMano, setAMano] = useState(false)
  const [consultando, iniciar] = useTransition()

  useEffect(() => {
    consultarActual.current = consultar
  })

  const lanzar = useCallback((pedida: boolean) => {
    const actual = enCurso.current
    if (actual) {
      // Si la persona pide la que ya corre, la hace suya en vez de repetirla.
      if (pedida && !actual.aMano) {
        actual.aMano = true
        setAMano(true)
      }
      return
    }
    const consulta: Consulta = { aMano: pedida }
    enCurso.current = consulta
    setAMano(pedida)
    iniciar(async () => {
      try {
        await consultarActual.current(consulta)
      } finally {
        enCurso.current = null
        // React mantiene pendientes juntas todas las transiciones asíncronas
        // de la página: «Actualizar» se libera al terminar la suya, aunque
        // otra siga en curso.
        setAMano(false)
        // Un fallo también cuenta: se reintenta al siguiente minuto, no en bucle.
        setMarca(Date.now())
      }
    })
  }, [])

  const consultarAhora = useCallback(() => lanzar(true), [lanzar])

  useEffect(() => {
    const vence = marca + intervaloMs
    // El temporizador mide con el reloj monotónico y `vence` con el de pared,
    // que puede atrasarse (ajuste NTP): si se dispara, el intervalo ya pasó
    // aunque `Date.now()` diga que falta un poco. El reloj de pared solo
    // decide al volver a la pestaña, por si el navegador demoró el temporizador.
    let vencido = false
    const siToca = () => {
      if (
        document.visibilityState === "visible" &&
        (vencido || Date.now() >= vence)
      ) {
        lanzar(false)
      }
    }
    const temporizador = setTimeout(
      () => {
        vencido = true
        siToca()
      },
      // Nunca más de un intervalo, aunque el reloj del navegador vaya atrasado
      // frente al del servidor (de donde viene la primera marca).
      Math.min(intervaloMs, Math.max(0, vence - Date.now()))
    )
    document.addEventListener("visibilitychange", siToca)
    return () => {
      clearTimeout(temporizador)
      document.removeEventListener("visibilitychange", siToca)
    }
  }, [marca, intervaloMs, lanzar])

  return {
    consultando,
    actualizandoAMano: consultando && aMano,
    consultarAhora,
  }
}
