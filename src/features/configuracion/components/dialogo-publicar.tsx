"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Send, TriangleAlert } from "lucide-react"
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { ControlSegmentado } from "@/features/roles/components/control-segmentado"

import { publicarVersionTerminos } from "../actions"
import { valoresPublicarTerminos } from "../formularios"
import { NOMBRES_TERMINOS } from "../presentacion"
import {
  type EntradaPublicarTerminos,
  esquemaPublicarTerminos,
  TEXTO_CONFIRMAR_PUBLICACION,
} from "../schemas"
import type { VersionTerminos } from "../tipos"
import { hoyBogota } from "../vigencias"
import { CampoFecha, CampoHora, CampoTexto } from "./campos"
import { useEnvio } from "./use-envio"

const CAMPOS = [
  "dia",
  "hora",
  "confirmacion",
] as const satisfies readonly (keyof EntradaPublicarTerminos)[]

/**
 * Publicar un borrador: ahora o en una fecha. Es irreversible (la versión
 * queda inmutable y las personas deberán aceptarla), por eso pide escribir
 * PUBLICAR.
 */
export function DialogoPublicar({
  version,
  onCerrar,
}: {
  version: VersionTerminos | null
  onCerrar: () => void
}) {
  return (
    <Dialog
      open={version !== null}
      onOpenChange={(abierto) => !abierto && onCerrar()}
    >
      <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-md">
        {version ? (
          <FormularioPublicar version={version} onCerrar={onCerrar} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function FormularioPublicar({
  version,
  onCerrar,
}: {
  version: VersionTerminos
  onCerrar: () => void
}) {
  const formulario = useForm({
    resolver: zodResolver(esquemaPublicarTerminos),
    defaultValues: valoresPublicarTerminos(version),
    mode: "onTouched",
  })
  const { control } = formulario
  const inmediata = useWatch({ control, name: "inmediata" })
  const { enviar, pendiente, errorGeneral } = useEnvio({
    formulario,
    accion: publicarVersionTerminos,
    campos: CAMPOS,
    onExito: () => {
      toast.success(`Versión ${version.version} publicada`, {
        description: inmediata
          ? "Ya está vigente."
          : "Entrará en vigor en la fecha elegida.",
      })
      onCerrar()
    },
  })
  const documento = NOMBRES_TERMINOS[version.tipo].titulo

  return (
    <FormProvider {...formulario}>
      <form onSubmit={enviar} noValidate>
        <DialogHeader className="flex-row items-start gap-3 border-b px-5 py-4 text-left">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary"
          >
            <Send className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle className="text-base font-semibold">
              Publicar la versión {version.version}
            </DialogTitle>
            <DialogDescription>{documento}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-5 px-5 py-4">
          <p className="flex gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-sm text-pretty">
            <TriangleAlert
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-warning"
            />
            Una vez publicada no se puede editar ni borrar, y quienes usan la
            plataforma deberán aceptarla.
          </p>

          <Controller
            control={control}
            name="inmediata"
            render={({ field }) => (
              <Field>
                <FieldLabel>Entra en vigor</FieldLabel>
                <ControlSegmentado
                  etiqueta="Cuándo entra en vigor"
                  opciones={[
                    { valor: "ahora", etiqueta: "Al publicar" },
                    { valor: "fecha", etiqueta: "En una fecha" },
                  ]}
                  valor={field.value ? "ahora" : "fecha"}
                  onCambio={(valor) => field.onChange(valor === "ahora")}
                />
                <FieldDescription>Hora de Colombia.</FieldDescription>
              </Field>
            )}
          />
          {inmediata ? null : (
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <CampoFecha
                nombre="dia"
                etiqueta="Día"
                minimo={hoyBogota()}
                deshabilitado={pendiente}
              />
              <CampoHora
                nombre="hora"
                etiqueta="Hora"
                deshabilitado={pendiente}
              />
            </div>
          )}

          <CampoTexto
            nombre="confirmacion"
            etiqueta={
              <>
                Escribe{" "}
                <span className="font-mono font-semibold">
                  {TEXTO_CONFIRMAR_PUBLICACION}
                </span>{" "}
                para confirmar
              </>
            }
            mayusculas
            deshabilitado={pendiente}
          />

          {errorGeneral ? (
            <p role="alert" className="text-sm text-destructive">
              {errorGeneral}
            </p>
          ) : null}
        </div>

        <DialogFooter className="mx-0 mb-0 bg-muted/30 px-5 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={onCerrar}
            disabled={pendiente}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={pendiente}>
            {pendiente ? (
              <Spinner aria-label="Publicando" data-icon="inline-start" />
            ) : (
              <Send data-icon="inline-start" aria-hidden />
            )}
            Publicar
          </Button>
        </DialogFooter>
      </form>
    </FormProvider>
  )
}
