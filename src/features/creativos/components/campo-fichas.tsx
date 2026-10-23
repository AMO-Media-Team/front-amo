"use client"

import { Plus, X } from "lucide-react"
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react"
import { Controller, useFormContext } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { cn } from "@/lib/utils"

import {
  agregarEtiquetas,
  type ClaseEtiqueta,
  mensajeEtiquetaInvalida,
  mismaEtiqueta,
  NORMALIZADORES,
  separarEntradas,
} from "../textos"

export interface CampoFichasProps {
  nombre: "hashtags" | "menciones"
  clase: ClaseEtiqueta
  etiqueta: string
  descripcion?: ReactNode
  placeholder?: string
  maximo: number
  sugerencias?: readonly string[]
  deshabilitado?: boolean
  /** Al terminar de editar (salir del campo o confirmar una ficha). */
  onConfirmar?: () => void
}

/**
 * Lista de hashtags o menciones como fichas: se escriben y se confirman con
 * Enter, coma o espacio (pegar «#a #b» agrega las dos), se normalizan (`#`,
 * `@`) y no se repiten. Lo que no es válido queda en el cuadro con el motivo.
 * Enter nunca envía el formulario que contiene al panel (el asistente). Al
 * quitar una ficha o usar una sugerencia (botones que desaparecen) el foco
 * vuelve al cuadro; lleno, el cuadro queda de solo lectura (no deshabilitado)
 * para seguir quitando con retroceso.
 */
export function CampoFichas({
  nombre,
  clase,
  etiqueta,
  descripcion,
  placeholder,
  maximo,
  sugerencias = [],
  deshabilitado = false,
  onConfirmar,
}: CampoFichasProps) {
  const { control } =
    useFormContext<Record<CampoFichasProps["nombre"], string[]>>()
  const id = useId()
  const idDescripcion = `${id}-descripcion`
  const idContador = `${id}-contador`
  const idError = `${id}-error`
  const [texto, setTexto] = useState("")
  const [rechazo, setRechazo] = useState<string | null>(null)
  const cuadro = useRef<HTMLInputElement>(null)

  return (
    <Controller
      control={control}
      name={nombre}
      render={({ field, fieldState }) => {
        const valores: string[] = Array.isArray(field.value) ? field.value : []
        const lleno = valores.length >= maximo

        /** Agrega lo escrito; devuelve lo que no se pudo agregar. */
        function confirmar(entrada: string): string {
          const partes = separarEntradas(entrada)
          if (partes.length === 0) return ""
          const validas: string[] = []
          const invalidas: string[] = []
          for (const parte of partes) {
            const normalizada = NORMALIZADORES[clase](parte)
            if (normalizada) validas.push(normalizada)
            else invalidas.push(parte)
          }
          const nuevas = agregarEtiquetas(valores, validas)
          const caben = nuevas.slice(0, maximo)
          if (caben.length !== valores.length) field.onChange(caben)
          if (invalidas.length > 0) {
            setRechazo(mensajeEtiquetaInvalida(clase, invalidas[0]))
          } else if (nuevas.length > maximo) {
            setRechazo(`Puedes agregar hasta ${maximo}.`)
          } else {
            setRechazo(null)
          }
          if (caben.length !== valores.length) onConfirmar?.()
          return invalidas.join(" ")
        }

        function quitar(valor: string) {
          field.onChange(valores.filter((actual) => actual !== valor))
          setRechazo(null)
          onConfirmar?.()
        }

        /** El botón que se usó desaparece: el foco no debe caer en <body>. */
        function volverAlCuadro() {
          cuadro.current?.focus()
        }

        function teclas(evento: KeyboardEvent<HTMLInputElement>) {
          if (
            evento.key === "Enter" ||
            evento.key === "," ||
            evento.key === " "
          ) {
            // Enter tampoco debe enviar el formulario del asistente.
            evento.preventDefault()
            setTexto(confirmar(texto))
          } else if (evento.key === "Backspace" && !texto && valores.length) {
            quitar(valores[valores.length - 1])
          }
        }

        function pegar(evento: ClipboardEvent<HTMLInputElement>) {
          const pegado = evento.clipboardData.getData("text")
          if (separarEntradas(pegado).length < 2) return
          evento.preventDefault()
          setTexto(confirmar(`${texto} ${pegado}`))
        }

        const error = rechazo ?? fieldState.error?.message ?? null
        const pendientes = sugerencias.filter(
          (sugerencia) =>
            !valores.some((valor) => mismaEtiqueta(valor, sugerencia))
        )
        const describe = [
          descripcion ? idDescripcion : null,
          idContador,
          error ? idError : null,
        ]
          .filter(Boolean)
          .join(" ")

        return (
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
            <div
              className={cn(
                "flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
                error && "border-destructive",
                deshabilitado && "opacity-60"
              )}
            >
              {valores.length > 0 ? (
                <ul aria-label={etiqueta} className="contents">
                  {valores.map((valor) => (
                    <li
                      key={valor}
                      className="inline-flex h-7 max-w-full items-center gap-1 rounded-md bg-muted pr-0.5 pl-2 font-mono text-xs"
                    >
                      <span className="truncate">{valor}</span>
                      <button
                        type="button"
                        disabled={deshabilitado}
                        onClick={() => {
                          quitar(valor)
                          volverAlCuadro()
                        }}
                        aria-label={`Quitar ${valor}`}
                        className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:anillo-foco"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <input
                ref={cuadro}
                id={id}
                value={texto}
                onChange={(evento) => {
                  if (lleno) return
                  setTexto(evento.target.value)
                  if (rechazo) setRechazo(null)
                }}
                onKeyDown={teclas}
                onPaste={pegar}
                onBlur={() => {
                  setTexto(confirmar(texto))
                  field.onBlur()
                  onConfirmar?.()
                }}
                placeholder={valores.length ? "" : placeholder}
                disabled={deshabilitado}
                // Lleno no se deshabilita: conserva el foco y el retroceso
                // sigue quitando la última; el contador explica el tope.
                readOnly={lleno}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
                aria-invalid={error ? true : undefined}
                aria-describedby={describe}
                className="h-7 min-w-28 flex-1 bg-transparent font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted-foreground disabled:cursor-not-allowed"
              />
            </div>
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              {descripcion ? (
                <FieldDescription id={idDescripcion} className="min-w-0 flex-1">
                  {descripcion}
                </FieldDescription>
              ) : (
                <span />
              )}
              <span
                id={idContador}
                className="shrink-0 text-xs cifras text-muted-foreground"
              >
                {valores.length} de {maximo}
              </span>
            </div>
            {pendientes.length > 0 && !lleno ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  Sugerencias:
                </span>
                {pendientes.map((sugerencia) => (
                  <Button
                    key={sugerencia}
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={deshabilitado}
                    onClick={() => {
                      confirmar(sugerencia)
                      volverAlCuadro()
                    }}
                    aria-label={`Agregar ${sugerencia}`}
                    className="font-mono"
                  >
                    <Plus data-icon="inline-start" aria-hidden />
                    {sugerencia}
                  </Button>
                ))}
              </div>
            ) : null}
            <FieldError
              id={idError}
              errors={error ? [{ message: error }] : []}
            />
          </Field>
        )
      }}
    />
  )
}
