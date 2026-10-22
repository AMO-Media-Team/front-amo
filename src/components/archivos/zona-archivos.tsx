"use client"

import { Camera, CircleAlert, FolderOpen, Upload } from "lucide-react"
import {
  type ChangeEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react"
import { type FileRejection, useDropzone } from "react-dropzone"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { aceptarDe, atributoAccept } from "@/lib/archivos/mime"
import { type ReglasArchivo, validarArchivo } from "@/lib/archivos/validar"
import { cn } from "@/lib/utils"

import {
  describirReglas,
  etiquetaCamara,
  mensajeDemasiados,
  mensajeFormato,
  mimesDeCamara,
} from "./textos"

export interface ArchivoRechazado {
  nombre: string
  mensaje: string
}

export interface ZonaArchivosProps {
  reglas: ReglasArchivo
  /** Archivos que pasaron la validación (formato, peso, proporción, duración). */
  onArchivos: (archivos: File[]) => void
  multiple?: boolean
  /** Con `multiple`: cuántos a la vez (10 por defecto). */
  maxArchivos?: number
  /**
   * Muestra un botón para usar la cámara del celular (`environment` = trasera,
   * `user` = frontal). La selección de la galería sigue disponible.
   */
  capture?: "environment" | "user"
  /** Título de la zona. */
  titulo?: string
  /** Ayuda bajo el título; por defecto, formatos y límites de `reglas`. */
  descripcion?: ReactNode
  deshabilitada?: boolean
  /** Marca la zona como inválida (error del formulario que la contiene). */
  invalida?: boolean
  /** Ids extra para `aria-describedby` (p. ej. el mensaje de error del campo). */
  describidaPor?: string
  /** Versión baja, para formularios con varias zonas. */
  compacta?: boolean
  className?: string
}

const MAX_ARCHIVOS_POR_DEFECTO = 10

/**
 * Zona para elegir, arrastrar o fotografiar archivos. Valida cada uno
 * con `validarArchivo` antes de entregarlo y explica en español por qué se
 * rechazó el resto. La zona solo recibe lo que se suelta; los botones son los
 * controles accesibles con teclado y lector de pantalla.
 */
export function ZonaArchivos({
  reglas,
  onArchivos,
  multiple = false,
  maxArchivos = MAX_ARCHIVOS_POR_DEFECTO,
  capture,
  titulo,
  descripcion,
  deshabilitada = false,
  invalida = false,
  describidaPor,
  compacta = false,
  className,
}: ZonaArchivosProps) {
  const id = useId()
  const idTitulo = `${id}-titulo`
  const idAyuda = `${id}-ayuda`
  const idRechazos = `${id}-rechazos`
  const camara = useRef<HTMLInputElement>(null)
  const [revisando, setRevisando] = useState(false)
  const [rechazos, setRechazos] = useState<ArchivoRechazado[]>([])
  const limite = multiple ? maxArchivos : 1
  const textoCamara = capture ? etiquetaCamara(reglas.mimes) : null
  const inactiva = deshabilitada || revisando

  async function revisar(
    archivos: readonly File[],
    previos: ArchivoRechazado[]
  ) {
    if (archivos.length === 0) {
      setRechazos(previos)
      return
    }
    setRevisando(true)
    try {
      const resultados = await Promise.all(
        archivos.map(async (archivo) => ({
          archivo,
          validacion: await validarArchivo(archivo, reglas),
        }))
      )
      const validos = resultados.flatMap(({ archivo, validacion }) =>
        validacion.ok ? [archivo] : []
      )
      setRechazos([
        ...previos,
        ...resultados.flatMap(({ archivo, validacion }) =>
          validacion.ok
            ? []
            : [{ nombre: archivo.name, mensaje: validacion.mensaje }]
        ),
      ])
      if (validos.length > 0) onArchivos(validos)
    } finally {
      setRevisando(false)
    }
  }

  /** Lo que react-dropzone ya descartó: el excedente (una vez) y los formatos. */
  function rechazosDeDropzone(rechazados: FileRejection[]): ArchivoRechazado[] {
    const sobrante = (rechazo: FileRejection) =>
      rechazo.errors.some((error) => error.code === "too-many-files")
    return [
      ...(rechazados.some(sobrante)
        ? [{ nombre: "", mensaje: mensajeDemasiados(limite) }]
        : []),
      ...rechazados
        .filter((rechazo) => !sobrante(rechazo))
        .map((rechazo) => ({
          nombre: rechazo.file.name,
          mensaje: mensajeFormato(reglas.mimes),
        })),
    ]
  }

  const { getRootProps, getInputProps, open, isDragActive, isDragReject } =
    useDropzone({
      accept: aceptarDe(reglas.mimes),
      multiple,
      maxFiles: limite,
      disabled: inactiva,
      noClick: true,
      noKeyboard: true,
      onDrop: (aceptados, rechazados) => {
        void revisar(aceptados, rechazosDeDropzone(rechazados))
      },
    })

  function alFotografiar(evento: ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(evento.target.files ?? []).slice(0, limite)
    evento.target.value = ""
    void revisar(archivos, [])
  }

  const ayuda = descripcion ?? describirReglas(reglas)
  const describe = [
    idAyuda,
    rechazos.length > 0 ? idRechazos : null,
    describidaPor,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        {...getRootProps({
          role: "group",
          "aria-labelledby": idTitulo,
          "aria-describedby": describe,
        })}
        data-arrastrando={isDragActive || undefined}
        data-rechazo={isDragReject || undefined}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-muted/20 px-4 text-center transition-colors duration-200",
          compacta ? "py-5" : "py-8 sm:py-10",
          "data-[arrastrando]:border-primary data-[arrastrando]:bg-primary/6",
          "data-[rechazo]:border-destructive data-[rechazo]:bg-destructive/6",
          invalida && "border-destructive/60",
          inactiva && "opacity-60"
        )}
      >
        <input {...getInputProps()} />
        <span
          aria-hidden
          className={cn(
            "grid place-items-center rounded-full bg-card text-primary shadow-sm ring-1 ring-border",
            compacta ? "size-10" : "size-12"
          )}
        >
          {revisando ? (
            <Spinner role={undefined} aria-hidden />
          ) : (
            <Upload className={compacta ? "size-4" : "size-5"} />
          )}
        </span>
        <div className="flex max-w-prose flex-col gap-1">
          <p id={idTitulo} className="text-sm font-medium text-balance">
            {titulo ?? (multiple ? "Sube tus archivos" : "Sube tu archivo")}
            <span className="hidden pointer-fine:inline">
              {multiple
                ? ": arrástralos aquí o elígelos"
                : ": arrástralo aquí o elígelo"}
            </span>
          </p>
          <p
            id={idAyuda}
            className="text-xs cifras text-pretty text-muted-foreground"
          >
            {isDragReject ? mensajeFormato(reglas.mimes) : ayuda}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size={compacta ? "sm" : "default"}
            onClick={open}
            disabled={inactiva}
          >
            <FolderOpen data-icon="inline-start" aria-hidden />
            {multiple ? "Elegir archivos" : "Elegir archivo"}
          </Button>
          {textoCamara ? (
            <Button
              type="button"
              variant="outline"
              size={compacta ? "sm" : "default"}
              onClick={() => camara.current?.click()}
              disabled={inactiva}
              className="pointer-fine:hidden"
            >
              <Camera data-icon="inline-start" aria-hidden />
              {textoCamara}
            </Button>
          ) : null}
        </div>
        {textoCamara ? (
          <input
            ref={camara}
            type="file"
            hidden
            tabIndex={-1}
            accept={atributoAccept(mimesDeCamara(reglas.mimes))}
            capture={capture}
            onChange={alFotografiar}
          />
        ) : null}
        <p role="status" className="sr-only">
          {revisando ? "Revisando el archivo…" : ""}
        </p>
      </div>
      <div id={idRechazos} role="alert">
        {rechazos.length > 0 ? (
          <ul className="flex flex-col gap-1.5 rounded-lg border border-destructive/30 bg-destructive/6 px-3 py-2 text-sm">
            {rechazos.map((rechazo, indice) => (
              <li key={`${rechazo.nombre}-${indice}`} className="flex gap-2">
                <CircleAlert
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                />
                <span className="min-w-0 text-pretty">
                  {rechazo.nombre ? (
                    <span className="font-medium break-all">
                      {rechazo.nombre}:{" "}
                    </span>
                  ) : null}
                  {rechazo.mensaje}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
