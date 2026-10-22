"use client"

import { type LucideIcon, X } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

export interface HojaDocumentoProps {
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  icono: LucideIcon
  titulo: string
  descripcion?: ReactNode
  children: ReactNode
  /** Acciones fijas al pie (siempre al alcance del pulgar). */
  pie?: ReactNode
}

/**
 * Hoja de un documento: en el celular sube desde abajo (al alcance del
 * pulgar) y en pantallas grandes se abre a la derecha. El contenido se
 * desplaza y el pie queda fijo, respetando el área segura del teléfono.
 */
export function HojaDocumento({
  abierta,
  onAbiertaChange,
  icono: Icono,
  titulo,
  descripcion,
  children,
  pie,
}: HojaDocumentoProps) {
  const movil = useIsMobile()
  return (
    <Sheet open={abierta} onOpenChange={onAbiertaChange}>
      <SheetContent
        side={movil ? "bottom" : "right"}
        showCloseButton={false}
        className={cn(
          "gap-0",
          movil
            ? "max-h-[92dvh] rounded-t-2xl"
            : "data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        )}
      >
        <SheetHeader className="flex-row items-start gap-3 border-b px-4 py-3 sm:px-5 sm:py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Icono className="size-5" aria-hidden />
          </span>
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
          <SheetClose
            render={
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label="Cerrar"
                className="-mt-1 -mr-2 shrink-0"
              />
            }
          >
            <X aria-hidden />
          </SheetClose>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {children}
        </div>
        {pie ? (
          <SheetFooter className="mt-0 flex-row flex-wrap justify-end gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            {pie}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
