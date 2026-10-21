import { Fragment } from "react"

import { cn } from "@/lib/utils"

import { analizarMarkdown, type Segmento, segmentosEnLinea } from "../markdown"

/**
 * Vista previa del Markdown mínimo de términos y plantillas, pintada con
 * elementos de React (nunca HTML crudo). Con `valores`, cada `{{variable}}`
 * se reemplaza por su ejemplo resaltado; sin ellos, se muestra como ficha.
 */
export function VistaMarkdown({
  texto,
  valores,
  className,
}: {
  texto: string
  /** Valor de ejemplo de cada variable (vista previa de una plantilla). */
  valores?: (variable: string) => string
  className?: string
}) {
  const bloques = analizarMarkdown(texto)
  if (bloques.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Sin contenido.
      </p>
    )
  }
  return (
    <div
      className={cn(
        "flex flex-col gap-3 text-sm leading-relaxed text-pretty",
        className
      )}
    >
      {bloques.map((bloque, indice) => {
        switch (bloque.tipo) {
          case "titulo": {
            const clases = cn(
              "font-heading font-semibold text-foreground",
              bloque.nivel === 1 && "text-lg",
              bloque.nivel === 2 && "mt-2 text-base",
              bloque.nivel === 3 && "text-sm"
            )
            const contenido = (
              <Segmentos segmentos={bloque.segmentos} valores={valores} />
            )
            if (bloque.nivel === 1)
              return (
                <h3 key={indice} className={clases}>
                  {contenido}
                </h3>
              )
            if (bloque.nivel === 2)
              return (
                <h4 key={indice} className={clases}>
                  {contenido}
                </h4>
              )
            return (
              <h5 key={indice} className={clases}>
                {contenido}
              </h5>
            )
          }
          case "parrafo":
            return (
              <p key={indice}>
                {bloque.lineas.map((linea, i) => (
                  <Fragment key={i}>
                    {i > 0 ? <br /> : null}
                    <Segmentos segmentos={linea} valores={valores} />
                  </Fragment>
                ))}
              </p>
            )
          case "lista": {
            const Lista = bloque.ordenada ? "ol" : "ul"
            return (
              <Lista
                key={indice}
                className={cn(
                  "flex flex-col gap-1 pl-5",
                  bloque.ordenada ? "list-decimal" : "list-disc"
                )}
              >
                {bloque.elementos.map((elemento, i) => (
                  <li key={i}>
                    <Segmentos segmentos={elemento} valores={valores} />
                  </li>
                ))}
              </Lista>
            )
          }
        }
      })}
    </div>
  )
}

function Segmentos({
  segmentos,
  valores,
}: {
  segmentos: Segmento[]
  valores?: (variable: string) => string
}) {
  return segmentos.map((segmento, indice) => {
    switch (segmento.tipo) {
      case "texto":
        return <Fragment key={indice}>{segmento.texto}</Fragment>
      // El énfasis puede envolver una variable (`**{{rol}}**`): su interior se
      // vuelve a segmentar. Ya no trae asteriscos, así que no anida más énfasis.
      case "negrita":
        return (
          <strong key={indice} className="font-semibold text-foreground">
            <Segmentos
              segmentos={segmentosEnLinea(segmento.texto)}
              valores={valores}
            />
          </strong>
        )
      case "cursiva":
        return (
          <em key={indice}>
            <Segmentos
              segmentos={segmentosEnLinea(segmento.texto)}
              valores={valores}
            />
          </em>
        )
      case "variable":
        return valores ? (
          <mark
            key={indice}
            title={`{{${segmento.nombre}}}`}
            className="rounded bg-primary/12 px-0.5 text-foreground"
          >
            {valores(segmento.nombre.toLowerCase())}
          </mark>
        ) : (
          <code
            key={indice}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8125em] text-primary"
          >
            {`{{${segmento.nombre}}}`}
          </code>
        )
    }
  })
}
