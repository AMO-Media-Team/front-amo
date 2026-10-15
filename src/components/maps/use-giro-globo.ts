"use client"

import type { Map as MapaMapbox } from "mapbox-gl"
import { type RefObject, useEffect, useRef } from "react"
import type { MapRef } from "react-map-gl/mapbox"

import {
  acercarVelocidad,
  GIRO,
  girarLongitud,
  tiempoDeCuadro,
  velocidadCrucero,
} from "./giro-globo"

/** Intervalo de comprobación mientras el giro espera (sin pintar cuadros). */
const ESPERA_EN_REPOSO_MS = 200

interface Motor {
  activo: boolean
  velocidad: number
  interactuando: boolean
  reanudarEn: number
  ultimoCuadro: number
  cuadro: number
  espera: ReturnType<typeof setTimeout> | undefined
  despertar(): void
}

/**
 * Hace girar el globo sobre su eje mientras `activo` sea verdadero y nadie lo
 * esté usando: arranca y frena con suavidad, se detiene ante cualquier gesto
 * (arrastre, rueda, teclado) o animación de cámara ajena y reanuda poco
 * después. El modelo (velocidades y tiempos) está en `giro-globo.ts`.
 */
export function useGiroGlobo(
  refMapa: RefObject<MapRef | null>,
  { activo, listo }: { activo: boolean; listo: boolean }
): void {
  const refMotor = useRef<Motor | null>(null)

  useEffect(() => {
    const instancia = refMapa.current?.getMap()
    if (!listo || !instancia) return
    const mapa: MapaMapbox = instancia

    const motor: Motor = {
      activo: false,
      velocidad: 0,
      interactuando: false,
      reanudarEn: 0,
      ultimoCuadro: 0,
      cuadro: 0,
      espera: undefined,
      despertar: () => {
        if (motor.cuadro || motor.espera !== undefined) return
        motor.ultimoCuadro = performance.now()
        motor.cuadro = requestAnimationFrame(paso)
      },
    }

    function paso(ahora: number): void {
      motor.cuadro = 0
      const dt = tiempoDeCuadro(ahora - motor.ultimoCuadro)
      motor.ultimoCuadro = ahora

      // Un gesto de la persona o una animación de cámara (cambio de nivel,
      // recentrar) mandan: el giro suelta el mapa (`jumpTo` cancelaría la
      // animación en curso) y, un momento después, arranca de cero.
      const ocupado = motor.interactuando || mapa.isMoving()
      if (ocupado) {
        motor.reanudarEn = Math.max(
          motor.reanudarEn,
          ahora + GIRO.rearmarTrasMs
        )
      }
      const libre = motor.activo && !ocupado && ahora >= motor.reanudarEn
      const objetivo = libre ? velocidadCrucero(mapa.getZoom()) : 0
      motor.velocidad = ocupado
        ? 0
        : acercarVelocidad(motor.velocidad, objetivo, dt)

      if (motor.velocidad > 0) {
        const centro = mapa.getCenter()
        mapa.jumpTo({
          center: [girarLongitud(centro.lng, motor.velocidad, dt), centro.lat],
        })
        motor.cuadro = requestAnimationFrame(paso)
        return
      }
      // Detenido: mientras siga activo se vuelve a comprobar sin gastar cuadros.
      if (motor.activo) {
        motor.espera = setTimeout(() => {
          motor.espera = undefined
          motor.despertar()
        }, ESPERA_EN_REPOSO_MS)
      }
    }

    const posponer = () => {
      motor.reanudarEn = performance.now() + GIRO.reanudarTrasMs
    }
    const alPresionar = () => {
      motor.interactuando = true
    }
    const alSoltar = () => {
      if (!motor.interactuando) return
      motor.interactuando = false
      posponer()
    }

    const contenedor = mapa.getCanvasContainer()
    const pasivo = { passive: true } as const
    contenedor.addEventListener("pointerdown", alPresionar, pasivo)
    contenedor.addEventListener("wheel", posponer, pasivo)
    contenedor.addEventListener("keydown", posponer)
    // Se suelta sobre la ventana: el arrastre puede terminar fuera del mapa.
    window.addEventListener("pointerup", alSoltar, pasivo)
    window.addEventListener("pointercancel", alSoltar, pasivo)

    refMotor.current = motor
    return () => {
      refMotor.current = null
      cancelAnimationFrame(motor.cuadro)
      clearTimeout(motor.espera)
      contenedor.removeEventListener("pointerdown", alPresionar)
      contenedor.removeEventListener("wheel", posponer)
      contenedor.removeEventListener("keydown", posponer)
      window.removeEventListener("pointerup", alSoltar)
      window.removeEventListener("pointercancel", alSoltar)
    }
  }, [refMapa, listo])

  useEffect(() => {
    const motor = refMotor.current
    if (!motor) return
    motor.activo = activo
    if (activo) {
      // Al quedar libre no arranca de inmediato: evita tirones si el puntero
      // entra y sale de una zona, y deja ver el encuadre antes de moverlo.
      motor.reanudarEn = Math.max(
        motor.reanudarEn,
        performance.now() + GIRO.rearmarTrasMs
      )
    }
    // Activo: empieza a comprobar. Inactivo: despierta para frenar con suavidad.
    motor.despertar()
  }, [activo, listo])
}
