"use client"

import {
  FileText,
  ImageIcon,
  Info,
  Paperclip,
  Scale,
  Send,
  X,
} from "lucide-react"
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
import { PieAcciones } from "@/components/layout/pie-acciones"
import { CuentaRegresiva } from "@/components/tiempo/cuenta-regresiva"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  abrirDisputa,
  confirmarAdjuntoDisputa,
  enviarMensajeDisputa,
  prepararAdjuntoDisputa,
} from "@/features/disputas/actions"
import {
  REGLAS_ADJUNTO,
  REGLAS_SELECCION_ADJUNTO,
} from "@/features/disputas/adjuntos"
import { avisoVisibilidad } from "@/features/disputas/presentacion"
import {
  type EntradaAbrirDisputa,
  esquemaAbrirDisputa,
  LONGITUD_MAXIMA_DESCRIPCION,
} from "@/features/disputas/schemas"
import type { MotivoDisputa } from "@/features/disputas/tipos"
import { COMPRESION_CAPTURA } from "@/lib/archivos/compresion"
import { formatearTamano } from "@/lib/archivos/formato"
import { categoriaDe, mimeDeArchivo } from "@/lib/archivos/mime"
import { formatearFechaHora, formatearNumero } from "@/lib/format"
import { EJEMPLOS_URL_POST } from "@/lib/redes/url-post"
import { desdeErrorZod } from "@/lib/result"
import { cn } from "@/lib/utils"

import {
  type AperturaDisputa,
  descripcionAlCambiar,
  efectoApertura,
  mensajePruebas,
  motivoInicial,
  opcionesMotivo,
  validarEnlacePublicacion,
} from "../../disputa"

type Campo = "motivo" | "descripcion" | "enlace"

/** En qué va el envío: abrir la disputa y, si hay pruebas, subirlas y mandarlas. */
type Fase = "editando" | "abriendo" | "adjuntando" | "pruebas"

/** Control que recibe el foco cuando cambia el adjunto. */
type DestinoFoco = "quitar" | "adjuntar"

export interface DisputaAbierta {
  disputaId: string
}

export interface FormularioDisputaProps {
  apertura: AperturaDisputa
  /** `Date.now()` del servidor al pintar (cuenta regresiva del reclamo). */
  ahoraServidor: number
  /**
   * Empieza el envío (antes de llamar a la acción): quien lo monta debe
   * mantenerlo montado aunque la página se refresque con la disputa abierta.
   */
  onEnviando?: () => void
  /** No se pudo abrir (el error ya está en el formulario, que sigue igual). */
  onFallido?: () => void
  /** La disputa ya existe (la página se refresca con ella en segundo plano). */
  onAbierta: (abierta: DisputaAbierta) => void
  /**
   * Terminó el envío de las pruebas del primer mensaje. `aviso`: lo que no se
   * pudo mandar (la disputa ya quedó abierta), para decirlo junto al hilo.
   */
  onTerminado: (aviso: string | null) => void
}

const TEXTOS = {
  reclamo: {
    titulo: "Cuéntanos qué pasó",
    intro:
      "Si publicaste dentro del plazo y la evidencia no quedó registrada, ábrelo aquí. El equipo AMO revisará tu caso.",
    leyendaMotivo: "¿Qué pasó?",
    descripcion: "Descríbelo",
    adjunto: "Captura de tu publicación (opcional)",
    enviar: "Enviar reclamo",
    abriendo: "Abriendo tu reclamo…",
    sujeto: "tu reclamo",
  },
  problema: {
    titulo: "¿Qué está mal?",
    intro: "",
    leyendaMotivo: "Motivo",
    descripcion: "Qué pasó",
    adjunto: "Una prueba (opcional)",
    enviar: "Reportar el problema",
    abriendo: "Enviando tu reporte…",
    sujeto: "tu reporte",
  },
} as const

const INTRO_PROBLEMA = {
  medio:
    "Cuéntanos qué no está bien con esta campaña. El equipo AMO revisará el caso con el anunciante.",
  anunciante:
    "Cuéntanos qué no está bien con esta publicación. El equipo AMO revisará el caso con el medio.",
} as const

