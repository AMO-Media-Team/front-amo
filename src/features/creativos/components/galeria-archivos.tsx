"use client"

import { ArrowLeft, ArrowRight, Eye, Trash2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { VisorArchivoFirmado } from "@/components/archivos/visor-archivo-firmado"
import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ResultadoAccion } from "@/lib/result"

import { firmarArchivoCreativo } from "../actions"
import { describirArchivo, nombreArchivo } from "../presentacion"
import type { ArchivoCreativo, VersionCreativo } from "../tipos"
import { useFirmasVersion } from "./consultas"
import { MiniaturaArchivo } from "./miniatura-archivo"

export type Direccion = "antes" | "despues"

export interface GaleriaArchivosProps {
  version: VersionCreativo
  /** Carrusel: el orden importa y se puede cambiar. */
  ordenable: boolean
  deshabilitada?: boolean
  /** Mientras se guarda un orden, los botones de mover esperan. */
  ordenando?: boolean
  onQuitar: (archivo: ArchivoCreativo) => Promise<ResultadoAccion<unknown>>
  onMover: (indice: number, direccion: Direccion) => void
  /**
   * A dónde va el foco tras quitar el último archivo (la galería desaparece),
   * p. ej. el título de la sección con `tabIndex={-1}`.
   */
  focoSinArchivos?: () => HTMLElement | null
}

type Accion = Direccion | "ver" | "quitar"

function claveFoco(id: string, accion: Accion) {
  return `${id}:${accion}`
}

/**
 * Archivos ya guardados de la versión editable: miniatura, medidas y peso,
 * ver en grande (URL firmada), mover antes o después (carrusel) y quitar con
 * confirmación. Tras mover, el foco sigue al archivo movido (también mientras
 * se guarda el orden) y se anuncia su nueva posición; tras quitar, pasa a
 * «Quitar» de la pieza vecina (o a `focoSinArchivos` si no queda ninguna).
 */
