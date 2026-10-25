"use client"

import { Bell } from "lucide-react"
import { useCallback, useState, useSyncExternalStore } from "react"

import { useShell } from "@/components/layout/contexto-shell"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import { textoAnuncio } from "../en-vivo"
import type { AvisoEnVivo } from "../esquemas"
import { useConteoNoLeidas } from "../fuente"
import { useCanalNotificaciones } from "../tiempo-real"
import { PanelNotificaciones } from "./panel-notificaciones"

const MAXIMO_VISIBLE = 9

const suscribirNada = () => () => {}

function etiquetaAccesible(noLeidas: number): string {
  if (noLeidas === 0) return "Notificaciones"
  return noLeidas === 1
    ? "Notificaciones, 1 sin leer"
    : `Notificaciones, ${noLeidas} sin leer`
}

/**
 * Campana del AppShell conectada a la fuente de datos: abre el canal en vivo
 * del usuario (el contador cambia en cuanto llega un aviso), con el sondeo de
 * React Query de respaldo, y el panel con las últimas notificaciones. Los
 * avisos urgentes se anuncian en una región viva (los demás solo cambian el
 * contador, que ya lleva su nombre accesible). Se monta una vez, en
 * `components/layout/barra-superior.tsx`.
 */
export function CampanaNotificacionesEnVivo() {
  const { usuario } = useShell()
  const [abierto, setAbierto] = useState(false)
  const [anuncio, setAnuncio] = useState("")
  const alRecibir = useCallback((aviso: AvisoEnVivo) => {
    const texto = textoAnuncio(aviso)
    if (texto) setAnuncio(texto)
  }, [])
  const enVivo = useCanalNotificaciones(usuario.id, { alRecibir })
  const conteo = useConteoNoLeidas({ enVivo })
  // La campana se pinta en el servidor sin conteo; otra vista de la página
  // puede sembrarlo antes de hidratar: se muestra solo ya en el navegador.
  const hidratada = useSyncExternalStore(
    suscribirNada,
    () => true,
    () => false
  )
  const noLeidas = hidratada ? (conteo.data?.total ?? 0) : 0

  return (
    <>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {anuncio}
      </p>
      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={etiquetaAccesible(noLeidas)}
              // Canal suscrito: lo esperan las pruebas E2E antes de emitir un aviso.
              data-en-vivo={enVivo}
              className="relative"
            />
          }
        >
          <Bell
            aria-hidden
            className={cn(
              "size-[1.1rem] origin-top transition-transform",
              noLeidas > 0 && "group-hover/button:rotate-12"
            )}
          />
          {noLeidas > 0 ? (
            <span
              key={noLeidas}
              aria-hidden
              className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 animate-in place-items-center rounded-full bg-primary px-1 text-[0.625rem] leading-none font-semibold cifras text-primary-foreground ring-2 ring-background duration-300 zoom-in-50"
            >
              {noLeidas > MAXIMO_VISIBLE ? `${MAXIMO_VISIBLE}+` : noLeidas}
            </span>
          ) : null}
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[min(24rem,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0"
        >
          <PanelNotificaciones
            activo={abierto}
            onCerrar={() => setAbierto(false)}
          />
        </PopoverContent>
      </Popover>
    </>
  )
}
