"use client"

import { CircleAlert, FileText, Inbox, RefreshCw, X } from "lucide-react"
import {
  type FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import { useSubida } from "@/components/archivos/use-subida"
import type { ElementoSubida } from "@/components/archivos/use-subidas"
import { ZonaArchivos } from "@/components/archivos/zona-archivos"
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
import { formatearTamano } from "@/lib/archivos/formato"
import { mimeDeArchivo } from "@/lib/archivos/mime"
import type { ResultadoAccion } from "@/lib/result"
import { cn } from "@/lib/utils"

import {
  confirmarSoporteRespuesta,
  prepararSoporteRespuesta,
  responderSolicitud,
} from "../actions"
import {
  admiteSupresion,
  DECISIONES,
  ORDEN_DECISIONES,
  textoRadicado,
} from "../presentacion"
import {
  esquemaFormularioRespuesta,
  LIMITES_RESPUESTA,
  LIMITES_SOPORTE,
} from "../schemas"
import type { DecisionSolicitud, TipoSolicitud } from "../tipos"

const TARJETA_OPCION =
  "flex cursor-pointer items-start gap-3 rounded-xl border bg-background/60 p-3 transition-colors select-none hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-primary/6 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/20"

type Campo = "decision" | "respuesta" | "soporte"
type Errores = Partial<Record<Campo, string>>
type Fase = "editando" | "subiendo" | "respondiendo"

const ORDEN_CAMPOS: readonly Campo[] = ["decision", "respuesta", "soporte"]

export interface DialogoResponderProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  solicitud: { id: string; numero: number; tipo: TipoSolicitud }
  /** A dónde va el foco al cerrar tras responder (el botón ya no existe). */
  onRespondida: (resultado: ResultadoAccion) => void
}

/**
 * «Responder» (CTA-007): la decisión (procede, procede en parte, no procede),
 * la respuesta que recibe el titular y, opcional, un PDF de soporte que se
 * sube directo a `soportes/titular/{id}/` con una firma del servidor. Valida
 * como la acción antes de subir; si la BD rechaza después de subir, el
 * soporte se conserva para reintentar sin volver a subirlo.
 */