export function GaleriaArchivos({
  version,
  ordenable,
  deshabilitada = false,
  ordenando = false,
  onQuitar,
  onMover,
  focoSinArchivos,
}: GaleriaArchivosProps) {
  const firmas = useFirmasVersion(version)
  const [viendo, setViendo] = useState<ArchivoCreativo | null>(null)
  const [quitando, setQuitando] = useState<ArchivoCreativo | null>(null)
  const [anuncio, setAnuncio] = useState("")
  const botones = useRef(new Map<string, HTMLButtonElement>())
  const foco = useRef<{ id: string; accion: Direccion } | null>(null)
  /** Tras quitar: la pieza vecina que recibe el foco (`null`: no queda ninguna). */
  const trasQuitar = useRef<{ vecino: string | null } | null>(null)
  const archivos = version.archivos
  const total = archivos.length
  const posicion = (archivo: ArchivoCreativo) =>
    archivos.findIndex((actual) => actual.id === archivo.id)

  // El archivo movido conserva el foco (en el otro botón si llegó al borde).
  // Mientras se guarda el orden sus botones siguen enfocables (`aria-disabled`);
  // si aún no se pueden enfocar, el foco espera al siguiente render.
  useEffect(() => {
    const pendiente = foco.current
    if (!pendiente) return
    const indice = archivos.findIndex((archivo) => archivo.id === pendiente.id)
    const accion: Direccion =
      pendiente.accion === "antes" && indice === 0
        ? "despues"
        : pendiente.accion === "despues" && indice === total - 1
          ? "antes"
          : pendiente.accion
    const boton = botones.current.get(claveFoco(pendiente.id, accion))
    if (boton?.disabled) return
    foco.current = null
    boton?.focus()
  })

  function mover(
    archivo: ArchivoCreativo,
    indice: number,
    direccion: Direccion
  ) {
    if (ordenando) return
    const destino = direccion === "antes" ? indice - 1 : indice + 1
    foco.current = { id: archivo.id, accion: direccion }
    setAnuncio(
      `${nombreArchivo(archivo, indice, total)} pasó a la posición ${destino + 1} de ${total}.`
    )
    onMover(indice, direccion)
  }

  function pedirQuitar(archivo: ArchivoCreativo) {
    trasQuitar.current = null
    setQuitando(archivo)
  }

  async function quitar(archivo: ArchivoCreativo) {
    const indice = posicion(archivo)
    const nombre = nombreArchivo(archivo, indice, total)
    // Antes de la acción: la galería puede desaparecer (último archivo) en
    // cuanto la caché lo quita, y entonces el diálogo devuelve el foco al cerrarse.
    trasQuitar.current = {
      vecino: (archivos[indice + 1] ?? archivos[indice - 1])?.id ?? null,
    }
    try {
      const resultado = await onQuitar(archivo)
      if (resultado.ok) setAnuncio(`Archivo quitado: ${nombre.toLowerCase()}.`)
      else trasQuitar.current = null
      return resultado
    } catch (error) {
      // Sigue ahí: si se cancela, el foco vuelve a su «Quitar».
      trasQuitar.current = null
      throw error
    }
  }

  /** El botón «Quitar» desaparece con su pieza: el foco va a la vecina. */
  function focoTrasQuitar(): HTMLElement | null {
    const destino = trasQuitar.current
    if (!destino) return null
    return (
      (destino.vecino
        ? botones.current.get(claveFoco(destino.vecino, "quitar"))
        : null) ??
      focoSinArchivos?.() ??
      null
    )
  }

  function registrar(id: string, accion: Accion) {
    return (boton: HTMLButtonElement | null) => {
      const clave = claveFoco(id, accion)
      if (boton) botones.current.set(clave, boton)
      else botones.current.delete(clave)
    }
  }

  return (
    <>
      <ul
        aria-label="Archivos cargados"
        className="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-4"
      >
        {archivos.map((archivo, indice) => {
          const nombre = nombreArchivo(archivo, indice, total)
          const firma = firmas.data
            ? (firmas.data.archivos[archivo.id] ?? null)
            : undefined
          return (
            <li
              key={archivo.id}
              aria-label={nombre}
              className="flex min-w-0 animate-aparecer-arriba flex-col overflow-hidden rounded-xl border bg-card"
            >
              <button
                type="button"
                ref={registrar(archivo.id, "ver")}
                onClick={() => setViendo(archivo)}
                aria-label={`Ver ${nombre.toLowerCase()} en grande`}
                className="group/miniatura relative block aspect-square w-full outline-none focus-visible:anillo-foco"
              >
                <MiniaturaArchivo
                  archivo={archivo}
                  firma={firma}
                  cargando={firmas.isPending}
                />
                {ordenable ? (
                  <span
                    aria-hidden
                    className="absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-full bg-background/90 text-xs font-semibold cifras shadow-sm ring-1 ring-border"
                  >
                    {indice + 1}
                  </span>
                ) : null}
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent px-2 pt-6 pb-1.5 text-xs font-medium text-white opacity-0 transition-opacity group-hover/miniatura:opacity-100 group-focus-visible/miniatura:opacity-100 motion-reduce:transition-none">
                  <Eye aria-hidden className="size-3.5" />
                  Ver
                </span>
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
                <p className="truncate text-sm font-medium">{nombre}</p>
                <p className="text-xs cifras text-pretty text-muted-foreground">
                  {describirArchivo(archivo)}
                </p>
                <div className="mt-auto flex items-center gap-1 pt-1">
                  {ordenable && total > 1 ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        ref={registrar(archivo.id, "antes")}
                        aria-label={`Mover ${nombre.toLowerCase()} antes`}
                        title="Mover antes"
                        disabled={deshabilitada || ordenando || indice === 0}
                        focusableWhenDisabled={ordenando}
                        onClick={() => mover(archivo, indice, "antes")}
                      >
                        <ArrowLeft aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        ref={registrar(archivo.id, "despues")}
                        aria-label={`Mover ${nombre.toLowerCase()} después`}
                        title="Mover después"
                        disabled={
                          deshabilitada || ordenando || indice === total - 1
                        }
                        focusableWhenDisabled={ordenando}
                        onClick={() => mover(archivo, indice, "despues")}
                      >
                        <ArrowRight aria-hidden />
                      </Button>
                    </>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    ref={registrar(archivo.id, "quitar")}
                    aria-label={`Quitar ${nombre.toLowerCase()}`}
                    title="Quitar"
                    disabled={deshabilitada}
                    onClick={() => pedirQuitar(archivo)}
                    className="ml-auto text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>

      <Dialog
        open={viendo !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setViendo(null)
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[92vh] gap-3 overflow-y-auto sm:max-w-2xl"
        >
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-2 right-2"
                aria-label="Cerrar"
              />
            }
          >
            <X aria-hidden />
          </DialogClose>
          {viendo ? (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle>
                  {nombreArchivo(viendo, posicion(viendo), total)}
                </DialogTitle>
                <DialogDescription className="cifras">
                  {describirArchivo(viendo)}
                </DialogDescription>
              </DialogHeader>
              <VisorArchivoFirmado
                key={viendo.id}
                firmar={() => firmarArchivoCreativo({ archivoId: viendo.id })}
                firmarDescarga={() =>
                  firmarArchivoCreativo({
                    archivoId: viendo.id,
                    descargar: true,
                  })
                }
                nombre={nombreArchivo(viendo, posicion(viendo), total)}
                tipo={viendo.mime}
                tamano={viendo.tamanoBytes}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <DialogoConfirmacion
        abierto={quitando !== null}
        onAbiertoChange={(abierto) => {
          if (!abierto) setQuitando(null)
        }}
        titulo={
          quitando
            ? `¿Quitar ${nombreArchivo(quitando, posicion(quitando), total).toLowerCase()}?`
            : "¿Quitar el archivo?"
        }
        descripcion="Se borra de esta versión del creativo. Si lo necesitas otra vez tendrás que cargarlo de nuevo."
        textoConfirmar="Quitar"
        destructivo
        focoAlCerrar={focoTrasQuitar}
        onConfirmar={() => (quitando ? quitar(quitando) : undefined)}
      />
    </>
  )
}
