"use client"

import { CircleAlert, Gavel } from "lucide-react"
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
import type { ResultadoAccion } from "@/lib/result"
import { cn } from "@/lib/utils"

import {
  AYUDA_CAUSAS,
  bloqueoPermanencia,
  type EfectoAlResolver,
  etiquetaCausa,
  type OpcionResolucion,
  ORDEN_CAUSAS,
  SUGERENCIAS_RESOLUCION,
} from "../resolucion"
import {
  type EntradaResolverDisputa,
  esquemaResolverDisputa,
  LONGITUD_MAXIMA_RESOLUCION,
} from "../schemas"
import type { CausaCancelacion } from "../tipos"

type Campo = "resultado" | "causa" | "constancia" | "motivo"
type Errores = Partial<Record<Campo | "general", string>>

const TARJETA_OPCION =
  "flex cursor-pointer items-start gap-3 rounded-xl border bg-background/60 p-3 transition-colors select-none hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-primary/6 has-data-disabled:cursor-not-allowed has-data-disabled:opacity-70 has-data-disabled:hover:bg-background/60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/20"

export interface DialogoResolverProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  disputaId: string
  /** De `opcionesResolucion` (calculadas en el servidor con la asignación). */
  opciones: readonly OpcionResolucion[]
  /** Fin de la permanencia, para explicar la constancia manual. */
  permanenciaHasta?: string | null
  focoAlCerrar?: () => HTMLElement | null
  onConfirmar: (
    entrada: EntradaResolverDisputa
  ) => Promise<ResultadoAccion<unknown>>
}

/**
 * Resolver una disputa (ADM-012): qué pasa con la asignación (las opciones
 * que admite su estado previo, cada una con su efecto y, si no se puede, por
 * qué), la causa si se cancela, la constancia manual de la permanencia si se
 * verifica antes de tiempo y la explicación, que reciben las partes. Valida
 * con el mismo esquema que la acción; un fallo de la BD se muestra dentro.
 */
