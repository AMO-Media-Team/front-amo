"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CircleAlert, CircleCheck, RotateCcw } from "lucide-react"
import { useEffect, useEffectEvent, useId, useRef, useState } from "react"
import {
  FormProvider,
  type Path,
  useForm,
  useFormState,
  useWatch,
} from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { formatearNumero } from "@/lib/format"
import type { ResultadoAccion } from "@/lib/result"
import { cn } from "@/lib/utils"

import type { EstadoTextos } from "../paquete"
import { type EntradaTextosCreativo, esquemaTextosCreativo } from "../schemas"
import {
  contarCaracteres,
  HASHTAG_PUBLICIDAD,
  MAX_COPY,
  MAX_HASHTAGS,
  MAX_MENCIONES,
  normalizarEnlace,
} from "../textos"
import type { VersionCreativo } from "../tipos"
import { CampoFichas } from "./campo-fichas"

/** Pausa tras la última tecla antes de guardar solo. */
export const ESPERA_AUTOGUARDADO_MS = 1200

const CAMPOS: readonly (keyof EntradaTextosCreativo)[] = [
  "copySugerido",
  "hashtags",
  "menciones",
  "enlaceDestino",
]

export function valoresIniciales(
  version: VersionCreativo | null
): EntradaTextosCreativo {
  return {
    copySugerido: version?.copySugerido ?? "",
    hashtags: version?.hashtags ?? [],
    menciones: version?.menciones ?? [],
    enlaceDestino: version?.enlaceDestino ?? "",
  }
}

/** Lo que pasó con el último guardado (lo pendiente se deduce de los valores). */
type Guardado =
  | { tipo: "inicial" | "guardando" | "guardado" }
  | { tipo: "error"; mensaje: string }

type Estado =
  | { tipo: "sin-cambios" | "pendiente" | "guardando" | "guardado" }
  | { tipo: "error"; mensaje: string }

export interface FormularioTextosProps {
  version: VersionCreativo | null
  deshabilitado?: boolean
  /** Guarda los textos (crea la versión si aún no existe). */
  onGuardar: (
    textos: EntradaTextosCreativo
  ) => Promise<ResultadoAccion<VersionCreativo>>
  /** Para el estado del paquete: guardados, pendientes, guardando o inválidos. */
  onEstado?: (estado: EstadoTextos) => void
}

function TextoEstado({ estado }: { estado: Estado }) {
  switch (estado.tipo) {
    case "guardando":
      return (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Spinner role={undefined} aria-hidden className="size-3.5" />
          Guardando…
        </span>
      )
    case "guardado":
      return (
        <span className="inline-flex items-center gap-1.5 text-success">
          <CircleCheck aria-hidden className="size-3.5" />
          Textos guardados
        </span>
      )
    case "error":
      return (
        <span className="inline-flex items-start gap-1.5 text-destructive">
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {estado.mensaje}
        </span>
      )
    case "pendiente":
      return <span className="text-muted-foreground">Cambios sin guardar…</span>
    case "sin-cambios":
      return (
        <span className="text-muted-foreground">
          Se guardan solos mientras escribes.
        </span>
      )
  }
}

function estadoVisible(guardado: Guardado, pendiente: boolean): Estado {
  if (guardado.tipo === "error") return guardado
  if (guardado.tipo === "guardando") return { tipo: "guardando" }
  if (pendiente) return { tipo: "pendiente" }
  return guardado.tipo === "guardado"
    ? { tipo: "guardado" }
    : { tipo: "sin-cambios" }
}

function aEstadoTextos(estado: Estado, invalido: boolean): EstadoTextos {
  if (invalido) return "invalidos"
  if (estado.tipo === "guardando") return "guardando"
  if (estado.tipo === "pendiente" || estado.tipo === "error") {
    return "sin-guardar"
  }
  return "guardados"
}

/** Ids separados por espacio para `aria-describedby` (sin vacíos). */
function ids(...valores: (string | false | null | undefined)[]): string {
  return valores.filter(Boolean).join(" ")
}

