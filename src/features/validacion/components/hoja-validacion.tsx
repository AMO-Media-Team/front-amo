"use client"

import { type LucideIcon, X } from "lucide-react"
import { type ReactNode, useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

import { ID_TITULO_HOJA } from "./use-revisor"

/**
 * Hoja lateral de revisión de la cola (como `HojaRevision` de la
 * verificación): ocupa toda la pantalla en el celular y se ensancha en
 * escritorio para ver la captura y decidir a la vez. Se arma por partes para
 * que la hoja siga abierta al pasar al siguiente elemento (solo cambia su
 * contenido, con su propio formulario) y dice a dónde va el foco al cerrarse
 * (`focoAlCerrar`): tras decidir el último, la tarjeta que la abrió ya no
 * existe.
 */
export function MarcoHoja({
  abierta,
  onAbiertaChange,
  bloqueada = false,
  focoAlCerrar,
  children,
}: {
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  /** Mientras se guarda no se cierra (ni con Escape ni tocando fuera). */
  bloqueada?: boolean
  focoAlCerrar?: () => HTMLElement | null
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
        finalFocus={focoAlCerrar}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl data-[side=right]:xl:max-w-5xl"
      >
        {children}
      </SheetContent>
    </Sheet>
  )
}

/**
 * Encabezado de la hoja. Con `enfocar`, el título recibe el foco al montarse:
 * así quien usa teclado o lector de pantalla sabe que pasó al siguiente.
 */
export function CabeceraHoja({
  icono: Icono,
  titulo,
  descripcion,
  enfocar = false,
  bloqueada = false,
  onCerrar,
}: {
  icono: LucideIcon
  titulo: string
  descripcion?: ReactNode
  enfocar?: boolean
  bloqueada?: boolean
  onCerrar: () => void
}) {
  const refTitulo = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (enfocar) refTitulo.current?.focus()
  }, [enfocar])
  return (
    <SheetHeader className="flex-row items-start gap-3 border-b px-4 py-4 sm:px-5">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
        <Icono className="size-5" aria-hidden />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <SheetTitle
          ref={refTitulo}
          id={ID_TITULO_HOJA}
          tabIndex={-1}
          className="text-base font-semibold text-balance outline-none focus-visible:anillo-foco"
        >
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
        onClick={onCerrar}
      >
        <X aria-hidden />
      </Button>
    </SheetHeader>
  )
}

/** Contenido desplazable de la hoja (el encabezado y el pie quedan fijos). */
export function CuerpoHoja({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {children}
    </div>
  )
}

/** Botones de la decisión (Rechazar, Aprobar), siempre a la vista. */
export function PieHoja({ children }: { children: ReactNode }) {
  return (
    <SheetFooter className="border-t bg-muted/30 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:px-5">
      {children}
    </SheetFooter>
  )
}
