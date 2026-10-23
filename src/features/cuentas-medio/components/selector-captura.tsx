"use client"

import { ImageIcon, RefreshCw } from "lucide-react"
import Image from "next/image"
import { type Ref, useEffect, useId, useRef, useState } from "react"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import { ZonaArchivos } from "@/components/archivos/zona-archivos"
import { Button } from "@/components/ui/button"
import { formatearTamano } from "@/lib/archivos/formato"

import { AYUDA_CAPTURA, REGLAS_SELECCION_CAPTURA } from "../schemas"
import type { CargaCaptura } from "./use-carga-captura"

/** La captura elegida, para revisarla antes de enviarla. */
function CapturaElegida({
  archivo,
  vistaPrevia,
  descripcion,
  onCambiar,
  bloqueada,
  cambiarRef,
}: {
  archivo: File
  vistaPrevia: string | null
  descripcion: string
  onCambiar: () => void
  bloqueada: boolean
  /** «Cambiar» recibe el foco al elegir: el botón que lo tenía se desmonta. */
  cambiarRef: Ref<HTMLButtonElement>
}) {
  const [sinVista, setSinVista] = useState(false)
  const idNombre = useId()
  const conImagen = vistaPrevia !== null && !sinVista
  return (
    <figure className="flex flex-col gap-2 rounded-xl border bg-muted/20 p-2">
      {conImagen ? (
        <div className="relative h-64 w-full overflow-hidden rounded-lg bg-muted sm:h-72">
          <Image
            src={vistaPrevia}
            alt={descripcion}
            fill
            unoptimized
            sizes="(min-width: 640px) 32rem, 100vw"
            onError={() => setSinVista(true)}
            className="object-contain"
          />
        </div>
      ) : (
        <div className="grid h-28 place-items-center rounded-lg bg-muted text-muted-foreground">
          <ImageIcon aria-hidden className="size-8" />
        </div>
      )}
      <figcaption className="flex items-center justify-between gap-2 px-1 text-sm">
        <span className="min-w-0 truncate font-medium" title={archivo.name}>
          <span id={idNombre}>{archivo.name}</span>
          <span className="ml-2 text-xs font-normal cifras text-muted-foreground">
            {formatearTamano(archivo.size)}
          </span>
        </span>
        <Button
          ref={cambiarRef}
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCambiar}
          disabled={bloqueada}
          aria-describedby={idNombre}
          className="shrink-0"
        >
          <RefreshCw data-icon="inline-start" aria-hidden />
          Cambiar
        </Button>
      </figcaption>
    </figure>
  )
}

export interface SelectorCapturaProps {
  carga: CargaCaptura
  /** Título de la zona («Captura de la historia», «Captura de tus estadísticas»). */
  titulo: string
  /** Texto alternativo de la vista previa. */
  descripcionVista: string
  /** Error del formulario (p. ej. «Elige la captura»). */
  error?: string | null
  idError?: string
}

/** Control que recibe el foco cuando cambia la captura. */
type DestinoFoco = "cambiar" | "elegir"

/**
 * Elegir la captura (galería o cámara del celular), revisarla y ver su
 * envío: progreso, pausa sin conexión, reintentos y su causa si falla.
 */
export function SelectorCaptura({
  carga,
  titulo,
  descripcionVista,
  error,
  idError,
}: SelectorCapturaProps) {
  const { subida, elegida, vistaPrevia, elemento } = carga
  const contenedor = useRef<HTMLDivElement>(null)
  const zona = useRef<HTMLDivElement>(null)
  const cambiar = useRef<HTMLButtonElement>(null)
  const destinoFoco = useRef<DestinoFoco | null>(null)

  // Elegir, cambiar o quitar la captura desmonta el botón que se acaba de
  // usar: el foco pasa a «Cambiar» o a «Elegir archivo», que siguen en
  // pantalla. Solo si se perdió o sigue aquí (la revisión del archivo es
  // asíncrona y la persona pudo pasar a otro campo).
  useEffect(() => {
    const destino = destinoFoco.current
    if (!destino) return
    destinoFoco.current = null
    const activo = document.activeElement
    const libre =
      !activo ||
      activo === document.body ||
      Boolean(contenedor.current?.contains(activo))
    if (!libre) return
    const control =
      destino === "cambiar"
        ? cambiar.current
        : zona.current?.querySelector<HTMLElement>("button:not(:disabled)")
    control?.focus()
  }, [elegida])

  function elegir(archivo: File) {
    destinoFoco.current = "cambiar"
    carga.elegir(archivo)
  }

  function descartar() {
    destinoFoco.current = "elegir"
    carga.descartar()
  }

  return (
    <div ref={contenedor} className="flex flex-col gap-3">
      {elegida ? (
        <CapturaElegida
          archivo={elegida}
          vistaPrevia={vistaPrevia}
          descripcion={descripcionVista}
          onCambiar={descartar}
          bloqueada={subida.activa}
          cambiarRef={cambiar}
        />
      ) : (
        <div ref={zona}>
          <ZonaArchivos
            reglas={REGLAS_SELECCION_CAPTURA}
            onArchivos={([archivo]) => {
              if (archivo) elegir(archivo)
            }}
            titulo={titulo}
            descripcion={AYUDA_CAPTURA}
            invalida={Boolean(error)}
            describidaPor={error ? idError : undefined}
          />
        </div>
      )}
      {error && !elegida ? (
        <p id={idError} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {elemento ? (
        <ListaSubidas
          elementos={[elemento]}
          etiqueta="Envío de la captura"
          onReintentar={() => void carga.reintentar()}
          onCancelar={() => subida.cancelar()}
          onQuitar={descartar}
        />
      ) : null}
    </div>
  )
}
