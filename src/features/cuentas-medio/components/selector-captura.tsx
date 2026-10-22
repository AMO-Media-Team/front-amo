"use client"

import { ImageIcon, RefreshCw } from "lucide-react"
import Image from "next/image"
import { useState } from "react"

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
}: {
  archivo: File
  vistaPrevia: string | null
  descripcion: string
  onCambiar: () => void
  bloqueada: boolean
}) {
  const [sinVista, setSinVista] = useState(false)
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
          {archivo.name}
          <span className="ml-2 text-xs font-normal cifras text-muted-foreground">
            {formatearTamano(archivo.size)}
          </span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCambiar}
          disabled={bloqueada}
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
  return (
    <div className="flex flex-col gap-3">
      {elegida ? (
        <CapturaElegida
          archivo={elegida}
          vistaPrevia={vistaPrevia}
          descripcion={descripcionVista}
          onCambiar={() => carga.descartar()}
          bloqueada={subida.activa}
        />
      ) : (
        <ZonaArchivos
          reglas={REGLAS_SELECCION_CAPTURA}
          onArchivos={([archivo]) => {
            if (archivo) carga.elegir(archivo)
          }}
          titulo={titulo}
          descripcion={AYUDA_CAPTURA}
          invalida={Boolean(error)}
          describidaPor={error ? idError : undefined}
        />
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
          onQuitar={() => carga.descartar()}
        />
      ) : null}
    </div>
  )
}
