"use client"

import { CircleAlert, Scale } from "lucide-react"
import { useId, useRef, useState, useTransition } from "react"

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
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { abrirDisputa } from "@/features/disputas/actions"
import { MOTIVOS } from "@/features/disputas/presentacion"
import {
  type EntradaAbrirDisputa,
  esquemaAbrirDisputa,
  LONGITUD_MAXIMA_DESCRIPCION,
} from "@/features/disputas/schemas"
import type { MotivoDisputa } from "@/features/disputas/tipos"
import { formatearNumero } from "@/lib/format"
import { desdeErrorZod } from "@/lib/result"

import { efectosDisputa } from "../gestion-asignacion"

type Campo = "motivo" | "descripcion"

/** Qué escribir según el motivo (el texto lo leen las partes). */
const PLACEHOLDERS: Readonly<Record<MotivoDisputa, string>> = {
  INCUMPLIMIENTO:
    "Ej.: el medio publicó fuera de la ventana pactada y sin la etiqueta de publicidad.",
  METRICAS:
    "Ej.: el alcance del corte de 72 horas no coincide con la captura del panel.",
  CONTENIDO:
    "Ej.: el copy publicado no es el aprobado; se agregó un enlace distinto.",
  PERMANENCIA:
    "Ej.: el post ya no está visible en la cuenta desde el 20 de octubre.",
  PAGO: "Ej.: el anunciante reporta un cobro que no corresponde a esta asignación.",
  OTRO: "Describe qué pasó, cuándo y qué evidencia hay.",
}

export interface DialogoAbrirDisputaProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  asignacion: { id: string; titulo: string; medio: string }
  /** Los que admite el estado (`aperturaPosible` con la parte ADMIN). */
  motivos: readonly MotivoDisputa[]
  /** A dónde va el foco al cerrar (`finalFocus`); `null`: el botón que lo abrió. */
  focoAlCerrar?: () => HTMLElement | null
  onAbierta: (disputaId: string) => void
}

/**
 * El equipo AMO abre una disputa sobre la asignación (ADM-011) con la acción,
 * el esquema y los textos de `@/features/disputas` (los mismos de la bandeja
 * y de las partes): motivo con lo que significa para el equipo, descripción
 * (la leen el medio y el anunciante) y qué pasa al abrirla. Un fallo queda
 * dentro del diálogo, asociado a su campo.
 */
