"use client"

import { ExternalLink, LockKeyhole } from "lucide-react"
import type { ReactNode } from "react"

import { BotonCopiar } from "@/components/feedback/boton-copiar"
import { enlaceVisible } from "@/features/creativos/textos"

import { textoCompleto, textoHashtags, textoMenciones } from "../contenido"
import type { VersionContenido } from "../tipos"

function Bloque({
  titulo,
  copiar,
  children,
}: {
  titulo: string
  /** Botón de copiar del bloque (si hay qué copiar). */
  copiar: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {titulo}
        </h4>
        {copiar}
      </div>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  )
}

function Fichas({ valores }: { valores: string[] }) {
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

/**
 * El texto de la publicación (MED-012): copy, hashtags, menciones y enlace de
 * destino, cada uno copiable con un toque, y todo junto en el orden en que
 * se pega. Se publica tal como viene: la condición lo recuerda.
 */
export function TextosContenido({ version }: { version: VersionContenido }) {
  const hashtags = textoHashtags(version.hashtags)
  const menciones = textoMenciones(version.menciones)
  const completo = textoCompleto(version)
  const partes = [
    version.copySugerido,
    hashtags,
    menciones,
    version.enlaceDestino,
  ].filter(Boolean).length

  return (
    <section aria-labelledby="textos-contenido" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 id="textos-contenido" className="text-sm font-semibold">
            Texto de la publicación
          </h3>
          <p className="text-xs text-pretty text-muted-foreground">
            Publícalo tal como viene, sin editarlo, y agrega la etiqueta de
            publicidad de la red.
          </p>
        </div>
        {partes > 1 ? (
          <BotonCopiar
            texto={completo}
            etiqueta="Copiar todo"
            etiquetaCopiado="Todo copiado"
            variante="default"
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-2.5">
        <Bloque
          titulo="Texto"
          copiar={
            version.copySugerido ? (
              <BotonCopiar
                texto={version.copySugerido}
                etiqueta="Copiar el texto"
                etiquetaCopiado="Texto copiado"
              />
            ) : null
          }
        >
          {version.copySugerido ? (
            <p className="text-pretty break-words whitespace-pre-wrap">
              {version.copySugerido}
            </p>
          ) : (
            <span className="text-muted-foreground">
              Sin texto sugerido: escribe el tuyo, respetando las instrucciones.
            </span>
          )}
        </Bloque>
        {version.hashtags.length > 0 ? (
          <Bloque
            titulo="Hashtags"
            copiar={
              <BotonCopiar
                texto={hashtags}
                etiqueta="Copiar los hashtags"
                etiquetaCopiado="Hashtags copiados"
              />
            }
          >
            <Fichas valores={hashtags.split(" ")} />
          </Bloque>
        ) : null}
        {version.menciones.length > 0 ? (
          <Bloque
            titulo="Menciones obligatorias"
            copiar={
              <BotonCopiar
                texto={menciones}
                etiqueta="Copiar las menciones"
                etiquetaCopiado="Menciones copiadas"
              />
            }
          >
            <Fichas valores={menciones.split(" ")} />
          </Bloque>
        ) : null}
        {version.enlaceDestino ? (
          <Bloque
            titulo="Enlace de destino"
            copiar={
              <BotonCopiar
                texto={version.enlaceDestino}
                etiqueta="Copiar el enlace"
                etiquetaCopiado="Enlace copiado"
              />
            }
          >
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
              <ExternalLink aria-hidden className="size-3.5 shrink-0" />{" "}
              <span className="sr-only">(abre en una pestaña nueva)</span>
            </a>
          </Bloque>
        ) : null}
      </div>
    </section>
  )
}
