"use client"

import { ThumbsDown } from "lucide-react"
import { useRouter } from "next/navigation"
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
import { cn } from "@/lib/utils"

import { rechazarOferta } from "../actions"
import { SUGERENCIAS_NO_ME_INTERESA } from "../presentacion"
import { RUTA_OFERTAS_MEDIO } from "../rutas"
import {
  esquemaRechazarOferta,
  LONGITUD_MAXIMA_MOTIVO_RECHAZO,
} from "../schemas"

const ERROR_INESPERADO =
  "No pudimos quitar la oferta de tu lista. Revisa tu conexión e intenta de nuevo."

/**
 * «No me interesa» (MED-010): motivo opcional con sugerencias de un toque.
 * Al confirmar, la oferta sale del listado (queda en «Ver las que rechacé»)
 * y el medio vuelve a «Ofertas». Un fallo se muestra dentro del diálogo, junto
 * al campo si es del motivo.
 */
export function DialogoNoMeInteresa({
  abierto,
  onAbiertoChange,
  ofertaId,
  titulo,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  ofertaId: string
  titulo: string
}) {
  const router = useRouter()
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<{
    mensaje: string
    campo: boolean
  } | null>(null)
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
    const validacion = esquemaRechazarOferta.safeParse({ ofertaId, motivo })
    if (!validacion.success) {
      setError({
        mensaje: validacion.error.issues[0]?.message ?? ERROR_INESPERADO,
        campo: true,
      })
      campo.current?.focus()
      return
    }
    setError(null)
    iniciar(async () => {
      try {
        const resultado = await rechazarOferta({ ofertaId, motivo })
        if (!resultado.ok) {
          const delCampo = resultado.erroresCampo?.motivo?.[0]
          setError({ mensaje: delCampo ?? resultado.error, campo: !!delCampo })
          return
        }
        toast.success("Listo: quitamos la oferta de tu lista", {
          description:
            "Si cambias de opinión, la encuentras en «Ver las que rechacé» mientras siga abierta.",
        })
        router.push(RUTA_OFERTAS_MEDIO)
      } catch {
        setError({ mensaje: ERROR_INESPERADO, campo: false })
      }
    })
  }

  const errorEnCampo = error?.campo ?? false

  return (
    <AlertDialog open={abierto} onOpenChange={cambiarAbierto}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-muted text-muted-foreground">
            <ThumbsDown aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle>¿No te interesa esta oferta?</AlertDialogTitle>
          <AlertDialogDescription>
            Quitaremos «{titulo}» de tu lista. Contarnos por qué es opcional y
            nos ayuda a traerte ofertas que te sirvan.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-2">
            <p id={idSugerencias} className="text-xs text-muted-foreground">
              Motivos frecuentes
            </p>
            <ul
              aria-labelledby={idSugerencias}
              className="flex flex-col gap-1.5"
            >
              {SUGERENCIAS_NO_ME_INTERESA.map((sugerencia) => (
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

          <div className="grid gap-2">
            <Label htmlFor={idCampo}>
              Motivo{" "}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
            </Label>
            <Textarea
              ref={campo}
              id={idCampo}
              value={motivo}
              onChange={(evento) => {
                setMotivo(evento.target.value)
                if (errorEnCampo) setError(null)
              }}
              maxLength={LONGITUD_MAXIMA_MOTIVO_RECHAZO}
              rows={3}
              disabled={pendiente}
              aria-invalid={errorEnCampo || undefined}
              aria-describedby={
                errorEnCampo ? `${idError} ${idAyuda}` : idAyuda
              }
              placeholder="Ej.: no tengo espacio para publicar esas fechas"
            />
            <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
              <p id={idAyuda}>Solo lo ve el equipo AMO.</p>
              <span className="shrink-0 cifras" aria-hidden>
                {motivo.length}/{LONGITUD_MAXIMA_MOTIVO_RECHAZO}
              </span>
            </div>
          </div>

          {error ? (
            <p id={idError} role="alert" className="text-sm text-destructive">
              {error.mensaje}
            </p>
          ) : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendiente}>Volver</AlertDialogCancel>
          <Button onClick={confirmar} disabled={pendiente}>
            {pendiente ? (
              <Spinner aria-label="Procesando" data-icon="inline-start" />
            ) : null}
            Quitar de mi lista
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
