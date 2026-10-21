"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CircleAlert, Lock, Save } from "lucide-react"
import { useEffect, useTransition } from "react"
import { FormProvider, useForm } from "react-hook-form"

import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { SheetClose, SheetFooter } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"

import { editarRol } from "../actions"
import { type EntradaEditarRol, esquemaEditarRol } from "../schemas"
import type { RolListado } from "../tipos"
import {
  CampoDescripcion,
  CampoMfa,
  SelectorColor,
  VistaPreviaRol,
} from "./campos-rol"

const CAMPOS = ["nombre", "descripcion", "color", "requiereMfa"] as const

/**
 * Edición de un rol. La clave y el tipo son permanentes; de un rol de sistema
 * solo se cambian la descripción y el color (la BD rechaza lo demás).
 */
export function FormularioEditarRol({
  rol,
  onGuardado,
  onSucio,
}: {
  rol: RolListado
  onGuardado: () => void
  onSucio: (sucio: boolean) => void
}) {
  const valores: EntradaEditarRol = {
    rolId: rol.id,
    nombre: rol.nombre,
    descripcion: rol.descripcion ?? "",
    color: rol.color,
    requiereMfa: rol.requiereMfa,
  }
  const formulario = useForm({
    resolver: zodResolver(esquemaEditarRol),
    defaultValues: valores,
    mode: "onTouched",
  })
  const { register, formState, handleSubmit, getValues, setError } = formulario
  const [pendiente, iniciar] = useTransition()
  const errorServidor = formState.errors.root?.servidor?.message
  const sucio = formState.isDirty

  // La hoja pide confirmación antes de cerrarse con cambios sin guardar.
  useEffect(() => onSucio(sucio), [sucio, onSucio])
  const soloApariencia = rol.esSistema

  const enviar = handleSubmit(() =>
    iniciar(async () => {
      const resultado = await editarRol(getValues())
      if (!resultado.ok) {
        aplicarErroresServidor(setError, resultado, CAMPOS)
        return
      }
      onSucio(false)
      onGuardado()
    })
  )

  return (
    <FormProvider {...formulario}>
      <form
        onSubmit={enviar}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
        aria-describedby={errorServidor ? "editar-rol-error" : undefined}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
          <VistaPreviaRol clave={rol.clave} tipo={rol.tipo} />

          {soloApariencia ? (
            <Alert>
              <Lock aria-hidden />
              <AlertTitle>Rol de sistema</AlertTitle>
              <AlertDescription>
                Solo puedes cambiar su descripción y su color. El nombre, la
                verificación en dos pasos y los permisos vienen con la
                plataforma.
              </AlertDescription>
            </Alert>
          ) : null}

          {errorServidor ? (
            <Alert variant="destructive" id="editar-rol-error">
              <CircleAlert aria-hidden />
              <AlertDescription>{errorServidor}</AlertDescription>
            </Alert>
          ) : null}

          <Field data-invalid={formState.errors.nombre ? true : undefined}>
            <FieldLabel htmlFor="rol-nombre">Nombre</FieldLabel>
            <Input
              id="rol-nombre"
              autoComplete="off"
              maxLength={60}
              disabled={pendiente || soloApariencia}
              aria-invalid={formState.errors.nombre ? true : undefined}
              {...register("nombre")}
            />
            <FieldDescription>
              Clave{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                {rol.clave}
              </code>{" "}
              · permanente
            </FieldDescription>
            <FieldError errors={[formState.errors.nombre]} />
          </Field>

          <CampoDescripcion
            deshabilitado={pendiente}
            error={formState.errors.descripcion}
          />

          <CampoMfa
            tipo={rol.tipo}
            deshabilitado={pendiente || soloApariencia}
          />

          <SelectorColor deshabilitado={pendiente} />
        </div>

        <SheetFooter className="border-t bg-muted/30 sm:flex-row sm:justify-end">
          <SheetClose
            render={
              <Button variant="outline" type="button" disabled={pendiente} />
            }
          >
            Cancelar
          </SheetClose>
          <Button type="submit" disabled={pendiente || !formState.isDirty}>
            {pendiente ? (
              <Spinner aria-label="Guardando" data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" aria-hidden />
            )}
            Guardar cambios
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  )
}
