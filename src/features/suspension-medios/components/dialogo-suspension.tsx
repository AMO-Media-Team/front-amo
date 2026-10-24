"use client"

import { Ban, Handshake, RotateCw } from "lucide-react"
import { useId, useRef, useState, useTransition } from "react"

import { Esqueleto } from "@/components/feedback/esqueletos"
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
import {
  LONGITUD_MAXIMA_MOTIVO,
  LONGITUD_MINIMA_MOTIVO,
} from "@/features/usuarios/schemas"
import type { ResultadoAccion } from "@/lib/result"
import { cn } from "@/lib/utils"

import {
  EFECTO_SUSPENSION,
  MOTIVOS_SUSPENSION_MEDIO,
  PLACEHOLDER_MOTIVO_MEDIO,
} from "../decision"
import { resumirEnCurso, textoResumenEnCurso } from "../en-curso"
import type { AsignacionEnCurso, ResultadoSuspension } from "../tipos"
import { ListaEnCurso } from "./lista-en-curso"

/** Lo que el diálogo sabe de las asignaciones en curso mientras está abierto. */
export type CargaEnCurso =
  | { estado: "cargando" }
  | { estado: "lista"; asignaciones: readonly AsignacionEnCurso[] }
  | { estado: "error"; mensaje: string }
  /** Quien suspende no tiene `asignaciones.ver`. */
  | { estado: "sin_permiso" }

/**
 * Resumen visible de la carga. Es una región viva persistente: anuncia
 * «Cargando…» y después cuántas tiene en curso (el error se anuncia aparte
 * con `role="alert"`; sin permiso, el texto es fijo).
 */
function resumenCarga(carga: CargaEnCurso): string {
  switch (carga.estado) {
    case "cargando":
      return "Cargando sus asignaciones en curso…"
    case "lista":
      return textoResumenEnCurso(resumirEnCurso(carga.asignaciones))
    case "sin_permiso":
      return "No puedes ver sus asignaciones. Si las tiene, quien tenga acceso a ellas debe revisarlas para decidir si se cancelan."
    case "error":
      return ""
  }
}

function EnCurso({
  carga,
  verDisputas,
  onReintentar,
}: {
  carga: CargaEnCurso
  verDisputas: boolean
  onReintentar: () => void
}) {
  const resumen = resumenCarga(carga)
  return (
    <>
      <p
        role="status"
        className={cn(
          "text-sm text-pretty",
          carga.estado !== "lista" && "text-muted-foreground",
          !resumen && "sr-only"
        )}
      >
        {resumen}
      </p>
      {carga.estado === "cargando" ? (
        <div aria-hidden className="flex flex-col gap-2">
          <Esqueleto className="h-16 rounded-lg" />
          <Esqueleto className="h-16 rounded-lg" />
        </div>
      ) : null}
      {carga.estado === "error" ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/6 px-3 py-2.5 text-sm">
          <p role="alert" className="text-pretty">
            {carga.mensaje}
          </p>
          <Button variant="outline" size="sm" onClick={onReintentar}>
            <RotateCw data-icon="inline-start" aria-hidden />
            Reintentar
          </Button>
        </div>
      ) : null}
      {carga.estado === "lista" && carga.asignaciones.length > 0 ? (
        <ListaEnCurso
          asignaciones={carga.asignaciones}
          verDisputas={verDisputas}
          enOtraPestana
        />
      ) : null}
    </>
  )
}

/**
 * Suspender un medio (ADM-002): explica qué implica, muestra las asignaciones
 * que tiene en curso con enlace a cada ficha (allí se cancelan con su causa,
 * ADM-002 c2) y pide el motivo, que el medio recibe tal cual. Nunca cancela
 * asignaciones. Al abrir, el foco va al título (contenido largo: se lee de
 * arriba abajo); un fallo se muestra dentro y lo deja abierto.
 */
export function DialogoSuspension({
  abierto,
  onAbiertoChange,
  nombre,
  carga,
  verDisputas,
  focoAlCerrar,
  onReintentar,
  onConfirmar,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  nombre: string
  carga: CargaEnCurso
  verDisputas: boolean
  /** A dónde va el foco al cerrar (el botón de la cabecera, que cambia de texto). */
  focoAlCerrar?: () => HTMLElement | null
  onReintentar: () => void
  onConfirmar: (motivo: string) => Promise<ResultadoAccion<ResultadoSuspension>>
}) {
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const titulo = useRef<HTMLHeadingElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const idCampo = useId()
  const idAyuda = useId()
  const idError = useId()
  const idSugerencias = useId()
  const idEnCurso = useId()

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
    if (motivo.trim().length < LONGITUD_MINIMA_MOTIVO) {
      setError(
        `Describe el motivo (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres).`
      )
      campo.current?.focus()
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

  return (
    <AlertDialog open={abierto} onOpenChange={cambiarAbierto}>
      <AlertDialogContent
        initialFocus={titulo}
        finalFocus={focoAlCerrar}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg"
      >
        <AlertDialogHeader className="shrink-0 border-b px-4 pt-4 pb-3 sm:px-5">
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Ban aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle
            ref={titulo}
            tabIndex={-1}
            className="rounded-sm outline-none focus-visible:anillo-foco"
          >
            ¿Suspender a {nombre}?
          </AlertDialogTitle>
          <AlertDialogDescription>{EFECTO_SUSPENSION}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          <section aria-labelledby={idEnCurso} className="flex flex-col gap-2">
            <h3
              id={idEnCurso}
              className="flex items-center gap-1.5 text-sm font-semibold"
            >
              <Handshake aria-hidden className="size-4 text-muted-foreground" />
              Asignaciones en curso
            </h3>
            <EnCurso
              carga={carga}
              verDisputas={verDisputas}
              onReintentar={onReintentar}
            />
          </section>

          <div className="flex flex-col gap-3">
            <div className="grid gap-2">
              <p id={idSugerencias} className="text-xs text-muted-foreground">
                Motivos frecuentes
              </p>
              <ul
                aria-labelledby={idSugerencias}
                className="flex flex-col gap-1.5"
              >
                {MOTIVOS_SUSPENSION_MEDIO.map((sugerencia) => (
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
              <Label htmlFor={idCampo}>Motivo de la suspensión</Label>
              <Textarea
                ref={campo}
                id={idCampo}
                value={motivo}
                onChange={(evento) => {
                  setMotivo(evento.target.value)
                  // El aviso se va al corregirlo, como en los demás diálogos.
                  if (error) setError(null)
                }}
                maxLength={LONGITUD_MAXIMA_MOTIVO}
                rows={3}
                disabled={pendiente}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${idError} ${idAyuda}` : idAyuda}
                placeholder={PLACEHOLDER_MOTIVO_MEDIO}
              />
              <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
                <p id={idAyuda}>
                  El medio lo verá tal cual en su aviso; queda en la bitácora.
                </p>
                <span className="shrink-0 cifras" aria-hidden>
                  {motivo.length}/{LONGITUD_MAXIMA_MOTIVO}
                </span>
              </div>
              {error ? (
                <p
                  id={idError}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <AlertDialogFooter className="mx-0 mb-0 shrink-0 px-4 py-3 sm:px-5">
          <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
          <Button
            onClick={confirmar}
            disabled={pendiente}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30"
          >
            {pendiente ? (
              <Spinner aria-label="Procesando" data-icon="inline-start" />
            ) : null}
            Suspender medio
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
