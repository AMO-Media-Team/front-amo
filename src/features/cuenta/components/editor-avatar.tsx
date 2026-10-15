"use client"

import { Camera, ImagePlus, Trash2 } from "lucide-react"
import { type ReactNode, useEffect, useState, useTransition } from "react"
import { type FileRejection, useDropzone } from "react-dropzone"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { obtenerClienteNavegador } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

import { confirmarAvatar, prepararSubidaAvatar, quitarAvatar } from "../actions"
import {
  BUCKET_AVATARES,
  type Dimensiones,
  type Encuadre,
  ENCUADRE_INICIAL,
  escalaVisor,
  TAMANO_MAXIMO_ORIGINAL_MB,
  TIPOS_IMAGEN_ACEPTADOS,
} from "../avatar"
import { AvatarCuenta } from "./avatar-cuenta"
import { generarAvatar, leerDimensiones } from "./procesar-avatar"
import { LADO_VISOR, RecortadorAvatar } from "./recortador-avatar"

type Etapa = "optimizando" | "subiendo" | "guardando"

const ETAPAS: Record<Etapa, { texto: string; progreso: number }> = {
  optimizando: { texto: "Optimizando la foto…", progreso: 30 },
  subiendo: { texto: "Subiendo…", progreso: 70 },
  guardando: { texto: "Guardando en tu perfil…", progreso: 92 },
}

interface Seleccion {
  archivo: File
  url: string
  dimensiones: Dimensiones
}

function mensajeRechazo(rechazo: FileRejection): string {
  const codigo = rechazo.errors[0]?.code
  if (codigo === "file-too-large") {
    return `La imagen pesa más de ${TAMANO_MAXIMO_ORIGINAL_MB} MB. Elige una más liviana.`
  }
  if (codigo === "file-invalid-type") {
    return "Ese formato no se admite. Usa una foto JPG, PNG o WebP."
  }
  return "No pudimos usar ese archivo. Prueba con otra foto."
}

/** Miniatura circular con el mismo encuadre del visor (vista previa real). */
function VistaPreviaCirculo({
  seleccion,
  encuadre,
  tamano,
}: {
  seleccion: Seleccion
  encuadre: Encuadre
  tamano: number
}) {
  const factor = tamano / LADO_VISOR
  const escala = escalaVisor(seleccion.dimensiones, LADO_VISOR, encuadre.zoom)
  const ancho = seleccion.dimensiones.ancho * escala
  const alto = seleccion.dimensiones.alto * escala
  const izquierda = ((LADO_VISOR - ancho) / 2 + encuadre.x) * factor
  const arriba = ((LADO_VISOR - alto) / 2 + encuadre.y) * factor
  return (
    <span
      aria-hidden
      className="relative block shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border"
      style={{ width: tamano, height: tamano }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- URL local (blob:) */}
      <img
        src={seleccion.url}
        alt=""
        className="absolute top-0 left-0 max-w-none"
        style={{
          width: ancho * factor,
          height: alto * factor,
          transform: `translate(${izquierda}px, ${arriba}px)`,
        }}
      />
    </span>
  )
}

function ZonaSeleccion({
  onArchivo,
  onError,
}: {
  onArchivo: (archivo: File) => void
  onError: (mensaje: string) => void
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: Object.fromEntries(
      TIPOS_IMAGEN_ACEPTADOS.map((tipo) => [tipo, []])
    ),
    maxSize: TAMANO_MAXIMO_ORIGINAL_MB * 1024 * 1024,
    multiple: false,
    onDropAccepted: ([archivo]) => {
      if (archivo) onArchivo(archivo)
    },
    onDropRejected: ([rechazo]) => {
      if (rechazo) onError(mensajeRechazo(rechazo))
    },
  })

  return (
    <div
      {...getRootProps({
        className: cn(
          "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors outline-none focus-visible:anillo-foco",
          isDragActive
            ? "border-primary bg-primary/8"
            : "border-border bg-muted/30 hover:border-primary/50 hover:bg-primary/5"
        ),
      })}
    >
      <input {...getInputProps({ "aria-label": "Elegir una foto" })} />
      <span className="grid size-14 place-items-center rounded-2xl bg-card text-primary shadow-glow ring-1 ring-border transition-transform group-hover:-translate-y-0.5">
        <ImagePlus className="size-6" aria-hidden />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          {isDragActive
            ? "Suéltala aquí"
            : "Arrastra una foto o haz clic para elegirla"}
        </span>
        <span className="text-xs text-muted-foreground">
          JPG, PNG o WebP · hasta {TAMANO_MAXIMO_ORIGINAL_MB} MB
        </span>
      </span>
    </div>
  )
}

