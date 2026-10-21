"use client"

import { ArrowRight, BellOff, Check, CheckCheck, RotateCw } from "lucide-react"
import type { ReactNode } from "react"
import { toast } from "sonner"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Button } from "@/components/ui/button"
import { PopoverDescription, PopoverTitle } from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { RUTA_NOTIFICACIONES } from "@/lib/auth/navegacion"

import {
  useConteoNoLeidas,
  useMarcarNotificaciones,
  useNotificacionesRecientes,
} from "../fuente"
import type { Notificacion } from "../tipos"
import { ItemNotificacion } from "./item-notificacion"

function textoResumen(disponible: boolean, total: number): string {
  if (!disponible) return "Avisos de ofertas, asignaciones y pagos."
  if (total === 0) return "Estás al día."
  return total === 1 ? "Tienes 1 sin leer." : `Tienes ${total} sin leer.`
}

function CargandoLista() {
  return (
    <div role="status" className="flex flex-col">
      <span className="sr-only">Cargando notificaciones…</span>
      {Array.from({ length: 3 }, (_, indice) => (
        <div key={indice} className="flex gap-3 px-3 py-3">
          <Esqueleto className="size-9 shrink-0 rounded-xl" />
          <div className="flex flex-1 flex-col gap-1.5 pt-0.5">
            <Esqueleto className="h-3.5 w-3/4" />
            <Esqueleto className="h-3 w-full" />
            <Esqueleto className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

function Aviso({
  titulo,
  descripcion,
  children,
}: {
  titulo: string
  descripcion: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-9 text-center">
      <span className="grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border">
        <BellOff className="size-5" aria-hidden />
      </span>
      <p className="mt-1 text-sm font-medium">{titulo}</p>
      <p className="max-w-60 text-xs leading-relaxed text-muted-foreground">
        {descripcion}
      </p>
      {children}
    </div>
  )
}

/**
 * Contenido del panel de la campana (va dentro de `<PopoverContent>`): las
 * últimas notificaciones, «Marcar todas» y el enlace a la bandeja. Solo pide
 * la lista mientras el panel está abierto (`activo`).
 */
export function PanelNotificaciones({
  activo,
  onCerrar,
}: {
  activo: boolean
  onCerrar: () => void
}) {
  const conteo = useConteoNoLeidas()
  const recientes = useNotificacionesRecientes(activo)
  const marcar = useMarcarNotificaciones()

  const disponible =
    (conteo.data?.disponible ?? true) && (recientes.data?.disponible ?? true)
  const total = conteo.data?.total ?? 0
  const notificaciones = recientes.data?.notificaciones ?? []

  const avisarError = (error: Error) =>
    toast.error("No pudimos marcar tus notificaciones", {
      description: error.message,
    })

  const marcarLeida = (notificacion: Notificacion) => {
    if (notificacion.leida) return
    marcar.mutate(
      { ids: [notificacion.id], leida: true },
      { onError: avisarError }
    )
  }

  const abrir = (notificacion: Notificacion) => {
    marcarLeida(notificacion)
    onCerrar()
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <PopoverTitle className="font-heading text-sm font-semibold">
            Notificaciones
          </PopoverTitle>
          <PopoverDescription className="text-xs">
            {textoResumen(disponible, total)}
          </PopoverDescription>
        </div>
        {disponible && total > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="-mr-1.5 h-7 shrink-0 text-xs text-muted-foreground hover:text-foreground"
            disabled={marcar.isPending}
            onClick={() =>
              marcar.mutate({ todas: true }, { onError: avisarError })
            }
          >
            <CheckCheck data-icon="inline-start" aria-hidden />
            Marcar todas
          </Button>
        ) : null}
      </div>

      <div className="max-h-[min(26rem,60dvh)] overflow-y-auto overscroll-contain">
        {!disponible ? (
          <Aviso
            titulo="Muy pronto"
            descripcion="Aquí verás los avisos de ofertas, asignaciones, pagos y seguridad de tu cuenta."
          />
        ) : recientes.isPending ? (
          <CargandoLista />
        ) : recientes.isError ? (
          <Aviso
            titulo="No pudimos cargar tus notificaciones"
            descripcion="Revisa tu conexión e inténtalo de nuevo."
          >
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void recientes.refetch()}
            >
              <RotateCw data-icon="inline-start" aria-hidden />
              Reintentar
            </Button>
          </Aviso>
        ) : notificaciones.length === 0 ? (
          <Aviso
            titulo="Estás al día"
            descripcion="Te avisaremos cuando haya novedades en tus ofertas, asignaciones o pagos."
          />
        ) : (
          <ul
            aria-label="Últimas notificaciones"
            className="flex flex-col divide-y"
          >
            {notificaciones.map((notificacion) => (
              <ItemNotificacion
                key={notificacion.id}
                notificacion={notificacion}
                variante="compacta"
                onAbrir={abrir}
                acciones={
                  notificacion.leida ? null : (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Marcar como leída: ${notificacion.titulo}`}
                            className="opacity-0 transition-opacity group-hover/notificacion:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                            onClick={() => marcarLeida(notificacion)}
                          />
                        }
                      >
                        <Check aria-hidden />
                      </TooltipTrigger>
                      <TooltipContent>Marcar como leída</TooltipContent>
                    </Tooltip>
                  )
                }
              />
            ))}
          </ul>
        )}
      </div>

      <div className="border-t p-1.5">
        <EnlaceBoton
          variant="ghost"
          className="w-full justify-between"
          href={RUTA_NOTIFICACIONES}
          onClick={onCerrar}
        >
          Ver todas las notificaciones
          <ArrowRight aria-hidden data-icon="inline-end" />
        </EnlaceBoton>
      </div>
    </>
  )
}
