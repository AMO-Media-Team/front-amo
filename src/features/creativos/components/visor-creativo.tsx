"use client"

import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileStack,
  LockKeyhole,
} from "lucide-react"
import { type ReactNode, useState } from "react"

import { VisorArchivoFirmado } from "@/components/archivos/visor-archivo-firmado"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { firmarArchivoCreativo } from "../actions"
import {
  describirArchivo,
  huellaCorta,
  nombreArchivo,
  tituloVersion,
} from "../presentacion"
import { enlaceVisible } from "../textos"
import type { ArchivoCreativo, VersionCreativo } from "../tipos"
import { useFirmasVersion } from "./consultas"
import { MiniaturaArchivo } from "./miniatura-archivo"

export interface PropsVisorCreativo {
  version: VersionCreativo
  className?: string
}

function Vacio({ children }: { children: string }) {
  return <span className="text-muted-foreground">{children}</span>
}

function Fichas({ valores, vacio }: { valores: string[]; vacio: string }) {
  if (valores.length === 0) return <Vacio>{vacio}</Vacio>
  return (
    <ul className="flex flex-wrap gap-1.5">
      {valores.map((valor) => (
        <li
          key={valor}
          className="inline-flex h-6 items-center rounded-md bg-muted px-2 font-mono text-xs break-all"
        >
          {valor}
        </li>
      ))}
    </ul>
  )
}

function Dato({ termino, children }: { termino: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {termino}
      </dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

/** Varios archivos: miniaturas para elegir cuál se ve, con anterior y siguiente. */
function SelectorArchivos({
  version,
  indice,
  onIndice,
}: {
  version: VersionCreativo
  indice: number
  onIndice: (indice: number) => void
}) {
  const firmas = useFirmasVersion(version)
  const total = version.archivos.length
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Archivo anterior"
        title="Anterior"
        disabled={indice === 0}
        onClick={() => onIndice(indice - 1)}
      >
        <ChevronLeft aria-hidden />
      </Button>
      <ul
        aria-label={`Archivos de la ${tituloVersion(version).toLowerCase()}`}
        className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1"
      >
        {version.archivos.map((archivo, posicion) => (
          <li key={archivo.id} className="shrink-0">
            <button
              type="button"
              aria-pressed={posicion === indice}
              aria-label={nombreArchivo(archivo, posicion, total)}
              onClick={() => onIndice(posicion)}
              className="block size-14 overflow-hidden rounded-md border-2 border-transparent outline-none focus-visible:anillo-foco aria-pressed:border-primary"
            >
              <MiniaturaArchivo
                archivo={archivo}
                firma={
                  firmas.data
                    ? (firmas.data.archivos[archivo.id] ?? null)
                    : undefined
                }
                cargando={firmas.isPending}
                sizes="3.5rem"
              />
            </button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Archivo siguiente"
        title="Siguiente"
        disabled={indice === total - 1}
        onClick={() => onIndice(indice + 1)}
      >
        <ChevronRight aria-hidden />
      </Button>
    </div>
  )
}

function DatosTecnicos({ archivos }: { archivos: ArchivoCreativo[] }) {
  return (
    <details className="group rounded-lg border bg-muted/20 px-3 py-2 text-sm">
      <summary className="cursor-pointer rounded font-medium outline-none select-none focus-visible:anillo-foco">
        Datos técnicos de los archivos
      </summary>
      <ul className="mt-2 flex flex-col gap-2">
        {archivos.map((archivo, posicion) => (
          <li key={archivo.id} className="flex flex-col gap-0.5">
            <span className="font-medium">
              {nombreArchivo(archivo, posicion, archivos.length)}
            </span>
            <span className="text-xs cifras text-muted-foreground">
              {describirArchivo(archivo)}
            </span>
            {archivo.sha256 ? (
              <span className="text-xs text-muted-foreground">
                Huella SHA-256 del original:{" "}
                <code
                  title={archivo.sha256}
                  className="font-mono text-[0.6875rem] break-all text-foreground"
                >
                  {huellaCorta(archivo.sha256)}
                </code>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  )
}

/**
 * Una versión del paquete creativo para consultarla: sus archivos (imagen o
 * video con URL firmada de corta duración; varios, con miniaturas para pasar
 * de uno a otro), el copy sugerido, los hashtags, las menciones y el enlace de
 * destino. Lo usan la ficha de la oferta y la moderación.
 */
export function VisorCreativo({ version, className }: PropsVisorCreativo) {
  const [elegido, setElegido] = useState(0)
  const total = version.archivos.length
  const indice = Math.min(elegido, Math.max(total - 1, 0))
  const archivo = version.archivos[indice]
  const titulo = tituloVersion(version)

  return (
    <div
      className={cn(
        "grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]",
        className
      )}
    >
      <section
        aria-label={`Archivos de la ${titulo.toLowerCase()}`}
        className="flex min-w-0 flex-col gap-3"
      >
        {archivo ? (
          <>
            <VisorArchivoFirmado
              key={archivo.id}
              firmar={() => firmarArchivoCreativo({ archivoId: archivo.id })}
              firmarDescarga={() =>
                firmarArchivoCreativo({
                  archivoId: archivo.id,
                  descargar: true,
                })
              }
              nombre={nombreArchivo(archivo, indice, total)}
              tipo={archivo.mime}
              tamano={archivo.tamanoBytes}
              descripcion={`${nombreArchivo(archivo, indice, total)} de la ${titulo.toLowerCase()} del creativo`}
            />
            {total > 1 ? (
              <>
                <SelectorArchivos
                  version={version}
                  indice={indice}
                  onIndice={setElegido}
                />
                <p aria-live="polite" className="sr-only">
                  {`Mostrando ${nombreArchivo(archivo, indice, total).toLowerCase()}.`}
                </p>
              </>
            ) : null}
          </>
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            <FileStack aria-hidden className="size-6" />
            Esta versión aún no tiene archivos.
          </div>
        )}
      </section>

      <div className="flex min-w-0 flex-col gap-4">
        <dl className="flex flex-col gap-4">
          <Dato termino="Copy sugerido">
            {version.copySugerido ? (
              <p className="text-pretty break-words whitespace-pre-wrap">
                {version.copySugerido}
              </p>
            ) : (
              <Vacio>Sin copy sugerido: cada medio escribe el suyo.</Vacio>
            )}
          </Dato>
          <Dato termino="Hashtags">
            <Fichas valores={version.hashtags} vacio="Sin hashtags." />
          </Dato>
          <Dato termino="Menciones obligatorias">
            <Fichas valores={version.menciones} vacio="Sin menciones." />
          </Dato>
          <Dato termino="Enlace de destino">
            {version.enlaceDestino ? (
              <a
                href={version.enlaceDestino}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex max-w-full items-center gap-1.5 rounded text-primary underline-offset-4 outline-none hover:underline focus-visible:anillo-foco"
              >
                <LockKeyhole aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">
                  {enlaceVisible(version.enlaceDestino)}
                </span>
                <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                <span className="sr-only"> (abre en una pestaña nueva)</span>
              </a>
            ) : (
              <Vacio>Sin enlace de destino.</Vacio>
            )}
          </Dato>
        </dl>
        {total > 0 ? <DatosTecnicos archivos={version.archivos} /> : null}
      </div>
    </div>
  )
}