export function DialogoResolver({
  abierto,
  onAbiertoChange,
  disputaId,
  opciones,
  permanenciaHasta = null,
  focoAlCerrar,
  onConfirmar,
}: DialogoResolverProps) {
  const [efecto, setEfecto] = useState<EfectoAlResolver | null>(null)
  const [causa, setCausa] = useState<CausaCancelacion | null>(null)
  const [constancia, setConstancia] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [errores, setErrores] = useState<Errores>({})
  const [pendiente, iniciar] = useTransition()
  const campoMotivo = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const ids = {
    resultado: `${id}-resultado`,
    causa: `${id}-causa`,
    constancia: `${id}-constancia`,
    motivo: `${id}-motivo`,
    ayudaMotivo: `${id}-ayuda-motivo`,
    sugerencias: `${id}-sugerencias`,
  }
  const elegida = opciones.find((opcion) => opcion.efecto === efecto) ?? null
  const sugerencias = elegida ? SUGERENCIAS_RESOLUCION[elegida.efecto] : []

  function reiniciar() {
    setEfecto(null)
    setCausa(null)
    setConstancia(false)
    setMotivo("")
    setErrores({})
  }

  function cambiarAbierto(valor: boolean) {
    if (pendiente) return
    if (!valor) reiniciar()
    onAbiertoChange(valor)
  }

  function sinError(campo: Campo) {
    setErrores(({ [campo]: _quitado, general: _general, ...resto }) => resto)
  }

  function confirmar() {
    if (!elegida) {
      setErrores({ resultado: "Elige qué pasa con la asignación." })
      return
    }
    if (elegida.pideConstancia && !constancia) {
      setErrores({
        constancia:
          "Marca la constancia para verificar ahora, o espera a que se cumpla la permanencia.",
      })
      return
    }
    const entrada: EntradaResolverDisputa = {
      disputaId,
      estadoResultante: elegida.estadoResultante,
      causa: elegida.requiereCausa ? causa : null,
      permanenciaVerificada: elegida.pideConstancia && constancia,
      motivo,
    }
    const validacion = esquemaResolverDisputa.safeParse(entrada)
    if (!validacion.success) {
      const nuevos: Errores = {}
      for (const issue of validacion.error.issues) {
        const campo = issue.path[0]
        if (campo === "causa" || campo === "motivo") {
          nuevos[campo] ??= issue.message
        } else if (campo === "estadoResultante") {
          nuevos.resultado ??= issue.message
        }
      }
      setErrores(nuevos)
      if (nuevos.motivo && !nuevos.causa) campoMotivo.current?.focus()
      return
    }
    setErrores({})
    iniciar(async () => {
      const resultado = await onConfirmar(entrada)
      if (resultado.ok) {
        reiniciar()
        onAbiertoChange(false)
        return
      }
      const deCampo =
        resultado.erroresCampo?.motivo?.[0] ??
        resultado.erroresCampo?.causa?.[0]
      setErrores(
        resultado.erroresCampo?.causa
          ? { causa: resultado.erroresCampo.causa[0] }
          : deCampo
            ? { motivo: deCampo }
            : { general: resultado.error }
      )
    })
  }

  return (
    // Tocar fuera no cierra: borraría la decisión y la explicación escritas.
    <Dialog
      open={abierto}
      onOpenChange={cambiarAbierto}
      disablePointerDismissal
    >
      <DialogContent
        showCloseButton={false}
        finalFocus={focoAlCerrar}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader className="flex-row items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Gavel className="size-5" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle>Resolver la disputa</DialogTitle>
            <DialogDescription>
              Elige qué pasa con la asignación y explica la decisión: el medio y
              el anunciante la recibirán en un aviso y la verán en la disputa.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p id={ids.resultado} className="text-sm font-medium">
              ¿Qué pasa con la asignación?
            </p>
            <RadioGroup
              value={efecto ?? ""}
              onValueChange={(valor) => {
                setEfecto(valor as EfectoAlResolver)
                sinError("resultado")
              }}
              disabled={pendiente}
              aria-labelledby={ids.resultado}
              aria-invalid={errores.resultado ? true : undefined}
              aria-describedby={
                errores.resultado ? `${ids.resultado}-error` : undefined
              }
              className="gap-2"
            >
              {opciones.map((opcion) => {
                const idOpcion = `${id}-${opcion.efecto}`
                return (
                  <label key={opcion.efecto} className={TARJETA_OPCION}>
                    <RadioGroupItem
                      value={opcion.efecto}
                      disabled={opcion.bloqueo !== null}
                      aria-labelledby={`${idOpcion}-titulo`}
                      aria-describedby={`${idOpcion}-efecto${opcion.bloqueo ? ` ${idOpcion}-bloqueo` : ""}`}
                      className="mt-0.5"
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span
                        id={`${idOpcion}-titulo`}
                        className="text-sm font-medium"
                      >
                        {opcion.titulo}
                      </span>
                      <span
                        id={`${idOpcion}-efecto`}
                        className="text-xs text-pretty text-muted-foreground"
                      >
                        {opcion.explicacion}
                      </span>
                      {opcion.bloqueo ? (
                        <span
                          id={`${idOpcion}-bloqueo`}
                          className="mt-1 flex items-start gap-1.5 text-xs font-medium text-pretty text-warning"
                        >
                          <CircleAlert
                            aria-hidden
                            className="mt-px size-3.5 shrink-0"
                          />
                          {opcion.bloqueo}
                        </span>
                      ) : null}
                    </span>
                  </label>
                )
              })}
            </RadioGroup>
            {errores.resultado ? (
              <p
                id={`${ids.resultado}-error`}
                role="alert"
                className="text-sm text-destructive"
              >
                {errores.resultado}
              </p>
            ) : null}
          </div>

          {elegida?.requiereCausa ? (
            <div className="flex flex-col gap-2">
              <p id={ids.causa} className="text-sm font-medium">
                Causa de la cancelación
              </p>
              <RadioGroup
                value={causa ?? ""}
                onValueChange={(valor) => {
                  setCausa(valor as CausaCancelacion)
                  sinError("causa")
                }}
                disabled={pendiente}
                aria-labelledby={ids.causa}
                aria-invalid={errores.causa ? true : undefined}
                aria-describedby={
                  errores.causa ? `${ids.causa}-error` : undefined
                }
                className="grid gap-2 sm:grid-cols-2"
              >
                {ORDEN_CAUSAS.map((valor) => {
                  const idCausa = `${id}-causa-${valor}`
                  return (
                    <label key={valor} className={TARJETA_OPCION}>
                      <RadioGroupItem
                        value={valor}
                        aria-labelledby={`${idCausa}-titulo`}
                        aria-describedby={`${idCausa}-ayuda`}
                        className="mt-0.5"
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span
                          id={`${idCausa}-titulo`}
                          className="text-sm font-medium"
                        >
                          {etiquetaCausa(valor)}
                        </span>
                        <span
                          id={`${idCausa}-ayuda`}
                          className="text-xs text-pretty text-muted-foreground"
                        >
                          {AYUDA_CAUSAS[valor]}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </RadioGroup>
              {errores.causa ? (
                <p
                  id={`${ids.causa}-error`}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errores.causa}
                </p>
              ) : null}
            </div>
          ) : null}

          {elegida?.pideConstancia ? (
            <div className="flex flex-col gap-1.5 rounded-xl border border-warning/45 bg-warning/8 p-3">
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id={ids.constancia}
                  checked={constancia}
                  onCheckedChange={(valor) => {
                    setConstancia(valor === true)
                    sinError("constancia")
                  }}
                  disabled={pendiente}
                  aria-invalid={errores.constancia ? true : undefined}
                  aria-describedby={`${ids.constancia}-ayuda${errores.constancia ? ` ${ids.constancia}-error` : ""}`}
                  className="mt-0.5"
                />
                <Label
                  htmlFor={ids.constancia}
                  className="text-sm leading-snug"
                >
                  Comprobé que la publicación sigue en línea y dejo constancia
                  de la permanencia
                </Label>
              </div>
              <p
                id={`${ids.constancia}-ayuda`}
                className="pl-6.5 text-xs text-pretty text-muted-foreground"
              >
                {permanenciaHasta
                  ? `${bloqueoPermanencia(permanenciaHasta)} `
                  : ""}
                La constancia queda en la bitácora con tu explicación.
              </p>
              {errores.constancia ? (
                <p
                  id={`${ids.constancia}-error`}
                  role="alert"
                  className="pl-6.5 text-sm text-destructive"
                >
                  {errores.constancia}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor={ids.motivo}>Explicación de la decisión</Label>
            {sugerencias.length > 0 ? (
              <div className="grid gap-1.5">
                <p
                  id={ids.sugerencias}
                  className="text-xs text-muted-foreground"
                >
                  Redacciones frecuentes
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
                        onClick={() => {
                          setMotivo(sugerencia)
                          sinError("motivo")
                          campoMotivo.current?.focus()
                        }}
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
            <Textarea
              ref={campoMotivo}
              id={ids.motivo}
              value={motivo}
              onChange={(evento) => {
                setMotivo(evento.target.value)
                if (errores.motivo) sinError("motivo")
              }}
              maxLength={LONGITUD_MAXIMA_RESOLUCION}
              rows={3}
              disabled={pendiente}
              aria-invalid={errores.motivo ? true : undefined}
              aria-describedby={
                errores.motivo
                  ? `${ids.motivo}-error ${ids.ayudaMotivo}`
                  : ids.ayudaMotivo
              }
              placeholder="Ej.: revisamos la captura del panel y las cifras coinciden con la publicación…"
            />
            <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
              <p id={ids.ayudaMotivo}>
                La reciben el medio y el anunciante; queda en la bitácora.
              </p>
              <span className="shrink-0 cifras" aria-hidden>
                {motivo.length.toLocaleString("es-CO")}/
                {LONGITUD_MAXIMA_RESOLUCION.toLocaleString("es-CO")}
              </span>
            </div>
            {errores.motivo ? (
              <p
                id={`${ids.motivo}-error`}
                role="alert"
                className="text-sm text-destructive"
              >
                {errores.motivo}
              </p>
            ) : null}
          </div>

          {errores.general ? (
            <p role="alert" className="text-sm text-pretty text-destructive">
              {errores.general}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose
            disabled={pendiente}
            render={<Button variant="outline" />}
          >
            {/* «Cancelar» se confundiría con «Cancelar la asignación». */}
            Volver
          </DialogClose>
          <Button onClick={confirmar} disabled={pendiente}>
            {pendiente ? (
              <Spinner aria-label="Procesando" data-icon="inline-start" />
            ) : null}
            Resolver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