export function DialogoAbrirDisputa({
  abierto,
  onAbiertoChange,
  asignacion,
  motivos,
  focoAlCerrar,
  onAbierta,
}: DialogoAbrirDisputaProps) {
  const [motivo, setMotivo] = useState<MotivoDisputa | null>(null)
  const [descripcion, setDescripcion] = useState("")
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const grupoMotivos = useRef<HTMLDivElement>(null)
  const campoDescripcion = useRef<HTMLTextAreaElement>(null)
  const ids = {
    motivo: useId(),
    errorMotivo: useId(),
    descripcion: useId(),
    ayuda: useId(),
    error: useId(),
    prefijo: useId(),
  }

  function reiniciar() {
    setMotivo(null)
    setDescripcion("")
    setErrores({})
    setErrorGeneral(null)
  }

  function cambiarAbierto(valor: boolean) {
    if (pendiente) return
    if (!valor) reiniciar()
    onAbiertoChange(valor)
  }

  function mostrarErrores(erroresCampo: Record<string, string[]> | undefined) {
    const porCampo: Partial<Record<Campo, string>> = {
      motivo: erroresCampo?.motivo?.[0],
      descripcion: erroresCampo?.descripcion?.[0],
    }
    setErrores(porCampo)
    if (porCampo.motivo) {
      grupoMotivos.current
        ?.querySelector<HTMLElement>('[role="radio"]')
        ?.focus()
    } else if (porCampo.descripcion) {
      campoDescripcion.current?.focus()
    }
    return Boolean(porCampo.motivo || porCampo.descripcion)
  }

  function confirmar() {
    const entrada: EntradaAbrirDisputa = {
      asignacionId: asignacion.id,
      // Sin elegir, el esquema responde «Elige el motivo.».
      motivo: motivo as MotivoDisputa,
      descripcion,
    }
    const validacion = esquemaAbrirDisputa.safeParse(entrada)
    if (!validacion.success) {
      setErrorGeneral(null)
      mostrarErrores(desdeErrorZod(validacion.error).erroresCampo)
      return
    }
    setErrores({})
    setErrorGeneral(null)
    iniciar(async () => {
      const resultado = await abrirDisputa(entrada)
      if (!resultado.ok) {
        if (!mostrarErrores(resultado.erroresCampo)) {
          setErrorGeneral(resultado.error)
        }
        return
      }
      onAbierta(resultado.datos.disputaId)
      reiniciar()
      onAbiertoChange(false)
    })
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
        className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-xl"
      >
        <DialogHeader className="flex-row items-start gap-3 border-b px-5 py-4 text-left">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/12 text-warning"
          >
            <Scale className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle className="text-base font-semibold">
              ¿Abrir una disputa?
            </DialogTitle>
            <DialogDescription className="text-pretty">
              Sobre «{asignacion.titulo}» con {asignacion.medio}. La abre el
              equipo AMO.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-4">
          <ul
            aria-label="Qué pasa al abrirla"
            className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-pretty"
          >
            {efectosDisputa(motivo).map((efecto) => (
              <li key={efecto} className="flex gap-2">
                <CircleAlert
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                {efecto}
              </li>
            ))}
          </ul>

          <div className="grid gap-2">
            <p id={ids.motivo} className="text-sm font-medium">
              Motivo
            </p>
            <RadioGroup
              ref={grupoMotivos}
              value={motivo ?? ""}
              onValueChange={(valor) => {
                const elegido = motivos.find((clave) => clave === valor)
                if (!elegido) return
                setMotivo(elegido)
                setErrores(({ motivo: _, ...resto }) => resto)
              }}
              disabled={pendiente}
              aria-labelledby={ids.motivo}
              aria-invalid={errores.motivo ? true : undefined}
              aria-describedby={errores.motivo ? ids.errorMotivo : undefined}
              className="gap-2 sm:grid-cols-2"
            >
              {motivos.map((clave) => (
                <label
                  key={clave}
                  className="flex cursor-pointer gap-3 rounded-xl border bg-background/60 p-3 transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-primary/6 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/20"
                >
                  <RadioGroupItem
                    value={clave}
                    className="mt-0.5"
                    aria-labelledby={`${ids.prefijo}-${clave}`}
                    aria-describedby={`${ids.prefijo}-${clave}-ayuda`}
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      id={`${ids.prefijo}-${clave}`}
                      className="text-sm font-medium"
                    >
                      {MOTIVOS[clave].etiqueta}
                    </span>
                    <span
                      id={`${ids.prefijo}-${clave}-ayuda`}
                      className="text-xs text-pretty text-muted-foreground"
                    >
                      {MOTIVOS[clave].ayuda.interno}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            {errores.motivo ? (
              <p
                id={ids.errorMotivo}
                role="alert"
                className="text-sm text-destructive"
              >
                {errores.motivo}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={ids.descripcion}>Qué pasó</Label>
            <Textarea
              ref={campoDescripcion}
              id={ids.descripcion}
              value={descripcion}
              onChange={(evento) => {
                setDescripcion(evento.target.value)
                if (errores.descripcion) {
                  setErrores(({ descripcion: _, ...resto }) => resto)
                }
              }}
              maxLength={LONGITUD_MAXIMA_DESCRIPCION}
              rows={4}
              disabled={pendiente}
              placeholder={PLACEHOLDERS[motivo ?? "OTRO"]}
              aria-invalid={errores.descripcion ? true : undefined}
              aria-describedby={
                errores.descripcion ? `${ids.error} ${ids.ayuda}` : ids.ayuda
              }
            />
            <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
              <p id={ids.ayuda} className="text-pretty">
                Es lo primero que leen el medio y el anunciante en el hilo de la
                disputa. No incluyas datos personales ni bancarios.
              </p>
              <span className="shrink-0 cifras" aria-hidden>
                {formatearNumero(descripcion.length)}/
                {formatearNumero(LONGITUD_MAXIMA_DESCRIPCION)}
              </span>
            </div>
            {errores.descripcion ? (
              <p
                id={ids.error}
                role="alert"
                className="text-sm text-destructive"
              >
                {errores.descripcion}
              </p>
            ) : null}
          </div>

          {errorGeneral ? (
            <p role="alert" className="text-sm text-pretty text-destructive">
              {errorGeneral}
            </p>
          ) : null}
        </div>

        <DialogFooter className="mx-0 mb-0 px-5 py-4">
          <DialogClose
            disabled={pendiente}
            render={<Button variant="outline" />}
          >
            Volver
          </DialogClose>
          <Button onClick={confirmar} disabled={pendiente}>
            {pendiente ? (
              <Spinner aria-label="Abriendo" data-icon="inline-start" />
            ) : (
              <Scale data-icon="inline-start" aria-hidden />
            )}
            Abrir disputa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
