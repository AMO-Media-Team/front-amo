"use client"

import {
  BellRing,
  ChevronDown,
  FilterX,
  Inbox,
  Mail,
  MailOpen,
  PartyPopper,
} from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { cargarNotificaciones } from "../actions"
import type { FiltrosBandeja } from "../esquemas"
import { agruparPorDia } from "../presentacion"
import type { Notificacion, PaginaNotificaciones } from "../tipos"
import { ItemNotificacion } from "./item-notificacion"
import { useBandeja } from "./marco-bandeja"

function BotonLectura({ notificacion }: { notificacion: Notificacion }) {
  const { marcar } = useBandeja()
  const accion = notificacion.leida
    ? "Marcar como no leída"
    : "Marcar como leída"
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`${accion}: ${notificacion.titulo}`}
            className="text-muted-foreground opacity-0 transition-opacity group-hover/notificacion:opacity-100 hover:text-foreground focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            onClick={() => marcar([notificacion.id], !notificacion.leida)}
          />
        }
      >
        {notificacion.leida ? <Mail aria-hidden /> : <MailOpen aria-hidden />}
      </TooltipTrigger>
      <TooltipContent>{accion}</TooltipContent>
    </Tooltip>
  )
}

function SinResultados({ filtros }: { filtros: FiltrosBandeja }) {
  const { fijarFiltros } = useBandeja()
  if (filtros.estado === "todas" && filtros.categoria === null) {
    return (
      <EstadoVacio
        className="flex-none rounded-2xl py-14"
        icono={BellRing}
        titulo="Aún no tienes notificaciones"
        descripcion="Te avisaremos aquí cuando haya ofertas, asignaciones, pagos o alertas de seguridad que requieran tu atención."
      />
    )
  }
  if (filtros.estado === "no_leidas" && filtros.categoria === null) {
    return (
      <EstadoVacio
        className="flex-none rounded-2xl py-14"
        icono={PartyPopper}
        titulo="Estás al día"
        descripcion="No tienes notificaciones sin leer."
      >
        <Button
          variant="outline"
          onClick={() => fijarFiltros({ estado: "todas" })}
        >
          <Inbox data-icon="inline-start" aria-hidden />
          Ver todas
        </Button>
      </EstadoVacio>
    )
  }
  return (
    <EstadoVacio
      className="flex-none rounded-2xl py-14"
      icono={FilterX}
      titulo="Nada por aquí"
      descripcion="No hay notificaciones con estos filtros."
    >
      <Button
        variant="outline"
        onClick={() => fijarFiltros({ estado: "todas", categoria: null })}
      >
        <FilterX data-icon="inline-start" aria-hidden />
        Quitar filtros
      </Button>
    </EstadoVacio>
  )
}

/**
 * Lista de la bandeja agrupada por día (hora de Bogotá), con marcas de
 * lectura optimistas y «Cargar anteriores» por cursor. Se monta de nuevo al
 * cambiar los filtros (la `key` la pone el servidor).
 */
export function BandejaNotificaciones({
  filtros,
  inicial,
}: {
  filtros: FiltrosBandeja
  inicial: PaginaNotificaciones
}) {
  const { cargando, estaLeida, marcar } = useBandeja()
  const [notificaciones, setNotificaciones] = useState(inicial.notificaciones)
  const [siguiente, setSiguiente] = useState(inicial.siguiente)
  const [cargandoMas, iniciar] = useTransition()

  const grupos = useMemo(
    () =>
      agruparPorDia(
        notificaciones.map((notificacion) => ({
          ...notificacion,
          leida: estaLeida(notificacion),
        }))
      ),
    [notificaciones, estaLeida]
  )

  const cargarMas = () => {
    if (siguiente === null) return
    iniciar(async () => {
      const resultado = await cargarNotificaciones({
        filtros,
        antesId: siguiente,
      })
      if (!resultado.ok) {
        toast.error("No pudimos cargar más notificaciones", {
          description: resultado.error,
        })
        return
      }
      setNotificaciones((actuales) => [
        ...actuales,
        ...resultado.datos.notificaciones,
      ])
      setSiguiente(resultado.datos.siguiente)
    })
  }

  const abrir = (notificacion: Notificacion) => {
    if (!notificacion.leida) marcar([notificacion.id], true)
  }

  if (notificaciones.length === 0) return <SinResultados filtros={filtros} />

  return (
    <section
      aria-label="Notificaciones"
      aria-busy={cargando || undefined}
      className={cn(
        "overflow-clip rounded-2xl border bg-card shadow-xs transition-opacity duration-200",
        cargando && "pointer-events-none opacity-60"
      )}
    >
      {grupos.map((grupo, indiceGrupo) => (
        <div
          key={grupo.clave}
          role="group"
          aria-labelledby={`grupo-${grupo.clave}`}
        >
          <h2
            id={`grupo-${grupo.clave}`}
            className={cn(
              "sticky top-14 z-[5] flex items-center gap-2 border-b bg-card/90 px-4 py-2 text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase backdrop-blur-md sm:px-5",
              indiceGrupo > 0 && "border-t"
            )}
          >
            {grupo.titulo}
            <span className="font-normal cifras tracking-normal normal-case">
              · {grupo.notificaciones.length}
            </span>
          </h2>
          <ul className="flex flex-col divide-y">
            {grupo.notificaciones.map((notificacion, indice) => (
              <ItemNotificacion
                key={notificacion.id}
                notificacion={notificacion}
                onAbrir={abrir}
                acciones={<BotonLectura notificacion={notificacion} />}
                className="motion-safe:animate-aparecer-arriba"
                style={{ animationDelay: `${Math.min(indice, 8) * 35}ms` }}
              />
            ))}
          </ul>
        </div>
      ))}

      {siguiente !== null ? (
        <div className="flex justify-center border-t px-4 py-3">
          <Button variant="ghost" onClick={cargarMas} disabled={cargandoMas}>
            {cargandoMas ? (
              <Spinner data-icon="inline-start" aria-hidden />
            ) : (
              <ChevronDown data-icon="inline-start" aria-hidden />
            )}
            {cargandoMas ? "Cargando…" : "Cargar anteriores"}
          </Button>
        </div>
      ) : notificaciones.length > 8 ? (
        <p className="border-t px-4 py-3 text-center text-xs text-muted-foreground">
          No hay notificaciones más antiguas.
        </p>
      ) : null}
    </section>
  )
}
