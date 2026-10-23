"use client"

import { FileText, ImageIcon, Lock, Paperclip, Send, X } from "lucide-react"
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import { useCargaCaptura } from "@/components/archivos/use-carga-captura"
import { ZonaArchivos } from "@/components/archivos/zona-archivos"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { formatearTamano } from "@/lib/archivos/formato"
import { categoriaDe, mimeDeArchivo } from "@/lib/archivos/mime"
import { cn } from "@/lib/utils"

import {
  confirmarAdjuntoDisputa,
  enviarMensajeDisputa,
  prepararAdjuntoDisputa,
} from "../actions"
import { REGLAS_ADJUNTO, REGLAS_SELECCION_ADJUNTO } from "../adjuntos"
import { avisoVisibilidad } from "../presentacion"
import { esquemaMensajeDisputa, LONGITUD_MAXIMA_MENSAJE } from "../schemas"
import type { Perspectiva } from "../tipos"

export interface CajaRespuestaProps {
  disputaId: string
  perspectiva: Perspectiva
  /** El equipo que resuelve puede dejar notas internas. */
  puedeNotaInterna?: boolean
  /** Disputa cerrada: el equipo solo deja notas internas. */
  soloNotas?: boolean
}

/** Control que recibe el foco cuando cambia el adjunto. */
type DestinoFoco = "quitar" | "adjuntar"

/**
 * Caja para escribir en el hilo: mensaje (hasta 4.000 caracteres), un
 * adjunto opcional (imagen o PDF; las fotos se reducen en el dispositivo y
 * se suben en cuanto se eligen) y, para el equipo, la marca de nota interna.
 * Dice siempre quién verá lo que se escribe. Tras enviar, la caja se vacía,
 * el foco sigue en el mensaje y una región viva lo anuncia; la página se
 * refresca con el mensaje nuevo (`refresh()` en la acción).
 */
