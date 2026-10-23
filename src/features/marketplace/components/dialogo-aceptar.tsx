"use client"

import {
  CalendarClock,
  CircleAlert,
  HandCoins,
  Megaphone,
  Undo2,
} from "lucide-react"
import type { Route } from "next"
import type { ReactNode } from "react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatearHandle } from "@/features/operacion/formato"
import { formatearCOP, formatearFechaHora } from "@/lib/format"

import type { FalloAceptar } from "../tipos"

function Compromiso({
  icono,
  children,
}: {
  icono: ReactNode
  children: ReactNode
}) {
  return (
    <li className="flex items-start gap-2.5 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-primary">
      {icono}
      <span className="min-w-0">{children}</span>
    </li>
  )
}

export interface DialogoAceptarProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  titulo: string
  /** Fin de la ventana: hasta cuándo puede publicar. */
  ventanaFin: string
  /** Hasta cuándo puede desistir (si no ha descargado el contenido). */
  fechaLimiteAceptacion: string
  handle: string
  monto: number
  pendiente: boolean
  fallo: FalloAceptar | null
  onConfirmar: () => void
  /** A dónde va el foco al cerrar (el botón «Aceptar» puede desaparecer). */
  focoAlCerrar?: () => HTMLElement | null
}

/**
 * Confirmación de la aceptación (MED-010): con qué cuenta publica, cuánto
 * recibe (precio congelado) y a qué se compromete. Un error se muestra aquí
 * con su título en voz del medio y, si aplica, el enlace para resolverlo; si
 * la respuesta no llegó, el botón dice «Reintentar» (misma solicitud: nunca
 * toma dos cupos).
 */
export function DialogoAceptar({
  abierto,
  onAbiertoChange,
  titulo,
  ventanaFin,
  fechaLimiteAceptacion,
  handle,
  monto,
  pendiente,
  fallo,
  onConfirmar,
  focoAlCerrar,
}: DialogoAceptarProps) {
  const bloqueado = fallo?.bloquea ?? false
  const reintento = fallo !== null && !fallo.definitivo

  return (
    <AlertDialog
      open={abierto}
      onOpenChange={(valor) => {
        if (pendiente && !valor) return
        onAbiertoChange(valor)
      }}
    >
      <AlertDialogContent className="sm:max-w-md" finalFocus={focoAlCerrar}>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-primary/10 text-primary">
            <HandCoins aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle>¿Aceptas esta oferta?</AlertDialogTitle>
          <AlertDialogDescription>
            «{titulo}». Publicarás con{" "}
            <strong className="font-semibold text-foreground">
              {formatearHandle(handle)}
            </strong>{" "}
            y recibirás{" "}
            <strong className="font-semibold cifras text-foreground">
              {formatearCOP(monto)}
            </strong>{" "}
            antes de retenciones. El precio queda congelado al aceptar.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="flex flex-col gap-2.5 rounded-xl border bg-muted/30 p-3">
          <Compromiso icono={<CalendarClock aria-hidden />}>
            Tienes hasta el{" "}
            <time dateTime={ventanaFin} className="font-medium cifras">
              {formatearFechaHora(ventanaFin)}
            </time>{" "}
            para publicar y cargar la evidencia.
          </Compromiso>
          <Compromiso icono={<Megaphone aria-hidden />}>
            Publica con la etiqueta de publicidad y sin editar el texto, los
            hashtags ni el enlace.
          </Compromiso>
          <Compromiso icono={<Undo2 aria-hidden />}>
            Puedes desistir antes de descargar el contenido y hasta el{" "}
            <time dateTime={fechaLimiteAceptacion} className="cifras">
              {formatearFechaHora(fechaLimiteAceptacion)}
            </time>
            .
          </Compromiso>
        </ul>

        {fallo ? (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/8 p-3"
          >
            <p className="flex items-start gap-2 text-sm font-semibold text-destructive">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {fallo.titulo}
            </p>
            <p className="text-sm">{fallo.error}</p>
            {fallo.enlace ? (
              <EnlaceBoton
                href={fallo.enlace.href as Route}
                variant="outline"
                size="sm"
                className="w-fit"
              >
                {fallo.enlace.texto}
              </EnlaceBoton>
            ) : null}
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendiente}>
            {bloqueado ? "Entendido" : "Volver"}
          </AlertDialogCancel>
          {bloqueado ? null : (
            <Button onClick={onConfirmar} disabled={pendiente}>
              {pendiente ? (
                <Spinner aria-label="Aceptando" data-icon="inline-start" />
              ) : null}
              {reintento ? "Reintentar" : "Sí, acepto"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