/**
 * Copy sugerido, hashtags, menciones y enlace de destino del creativo. Se
 * guardan solos (tras una pausa al escribir y al salir de cada campo) con el
 * MISMO esquema que aplica el servidor. No es un `<form>`: vive dentro del
 * asistente de oferta, que ya lo es.
 */
export function FormularioTextos({
  version,
  deshabilitado = false,
  onGuardar,
  onEstado,
}: FormularioTextosProps) {
  const formulario = useForm({
    resolver: zodResolver(esquemaTextosCreativo),
    defaultValues: valoresIniciales(version),
    mode: "onChange",
  })
  const { control, register, trigger, getValues, setError, setValue } =
    formulario
  const { errors } = useFormState({ control })
  const valores = useWatch({ control })
  const firma = JSON.stringify(valores)
  const [guardadaFirma, setGuardadaFirma] = useState(() =>
    JSON.stringify(valoresIniciales(version))
  )
  const [guardado, setGuardado] = useState<Guardado>({ tipo: "inicial" })
  const ultimaGuardada = useRef(guardadaFirma)
  const enCurso = useRef(false)
  const repetir = useRef(false)
  const id = useId()
  const invalido = Object.keys(errors).length > 0
  const estado = estadoVisible(guardado, firma !== guardadaFirma)

  async function guardar(): Promise<void> {
    if (deshabilitado) return
    if (enCurso.current) {
      repetir.current = true
      return
    }
    enCurso.current = true
    try {
      const textos = getValues()
      const actual = JSON.stringify(textos)
      if (actual === ultimaGuardada.current || !(await trigger())) return
      setGuardado({ tipo: "guardando" })
      const resultado = await onGuardar(textos)
      if (resultado.ok) {
        ultimaGuardada.current = actual
        setGuardadaFirma(actual)
        setGuardado({ tipo: "guardado" })
        return
      }
      for (const [ruta, mensajes] of Object.entries(
        resultado.erroresCampo ?? {}
      )) {
        const campo = ruta.replace(/^textos\./, "").split(".")[0]
        if (CAMPOS.includes(campo as keyof EntradaTextosCreativo)) {
          setError(campo as Path<EntradaTextosCreativo>, {
            message: mensajes[0],
          })
        }
      }
      setGuardado({ tipo: "error", mensaje: resultado.error })
    } catch {
      setGuardado({
        tipo: "error",
        mensaje: "No hay conexión con el servidor. Revisa tu red.",
      })
    } finally {
      enCurso.current = false
      // Lo escrito mientras se guardaba se guarda a continuación.
      if (repetir.current) {
        repetir.current = false
        void guardar()
      }
    }
  }

  function guardarAhora() {
    void guardar()
  }

  // Guardado tras una pausa al escribir (con la versión más reciente de `guardar`).
  const guardarEnPausa = useEffectEvent(() => void guardar())
  useEffect(() => {
    if (firma === ultimaGuardada.current) return
    const espera = setTimeout(guardarEnPausa, ESPERA_AUTOGUARDADO_MS)
    return () => clearTimeout(espera)
  }, [firma])

  const avisar = useEffectEvent((actual: EstadoTextos) => onEstado?.(actual))
  const estadoTextos = aEstadoTextos(estado, invalido)
  useEffect(() => avisar(estadoTextos), [estadoTextos])

  // Al salir (p. ej. a otro paso del asistente) se guarda lo pendiente si es válido.
  const alDesmontar = useEffectEvent(() => {
    const textos = getValues()
    if (enCurso.current || JSON.stringify(textos) === ultimaGuardada.current) {
      return
    }
    if (esquemaTextosCreativo.safeParse(textos).success) void onGuardar(textos)
  })
  useEffect(() => () => alDesmontar(), [])

  const copy = valores.copySugerido ?? ""
  const caracteres = contarCaracteres(copy)
  const idCopy = `${id}-copy`
  const idContadorCopy = `${id}-copy-contador`
  const idAyudaCopy = `${id}-copy-ayuda`
  const idErrorCopy = `${id}-copy-error`
  const idEnlace = `${id}-enlace`
  const idAyudaEnlace = `${id}-enlace-ayuda`
  const idErrorEnlace = `${id}-enlace-error`
  const registroEnlace = register("enlaceDestino")
  const registroCopy = register("copySugerido")

  return (
    <FormProvider {...formulario}>
      <div className="flex flex-col gap-5">
        <Field data-invalid={errors.copySugerido ? true : undefined}>
          <FieldLabel htmlFor={idCopy}>
            Copy sugerido
            <span className="font-normal text-muted-foreground">
              (opcional)
            </span>
          </FieldLabel>
          <Textarea
            id={idCopy}
            rows={5}
            disabled={deshabilitado}
            placeholder="El texto que proponen para la publicación. Cada medio puede adaptarlo a su estilo."
            aria-invalid={errors.copySugerido ? true : undefined}
            aria-describedby={ids(
              idAyudaCopy,
              idContadorCopy,
              errors.copySugerido && idErrorCopy
            )}
            className="max-h-80 min-h-28"
            {...registroCopy}
            onBlur={(evento) => {
              void registroCopy.onBlur(evento)
              guardarAhora()
            }}
          />
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <FieldDescription id={idAyudaCopy} className="min-w-0 flex-1">
              Puedes incluir emojis y saltos de línea.
            </FieldDescription>
            <span
              id={idContadorCopy}
              className={cn(
                "shrink-0 text-xs cifras text-muted-foreground",
                caracteres > MAX_COPY && "font-medium text-destructive"
              )}
            >
              {formatearNumero(caracteres)} de {formatearNumero(MAX_COPY)}{" "}
              caracteres
            </span>
          </div>
          <FieldError id={idErrorCopy} errors={[errors.copySugerido]} />
        </Field>

        <CampoFichas
          nombre="hashtags"
          clase="hashtag"
          etiqueta="Hashtags"
          descripcion="Escribe cada uno y presiona Enter. La etiqueta de publicidad es obligatoria en cada publicación."
          placeholder="#TuMarca"
          maximo={MAX_HASHTAGS}
          sugerencias={[HASHTAG_PUBLICIDAD]}
          deshabilitado={deshabilitado}
          onConfirmar={guardarAhora}
        />

        <CampoFichas
          nombre="menciones"
          clase="mencion"
          etiqueta="Menciones obligatorias"
          descripcion="Cuentas que el medio debe etiquetar, por ejemplo la de tu marca."
          placeholder="@tumarca"
          maximo={MAX_MENCIONES}
          deshabilitado={deshabilitado}
          onConfirmar={guardarAhora}
        />

        <Field data-invalid={errors.enlaceDestino ? true : undefined}>
          <FieldLabel htmlFor={idEnlace}>
            Enlace de destino
            <span className="font-normal text-muted-foreground">
              (opcional)
            </span>
          </FieldLabel>
          <Input
            id={idEnlace}
            type="url"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="done"
            placeholder="https://tumarca.co/promocion"
            disabled={deshabilitado}
            aria-invalid={errors.enlaceDestino ? true : undefined}
            aria-describedby={ids(
              idAyudaEnlace,
              errors.enlaceDestino && idErrorEnlace
            )}
            {...registroEnlace}
            onKeyDown={(evento) => {
              // Enter no envía el asistente: confirma el enlace.
              if (evento.key !== "Enter") return
              evento.preventDefault()
              evento.currentTarget.blur()
            }}
            onBlur={(evento) => {
              const normalizado = normalizarEnlace(evento.target.value)
              if (normalizado !== evento.target.value) {
                setValue("enlaceDestino", normalizado, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              void registroEnlace.onBlur(evento)
              guardarAhora()
            }}
          />
          <FieldDescription id={idAyudaEnlace}>
            A dónde lleva la publicación. Solo enlaces seguros (https://).
          </FieldDescription>
          <FieldError id={idErrorEnlace} errors={[errors.enlaceDestino]} />
        </Field>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <p role="status">
            <TextoEstado estado={estado} />
          </p>
          {estado.tipo === "error" ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={guardarAhora}
            >
              <RotateCcw data-icon="inline-start" aria-hidden />
              Reintentar
            </Button>
          ) : null}
        </div>
      </div>
    </FormProvider>
  )
}
