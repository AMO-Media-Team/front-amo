import { Inbox, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

import { IlustracionAnillos } from "./ilustraciones"

interface EstadoVacioProps {
  titulo: string
  descripcion?: ReactNode
  icono?: LucideIcon
  /** Acciones (p. ej. "Crear campaña", "Limpiar filtros"). */
  children?: ReactNode
  /** "tarjeta" dibuja el borde punteado; "simple" se integra en un contenedor existente. */
  variante?: "tarjeta" | "simple"
  className?: string
}

export function EstadoVacio({
  titulo,
  descripcion,
  icono: Icono = Inbox,
  children,
  variante = "tarjeta",
  className,
}: EstadoVacioProps) {
  return (
    <Empty
      className={cn(
        "py-10",
        variante === "tarjeta" && "border bg-card/40",
        className
      )}
    >
      <EmptyHeader>
        <EmptyMedia>
          <div className="relative grid size-28 place-items-center text-primary">
            <IlustracionAnillos className="absolute inset-0 size-full" />
            <div className="relative grid size-12 place-items-center rounded-2xl bg-card shadow-glow ring-1 ring-border">
              <Icono className="size-6" aria-hidden />
            </div>
          </div>
        </EmptyMedia>
        <EmptyTitle className="text-base font-semibold">{titulo}</EmptyTitle>
        {descripcion ? (
          <EmptyDescription>{descripcion}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {children ? (
        <EmptyContent className="flex-row flex-wrap justify-center">
          {children}
        </EmptyContent>
      ) : null}
    </Empty>
  )
}
