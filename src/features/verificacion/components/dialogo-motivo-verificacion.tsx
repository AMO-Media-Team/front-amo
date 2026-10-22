"use client"

import { CircleHelp, TriangleAlert } from "lucide-react"
import { type ReactNode, useId, useRef, useState, useTransition } from "react"

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

import { LIMITES_VERIFICACION } from "../schemas"

interface DialogoMotivoVerificacionProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  titulo: string
  descripcion: ReactNode
  textoConfirmar: string
  /** Rechazos: botón y tono de peligro. */
  destructivo?: boolean
  etiqueta?: string
  /** Bajo el campo: quién lo verá y dónde queda. */
  ayuda: string
  /** Motivos frecuentes: un toque llena el campo, que se puede editar. */
  sugerencias?: readonly string[]
  onConfirmar: (motivo: string) => Promise<ResultadoAccion<unknown>>
}

const MINIMO = LIMITES_VERIFICACION.motivoMin
const MAXIMO = LIMITES_VERIFICACION.motivoMax

/**
 * Confirmación con motivo de la verificación (rechazar un documento, una
 * cuenta o el medio, o cambiar su nivel). El motivo lo recibe el medio para
 * corregir, así que se ofrecen redacciones claras de un toque. Un fallo de la
 * BD se muestra dentro del diálogo y lo deja abierto.
 */
export function DialogoMotivoVerificacion({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  textoConfirmar,
  destructivo = false,
  etiqueta = "Motivo",
  ayuda,
  sugerencias = [],
  onConfirmar,
}: DialogoMotivoVerificacionProps) {
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const campo = useRef<HTMLTextAreaElement>(null)
  const idCampo = useId()
  const idAyuda = useId()
  const idError = useId()
  const idSugerencias = useId()

  function cambiarAbierto(valor: boolean) {
    if (pendiente) return
    if (!valor) {
      setMotivo("")
      setError(null)
    }
    onAbiertoChange(valor)
  }

  function usarSugerencia(texto: string) {
    setMotivo(texto)
    setError(null)
    campo.current?.focus()
  }

  function confirmar() {
    const limpio = motivo.trim()
    if (limpio.length < MINIMO) {
      setError(`Describe el motivo (al menos ${MINIMO} caracteres).`)
      campo.current?.focus()
      return
    }
    setError(null)
    iniciar(async () => {
      const resultado = await onConfirmar(limpio)
      if (resultado.ok) {
        setMotivo("")
        onAbiertoChange(false)
        return
      }
      setError(resultado.erroresCampo?.motivo?.[0] ?? resultado.error)
    })
  }

  const Icono = destructivo ? TriangleAlert : CircleHelp

  return (
    <AlertDialog open={abierto} onOpenChange={cambiarAbierto}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogMedia
            className={cn(
              destructivo
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary"
            )}
          >
            <Icono aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-3">
          {sugerencias.length > 0 ? (
            <div className="grid gap-2">
              <p id={idSugerencias} className="text-xs text-muted-foreground">
                Motivos frecuentes
              </p>
              <ul
                aria-labelledby={idSugerencias}
                className="flex flex-col gap-1.5"
              >
                {sugerencias.map((sugerencia) => (
                  <li key={sugerencia}>
                    <button
                      type="button"
                      disabled={pendiente}
                      aria-pressed={motivo === sugerencia}
                      onClick={() => usarSugerencia(sugerencia)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left text-xs text-pretty transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
                        motivo === sugerencia &&
                          "border-primary/50 bg-primary/6 text-foreground"
                      )}
                    >
                      {sugerencia}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor={idCampo}>{etiqueta}</Label>
            <Textarea
              ref={campo}
              id={idCampo}
              value={motivo}
              onChange={(evento) => {
                setMotivo(evento.target.value)
                if (error) setError(null)
              }}
              maxLength={MAXIMO}
              rows={3}
              disabled={pendiente}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${idError} ${idAyuda}` : idAyuda}
            />
            <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
              <p id={idAyuda} className="text-pretty">
                {ayuda}
              </p>
              <span className="shrink-0 cifras" aria-hidden>
                {motivo.length}/{MAXIMO}
              </span>
            </div>
            {error ? (
              <p
                id={idError}
                role="alert"
                className="text-sm text-pretty text-destructive"
              >
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
          <Button
            onClick={confirmar}
            disabled={pendiente}
            variant={destructivo ? "destructive" : "default"}
          >
            {pendiente ? (
              <Spinner aria-label="Guardando" data-icon="inline-start" />
            ) : null}
            {textoConfirmar}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
