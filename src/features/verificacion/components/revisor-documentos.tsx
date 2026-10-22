"use client"

import { ArrowRight, FileClock, FileVideo, ImageIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { InsigniaEstado } from "@/features/operacion/components/distintivos"
import {
  ESTADOS_MEDIO,
  TIPOS_DOCUMENTO_MEDIO,
} from "@/features/operacion/estados"
import { categoriaDe } from "@/lib/archivos/mime"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"

import { rutaRevisionMedio } from "../colas"
import { enFrase } from "../presentacion"
import type { DocumentoEnCola } from "../tipos"
import { HojaDocumento } from "./revision-documento"

function IconoArchivo({ mime }: { mime: string | null }) {
  const categoria = mime ? categoriaDe(mime) : null
  const Icono =
    categoria === "imagen"
      ? ImageIcon
      : categoria === "video"
        ? FileVideo
        : FileClock
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning">
      <Icono aria-hidden className="size-5" />
    </span>
  )
}

function TarjetaDocumento({
  documento,
  onRevisar,
}: {
  documento: DocumentoEnCola
  onRevisar: () => void
}) {
  const nombre = TIPOS_DOCUMENTO_MEDIO[documento.tipo]
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <IconoArchivo mime={documento.mime} />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-[0.9375rem] font-semibold">{nombre}</h3>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Link
              href={rutaRevisionMedio(documento.medio.id)}
              className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
            >
              {documento.medio.nombre}
            </Link>
            {documento.medio.estado !== "PENDIENTE" ? (
              <InsigniaEstado
                catalogo={ESTADOS_MEDIO}
                estado={documento.medio.estado}
                className="h-5 px-2 text-[0.6875rem]"
              />
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            Cargado{" "}
            <time
              dateTime={documento.subidoAt}
              title={formatearFechaHora(documento.subidoAt)}
              suppressHydrationWarning
            >
              {formatearRelativo(documento.subidoAt)}
            </time>
          </p>
        </div>
      </div>
      <Button
        size="lg"
        className="w-full shrink-0 sm:w-auto"
        aria-label={`Revisar ${enFrase(nombre)} de ${documento.medio.nombre}`}
        onClick={onRevisar}
      >
        Revisar
        <ArrowRight data-icon="inline-end" aria-hidden />
      </Button>
    </article>
  )
}

/**
 * Cola de documentos por revisar con una sola hoja de revisión: al aprobar o
 * rechazar uno se abre el siguiente, para atender la cola de corrido. La
 * lista se actualiza sola (la acción refresca la página).
 */
export function RevisorDocumentos({
  documentos,
  hoy,
}: {
  documentos: readonly DocumentoEnCola[]
  hoy: string
}) {
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const actual = documentos.find((documento) => documento.id === seleccion)

  function abrirSiguiente() {
    const indice = documentos.findIndex(
      (documento) => documento.id === seleccion
    )
    setSeleccion(documentos[indice + 1]?.id ?? null)
  }

  return (
    <>
      <ol aria-label="Documentos por revisar" className="flex flex-col gap-3">
        {documentos.map((documento) => (
          <li key={documento.id}>
            <TarjetaDocumento
              documento={documento}
              onRevisar={() => setSeleccion(documento.id)}
            />
          </li>
        ))}
      </ol>
      {actual ? (
        <HojaDocumento
          key={actual.id}
          documento={actual}
          medio={actual.medio}
          hoy={hoy}
          abierta
          onAbiertaChange={(abierta) => {
            if (!abierta) setSeleccion(null)
          }}
          onDecidido={abrirSiguiente}
          conEnlaceExpediente
        />
      ) : null}
    </>
  )
}
