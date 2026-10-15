"use client"

import type { KeyboardEvent } from "react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { ControlSegmentado } from "@/features/roles/components/control-segmentado"
import { cn } from "@/lib/utils"

import { adornoUnidad, type Borrador } from "../edicion"
import { CLAVE_MUNICIPIO_PLATAFORMA, etiquetaOpcion } from "../parametros"
import type { Parametro } from "../tipos"
import { SelectorMunicipio } from "./selector-municipio"
import {
  FichasOpciones,
  type OpcionSelector,
  SelectorMultiple,
} from "./selector-opciones"

export interface PropsEditorValor {
  parametro: Parametro
  borrador: Borrador
  onCambio: (borrador: Borrador) => void
  idCampo: string
  /** Ayuda y error del campo (`aria-describedby`). */
  idDescripcion: string
  invalido: boolean
  deshabilitado: boolean
  /** Nombres de valores que viven en otras tablas (ISO2, DIVIPOLA). */
  etiquetas?: Readonly<Record<string, string>>
  /** Opciones de una lista abierta (países). */
  opciones?: readonly OpcionSelector[]
  /** Textos de un booleano: [verdadero, falso]. */
  booleano?: readonly [string, string]
  /** Nombre de un valor elegido que no estaba en `etiquetas` (un municipio nuevo). */
  onEtiqueta?: (valor: string, etiqueta: string) => void
  /** Enter en un campo de texto. */
  onEnviar: () => void
  onCancelar: () => void
}

function teclas(onEnviar: () => void, onCancelar: () => void) {
  return (evento: KeyboardEvent<HTMLInputElement>) => {
    if (evento.key === "Enter") {
      evento.preventDefault()
      onEnviar()
    } else if (evento.key === "Escape") {
      evento.preventDefault()
      onCancelar()
    }
  }
}

function opcionesDe(
  parametro: Parametro,
  etiquetas?: Readonly<Record<string, string>>
): OpcionSelector[] {
  return (parametro.opciones ?? []).map((valor) => ({
    valor,
    etiqueta: etiquetaOpcion(valor, etiquetas),
  }))
}

/** Control de edición según el tipo del parámetro (`config_tipo`). */
export function EditorValor(props: PropsEditorValor) {
  const { borrador } = props
  switch (borrador.tipo) {
    case "numero":
    case "porcentaje":
      return <EditorCifra {...props} borrador={borrador} />
    case "booleano":
      return <EditorBooleano {...props} borrador={borrador} />
    case "texto":
      return <EditorTexto {...props} borrador={borrador} />
    case "lista":
      return <EditorLista {...props} borrador={borrador} />
    case "mapa":
      return <EditorMapa {...props} borrador={borrador} />
  }
}

