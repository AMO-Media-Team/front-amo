"use client"

import { Video } from "lucide-react"
import { useId, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

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

import { registrarVideollamada } from "../actions"
import { esquemaVideollamada, LIMITES_VERIFICACION } from "../schemas"
import type { MedioResumen } from "../tipos"

const MAXIMO = LIMITES_VERIFICACION.observacionesMax

/**
 * Constancia de una prueba de vida por videollamada: la alternativa a la foto
 * (dato biométrico facultativo). Queda aprobada al registrarla, sin imagen.
 */
export function DialogoVideollamada({
  abierto,
  onAbiertoChange,
  medio,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  medio: MedioResumen
}) {
  const [observaciones, setObservaciones] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const campo = useRef<HTMLTextAreaElement>(null)
  const idCampo = useId()
  const idAyuda = useId()
  const idError = useId()

  function cambiarAbierto(valor: boolean) {
    if (pendiente) return
    if (!valor) {
      setObservaciones("")
      setError(null)
    }
    onAbiertoChange(valor)
  }

  function registrar() {
    const entrada = { medioId: medio.id, observaciones }
    const validacion = esquemaVideollamada.safeParse(entrada)
    if (!validacion.success) {
      setError(validacion.error.issues[0]?.message ?? "Revisa la descripción.")
      campo.current?.focus()
      return
    }
    setError(null)
    iniciar(async () => {
      const resultado = await registrarVideollamada(entrada)
      if (!resultado.ok) {
        setError(resultado.erroresCampo?.observaciones?.[0] ?? resultado.error)
        return
      }
      toast.success("Prueba de vida registrada", {
        description: `${medio.nombre} · por videollamada`,
      })
      setObservaciones("")
      onAbiertoChange(false)
    })
  }

  return (
    <AlertDialog open={abierto} onOpenChange={cambiarAbierto}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-primary/10 text-primary">
            <Video aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle>Registrar la videollamada</AlertDialogTitle>
          <AlertDialogDescription>
            Deja constancia de que verificaste en vivo la identidad del titular
            de <strong>{medio.nombre}</strong>. La prueba de vida queda aprobada
            sin guardar ninguna imagen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={idCampo}>Cómo se verificó</Label>
          <Textarea
            ref={campo}
            id={idCampo}
            value={observaciones}
            onChange={(evento) => {
              setObservaciones(evento.target.value)
              if (error) setError(null)
            }}
            rows={4}
            maxLength={MAXIMO}
            disabled={pendiente}
            placeholder="Ej.: 22 de octubre, 3:00 p. m. Atendió Ana Gómez. El titular mostró su cédula original por ambas caras y su rostro coincide con la foto."
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${idError} ${idAyuda}` : idAyuda}
          />
          <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
            <p id={idAyuda} className="text-pretty">
              Fecha, quién atendió y qué documento se exhibió. No escribas
              números de documento: esta nota no va cifrada.
            </p>
            <span className="shrink-0 cifras" aria-hidden>
              {observaciones.length}/{MAXIMO}
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
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
          <Button onClick={registrar} disabled={pendiente}>
            {pendiente ? (
              <Spinner aria-label="Registrando" data-icon="inline-start" />
            ) : null}
            Registrar y aprobar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
