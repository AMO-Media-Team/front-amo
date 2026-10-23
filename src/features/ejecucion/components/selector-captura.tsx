"use client"

import { CircleCheck, ImageIcon, RefreshCw } from "lucide-react"
import Image from "next/image"
import {
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import type { CargaCaptura } from "@/components/archivos/use-carga-captura"
import { ZonaArchivos } from "@/components/archivos/zona-archivos"
import { Button } from "@/components/ui/button"
import { formatearTamano } from "@/lib/archivos/formato"

import { REGLAS_SELECCION_CAPTURA } from "../schemas"

/** La captura elegida, para revisarla mientras sube. */
function CapturaElegida({
  archivo,
  vistaPrevia,
  descripcion,
  lista,
  onCambiar,
  bloqueada,
  cambiarRef,
}: {
  archivo: File
  vistaPrevia: string | null
  descripcion: string
  lista: boolean
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
        <div className="relative h-56 w-full overflow-hidden rounded-lg bg-muted sm:h-72">
          <Image
            src={vistaPrevia}
            alt={descripcion}
            fill
            unoptimized
            sizes="(min-width: 640px) 40rem, 100vw"
            onError={() => setSinVista(true)}
            className="object-contain"
          />
        </div>
      ) : (
        <div className="grid h-28 place-items-center rounded-lg bg-muted text-muted-foreground">
          <ImageIcon aria-hidden className="size-8" />
        </div>
      )}
      <figcaption className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            id={idNombre}
            className="truncate font-medium"
            title={archivo.name}
          >
            {archivo.name}
          </span>
          <span className="text-xs cifras text-muted-foreground">
            {formatearTamano(archivo.size)}
          </span>
        </span>
        {lista ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <CircleCheck aria-hidden className="size-4" />
            Lista para enviar
          </span>
        ) : null}
        <Button
          ref={cambiarRef}
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCambiar}
          disabled={bloqueada}
          aria-describedby={idNombre}
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
  /** Título de la zona («Captura del panel de estadísticas»). */
  titulo: string
  /** Qué captura se pide y cómo tomarla. */
  instrucciones: string
  /** Texto alternativo de la vista previa. */
  descripcionVista: string
  /** Captura ya enviada (al corregir): se conserva si no se elige otra. */
  actual?: ReactNode
  error?: string | null
  idError: string
  /** Mientras se envía el formulario no se cambia la captura. */
  bloqueado?: boolean
}

/** Control que recibe el foco cuando cambia la captura. */
type DestinoFoco = "cambiar" | "elegir"

/**
 * Elegir la captura (cámara del celular o galería), revisarla mientras sube
 * y ver su envío: progreso, pausa sin conexión, reintentos y su causa si
 * falla. Al corregir, muestra la que ya se envió y deja reemplazarla. Con un
 * error, el contenedor recibe el foco (`data-foco-error`, `useFocoErrores`).
 */
export function SelectorCaptura({
  carga,
  titulo,
  instrucciones,
  descripcionVista,
  actual,
  error,
  idError,
  bloqueado = false,
}: SelectorCapturaProps) {
  const { subida, elegida, vistaPrevia, elemento, lista } = carga
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
    <div
      ref={contenedor}
      tabIndex={-1}
      data-foco-error={error ? true : undefined}
      className="flex flex-col gap-3 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {elegida ? (
        <CapturaElegida
          archivo={elegida}
          vistaPrevia={vistaPrevia}
          descripcion={descripcionVista}
          lista={lista !== null}
          onCambiar={descartar}
          bloqueada={bloqueado}
          cambiarRef={cambiar}
        />
      ) : (
        <>
          {actual}
          <div ref={zona}>
            <ZonaArchivos
              reglas={REGLAS_SELECCION_CAPTURA}
              capture="environment"
              onArchivos={([archivo]) => {
                if (archivo) elegir(archivo)
              }}
              titulo={actual ? "Cambiar la captura" : titulo}
              descripcion={instrucciones}
              compacta={Boolean(actual)}
              deshabilitada={bloqueado}
              invalida={Boolean(error)}
              describidaPor={error ? idError : undefined}
            />
          </div>
        </>
      )}
      {error ? (
        <p id={idError} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {elemento ? (
        <ListaSubidas
          elementos={[elemento]}
          etiqueta="Envío de la captura"
          onReintentar={() => carga.reintentar()}
          onCancelar={() => subida.cancelar()}
          onQuitar={descartar}
        />
      ) : null}
    </div>
  )
}