/**
 * Abrir una disputa desde la página de la asignación (ADM-011), para el medio
 * y el anunciante. El reclamo de una vencida («Reclamar: sí publiqué», MED-011
 * c2) llega con «Otro» elegido y la descripción precargada, la cuenta
 * regresiva del plazo y, opcionales, el enlace y la captura de la
 * publicación; reportar un problema ofrece los motivos de su parte y una
 * prueba opcional. Siempre dice qué pasa mientras dure y quién lo verá. El
 * mismo esquema que la acción valida aquí; un error queda junto a su campo.
 *
 * Las pruebas van en el primer mensaje del hilo: el adjunto necesita la
 * carpeta de la disputa, así que se sube tras abrirla (`prepararAdjuntoDisputa`
 * y `confirmarAdjuntoDisputa`) y se envía con `enviarMensajeDisputa`.
 */
export function FormularioDisputa({
  apertura,
  ahoraServidor,
  onEnviando,
  onFallido,
  onAbierta,
  onTerminado,
}: FormularioDisputaProps) {
  const { perspectiva, modo } = apertura
  const opciones = opcionesMotivo(perspectiva, modo, apertura.motivos)
  const textos = TEXTOS[modo]
  const [motivo, setMotivo] = useState<MotivoDisputa | null>(() =>
    motivoInicial(modo, apertura.motivos)
  )
  const [descripcion, setDescripcion] = useState(
    () => opciones.find((opcion) => opcion.motivo === motivo)?.sugerencia ?? ""
  )
  const [enlace, setEnlace] = useState("")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [zonaVisible, setZonaVisible] = useState(false)
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [fase, setFase] = useState<Fase>("editando")
  const [pendiente, iniciar] = useTransition()
  const enviando = pendiente || fase !== "editando"

  const grupoMotivos = useRef<HTMLDivElement>(null)
  const campoDescripcion = useRef<HTMLTextAreaElement>(null)
  const campoEnlace = useRef<HTMLInputElement>(null)
  const botonAdjuntar = useRef<HTMLButtonElement>(null)
  const botonQuitar = useRef<HTMLButtonElement>(null)
  const destinoFoco = useRef<DestinoFoco | null>(null)
  /** Campo con error que recibe el foco cuando vuelve a estar habilitado. */
  const campoConError = useRef<Campo | null>(null)
  /** La carpeta del adjunto: existe solo después de abrir la disputa. */
  const disputaId = useRef<string | null>(null)

  const id = useId()
  const ids = {
    motivo: `${id}-motivo`,
    errorMotivo: `${id}-error-motivo`,
    descripcion: `${id}-descripcion`,
    ayudaDescripcion: `${id}-ayuda-descripcion`,
    errorDescripcion: `${id}-error-descripcion`,
    enlace: `${id}-enlace`,
    ayudaEnlace: `${id}-ayuda-enlace`,
    errorEnlace: `${id}-error-enlace`,
    adjunto: `${id}-adjunto`,
    opcion: `${id}-opcion`,
  }

  const subida = useSubida<unknown>({
    preparar: (descripcionArchivo) =>
      prepararAdjuntoDisputa({
        disputaId: disputaId.current ?? "",
        descripcion: descripcionArchivo,
      }),
    confirmar: (adjunto) =>
      confirmarAdjuntoDisputa({
        disputaId: disputaId.current ?? "",
        adjunto,
      }),
    reglas: REGLAS_ADJUNTO,
    comprimir: COMPRESION_CAPTURA,
    miniatura: false,
  })

  // Elegir o quitar el adjunto desmonta el control que se acaba de usar: el
  // foco pasa a «Quitar» o a «Adjuntar», que siguen en pantalla.
  useEffect(() => {
    const destino = destinoFoco.current
    if (!destino) return
    destinoFoco.current = null
    const control =
      destino === "quitar" ? botonQuitar.current : botonAdjuntar.current
    control?.focus()
  }, [archivo, zonaVisible])

  function cambiarMotivo(valor: unknown) {
    const nueva = opciones.find((opcion) => opcion.motivo === valor)
    if (!nueva) return
    const anterior = opciones.find((opcion) => opcion.motivo === motivo) ?? null
    setMotivo(nueva.motivo)
    setDescripcion((actual) => descripcionAlCambiar(actual, anterior, nueva))
    setErrores(({ motivo: _, ...resto }) => resto)
  }

  function elegirArchivo(elegido: File) {
    destinoFoco.current = "quitar"
    setZonaVisible(false)
    setArchivo(elegido)
  }

  function quitarArchivo() {
    destinoFoco.current = "adjuntar"
    setArchivo(null)
  }

  function alternarZona() {
    if (zonaVisible) destinoFoco.current = "adjuntar"
    setZonaVisible((visible) => !visible)
  }

  // El foco va al primer campo con error en cuanto se puede enfocar (tras un
  // error de la acción, los campos siguen deshabilitados hasta terminar).
  useEffect(() => {
    const campo = campoConError.current
    if (!campo || enviando) return
    campoConError.current = null
    if (campo === "motivo") {
      grupoMotivos.current
        ?.querySelector<HTMLElement>('[role="radio"]')
        ?.focus()
    } else if (campo === "descripcion") {
      campoDescripcion.current?.focus()
    } else {
      campoEnlace.current?.focus()
    }
  }, [errores, enviando])

  /** Muestra los errores y lleva el foco al primero; `true` si había alguno. */
  function mostrarErrores(porCampo: Partial<Record<Campo, string>>): boolean {
    setErrores(porCampo)
    const primero =
      (["motivo", "descripcion", "enlace"] as const).find(
        (campo) => porCampo[campo]
      ) ?? null
    campoConError.current = primero
    return primero !== null
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (enviando) return
    setErrorGeneral(null)
    const entrada: EntradaAbrirDisputa = {
      asignacionId: apertura.asignacionId,
      // Sin elegir, el esquema responde «Elige el motivo».
      motivo: motivo as MotivoDisputa,
      descripcion,
    }
    const validacion = esquemaAbrirDisputa.safeParse(entrada)
    const enlaceValidado =
      modo === "reclamo"
        ? validarEnlacePublicacion(apertura.plataforma, enlace, apertura.handle)
        : ({ ok: true, url: null } as const)
    const porCampo: Partial<Record<Campo, string>> = validacion.success
      ? {}
      : {
          motivo: desdeErrorZod(validacion.error).erroresCampo?.motivo?.[0],
          descripcion: desdeErrorZod(validacion.error).erroresCampo
            ?.descripcion?.[0],
        }
    if (!enlaceValidado.ok) porCampo.enlace = enlaceValidado.mensaje
    if (mostrarErrores(porCampo)) return

    const elegido = archivo
    const url = enlaceValidado.ok ? enlaceValidado.url : null
    // Antes de la acción: su respuesta puede refrescar la página con la
    // disputa abierta antes de que este envío termine.
    onEnviando?.()
    setFase("abriendo")
    iniciar(async () => {
      const resultado = await abrirDisputa(entrada)
      if (!resultado.ok) {
        setFase("editando")
        const deCampo = mostrarErrores({
          motivo: resultado.erroresCampo?.motivo?.[0],
          descripcion: resultado.erroresCampo?.descripcion?.[0],
        })
        if (!deCampo) setErrorGeneral(resultado.error)
        onFallido?.()
        return
      }
      disputaId.current = resultado.datos.disputaId
      onAbierta({ disputaId: resultado.datos.disputaId })
      onTerminado(await enviarPruebas(resultado.datos.disputaId, url, elegido))
    })
  }

  /**
   * El primer mensaje con el enlace y el adjunto. La disputa ya está abierta:
   * lo que falle aquí se cuenta junto al hilo, donde se puede volver a enviar.
   */
  async function enviarPruebas(
    id: string,
    url: string | null,
    elegido: File | null
  ): Promise<string | null> {
    let adjuntoPath: string | null = null
    let aviso: string | null = null
    if (elegido) {
      setFase("adjuntando")
      const subido = await subida.subir(elegido)
      if (subido.ok) {
        adjuntoPath = subido.archivo.ruta
      } else {
        aviso = `No pudimos subir ${modo === "reclamo" ? "la captura" : "el adjunto"} (${subido.error.replace(/\.$/, "")}). Adjúntalo desde la conversación.`
      }
    }
    const mensaje = mensajePruebas({
      modo,
      enlace: url,
      conAdjunto: adjuntoPath !== null,
    })
    if (!mensaje) return aviso
    setFase("pruebas")
    const enviado = await enviarMensajeDisputa({
      disputaId: id,
      mensaje,
      adjuntoPath,
    })
    return enviado.ok
      ? aviso
      : `No pudimos enviar tus pruebas (${enviado.error.replace(/\.$/, "")}). Envíalas desde la conversación.`
  }

  const imagen = archivo
    ? categoriaDe(mimeDeArchivo(archivo)) === "imagen"
    : false
  const elemento: ElementoSubida | null =
    archivo && fase === "adjuntando"
      ? {
          id: "adjunto",
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
    fase === "abriendo"
      ? textos.abriendo
      : fase === "adjuntando"
        ? `Subiendo ${modo === "reclamo" ? "la captura" : "el adjunto"}…`
        : fase === "pruebas"
          ? "Enviando tus pruebas…"
          : ""
  const ayudaDescripcion =
    perspectiva === "medio"
      ? avisoVisibilidad("medio")
      : "No incluyas datos personales ni bancarios."
  const opcionElegida = opciones.find((opcion) => opcion.motivo === motivo)

  return (
    <form
      onSubmit={enviar}
      noValidate
      aria-labelledby={`${id}-titulo`}
      aria-busy={enviando || undefined}
      className="flex flex-col gap-4"
    >
      <section className="flex flex-col gap-5 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          <h2
            id={`${id}-titulo`}
            className="text-base font-semibold text-balance"
          >
            {textos.titulo}
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            {modo === "reclamo" ? textos.intro : INTRO_PROBLEMA[perspectiva]}
          </p>
          {modo === "reclamo" && apertura.reclamoHasta ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <CuentaRegresiva
                venceAt={apertura.reclamoHasta}
                ahoraServidor={ahoraServidor}
                etiqueta="Plazo para reclamar"
                textos={{ pendiente: "Reclama en", vencido: "Cerró hace" }}
              />
              <span className="text-muted-foreground">
                Tienes hasta el {formatearFechaHora(apertura.reclamoHasta)}.
              </span>
            </p>
          ) : null}
        </div>

        <div className="flex gap-2.5 rounded-xl border border-info/35 bg-info/6 px-3.5 py-3 text-sm text-pretty">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
          <p>
            {efectoApertura({
              perspectiva,
              modo,
              estadoAsignacion: apertura.estadoAsignacion,
              plazoRecargaHoras: apertura.plazoRecargaHoras,
            })}
          </p>
        </div>

        <div className="grid gap-2">
          <p id={ids.motivo} className="text-sm font-medium">
            {textos.leyendaMotivo}
          </p>
          <RadioGroup
            ref={grupoMotivos}
            value={motivo ?? ""}
            onValueChange={cambiarMotivo}
            disabled={enviando}
            aria-labelledby={ids.motivo}
            aria-invalid={errores.motivo ? true : undefined}
            aria-describedby={errores.motivo ? ids.errorMotivo : undefined}
            className={cn(
              "gap-2",
              opciones.length > 2 ? "sm:grid-cols-2" : "sm:grid-cols-1"
            )}
          >
            {opciones.map((opcion) => (
              <label
                key={opcion.motivo}
                className="flex cursor-pointer gap-3 rounded-xl border bg-background/60 p-3 transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-primary/6 has-data-disabled:cursor-not-allowed has-data-disabled:opacity-70 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/20"
              >
                <RadioGroupItem
                  value={opcion.motivo}
                  className="mt-0.5"
                  aria-labelledby={`${ids.opcion}-${opcion.motivo}`}
                  aria-describedby={`${ids.opcion}-${opcion.motivo}-ayuda`}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    id={`${ids.opcion}-${opcion.motivo}`}
                    className="text-sm font-medium"
                  >
                    {opcion.etiqueta}
                  </span>
                  <span
                    id={`${ids.opcion}-${opcion.motivo}-ayuda`}
                    className="text-xs text-pretty text-muted-foreground"
                  >
                    {opcion.ayuda}
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
          <Label htmlFor={ids.descripcion}>{textos.descripcion}</Label>
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
            disabled={enviando}
            placeholder={opcionElegida?.ejemplo ?? "Cuenta qué pasó y cuándo."}
            aria-invalid={errores.descripcion ? true : undefined}
            aria-describedby={
              errores.descripcion
                ? `${ids.errorDescripcion} ${ids.ayudaDescripcion}`
                : ids.ayudaDescripcion
            }
            className="min-h-28 text-[0.9375rem] md:text-sm"
          />
          <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
            <p id={ids.ayudaDescripcion} className="text-pretty">
              {ayudaDescripcion}
            </p>
            <span className="shrink-0 cifras" aria-hidden>
              {formatearNumero(descripcion.length)}/
              {formatearNumero(LONGITUD_MAXIMA_DESCRIPCION)}
            </span>
          </div>
          {errores.descripcion ? (
            <p
              id={ids.errorDescripcion}
              role="alert"
              className="text-sm text-destructive"
            >
              {errores.descripcion}
            </p>
          ) : null}
        </div>

        {modo === "reclamo" ? (
          <div className="grid gap-2">
            <Label htmlFor={ids.enlace}>
              Enlace de tu publicación (opcional)
            </Label>
            <Input
              ref={campoEnlace}
              id={ids.enlace}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={enlace}
              onChange={(evento) => {
                setEnlace(evento.target.value)
                if (errores.enlace) {
                  setErrores(({ enlace: _, ...resto }) => resto)
                }
              }}
              disabled={enviando}
              placeholder={EJEMPLOS_URL_POST[apertura.plataforma]}
              aria-invalid={errores.enlace ? true : undefined}
              aria-describedby={
                errores.enlace
                  ? `${ids.errorEnlace} ${ids.ayudaEnlace}`
                  : ids.ayudaEnlace
              }
            />
            <p
              id={ids.ayudaEnlace}
              className="text-xs text-pretty text-muted-foreground"
            >
              El enlace del post
              {apertura.handle ? ` de @${apertura.handle}` : ""}, no el de tu
              perfil: ayuda al equipo AMO a comprobar que publicaste a tiempo.
            </p>
            {errores.enlace ? (
              <p
                id={ids.errorEnlace}
                role="alert"
                className="text-sm break-words text-destructive"
              >
                {errores.enlace}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <p id={ids.adjunto} className="text-sm font-medium">
            {textos.adjunto}
          </p>
          {archivo ? (
            <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-background/70 px-3 py-2 text-sm">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                {imagen ? (
                  <ImageIcon aria-hidden className="size-4" />
                ) : (
                  <FileText aria-hidden className="size-4" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium" title={archivo.name}>
                  {archivo.name}
                </span>
                <span className="text-xs cifras text-muted-foreground">
                  {formatearTamano(archivo.size)} · Se envía con {textos.sujeto}
                </span>
              </span>
              <Button
                ref={botonQuitar}
                type="button"
                variant="ghost"
                size="sm"
                onClick={quitarArchivo}
                disabled={enviando}
              >
                <X data-icon="inline-start" aria-hidden />
                Quitar{" "}
                <span className="sr-only">el adjunto {archivo.name}</span>
              </Button>
            </div>
          ) : zonaVisible ? (
            <ZonaArchivos
              reglas={REGLAS_SELECCION_ADJUNTO}
              capture="environment"
              compacta
              titulo={
                modo === "reclamo"
                  ? "Adjunta una captura de tu publicación"
                  : "Adjunta una imagen o un PDF"
              }
              descripcion="Imágenes o PDF de hasta 10 MB. Las fotos se reducen antes de subirlas."
              onArchivos={([elegido]) => {
                if (elegido) elegirArchivo(elegido)
              }}
              deshabilitada={enviando}
              describidaPor={ids.adjunto}
            />
          ) : null}
          {archivo ? null : (
            <Button
              ref={botonAdjuntar}
              type="button"
              variant="outline"
              size="sm"
              onClick={alternarZona}
              aria-expanded={zonaVisible}
              disabled={enviando}
              className="w-full sm:w-fit"
            >
              <Paperclip data-icon="inline-start" aria-hidden />
              {zonaVisible ? "No adjuntar" : "Adjuntar imagen o PDF"}
            </Button>
          )}
          {elemento ? (
            <ListaSubidas
              elementos={[elemento]}
              etiqueta="Envío del adjunto"
              onCancelar={() => subida.cancelar()}
            />
          ) : null}
        </div>

        {errorGeneral ? (
          <p role="alert" className="text-sm text-pretty text-destructive">
            {errorGeneral}
          </p>
        ) : null}
        <p role="status" className="text-sm text-muted-foreground empty:hidden">
          {estadoEnvio}
        </p>
      </section>

      <PieAcciones etiqueta={textos.enviar}>
        <Button type="submit" size="lg" disabled={enviando}>
          {enviando ? (
            <Spinner aria-label="Enviando" data-icon="inline-start" />
          ) : modo === "reclamo" ? (
            <Scale data-icon="inline-start" aria-hidden />
          ) : (
            <Send data-icon="inline-start" aria-hidden />
          )}
          {textos.enviar}
        </Button>
      </PieAcciones>
    </form>
  )
}