export function CajaRespuesta({
  disputaId,
  perspectiva,
  puedeNotaInterna = false,
  soloNotas = false,
}: CajaRespuestaProps) {
  const [texto, setTexto] = useState("")
  const [notaMarcada, setNotaMarcada] = useState(false)
  const interno = soloNotas || (puedeNotaInterna && notaMarcada)
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null)
  const [errorAdjunto, setErrorAdjunto] = useState<string | null>(null)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [anuncio, setAnuncio] = useState("")
  const [zonaVisible, setZonaVisible] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const campo = useRef<HTMLTextAreaElement>(null)
  const botonAdjuntar = useRef<HTMLButtonElement>(null)
  const botonQuitar = useRef<HTMLButtonElement>(null)
  const destinoFoco = useRef<DestinoFoco | null>(null)
  /** Tras enviar, el foco vuelve al mensaje (cuando deja de estar deshabilitado). */
  const enfocarMensaje = useRef(false)
  const id = useId()
  const idCampo = `${id}-mensaje`
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  const idErrorAdjunto = `${id}-error-adjunto`
  const idNota = `${id}-nota`

  const carga = useCargaCaptura({
    preparar: (descripcion) =>
      prepararAdjuntoDisputa({ disputaId, interno, descripcion }),
    confirmar: (adjunto) =>
      confirmarAdjuntoDisputa({ disputaId, interno, adjunto }),
    reglas: REGLAS_ADJUNTO,
    miniatura: false,
  })
  const { elegida } = carga

  // Elegir o quitar el adjunto desmonta el control que se acaba de usar: el
  // foco pasa a «Quitar» o a «Adjuntar», que siguen en pantalla.
  useEffect(() => {
    const destino = destinoFoco.current
    if (!destino) return
    destinoFoco.current = null
    const control =
      destino === "quitar" ? botonQuitar.current : botonAdjuntar.current
    control?.focus()
  }, [elegida, zonaVisible])

  useEffect(() => {
    if (pendiente || !enfocarMensaje.current) return
    enfocarMensaje.current = false
    campo.current?.focus()
  }, [pendiente])

  function elegirAdjunto(archivo: File) {
    destinoFoco.current = "quitar"
    setErrorAdjunto(null)
    setZonaVisible(false)
    carga.elegir(archivo)
  }

  function quitarAdjunto() {
    destinoFoco.current = "adjuntar"
    setErrorAdjunto(null)
    carga.descartar()
  }

  function alternarZona() {
    if (zonaVisible) destinoFoco.current = "adjuntar"
    setZonaVisible((visible) => !visible)
  }

  function enviar(evento?: FormEvent) {
    evento?.preventDefault()
    if (pendiente) return
    setErrorGeneral(null)
    setAnuncio("")
    const validacion = esquemaMensajeDisputa.safeParse({
      disputaId,
      mensaje: texto,
      interno,
    })
    if (!validacion.success) {
      const problema = validacion.error.issues.find(
        (issue) => issue.path[0] === "mensaje"
      )
      const vacio = texto.trim().length === 0
      setErrorMensaje(
        vacio && elegida
          ? "Escribe qué muestra el adjunto."
          : (problema?.message ?? "Escribe el mensaje.")
      )
      campo.current?.focus()
      return
    }
    setErrorMensaje(null)
    iniciar(async () => {
      let adjuntoPath: string | null = null
      if (elegida) {
        const lista = await carga.obtener()
        if (!lista?.ok) {
          setErrorAdjunto(
            lista?.error ??
              "El adjunto no terminó de subir. Inténtalo de nuevo."
          )
          enfocarMensaje.current = true
          return
        }
        adjuntoPath = lista.captura.ruta
      }
      const resultado = await enviarMensajeDisputa({
        disputaId,
        mensaje: texto,
        adjuntoPath,
        interno,
      })
      if (!resultado.ok) {
        const deMensaje = resultado.erroresCampo?.mensaje?.[0]
        const deAdjunto = resultado.erroresCampo?.adjunto?.[0]
        if (deMensaje) setErrorMensaje(deMensaje)
        else if (deAdjunto) setErrorAdjunto(deAdjunto)
        else setErrorGeneral(resultado.error)
        // El botón se deshabilitó mientras se enviaba: el foco vuelve al mensaje.
        enfocarMensaje.current = true
        return
      }
      // La marca de nota interna se conserva: un mensaje que debía quedarse en
      // el equipo nunca sale a las partes por haberla perdido.
      setTexto("")
      carga.descartar()
      setAnuncio(interno ? "Nota interna guardada." : "Mensaje enviado.")
      enfocarMensaje.current = true
    })
  }

  function alPresionar(evento: KeyboardEvent<HTMLTextAreaElement>) {
    if (evento.key === "Enter" && (evento.metaKey || evento.ctrlKey)) {
      evento.preventDefault()
      enviar()
    }
  }

  const describe = [idAyuda, errorMensaje ? idError : null]
    .filter(Boolean)
    .join(" ")
  const imagen = elegida
    ? categoriaDe(mimeDeArchivo(elegida)) === "imagen"
    : false

  return (
    <form
      onSubmit={enviar}
      noValidate
      aria-label={interno ? "Nueva nota interna" : "Responder en la disputa"}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-3 transition-colors sm:p-4",
        interno ? "border-dashed border-warning/60 bg-warning/6" : "bg-card"
      )}
    >
      <div className="grid gap-2">
        <Label htmlFor={idCampo}>{interno ? "Nota interna" : "Mensaje"}</Label>
        <Textarea
          ref={campo}
          id={idCampo}
          value={texto}
          onChange={(evento) => {
            setTexto(evento.target.value)
            if (errorMensaje) setErrorMensaje(null)
            if (anuncio) setAnuncio("")
          }}
          onKeyDown={alPresionar}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          maxLength={LONGITUD_MAXIMA_MENSAJE}
          rows={3}
          disabled={pendiente}
          aria-invalid={errorMensaje ? true : undefined}
          aria-describedby={describe}
          placeholder={
            interno
              ? "Lo que revisaste o decidiste, para el resto del equipo…"
              : "Cuenta lo que pasó o responde a la otra parte…"
          }
          className="min-h-24 text-[0.9375rem] md:text-sm"
        />
        <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
          <p id={idAyuda} className="flex items-start gap-1.5 text-pretty">
            {interno ? (
              <Lock aria-hidden className="mt-px size-3.5 shrink-0" />
            ) : null}
            {avisoVisibilidad(perspectiva, interno)}
          </p>
          <span className="shrink-0 cifras" aria-hidden>
            {texto.length.toLocaleString("es-CO")}/
            {LONGITUD_MAXIMA_MENSAJE.toLocaleString("es-CO")}
          </span>
        </div>
        {errorMensaje ? (
          <p id={idError} role="alert" className="text-sm text-destructive">
            {errorMensaje}
          </p>
        ) : null}
      </div>

      {elegida ? (
        <div className="flex flex-col gap-2">
          <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-background/70 px-3 py-2 text-sm">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              {imagen ? (
                <ImageIcon aria-hidden className="size-4" />
              ) : (
                <FileText aria-hidden className="size-4" />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium" title={elegida.name}>
                {elegida.name}
              </span>
              <span className="text-xs cifras text-muted-foreground">
                {formatearTamano(elegida.size)}
                {carga.lista ? " · Listo para enviar" : ""}
              </span>
            </span>
            <Button
              ref={botonQuitar}
              type="button"
              variant="ghost"
              size="sm"
              onClick={quitarAdjunto}
              disabled={pendiente}
            >
              <X data-icon="inline-start" aria-hidden />
              Quitar
              <span className="sr-only"> el adjunto {elegida.name}</span>
            </Button>
          </div>
          {carga.elemento ? (
            <ListaSubidas
              elementos={[carga.elemento]}
              etiqueta="Envío del adjunto"
              onReintentar={() => carga.reintentar()}
              onCancelar={() => carga.subida.cancelar()}
              onQuitar={quitarAdjunto}
            />
          ) : null}
        </div>
      ) : zonaVisible ? (
        <ZonaArchivos
          reglas={REGLAS_SELECCION_ADJUNTO}
          capture="environment"
          compacta
          titulo="Adjunta una imagen o un PDF"
          descripcion="Capturas, fotos o documentos de hasta 10 MB. Las fotos se reducen antes de subirlas."
          onArchivos={([archivo]) => {
            if (archivo) elegirAdjunto(archivo)
          }}
          deshabilitada={pendiente}
          invalida={Boolean(errorAdjunto)}
          describidaPor={errorAdjunto ? idErrorAdjunto : undefined}
        />
      ) : null}
      {errorAdjunto ? (
        <p
          id={idErrorAdjunto}
          role="alert"
          className="text-sm text-destructive"
        >
          {errorAdjunto}
        </p>
      ) : null}

      {puedeNotaInterna && !soloNotas ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-2.5">
            <Checkbox
              id={idNota}
              checked={notaMarcada}
              onCheckedChange={(valor) => setNotaMarcada(valor === true)}
              disabled={pendiente || elegida !== null}
              aria-describedby={elegida ? `${idNota}-ayuda` : undefined}
              className="mt-0.5"
            />
            <Label htmlFor={idNota} className="text-sm leading-snug">
              Nota interna: solo la ve el equipo AMO
            </Label>
          </div>
          {elegida ? (
            <p
              id={`${idNota}-ayuda`}
              className="pl-6.5 text-xs text-muted-foreground"
            >
              Quita el adjunto para cambiar a quién va dirigido.
            </p>
          ) : null}
        </div>
      ) : null}

      {errorGeneral ? (
        <p role="alert" className="text-sm text-destructive">
          {errorGeneral}
        </p>
      ) : null}

      <div
        className={cn(
          "flex flex-col-reverse gap-2 sm:flex-row sm:items-center",
          elegida ? "sm:justify-end" : "sm:justify-between"
        )}
      >
        {elegida ? null : (
          <Button
            ref={botonAdjuntar}
            type="button"
            variant="ghost"
            size="sm"
            onClick={alternarZona}
            aria-expanded={zonaVisible}
            disabled={pendiente}
            className="w-full sm:w-auto"
          >
            <Paperclip data-icon="inline-start" aria-hidden />
            {zonaVisible ? "No adjuntar" : "Adjuntar imagen o PDF"}
          </Button>
        )}
        <Button type="submit" disabled={pendiente} className="w-full sm:w-auto">
          {pendiente ? (
            <Spinner aria-label="Enviando" data-icon="inline-start" />
          ) : (
            <Send data-icon="inline-start" aria-hidden />
          )}
          {interno ? "Guardar nota" : "Enviar"}
        </Button>
      </div>
      <p role="status" className="text-xs text-success empty:hidden">
        {anuncio}
      </p>
    </form>
  )
}
