"use client"

import { Ban, CircleAlert, TriangleAlert, UserX } from "lucide-react"
import { useId, useRef, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { LONGITUD_MAXIMA_MOTIVO } from "@/features/usuarios/schemas"
import { desdeErrorZod } from "@/lib/result"
import { cn } from "@/lib/utils"

import { cancelarAsignacion } from "../actions"
import { CAUSAS_CANCELACION, type EstadoAsignacion } from "../estados"
import {
  admiteSuspension,
  type CausaCancelacion,
  EFECTOS_CAUSA,
  efectosCancelacion,
  type OpcionCancelar,
  ORDEN_CAUSAS,
  SUGERENCIAS_CANCELACION,
} from "../gestion-asignacion"
import {
  type EntradaCancelarAsignacion,
  esquemaCancelarAsignacion,
} from "../schemas"

type Campo = "causa" | "motivo" | "suspenderMedio"

const CAMPOS: readonly Campo[] = ["causa", "motivo", "suspenderMedio"]

function erroresDe(
  erroresCampo: Readonly<Record<string, string[]>> | undefined
): Partial<Record<Campo, string>> {
  return Object.fromEntries(
    CAMPOS.flatMap((campo) => {
      const mensaje = erroresCampo?.[campo]?.[0]
      return mensaje ? [[campo, mensaje]] : []
    })
  )
}

export interface CancelacionHecha {
  causa: CausaCancelacion
  medioSuspendido: boolean
}

export interface DialogoCancelarAsignacionProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  asignacion: { id: string; titulo: string; medio: string }
  /** Estado que mostraba la ficha al abrir el diálogo (la acción lo compara). */
  estadoVisto: EstadoAsignacion
  opcion: OpcionCancelar
  /** A dónde va el foco al cerrar (`finalFocus`); `null`: el botón que lo abrió. */
  focoAlCerrar?: () => HTMLElement | null
  onCancelada: (hecha: CancelacionHecha) => void
}

/**
 * Cancelación con causa (ADM-010, INT-006): qué pasa al cancelar, la causa
 * del catálogo con lo que significa para el medio, el motivo (con motivos
 * frecuentes según la causa) y, con fraude o incumplimiento del medio,
 * «Suspender también al medio». Se valida con el mismo esquema que la acción;
 * un fallo queda dentro del diálogo, asociado a su campo, y lo mantiene
 * abierto. No se cierra al tocar fuera: lo escrito no se pierde por accidente.
 */
