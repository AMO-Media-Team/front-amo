"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export interface DialogoFormularioProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  icono: LucideIcon
  titulo: string
  descripcion: ReactNode
  /** Id del `<form>` del cuerpo: el botón principal del pie lo envía. */
  idFormulario: string
  textoConfirmar: string
  textoPendiente: string
  /** Se está enviando: no se cierra y el botón muestra el progreso. */
  pendiente: boolean
  /** Aún no hay nada que enviar (cargando o sin opciones): el botón espera. */
  envioDeshabilitado?: boolean
  /** Error general (no de un campo), dentro del diálogo. */
  errorGeneral?: string | null
  /** A dónde va el foco al cerrar (`finalFocus`). */
  focoAlCerrar?: () => HTMLElement | null
  ancho?: "md" | "lg"
  children: ReactNode
}

/**
 * Diálogo con formulario de Finanzas: cabecera con ícono, cuerpo que se
 * desplaza (en el celular cabe entero en la pantalla) y pie con «Cancelar» y
 * el botón que envía el formulario. No se cierra al tocar fuera ni mientras
 * se envía: lo escrito no se pierde por accidente.
 */
export function DialogoFormulario({
  abierto,
  onAbiertoChange,
  icono: Icono,
  titulo,
  descripcion,
  idFormulario,
  textoConfirmar,
  textoPendiente,
  pendiente,
  envioDeshabilitado = false,
  errorGeneral,
  focoAlCerrar,
  ancho = "lg",
  children,
}: DialogoFormularioProps) {
  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        if (pendiente) return
        onAbiertoChange(valor)
      }}
      disablePointerDismissal
    >
      <DialogContent
        showCloseButton={false}
        finalFocus={focoAlCerrar}
        className={cn(
          "max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0",
          ancho === "lg" ? "sm:max-w-xl" : "sm:max-w-md"
        )}
      >
        <DialogHeader className="flex-row items-start gap-3 border-b px-5 py-4 text-left">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
          >
            <Icono className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle className="text-base font-semibold">
              {titulo}
            </DialogTitle>
            <DialogDescription className="text-pretty">
              {descripcion}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-4">
          {children}
          {errorGeneral ? (
            <Alert variant="destructive">
              <AlertDescription className="text-pretty">
                {errorGeneral}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter className="mx-0 mb-0 px-5 py-4">
          <DialogClose
            disabled={pendiente}
            render={<Button type="button" variant="outline" />}
          >
            Cancelar
          </DialogClose>
          <Button
            type="submit"
            form={idFormulario}
            disabled={pendiente || envioDeshabilitado}
          >
            {pendiente ? (
              <Spinner aria-label={textoPendiente} data-icon="inline-start" />
            ) : null}
            {textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