function EditorCifra({
  parametro,
  borrador,
  onCambio,
  idCampo,
  idDescripcion,
  invalido,
  deshabilitado,
  onEnviar,
  onCancelar,
}: PropsEditorValor & {
  borrador: Extract<Borrador, { tipo: "numero" | "porcentaje" }>
}) {
  const adorno = adornoUnidad(parametro)
  return (
    <InputGroup className="w-full max-w-60 bg-background">
      {adorno?.posicion === "inicio" ? (
        <InputGroupAddon>
          <InputGroupText>{adorno.texto}</InputGroupText>
        </InputGroupAddon>
      ) : null}
      <InputGroupInput
        id={idCampo}
        value={borrador.texto}
        onChange={(evento) =>
          onCambio({ ...borrador, texto: evento.target.value })
        }
        onKeyDown={teclas(onEnviar, onCancelar)}
        inputMode={parametro.tipo === "ENTERO" ? "numeric" : "decimal"}
        autoComplete="off"
        autoFocus
        disabled={deshabilitado}
        aria-invalid={invalido || undefined}
        aria-describedby={idDescripcion}
        className="cifras"
      />
      {adorno?.posicion === "fin" ? (
        <InputGroupAddon align="inline-end">
          <InputGroupText>{adorno.texto}</InputGroupText>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  )
}

function EditorBooleano({
  parametro,
  borrador,
  onCambio,
  booleano = ["Sí", "No"],
}: PropsEditorValor & { borrador: Extract<Borrador, { tipo: "booleano" }> }) {
  const [si, no] = booleano
  return (
    <ControlSegmentado
      etiqueta={parametro.descripcion}
      opciones={[
        { valor: "si", etiqueta: si },
        { valor: "no", etiqueta: no },
      ]}
      valor={borrador.valor ? "si" : "no"}
      onCambio={(valor) =>
        onCambio({ tipo: "booleano", valor: valor === "si" })
      }
    />
  )
}

function EditorTexto({
  parametro,
  borrador,
  onCambio,
  idCampo,
  invalido,
  deshabilitado,
  etiquetas,
  onEtiqueta,
}: PropsEditorValor & { borrador: Extract<Borrador, { tipo: "texto" }> }) {
  if (parametro.clave === CLAVE_MUNICIPIO_PLATAFORMA) {
    return (
      <SelectorMunicipio
        id={idCampo}
        valor={borrador.valor}
        etiqueta={etiquetas?.[borrador.valor] ?? null}
        invalido={invalido}
        deshabilitado={deshabilitado}
        onCambio={(municipio) => {
          onEtiqueta?.(
            municipio.codigo,
            `${municipio.nombre} · ${municipio.departamento}`
          )
          onCambio({ tipo: "texto", valor: municipio.codigo })
        }}
        className="max-w-sm"
      />
    )
  }
  return (
    <ControlSegmentado
      etiqueta={parametro.descripcion}
      opciones={opcionesDe(parametro, etiquetas)}
      valor={borrador.valor}
      onCambio={(valor) => onCambio({ tipo: "texto", valor })}
    />
  )
}

function EditorLista({
  parametro,
  borrador,
  onCambio,
  invalido,
  deshabilitado,
  idDescripcion,
  etiquetas,
  opciones,
}: PropsEditorValor & { borrador: Extract<Borrador, { tipo: "lista" }> }) {
  if (parametro.opciones) {
    return (
      <FichasOpciones
        etiqueta={parametro.descripcion}
        opciones={opcionesDe(parametro, etiquetas)}
        valores={borrador.valores}
        deshabilitado={deshabilitado}
        onCambio={(valores) => onCambio({ tipo: "lista", valores })}
      />
    )
  }
  return (
    <SelectorMultiple
      opciones={opciones ?? []}
      valores={borrador.valores}
      deshabilitado={deshabilitado}
      invalido={invalido}
      idDescripcion={idDescripcion}
      etiquetaAgregar="Agregar país"
      onCambio={(valores) => onCambio({ tipo: "lista", valores })}
    />
  )
}

function EditorMapa({
  parametro,
  borrador,
  onCambio,
  idCampo,
  idDescripcion,
  invalido,
  deshabilitado,
  etiquetas,
  onEnviar,
  onCancelar,
}: PropsEditorValor & { borrador: Extract<Borrador, { tipo: "mapa" }> }) {
  const adorno = adornoUnidad(parametro)
  return (
    <div className="grid w-full max-w-xl gap-2 sm:grid-cols-3">
      {Object.entries(borrador.textos).map(([clave, texto], indice) => {
        const id = indice === 0 ? idCampo : `${idCampo}-${clave}`
        return (
          <label key={clave} htmlFor={id} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {etiquetaOpcion(clave, etiquetas)}
            </span>
            <InputGroup className="bg-background">
              <InputGroupInput
                id={id}
                value={texto}
                onChange={(evento) =>
                  onCambio({
                    tipo: "mapa",
                    textos: {
                      ...borrador.textos,
                      [clave]: evento.target.value,
                    },
                  })
                }
                onKeyDown={teclas(onEnviar, onCancelar)}
                inputMode="decimal"
                autoComplete="off"
                autoFocus={indice === 0}
                disabled={deshabilitado}
                aria-invalid={invalido || undefined}
                aria-describedby={idDescripcion}
                className={cn("cifras")}
              />
              {adorno ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{adorno.texto}</InputGroupText>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </label>
        )
      })}
    </div>
  )
}
