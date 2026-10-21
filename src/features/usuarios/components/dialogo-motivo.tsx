"use client"

import { CircleHelp, TriangleAlert } from "lucide-react"
import { type ReactNode, useId, useState, useTransition } from "react"

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
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { ResultadoAccion } from "@/lib/result"
import { cn } from "@/lib/utils"

import { LONGITUD_MAXIMA_MOTIVO, LONGITUD_MINIMA_MOTIVO } from "../schemas"

interface DialogoMotivoProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  titulo: string
  descripcion: ReactNode
  textoConfirmar: string
  destructivo?: boolean
  /** Ayuda bajo el campo ("Quedará en la bitácora y lo verá el equipo de administración"). */
  ayuda?: string
  onConfirmar: (motivo: string) => Promise<ResultadoAccion<unknown>>
}

/**
 * Confirmación que exige un motivo (transiciones con «M» en §4.2). El motivo
 * queda en la bitácora junto con el cambio. Un fallo se muestra dentro del
 * diálogo y lo mantiene abierto para corregir o reintentar.
 */
export function DialogoMotivo({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  textoConfirmar,
  destructivo = false,
  ayuda = "Queda registrado en la bitácora de auditoría.",
  onConfirmar,
}: DialogoMotivoProps) {
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const idCampo = useId()
  const idAyuda = useId()
  const idError = useId()
  const valido = motivo.trim().length >= LONGITUD_MINIMA_MOTIVO

  function cambiarAbierto(valor: boolean) {
    if (pendiente) return
    if (!valor) {
      setMotivo("")
      setError(null)
    }
    onAbiertoChange(valor)
  }

  function confirmar() {
    if (!valido) {
      setError(
        `Describe el motivo (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres).`
      )
      return
    }
    setError(null)
    iniciar(async () => {
      const resultado = await onConfirmar(motivo.trim())
      if (resultado.ok) {
        setMotivo("")
        onAbiertoChange(false)
      } else {
        setError(resultado.erroresCampo?.motivo?.[0] ?? resultado.error)
      }
    })
  }

  const Icono = destructivo ? TriangleAlert : CircleHelp

  return (
    <AlertDialog open={abierto} onOpenChange={cambiarAbierto}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogMedia
            className={cn(
              destructivo
                ? "bg-destructive/10 text-destructive"
                : "bg-warning/12 text-warning"
            )}
          >
            <Icono aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-2">
          <Label htmlFor={idCampo}>Motivo</Label>
          <Textarea
            id={idCampo}
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            maxLength={LONGITUD_MAXIMA_MOTIVO}
            rows={3}
            disabled={pendiente}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${idError} ${idAyuda}` : idAyuda}
            placeholder="Ej.: solicitud del cliente, acceso indebido, cambio de área…"
          />
          <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
            <p id={idAyuda}>{ayuda}</p>
            <span className="shrink-0 cifras" aria-hidden>
              {motivo.length}/{LONGITUD_MAXIMA_MOTIVO}
            </span>
          </div>
          {error ? (
            <p id={idError} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
          <Button
            onClick={confirmar}
            disabled={pendiente}
            className={cn(
              destructivo &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30"
            )}
          >
            {pendiente ? (
              <Spinner aria-label="Procesando" data-icon="inline-start" />
            ) : null}
            {textoConfirmar}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
