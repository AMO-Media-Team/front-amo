"use client"

import { type LucideIcon, X } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

/**
 * Hoja lateral de revisión (documento o cuenta): ocupa toda la pantalla en el
 * celular y se ensancha en escritorio para ver el archivo y decidir a la vez.
 * El contenido se monta al abrir (la URL firmada se pide entonces y queda en
 * la bitácora) y se desmonta al cerrar.
 */
export function HojaRevision({
  abierta,
  onAbiertaChange,
  icono: Icono,
  titulo,
  descripcion,
  pie,
  bloqueada = false,
  children,
}: {
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  icono: LucideIcon
  titulo: string
  descripcion?: ReactNode
  /** Botones de la decisión (Rechazar, Aprobar). */
  pie?: ReactNode
  /** Mientras se guarda no se cierra (ni con Escape ni tocando fuera). */
  bloqueada?: boolean
  children: ReactNode
}) {
  return (
    <Sheet
      open={abierta}
      onOpenChange={(valor) => {
        if (bloqueada && !valor) return
        onAbiertaChange(valor)
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl data-[side=right]:xl:max-w-5xl"
      >
        <SheetHeader className="flex-row items-start gap-3 border-b px-4 py-4 sm:px-5">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Icono className="size-5" aria-hidden />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <SheetTitle className="text-base font-semibold text-balance">
              {titulo}
            </SheetTitle>
            {descripcion ? (
              <SheetDescription className="text-pretty">
                {descripcion}
              </SheetDescription>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cerrar"
            disabled={bloqueada}
            onClick={() => onAbiertaChange(false)}
          >
            <X aria-hidden />
          </Button>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {children}
        </div>
        {pie ? (
          <SheetFooter className="border-t bg-muted/30 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
            {pie}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

/**
 * Cuerpo de dos columnas en escritorio: el archivo a la izquierda (fijo al
 * desplazarse) y la información y el formulario a la derecha; una columna en
 * el celular, con el archivo primero.
 */
export function CuerpoRevision({
  archivo,
  children,
}: {
  archivo: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid gap-6 px-4 py-5 sm:px-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <div className="min-w-0 xl:sticky xl:top-0">{archivo}</div>
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </div>
  )
}