export function DialogoCancelarAsignacion({
  abierto,
  onAbiertoChange,
  asignacion,
  estadoVisto,
  opcion,
  focoAlCerrar,
  onCancelada,
}: DialogoCancelarAsignacionProps) {
  const [causa, setCausa] = useState<CausaCancelacion | null>(null)
  const [motivo, setMotivo] = useState("")
  const [suspender, setSuspender] = useState(false)
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const grupoCausas = useRef<HTMLDivElement>(null)
  const campoMotivo = useRef<HTMLTextAreaElement>(null)
  const ids = {
    causa: useId(),
    errorCausa: useId(),
    motivo: useId(),
    ayudaMotivo: useId(),
    errorMotivo: useId(),
    sugerencias: useId(),
    suspender: useId(),
    ayudaSuspender: useId(),
    errorSuspender: useId(),
    prefijoCausa: useId(),
  }
  const conSuspension = admiteSuspension(causa)
  const sugerencias = causa ? SUGERENCIAS_CANCELACION[causa] : []

  function reiniciar() {
    setCausa(null)
    setMotivo("")
    setSuspender(false)
    setErrores({})
    setErrorGeneral(null)
  }

  function cambiarAbierto(valor: boolean) {
    if (pendiente) return
    if (!valor) reiniciar()
    onAbiertoChange(valor)
  }

  function elegirCausa(valor: unknown) {
    if (typeof valor !== "string" || !(valor in CAUSAS_CANCELACION)) return
    const elegida = valor as CausaCancelacion
    setCausa(elegida)
    if (!admiteSuspension(elegida)) setSuspender(false)
    setErrores(({ causa: _, suspenderMedio: __, ...resto }) => resto)
  }

  function usarSugerencia(texto: string) {
    setMotivo(texto)
    setErrores(({ motivo: _, ...resto }) => resto)
    campoMotivo.current?.focus()
  }

  function enfocarPrimerError(campos: Partial<Record<Campo, string>>) {
    if (campos.causa) {
      grupoCausas.current?.querySelector<HTMLElement>('[role="radio"]')?.focus()
    } else if (campos.motivo) {
      campoMotivo.current?.focus()
    }
  }

  function confirmar() {
    const entrada: EntradaCancelarAsignacion = {
      asignacionId: asignacion.id,
      estadoVisto,
      // Sin elegir, el esquema responde «Elige la causa de la cancelación».
      causa: causa as CausaCancelacion,
      motivo,
      suspenderMedio: conSuspension && suspender,
    }
    const validacion = esquemaCancelarAsignacion.safeParse(entrada)
    if (!validacion.success) {
      const porCampo = erroresDe(desdeErrorZod(validacion.error).erroresCampo)
      setErrores(porCampo)
      setErrorGeneral(null)
      enfocarPrimerError(porCampo)
      return
    }
    setErrores({})
    setErrorGeneral(null)
    iniciar(async () => {
      const resultado = await cancelarAsignacion(entrada)
      if (!resultado.ok) {
        const porCampo = erroresDe(resultado.erroresCampo)
        if (Object.keys(porCampo).length > 0) {
          setErrores(porCampo)
          enfocarPrimerError(porCampo)
        } else {
          setErrorGeneral(resultado.error)
        }
        return
      }
      onCancelada({
        causa: validacion.data.causa,
        medioSuspendido: resultado.datos.medioSuspendido,
      })
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
        className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-lg"
      >
        <DialogHeader className="flex-row items-start gap-3 border-b px-5 py-4 text-left">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive"
          >
            <TriangleAlert className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle className="text-base font-semibold">
              ¿Cancelar la asignación?
            </DialogTitle>
            <DialogDescription className="text-pretty">
              «{asignacion.titulo}» con {asignacion.medio}.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-4">
          <ul
            aria-label="Qué pasa al cancelar"
            className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-pretty"
          >
            {efectosCancelacion(estadoVisto).map((efecto) => (
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
            <p id={ids.causa} className="text-sm font-medium">
              Causa
            </p>
            <RadioGroup
              ref={grupoCausas}
              value={causa ?? ""}
              onValueChange={elegirCausa}
              disabled={pendiente}
              aria-labelledby={ids.causa}
              aria-invalid={errores.causa ? true : undefined}
              aria-describedby={errores.causa ? ids.errorCausa : undefined}
              className="gap-2"
            >
              {ORDEN_CAUSAS.map((clave) => (
                <label
                  key={clave}
                  className="flex cursor-pointer gap-3 rounded-xl border bg-background/60 p-3 transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-primary/6 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/20"
                >
                  <RadioGroupItem
                    value={clave}
                    className="mt-0.5"
                    aria-labelledby={`${ids.prefijoCausa}-${clave}`}
                    aria-describedby={`${ids.prefijoCausa}-${clave}-ayuda`}
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      id={`${ids.prefijoCausa}-${clave}`}
                      className="text-sm font-medium"
                    >
                      {CAUSAS_CANCELACION[clave]}
                    </span>
                    <span
                      id={`${ids.prefijoCausa}-${clave}-ayuda`}
                      className="text-xs text-pretty text-muted-foreground"
                    >
                      {EFECTOS_CAUSA[clave]}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            {errores.causa ? (
              <p
                id={ids.errorCausa}
                role="alert"
                className="text-sm text-destructive"
              >
                {errores.causa}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            {sugerencias.length > 0 ? (
              <div className="grid gap-2">
                <p
                  id={ids.sugerencias}
                  className="text-xs text-muted-foreground"
                >
                  Motivos frecuentes
                </p>
                <ul
                  aria-labelledby={ids.sugerencias}
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
            <Label htmlFor={ids.motivo}>Motivo</Label>
            <Textarea
              ref={campoMotivo}
              id={ids.motivo}
              value={motivo}
              onChange={(evento) => {
                setMotivo(evento.target.value)
                if (errores.motivo) {
                  setErrores(({ motivo: _, ...resto }) => resto)
                }
              }}
              maxLength={LONGITUD_MAXIMA_MOTIVO}
              rows={3}
              disabled={pendiente}
              placeholder="Ej.: el medio retiró la publicación al segundo día; el anunciante lo reportó con capturas."
              aria-invalid={errores.motivo ? true : undefined}
              aria-describedby={
                errores.motivo
                  ? `${ids.errorMotivo} ${ids.ayudaMotivo}`
                  : ids.ayudaMotivo
              }
            />
            <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
              <p id={ids.ayudaMotivo} className="text-pretty">
                Lo reciben el medio y el anunciante en el aviso; queda en la
                bitácora.
              </p>
              <span className="shrink-0 cifras" aria-hidden>
                {motivo.length}/{LONGITUD_MAXIMA_MOTIVO}
              </span>
            </div>
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

          {conSuspension && opcion.suspension !== "no_aplica" ? (
            opcion.suspension === "disponible" ? (
              <div className="grid gap-2">
                <div className="flex items-start gap-3 rounded-xl border border-warning/45 bg-warning/8 p-3">
                  <Checkbox
                    id={ids.suspender}
                    checked={suspender}
                    onCheckedChange={(valor) => {
                      setSuspender(valor === true)
                      setErrores(({ suspenderMedio: _, ...resto }) => resto)
                    }}
                    disabled={pendiente}
                    aria-invalid={errores.suspenderMedio ? true : undefined}
                    aria-describedby={
                      errores.suspenderMedio
                        ? `${ids.errorSuspender} ${ids.ayudaSuspender}`
                        : ids.ayudaSuspender
                    }
                    className="mt-0.5"
                  />
                  <div className="flex min-w-0 flex-col gap-1">
                    <Label htmlFor={ids.suspender} className="leading-snug">
                      Suspender también a {asignacion.medio}
                    </Label>
                    <p
                      id={ids.ayudaSuspender}
                      className="text-xs text-pretty text-muted-foreground"
                    >
                      Deja de ver ofertas nuevas desde ya y recibe el mismo
                      motivo. Conserva lo que tiene en curso mientras el equipo
                      decide: revisa sus otras asignaciones en su ficha.
                    </p>
                  </div>
                </div>
                {errores.suspenderMedio ? (
                  <p
                    id={ids.errorSuspender}
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {errores.suspenderMedio}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="flex gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-pretty">
                <UserX
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                {opcion.suspension === "ya_suspendido"
                  ? `${asignacion.medio} ya está suspendido: la cancelación no cambia eso.`
                  : "No tienes permiso para suspender medios. Si hace falta suspenderlo, pídeselo a quien lo tenga: lo hará desde la ficha del medio."}
              </p>
            )
          ) : null}

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
          <Button
            onClick={confirmar}
            disabled={pendiente}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30"
          >
            {pendiente ? (
              <Spinner aria-label="Cancelando" data-icon="inline-start" />
            ) : (
              <Ban data-icon="inline-start" aria-hidden />
            )}
            Cancelar asignación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
