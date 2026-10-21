"use client"

import { Check, Lock, Minus, Star, TriangleAlert } from "lucide-react"

import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { type ClavePermiso, PERMISOS } from "@/lib/auth/permisos"
import { cn } from "@/lib/utils"

export type CambioPermiso = "agregado" | "quitado" | null

export const MENSAJE_FUERA_DE_ALCANCE =
  "Tú no tienes este permiso: no puedes otorgarlo ni retirarlo."

export function InsigniaSensible({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4.5 items-center gap-1 rounded-full bg-warning/12 px-1.5 text-[0.6875rem] font-medium text-warning",
        className
      )}
      title="Permiso sensible: da acceso a dinero, datos personales o la seguridad de la plataforma"
    >
      <Star className="size-2.5 fill-current" aria-hidden />
      Sensible
    </span>
  )
}

/** En solo lectura, un ícono en lugar de un interruptor deshabilitado. */
function EstadoLectura({ marcado }: { marcado: boolean }) {
  return marcado ? (
    <span
      role="img"
      aria-label="Otorgado"
      className="grid size-6 place-items-center rounded-full bg-primary/12 text-primary"
    >
      <Check className="size-3.5" aria-hidden />
    </span>
  ) : (
    <span
      role="img"
      aria-label="No otorgado"
      className="grid size-6 place-items-center rounded-full text-muted-foreground"
    >
      <Minus className="size-3.5" aria-hidden />
    </span>
  )
}

const MARCA_CAMBIO = {
  agregado: {
    texto: "Se otorgará",
    fila: "bg-success/6",
    acento: "bg-success",
    insignia: "bg-card text-success ring-1 ring-success/30 ring-inset",
  },
  quitado: {
    texto: "Se retirará",
    fila: "bg-destructive/6",
    acento: "bg-destructive",
    insignia: "bg-card text-destructive ring-1 ring-destructive/30 ring-inset",
  },
} as const

/**
 * Un permiso de la matriz: descripción (etiqueta del interruptor), clave,
 * marca de sensible y, si cambió, si se otorgará o retirará. Cuando el actor
 * no tiene el permiso (anti-escalada), el interruptor queda bloqueado con un
 * candado que explica por qué.
 */
export function FilaPermiso({
  clave,
  marcado,
  cambio,
  ajeno = false,
  editable,
  bloqueado,
  onAlternar,
}: {
  clave: ClavePermiso
  marcado: boolean
  cambio: CambioPermiso
  /** El tipo del rol no admite este permiso: se muestra para poder retirarlo. */
  ajeno?: boolean
  /** El rol admite edición (no es de sistema, ni propio, y el actor gestiona roles). */
  editable: boolean
  /** Editable, pero el actor no tiene este permiso. */
  bloqueado: boolean
  onAlternar: (clave: ClavePermiso) => void
}) {
  const { descripcion, esSensible } = PERMISOS[clave]
  const id = `permiso-${clave.replace(".", "-")}`
  const marca = cambio ? MARCA_CAMBIO[cambio] : null

  return (
    <li
      className={cn(
        "relative flex items-start gap-3 px-4 py-2.5 transition-colors duration-300",
        marca?.fila,
        editable && !bloqueado && !marca && "hover:bg-muted/40"
      )}
    >
      {marca ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-1.5 left-0 w-0.5 rounded-full",
            marca.acento
          )}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {editable ? (
          <label
            htmlFor={id}
            className={cn(
              "text-sm leading-snug",
              bloqueado ? "cursor-default" : "cursor-pointer",
              !marcado && "text-muted-foreground"
            )}
          >
            {descripcion}
          </label>
        ) : (
          <p
            className={cn(
              "text-sm leading-snug",
              !marcado && "text-muted-foreground"
            )}
          >
            {descripcion}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <code className="font-mono text-[0.6875rem] text-muted-foreground">
            {clave}
          </code>
          {esSensible ? <InsigniaSensible /> : null}
          {ajeno ? (
            <span
              className="inline-flex h-4.5 items-center gap-1 rounded-full bg-destructive/10 px-1.5 text-[0.6875rem] font-medium text-destructive"
              title="Permiso del equipo interno: en un rol externo abre datos de toda la plataforma"
            >
              <TriangleAlert className="size-2.5" aria-hidden />
              No corresponde a su tipo
            </span>
          ) : null}
          {marca ? (
            <span
              className={cn(
                "inline-flex h-4.5 items-center rounded-full px-1.5 text-[0.6875rem] font-medium",
                marca.insignia
              )}
            >
              {marca.texto}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {bloqueado ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={MENSAJE_FUERA_DE_ALCANCE}
                  className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              }
            >
              <Lock className="size-3.5" aria-hidden />
            </TooltipTrigger>
            <TooltipContent side="left">
              {MENSAJE_FUERA_DE_ALCANCE}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {editable ? (
          <Switch
            id={id}
            checked={marcado}
            onCheckedChange={() => onAlternar(clave)}
            disabled={bloqueado}
            aria-describedby={bloqueado ? `${id}-bloqueo` : undefined}
          />
        ) : (
          <EstadoLectura marcado={marcado} />
        )}
        {bloqueado ? (
          <span id={`${id}-bloqueo`} className="sr-only">
            {MENSAJE_FUERA_DE_ALCANCE}
          </span>
        ) : null}
      </div>
    </li>
  )
}