interface EditorAvatarProps {
  nombre: string
  avatarUrl: string | null
  color: string
  tieneAvatar: boolean
  /** El bucket `avatares` existe (migración de Storage aplicada). */
  disponible: boolean
  /** Identidad de la cabecera (servidor), entre la foto y las acciones. */
  children: ReactNode
}

/**
 * Cabecera con la foto de perfil editable: la foto (clic o «Cambiar foto»)
 * abre el editor con recorte cuadrado, se comprime en el navegador y se sube
 * con una URL firmada que emite el servidor para una ruta propia.
 */
export function EditorAvatar({
  nombre,
  avatarUrl,
  color,
  tieneAvatar,
  disponible,
  children,
}: EditorAvatarProps) {
  const [abierto, setAbierto] = useState(false)
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null)
  const [encuadre, setEncuadre] = useState<Encuadre>(ENCUADRE_INICIAL)
  const [etapa, setEtapa] = useState<Etapa | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  // Libera la URL local de la foto anterior al cambiarla o al cerrar.
  useEffect(() => {
    if (!seleccion) return
    return () => URL.revokeObjectURL(seleccion.url)
  }, [seleccion])

  const reiniciar = () => {
    setSeleccion(null)
    setEncuadre(ENCUADRE_INICIAL)
    setEtapa(null)
    setError(null)
  }

  const cambiarAbierto = (siguiente: boolean) => {
    if (pendiente) return
    setAbierto(siguiente)
    if (!siguiente) reiniciar()
  }

  const elegir = async (archivo: File) => {
    setError(null)
    const url = URL.createObjectURL(archivo)
    try {
      const dimensiones = await leerDimensiones(url)
      setEncuadre(ENCUADRE_INICIAL)
      setSeleccion({ archivo, url, dimensiones })
    } catch {
      URL.revokeObjectURL(url)
      setError("No pudimos leer esa imagen. Prueba con otra foto.")
    }
  }

  const guardar = () => {
    if (!seleccion) return
    iniciar(async () => {
      setError(null)
      try {
        setEtapa("optimizando")
        const archivo = await generarAvatar(
          seleccion.archivo,
          encuadre,
          seleccion.dimensiones,
          LADO_VISOR
        )
        setEtapa("subiendo")
        const subida = await prepararSubidaAvatar()
        if (!subida.ok) throw new Error(subida.error)
        const { error: errorSubida } = await obtenerClienteNavegador()
          .storage.from(BUCKET_AVATARES)
          .uploadToSignedUrl(subida.datos.ruta, subida.datos.token, archivo, {
            contentType: archivo.type || "image/webp",
          })
        if (errorSubida)
          throw new Error(
            "La foto no se pudo subir. Revisa tu conexión e inténtalo de nuevo."
          )
        setEtapa("guardando")
        const confirmacion = await confirmarAvatar({ ruta: subida.datos.ruta })
        if (!confirmacion.ok) throw new Error(confirmacion.error)
        toast.success("Foto actualizada")
        setAbierto(false)
        reiniciar()
      } catch (causa) {
        setEtapa(null)
        setError(
          causa instanceof Error && causa.message
            ? causa.message
            : "No pudimos guardar la foto. Inténtalo de nuevo."
        )
      }
    })
  }

  const quitar = async () => {
    const resultado = await quitarAvatar()
    if (resultado.ok) toast.success("Quitaste tu foto de perfil")
    return resultado
  }

  // Sin bucket la foto no es un control: solo las iniciales (el aviso va aparte).
  const foto = disponible ? (
    <button
      type="button"
      onClick={() => setAbierto(true)}
      aria-label={
        tieneAvatar ? "Cambiar tu foto de perfil" : "Agregar una foto de perfil"
      }
      className="group relative w-fit shrink-0 rounded-full outline-none focus-visible:anillo-foco"
    >
      <AvatarCuenta nombre={nombre} url={avatarUrl} color={color} />
      <span
        aria-hidden
        className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        <Camera className="size-6" />
      </span>
      <span
        aria-hidden
        className="absolute -right-0.5 -bottom-0.5 grid size-8 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-105"
      >
        <Camera className="size-4" />
      </span>
    </button>
  ) : (
    <AvatarCuenta nombre={nombre} url={avatarUrl} color={color} />
  )

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
      {foto}

      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>

      {disponible ? (
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-stretch lg:flex-row lg:items-center">
          <Button variant="outline" onClick={() => setAbierto(true)}>
            <Camera data-icon="inline-start" aria-hidden />
            {tieneAvatar ? "Cambiar foto" : "Agregar foto"}
          </Button>
          {tieneAvatar ? (
            <DialogoConfirmacion
              titulo="¿Quitar tu foto de perfil?"
              descripcion="Volverás a verte con tus iniciales en toda la plataforma."
              textoConfirmar="Quitar foto"
              destructivo
              disparador={
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 data-icon="inline-start" aria-hidden />
                  Quitar
                </Button>
              }
              onConfirmar={quitar}
            />
          ) : null}
        </div>
      ) : (
        <p className="inline-flex w-fit items-center gap-1.5 self-start rounded-full border border-dashed bg-background/50 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm sm:self-center">
          <Camera aria-hidden className="size-3.5" />
          Fotos de perfil muy pronto
        </p>
      )}

      <Dialog open={abierto} onOpenChange={cambiarAbierto}>
        <DialogContent className="gap-5 sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              Foto de perfil
            </DialogTitle>
            <DialogDescription>
              {seleccion
                ? "Encuadra tu rostro dentro del círculo. La optimizamos antes de subirla."
                : "Elige una foto donde se vea bien tu rostro. La recortarás en el siguiente paso."}
            </DialogDescription>
          </DialogHeader>

          {seleccion ? (
            <div className="flex flex-col items-center gap-5">
              <RecortadorAvatar
                url={seleccion.url}
                dimensiones={seleccion.dimensiones}
                encuadre={encuadre}
                onEncuadreChange={setEncuadre}
                deshabilitado={pendiente}
              />
              <div className="flex w-full items-center justify-center gap-4 rounded-xl border bg-muted/30 px-4 py-3">
                <span className="text-xs font-medium text-muted-foreground">
                  Vista previa
                </span>
                <VistaPreviaCirculo
                  seleccion={seleccion}
                  encuadre={encuadre}
                  tamano={56}
                />
                <VistaPreviaCirculo
                  seleccion={seleccion}
                  encuadre={encuadre}
                  tamano={32}
                />
                <VistaPreviaCirculo
                  seleccion={seleccion}
                  encuadre={encuadre}
                  tamano={24}
                />
              </div>
            </div>
          ) : (
            <ZonaSeleccion onArchivo={elegir} onError={setError} />
          )}

          {etapa ? (
            <div role="status" className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {ETAPAS[etapa].texto}
              </p>
              <Progress
                value={ETAPAS[etapa].progreso}
                aria-label={ETAPAS[etapa].texto}
              />
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            {seleccion ? (
              <Button
                variant="ghost"
                className="sm:mr-auto"
                disabled={pendiente}
                onClick={() => {
                  setSeleccion(null)
                  setError(null)
                }}
              >
                Elegir otra
              </Button>
            ) : null}
            <Button
              variant="outline"
              disabled={pendiente}
              onClick={() => cambiarAbierto(false)}
            >
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={!seleccion || pendiente}>
              {pendiente ? (
                <Spinner data-icon="inline-start" aria-hidden />
              ) : null}
              {pendiente ? "Guardando…" : "Guardar foto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
