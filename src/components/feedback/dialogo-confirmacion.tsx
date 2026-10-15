"use client"

import { CircleHelp, TriangleAlert } from "lucide-react"
import {
  type ReactElement,
  type ReactNode,
  useId,
  useState,
  useTransition,
} from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type { ResultadoAccion } from "@/lib/result"

/**
 * `false` o un `ResultadoAccion` fallido mantienen el diálogo abierto; con un
 * fallo, su mensaje se muestra dentro del diálogo.
 */
export type RespuestaConfirmacion = void | boolean | ResultadoAccion<unknown>

const ERROR_INESPERADO = "No se pudo completar la acción. Intenta de nuevo."

interface DialogoConfirmacionProps {
  titulo: string
  descripcion?: ReactNode
  /** Elemento que abre el diálogo (se pasa como `render` del disparador). */
  disparador?: ReactElement
  abierto?: boolean
  onAbiertoChange?: (abierto: boolean) => void
  textoConfirmar?: string
  textoCancelar?: string
  destructivo?: boolean
  /** Texto que la persona debe escribir para habilitar la confirmación (p. ej. "ELIMINAR"). */
  textoVerificacion?: string
  onConfirmar: () => RespuestaConfirmacion | Promise<RespuestaConfirmacion>
}

function mensajeDeFallo(respuesta: RespuestaConfirmacion): string | null {
  if (respuesta === false) return ""
  if (typeof respuesta === "object" && !respuesta.ok) return respuesta.error
  return null
}

export function DialogoConfirmacion({
  titulo,
  descripcion,
  disparador,
  abierto: abiertoControlado,
  onAbiertoChange,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  destructivo = false,
  textoVerificacion,
  onConfirmar,
}: DialogoConfirmacionProps) {
  const [abiertoInterno, setAbiertoInterno] = useState(false)
  const [textoEscrito, setTextoEscrito] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const idVerificacion = useId()
  const idError = useId()

  const abierto = abiertoControlado ?? abiertoInterno
  const verificado =
    !textoVerificacion || textoEscrito.trim() === textoVerificacion

  function cambiarAbierto(valor: boolean) {
    if (pendiente && !valor) return
    if (!valor) {
      setTextoEscrito("")
      setError(null)
    }
    setAbiertoInterno(valor)
    onAbiertoChange?.(valor)
  }

  function confirmar() {
    if (!verificado) return
    setError(null)
    iniciar(async () => {
      try {
        const mensaje = mensajeDeFallo(await onConfirmar())
        if (mensaje === null) cambiarAbierto(false)
        else if (mensaje) setError(mensaje)
      } catch {
        // El diálogo sigue abierto para reintentar; el detalle queda en los logs.
        setError(ERROR_INESPERADO)
      }
    })
  }

  const Icono = destructivo ? TriangleAlert : CircleHelp

  return (
    <AlertDialog open={abierto} onOpenChange={cambiarAbierto}>
      {disparador ? <AlertDialogTrigger render={disparador} /> : null}
      <AlertDialogContent>
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
          {descripcion ? (
            <AlertDialogDescription>{descripcion}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        {textoVerificacion ? (
          <div className="grid gap-2">
            <Label htmlFor={idVerificacion} className="block leading-snug">
              Escribe{" "}
              <span className="font-mono font-semibold text-foreground">
                {textoVerificacion}
              </span>{" "}
              para confirmar
            </Label>
            <Input
              id={idVerificacion}
              value={textoEscrito}
              onChange={(evento) => setTextoEscrito(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === "Enter") confirmar()
              }}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={pendiente}
              aria-describedby={error ? idError : undefined}
            />
          </div>
        ) : null}

        {error ? (
          <p id={idError} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendiente}>
            {textoCancelar}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmar}
            disabled={!verificado || pendiente}
            className={cn(
              destructivo &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30"
            )}
          >
            {pendiente ? (
              <Spinner aria-label="Procesando" data-icon="inline-start" />
            ) : null}
            {textoConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
