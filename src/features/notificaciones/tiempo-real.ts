"use client"

/**
 * Aviso en vivo (NOT-007): canal privado de Supabase Realtime `usuario:{id}`.
 *
 * - La base emite un broadcast privado por cada aviso nuevo
 *   (`private.fn_notificacion_realtime`) con `{id, tipo, prioridad,
 *   no_leidas}`; la política «realtime: tópico propio» solo deja unirse al
 *   dueño del tópico con una sesión válida (`acceso_valido`), así que ningún
 *   otro usuario lo recibe y nadie puede emitir en él.
 * - Al llegar: el contador toma `no_leidas` al instante y el resto de las
 *   consultas `["notificaciones", …]` se invalida una sola vez por ráfaga.
 * - Si el canal cae (error, tiempo agotado o cierre del servidor, p. ej. al
 *   vencer el JWT), se vuelve a abrir con espera creciente; mientras tanto el
 *   sondeo de respaldo vuelve a 60 s (`en-vivo.ts`). Al reconectar se
 *   invalida: lo que llegó durante el corte se lee con la sesión.
 * - El socket no pasa por Next ni por el DAL: no cuenta como actividad de la
 *   sesión (el cierre por inactividad sigue intacto).
 *
 * Un solo canal por usuario: lo abre la campana del AppShell
 * (`CampanaNotificacionesEnVivo`), que se monta una vez.
 */
import { type QueryClient, useQueryClient } from "@tanstack/react-query"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { useEffect, useRef } from "react"

import { obtenerClienteNavegador } from "@/lib/supabase/client"

import {
  ESPERA_INVALIDACION_MS,
  esperaReconexion,
  EVENTO_NOTIFICACION,
  fijarEnVivo,
  topicoUsuario,
  useEnVivo,
} from "./en-vivo"
import { type AvisoEnVivo, esquemaAvisoEnVivo } from "./esquemas"
import { CLAVES_NOTIFICACIONES } from "./fuente"
import type { ConteoNoLeidas } from "./tipos"

type ClienteNavegador = ReturnType<typeof obtenerClienteNavegador>

export interface OpcionesCanal {
  /** Cada aviso válido que llega (la campana anuncia los urgentes). */
  alRecibir?: (aviso: AvisoEnVivo) => void
}

/**
 * Retiro del canal anterior aún en curso. `channel(topico)` devuelve el canal
 * existente si el tópico sigue registrado: abrir otro antes de que el
 * anterior termine de salir (StrictMode, reconexión) lo dejaría sin suscribir.
 */
let retiroEnCurso: Promise<unknown> = Promise.resolve()

function retirar(supabase: ClienteNavegador, canal: RealtimeChannel): void {
  const previo = retiroEnCurso
  retiroEnCurso = previo
    .then(() => supabase.removeChannel(canal))
    .catch(() => undefined)
}

function esConteo(clave: readonly unknown[]): boolean {
  const conteo = CLAVES_NOTIFICACIONES.conteo
  return (
    clave.length === conteo.length &&
    conteo.every((parte, indice) => clave[indice] === parte)
  )
}

/** Refresca lo que depende de los avisos salvo el contador, que ya llegó. */
function invalidarListas(cliente: QueryClient): Promise<void> {
  return cliente.invalidateQueries({
    queryKey: CLAVES_NOTIFICACIONES.todas,
    predicate: (consulta) => !esConteo(consulta.queryKey),
  })
}

/**
 * Aplica un aviso a la caché: contador exacto de la base. Antes cancela un
 * sondeo del conteo en curso (foco de la ventana, otra vista que se monta):
 * su respuesta salió antes del aviso y, si llegara después, lo pisaría con el
 * número anterior hasta el siguiente sondeo (5 min con el canal conectado).
 * La cancelación revierte el estado al instante, así que el valor del aviso
 * queda encima.
 */
export function aplicarAviso(cliente: QueryClient, aviso: AvisoEnVivo): void {
  void cliente.cancelQueries({
    queryKey: CLAVES_NOTIFICACIONES.conteo,
    exact: true,
  })
  cliente.setQueryData<ConteoNoLeidas>(CLAVES_NOTIFICACIONES.conteo, {
    disponible: true,
    total: aviso.no_leidas,
  })
}

/**
 * Abre el canal del usuario mientras el componente está montado. Devuelve
 * `true` mientras está suscrito (el mismo estado que espacia el sondeo).
 */
export function useCanalNotificaciones(
  usuarioId: string,
  { alRecibir }: OpcionesCanal = {}
): boolean {
  const cliente = useQueryClient()
  const conectado = useEnVivo()
  const alRecibirActual = useRef(alRecibir)

  useEffect(() => {
    alRecibirActual.current = alRecibir
  }, [alRecibir])

  useEffect(() => {
    if (!usuarioId) return
    const supabase = obtenerClienteNavegador()
    let activo = true
    let canal: RealtimeChannel | null = null
    let intentos = 0
    let yaConecto = false
    let reconexion: ReturnType<typeof setTimeout> | undefined
    let invalidacion: ReturnType<typeof setTimeout> | undefined

    function programarInvalidacion() {
      clearTimeout(invalidacion)
      invalidacion = setTimeout(() => {
        void invalidarListas(cliente)
      }, ESPERA_INVALIDACION_MS)
    }

    function recibir(carga: unknown) {
      const aviso = esquemaAvisoEnVivo.safeParse(carga)
      if (!aviso.success) return
      aplicarAviso(cliente, aviso.data)
      programarInvalidacion()
      alRecibirActual.current?.(aviso.data)
    }

    function caer() {
      fijarEnVivo(false)
      if (!activo || reconexion) return
      const anterior = canal
      canal = null
      if (anterior) retirar(supabase, anterior)
      reconexion = setTimeout(() => {
        reconexion = undefined
        void abrir()
      }, esperaReconexion(intentos))
      intentos += 1
    }

    async function abrir() {
      await retiroEnCurso
      if (!activo) return
      try {
        // Toma el JWT vigente de la sesión antes de unirse al canal privado.
        await supabase.realtime.setAuth()
      } catch {
        // Sin token el servidor rechaza la unión: el reintento lo cubre.
      }
      if (!activo) return
      const propio = supabase
        .channel(topicoUsuario(usuarioId), { config: { private: true } })
        .on("broadcast", { event: EVENTO_NOTIFICACION }, (mensaje) =>
          recibir(mensaje.payload)
        )
      canal = propio
      propio.subscribe((estado) => {
        // Los avisos de un canal ya retirado (incluido su propio cierre) se ignoran.
        if (!activo || canal !== propio) return
        if (estado === "SUBSCRIBED") {
          intentos = 0
          fijarEnVivo(true)
          if (yaConecto) {
            void cliente.invalidateQueries({
              queryKey: CLAVES_NOTIFICACIONES.todas,
            })
          }
          yaConecto = true
          return
        }
        caer()
      })
    }

    void abrir()

    return () => {
      activo = false
      clearTimeout(reconexion)
      clearTimeout(invalidacion)
      fijarEnVivo(false)
      if (canal) retirar(supabase, canal)
      canal = null
    }
  }, [usuarioId, cliente])

  return conectado
}
