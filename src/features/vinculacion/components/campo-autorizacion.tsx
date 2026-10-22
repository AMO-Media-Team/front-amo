"use client"

import { ShieldCheck, X } from "lucide-react"
import { useState } from "react"
import { Controller, useFormContext } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { VistaMarkdown } from "@/features/configuracion/components/vista-markdown"
import { formatearFecha } from "@/lib/format"

import type { EntradaSolicitudVinculacion } from "../schemas"
import type { PoliticaDatos } from "../tipos"
import { useDescripcion } from "./campos-publicos"

function DialogoPolitica({
  politica,
  abierto,
  onAbiertoChange,
}: {
  politica: PoliticaDatos
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}) {
  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-lg"
      >
        <DialogHeader className="flex-row items-start gap-3 border-b px-5 py-4 text-left">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <ShieldCheck className="size-5" aria-hidden />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DialogTitle>Política de tratamiento de datos</DialogTitle>
            <DialogDescription>
              Versión {politica.version}, vigente desde el{" "}
              {formatearFecha(politica.vigenteDesde, "largo")}.
            </DialogDescription>
          </div>
          <DialogClose
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Cerrar" />
            }
          >
            <X aria-hidden />
          </DialogClose>
        </DialogHeader>
        {/* Región desplazable con foco: se lee también con el teclado. */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Texto de la política"
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        >
          <VistaMarkdown texto={politica.contenidoMd} />
        </div>
        <DialogFooter className="border-t px-5 py-3">
          <DialogClose render={<Button />}>Entendido</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Autorización expresa del tratamiento de datos (Ley 1581 de 2012), obligatoria
 * para enviar. Si el equipo AMO ya publicó la política vigente, se puede leer
 * sin salir del formulario.
 */
export function CampoAutorizacion({
  politica,
  deshabilitado,
}: {
  politica: PoliticaDatos | null
  deshabilitado: boolean
}) {
  const { control } = useFormContext<EntradaSolicitudVinculacion>()
  const [leyendo, setLeyendo] = useState(false)
  const { id, idAyuda, idError } = useDescripcion(true, true)

  return (
    <>
      <Controller
        control={control}
        name="autorizaDatos"
        render={({ field, fieldState }) => (
          <Field
            orientation="horizontal"
            data-invalid={fieldState.invalid || undefined}
            className="rounded-xl border bg-card/40 p-3.5 sm:p-4"
          >
            <Checkbox
              id={id}
              ref={field.ref}
              checked={field.value === true}
              onCheckedChange={(valor) => {
                field.onChange(valor === true)
                field.onBlur()
              }}
              disabled={deshabilitado}
              aria-invalid={fieldState.invalid || undefined}
              aria-describedby={
                fieldState.invalid ? `${idAyuda} ${idError}` : idAyuda
              }
              className="mt-0.5"
            />
            <FieldContent className="gap-1.5">
              <FieldLabel htmlFor={id} className="leading-snug">
                Autorizo a AMO a tratar mis datos personales
              </FieldLabel>
              <FieldDescription id={idAyuda}>
                Los usaremos solo para revisar esta solicitud y contactarte,
                como lo establece la Ley 1581 de 2012. Puedes pedir que los
                corrijamos o eliminemos cuando quieras.
                {politica ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => setLeyendo(true)}
                      className="rounded-sm font-medium text-primary underline underline-offset-4 outline-none hover:text-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      Lee la política de tratamiento de datos
                    </button>
                    .
                  </>
                ) : null}
              </FieldDescription>
              <FieldError id={idError} errors={[fieldState.error]} />
            </FieldContent>
          </Field>
        )}
      />
      {politica ? (
        <DialogoPolitica
          politica={politica}
          abierto={leyendo}
          onAbiertoChange={setLeyendo}
        />
      ) : null}
    </>
  )
}
