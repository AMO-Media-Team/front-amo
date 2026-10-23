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

import { LONGITUD_MAXIMA_MOTIVO, LONGITUD_MINIMA_MOTIVO } from "../schemas"

interface DialogoMotivoProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  titulo: string
  descripcion: ReactNode
  textoConfirmar: string
  /** Botón que cierra sin hacer nada; «Volver» cuando la acción misma es cancelar algo. */
  textoCancelar?: string
  destructivo?: boolean
  /** Ayuda bajo el campo ("Quedará en la bitácora y lo verá el equipo de administración"). */
  ayuda?: string
  /** Rótulo del campo. */
  etiqueta?: string
  placeholder?: string
  /** Motivos frecuentes: un toque llena el campo, que se puede editar. */
  sugerencias?: readonly string[]
  /**
   * A dónde va el foco al cerrar. Úsalo cuando la acción hace desaparecer el
   * botón que abrió el diálogo (p. ej. el título de la ficha con `tabIndex={-1}`);
   * `null` vuelve al comportamiento por defecto (el elemento que lo tenía al abrir).
   */
  focoAlCerrar?: () => HTMLElement | null
  onConfirmar: (motivo: string) => Promise<ResultadoAccion<unknown>>
}

const PLACEHOLDER_POR_DEFECTO =
  "Ej.: solicitud del cliente, acceso indebido, cambio de área…"

/**
 * Confirmación que exige un motivo (transiciones con «M» en §4.2). El motivo
 * queda en la bitácora junto con el cambio. Un fallo se muestra dentro del
 * diálogo y lo mantiene abierto para corregir o reintentar. Con
 * `sugerencias`, ofrece redacciones frecuentes de un toque (p. ej. cuando el
 * motivo lo recibe un medio para corregir).
 */
export function DialogoMotivo({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  textoConfirmar,
  textoCancelar = "Cancelar",
  destructivo = false,
  ayuda = "Queda registrado en la bitácora de auditoría.",
  etiqueta = "Motivo",
  placeholder = PLACEHOLDER_POR_DEFECTO,
  sugerencias = [],
  focoAlCerrar,
  onConfirmar,
}: DialogoMotivoProps) {
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const campo = useRef<HTMLTextAreaElement>(null)
  const idCampo = useId()
  const idAyuda = useId()
  const idError = useId()
  const idSugerencias = useId()
  const valido = motivo.trim().length >= LONGITUD_MINIMA_MOTIVO
  const conSugerencias = sugerencias.length > 0

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
      <AlertDialogContent
        className={conSugerencias ? "sm:max-w-lg" : "sm:max-w-md"}
        finalFocus={focoAlCerrar}
      >
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

        <div className="grid gap-3">
          {conSugerencias ? (
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
              onChange={(evento) => setMotivo(evento.target.value)}
              maxLength={LONGITUD_MAXIMA_MOTIVO}
              rows={3}
              disabled={pendiente}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${idError} ${idAyuda}` : idAyuda}
              placeholder={placeholder}
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
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendiente}>
            {textoCancelar}
          </AlertDialogCancel>
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
