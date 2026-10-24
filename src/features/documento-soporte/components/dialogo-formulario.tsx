"use client"

import type { LucideIcon } from "lucide-react"
import { type FormEvent, type ReactNode, useId } from "react"

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

export interface DialogoFormularioProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  icono: LucideIcon
  titulo: string
  descripcion: ReactNode
  textoConfirmar: string
  /** Lo que dice el botón mientras trabaja («Subiendo el PDF…»). */
  textoPendiente: string
  pendiente: boolean
  /** Error que no es de un campo (se anuncia y queda dentro del diálogo). */
  errorGeneral: string | null
  /** A dónde va el foco al cerrar; `null`: al botón que lo abrió. */
  focoAlCerrar?: () => HTMLElement | null | false
  onEnviar: () => void
  children: ReactNode
}

/**
 * Marco de los diálogos con formulario del documento soporte: encabezado con icono, cuerpo con
 * desplazamiento propio (cabe en 390 px de ancho y en pantallas bajas), error general y pie con
 * «Cancelar» y la acción. Enter en un campo envía. No se cierra al tocar fuera ni mientras trabaja: lo
 * escrito no se pierde por accidente.
 */
export function DialogoFormulario({
  abierto,
  onAbiertoChange,
  icono: Icono,
  titulo,
  descripcion,
  textoConfirmar,
  textoPendiente,
  pendiente,
  errorGeneral,
  focoAlCerrar,
  onEnviar,
  children,
}: DialogoFormularioProps) {
  const idFormulario = useId()

  function cambiarAbierto(valor: boolean) {
    if (pendiente && !valor) return
    onAbiertoChange(valor)
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!pendiente) onEnviar()
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={cambiarAbierto}
      disablePointerDismissal
    >
      <DialogContent
        showCloseButton={false}
        finalFocus={focoAlCerrar}
        className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-lg"
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

        <form
          id={idFormulario}
          noValidate
          onSubmit={enviar}
          className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-4"
        >
          {children}
          {errorGeneral ? (
            <p role="alert" className="text-sm text-pretty text-destructive">
              {errorGeneral}
            </p>
          ) : null}
        </form>

        <DialogFooter className="mx-0 mb-0 px-5 py-4">
          <DialogClose
            disabled={pendiente}
            render={<Button type="button" variant="outline" />}
          >
            Cancelar
          </DialogClose>
          <Button type="submit" form={idFormulario} disabled={pendiente}>
            {pendiente ? (
              <Spinner aria-hidden role={undefined} data-icon="inline-start" />
            ) : null}
            {pendiente ? textoPendiente : textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