export function DialogoResponder({
  abierto,
  onAbiertoChange,
  solicitud,
  onRespondida,
}: DialogoResponderProps) {
  const [decision, setDecision] = useState<DecisionSolicitud | null>(null)
  const [respuesta, setRespuesta] = useState("")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subido, setSubido] = useState<{ archivo: File; ruta: string } | null>(
    null
  )
  const [errores, setErrores] = useState<Errores>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [fase, setFase] = useState<Fase>("editando")
  const [pendiente, iniciar] = useTransition()
  const ocupado = pendiente || fase !== "editando"

  // Cada apertura empieza en blanco.
  const [abiertoAntes, setAbiertoAntes] = useState(abierto)
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto)
    if (abierto) {
      setDecision(null)
      setRespuesta("")
      setArchivo(null)
      setSubido(null)
      setErrores({})
      setErrorGeneral(null)
      setFase("editando")
    }
  }

  const id = useId()
  const ids = {
    decision: `${id}-decision`,
    respuesta: `${id}-respuesta`,
    ayudaRespuesta: `${id}-ayuda-respuesta`,
    contador: `${id}-contador`,
    soporte: `${id}-soporte`,
  }
  const grupoDecision = useRef<HTMLDivElement>(null)
  const campoRespuesta = useRef<HTMLTextAreaElement>(null)
  const zonaSoporte = useRef<HTMLDivElement>(null)
  const campoConError = useRef<Campo | null>(null)

  const subida = useSubida<{ ruta: string }>({
    preparar: (descripcion) =>
      prepararSoporteRespuesta({
        solicitudId: solicitud.id,
        archivo: descripcion,
      }),
    confirmar: (cargado) =>
      confirmarSoporteRespuesta({
        solicitudId: solicitud.id,
        archivo: cargado,
      }),
    reglas: LIMITES_SOPORTE,
    miniatura: false,
  })

  useEffect(() => {
    const campo = campoConError.current
    if (!campo || ocupado) return
    campoConError.current = null
    if (campo === "respuesta") campoRespuesta.current?.focus()
    else if (campo === "decision")
      grupoDecision.current
        ?.querySelector<HTMLElement>('[role="radio"]')
        ?.focus()
    else zonaSoporte.current?.querySelector<HTMLElement>("button")?.focus()
  }, [errores, ocupado])

  function mostrarErrores(porCampo: Errores): boolean {
    setErrores(porCampo)
    campoConError.current =
      ORDEN_CAMPOS.find((campo) => porCampo[campo]) ?? null
    return campoConError.current !== null
  }

  function sinError(campo: Campo) {
    setErrores(({ [campo]: _quitado, ...resto }) => resto)
  }

  function cambiarAbierto(valor: boolean) {
    if (ocupado) return
    onAbiertoChange(valor)
  }

  async function rutaSoporte(elegido: File): Promise<string | null> {
    if (subido?.archivo === elegido) return subido.ruta
    setFase("subiendo")
    const resultado = await subida.subir(elegido)
    if (!resultado.ok) {
      if (!resultado.cancelada) mostrarErrores({ soporte: resultado.error })
      return null
    }
    setSubido({ archivo: elegido, ruta: resultado.datos.ruta })
    return resultado.datos.ruta
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (ocupado) return
    setErrorGeneral(null)
    const validacion = esquemaFormularioRespuesta.safeParse({
      solicitudId: solicitud.id,
      decision,
      respuesta,
    })
    if (!validacion.success) {
      const porCampo: Errores = {}
      for (const problema of validacion.error.issues) {
        const campo = problema.path[0] as Campo | undefined
        if (campo && !porCampo[campo]) porCampo[campo] = problema.message
      }
      mostrarErrores(porCampo)
      return
    }
    const elegido = archivo
    iniciar(async () => {
      let soportePath: string | null = null
      if (elegido) {
        soportePath = await rutaSoporte(elegido)
        if (!soportePath) {
          setFase("editando")
          return
        }
      }
      setFase("respondiendo")
      const resultado = await responderSolicitud({
        ...validacion.data,
        soportePath,
      })
      setFase("editando")
      if (!resultado.ok) {
        const deCampo: Errores = {}
        for (const campo of ORDEN_CAMPOS) {
          const mensaje = resultado.erroresCampo?.[campo]?.[0]
          if (mensaje) deCampo[campo] = mensaje
        }
        if (deCampo.soporte) setSubido(null)
        if (!mostrarErrores(deCampo)) setErrorGeneral(resultado.error)
        return
      }
      onAbiertoChange(false)
      onRespondida(resultado)
    })
  }

  const elemento: ElementoSubida | null =
    archivo && subida.activa
      ? {
          id: "soporte",
          nombre: archivo.name,
          tamano: archivo.size,
          tipo: mimeDeArchivo(archivo),
          vistaPrevia: null,
          resultado: null,
          estado: subida.estado,
          progreso: subida.progreso,
          error: subida.error,
          intento: subida.intento,
          reanudaEn: subida.reanudaEn,
        }
      : null
  const estadoEnvio =
    fase === "subiendo"
      ? "Subiendo el soporte…"
      : fase === "respondiendo"
        ? "Enviando la respuesta…"
        : ""

  return (
    // Tocar fuera no cierra: borraría lo escrito y el soporte elegido.
    <Dialog
      open={abierto}
      onOpenChange={cambiarAbierto}
      disablePointerDismissal
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
      >
        <form
          onSubmit={enviar}
          noValidate
          aria-busy={ocupado || undefined}
          className="flex flex-col gap-5"
        >
          <DialogHeader className="flex-row items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
              <Inbox className="size-5" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle>
                Responder la solicitud {textoRadicado(solicitud.numero)}
              </DialogTitle>
              <DialogDescription>
                El titular recibe la decisión y la respuesta en AMO. Queda en la
                bitácora.
              </DialogDescription>
            </div>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Cerrar"
                  className="ml-auto shrink-0"
                  disabled={ocupado}
                />
              }
            >
              <X aria-hidden />
            </DialogClose>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <p id={ids.decision} className="text-sm font-medium">
              Decisión
            </p>
            <RadioGroup
              ref={grupoDecision}
              value={decision ?? ""}
              onValueChange={(valor) => {
                setDecision(valor as DecisionSolicitud)
                sinError("decision")
              }}
              disabled={ocupado}
              aria-labelledby={ids.decision}
              aria-invalid={errores.decision ? true : undefined}
              aria-describedby={
                errores.decision ? `${ids.decision}-error` : undefined
              }
              className="gap-2"
            >
              {ORDEN_DECISIONES.map((opcion) => {
                const idOpcion = `${id}-${opcion}`
                return (
                  <label key={opcion} className={TARJETA_OPCION}>
                    <RadioGroupItem
                      value={opcion}
                      aria-labelledby={`${idOpcion}-titulo`}
                      aria-describedby={`${idOpcion}-ayuda`}
                      className="mt-0.5"
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span
                        id={`${idOpcion}-titulo`}
                        className="text-sm font-medium"
                      >
                        {DECISIONES[opcion].etiqueta}
                      </span>
                      <span
                        id={`${idOpcion}-ayuda`}
                        className="text-xs text-pretty text-muted-foreground"
                      >
                        {DECISIONES[opcion].ayuda}
                      </span>
                    </span>
                  </label>
                )
              })}
            </RadioGroup>
            {errores.decision ? (
              <p
                id={`${ids.decision}-error`}
                role="alert"
                className="text-sm text-destructive"
              >
                {errores.decision}
              </p>
            ) : null}
            {admiteSupresion(solicitud.tipo) && decision !== "NO_PROCEDE" ? (
              <p className="flex items-start gap-2 rounded-lg border border-warning/45 bg-warning/10 px-3 py-2.5 text-sm text-pretty">
                <CircleAlert
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-warning"
                />
                Responder no borra nada: después ejecuta la supresión desde el
                panel «Supresión de datos», que vuelve a revisar los bloqueos.
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={ids.respuesta}>Respuesta al titular</Label>
            <Textarea
              ref={campoRespuesta}
              id={ids.respuesta}
              value={respuesta}
              maxLength={LIMITES_RESPUESTA.maximo}
              rows={6}
              required
              disabled={ocupado}
              placeholder="Ej.: Atendimos tu solicitud: corregimos tu celular y…"
              onChange={(evento) => {
                setRespuesta(evento.target.value)
                sinError("respuesta")
              }}
              aria-invalid={errores.respuesta ? true : undefined}
              aria-describedby={cn(
                errores.respuesta && `${ids.respuesta}-error`,
                ids.ayudaRespuesta,
                ids.contador
              )}
            />
            <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
              <p id={ids.ayudaRespuesta} className="text-pretty">
                Explica qué hiciste y, si no procede del todo, el motivo legal o
                contractual.
              </p>
              <p id={ids.contador} className="shrink-0 cifras">
                {respuesta.length.toLocaleString("es-CO")}/
                {LIMITES_RESPUESTA.maximo.toLocaleString("es-CO")}
              </p>
            </div>
            {errores.respuesta ? (
              <p
                id={`${ids.respuesta}-error`}
                role="alert"
                className="text-sm text-destructive"
              >
                {errores.respuesta}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <p id={ids.soporte} className="text-sm font-medium">
              Soporte (opcional)
            </p>
            {archivo ? (
              <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-background/70 px-3 py-2 text-sm">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  <FileText aria-hidden className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium" title={archivo.name}>
                    {archivo.name}
                  </span>
                  <span className="text-xs cifras text-muted-foreground">
                    {formatearTamano(archivo.size)}
                    {subido?.archivo === archivo ? " · Cargado" : ""}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={ocupado}
                  onClick={() => {
                    setArchivo(null)
                    subida.reiniciar()
                    requestAnimationFrame(() =>
                      zonaSoporte.current
                        ?.querySelector<HTMLElement>("button")
                        ?.focus()
                    )
                  }}
                >
                  <RefreshCw data-icon="inline-start" aria-hidden />
                  Quitar{" "}
                  <span className="sr-only">el soporte {archivo.name}</span>
                </Button>
              </div>
            ) : (
              <div ref={zonaSoporte}>
                <ZonaArchivos
                  reglas={LIMITES_SOPORTE}
                  compacta
                  titulo="Constancia de la respuesta"
                  descripcion={`Un PDF de hasta ${formatearTamano(LIMITES_SOPORTE.maxBytes)} (p. ej. la carta firmada). El titular lo puede descargar.`}
                  onArchivos={([elegido]) => {
                    if (elegido) {
                      setArchivo(elegido)
                      sinError("soporte")
                    }
                  }}
                  deshabilitada={ocupado}
                  invalida={Boolean(errores.soporte)}
                  describidaPor={
                    errores.soporte
                      ? `${ids.soporte} ${ids.soporte}-error`
                      : ids.soporte
                  }
                />
              </div>
            )}
            {elemento ? (
              <ListaSubidas
                elementos={[elemento]}
                etiqueta="Subida del soporte"
                onCancelar={() => subida.cancelar()}
              />
            ) : null}
            {errores.soporte ? (
              <p
                id={`${ids.soporte}-error`}
                role="alert"
                className="text-sm text-destructive"
              >
                {errores.soporte}
              </p>
            ) : null}
          </div>

          {errorGeneral ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/8 px-3 py-2.5 text-sm text-pretty text-destructive"
            >
              {errorGeneral}
            </p>
          ) : null}
          <p aria-live="polite" className="sr-only">
            {estadoEnvio}
          </p>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={ocupado} />
              }
            >
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={ocupado}>
              {ocupado ? (
                <Spinner
                  role={undefined}
                  aria-hidden
                  data-icon="inline-start"
                />
              ) : null}
              Responder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
