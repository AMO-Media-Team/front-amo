"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CircleAlert, Save, UserPen, X } from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"

import { editarUsuario } from "../actions"
import { nombreVisible } from "../presentacion"
import { puedeCambiarRol } from "../reglas-acciones"
import {
  conReglasDeRol,
  type EntradaEditarUsuario,
  esquemaEditarUsuario,
} from "../schemas"
import type { UsuarioDetalle } from "../tipos"
import { CamposUsuario, faltaOrganizacion } from "./campos-usuario"
import { useGestionUsuarios } from "./contexto-gestion"
import { aplicarErroresServidor } from "./errores-formulario"

const CAMPOS = ["nombre", "celular", "rolId", "organizacionId"] as const

function valoresDe(usuario: UsuarioDetalle): EntradaEditarUsuario {
  return {
    usuarioId: usuario.id,
    nombre: usuario.nombre ?? "",
    celular: usuario.celular ?? "",
    rolId: usuario.rol?.id ?? "",
    organizacionId: usuario.anuncianteId ?? usuario.medioId,
  }
}

function FormularioEditarUsuario({
  usuario,
  onGuardado,
  onSucio,
}: {
  usuario: UsuarioDetalle
  onGuardado: () => void
  onSucio: (sucio: boolean) => void
}) {
  const { actor, rolesAsignables, organizaciones } = useGestionUsuarios()
  const esquema = useMemo(
    () => conReglasDeRol(esquemaEditarUsuario, rolesAsignables),
    [rolesAsignables]
  )
  const formulario = useForm({
    resolver: zodResolver(esquema),
    defaultValues: valoresDe(usuario),
    mode: "onTouched",
  })
  const { control, formState, handleSubmit, getValues, setError } = formulario
  const [pendiente, iniciar] = useTransition()
  const rolId = useWatch({ control, name: "rolId" })
  const bloqueado = faltaOrganizacion(rolesAsignables, organizaciones, rolId)
  const errorServidor = formState.errors.root?.servidor?.message

  const enviar = handleSubmit(() =>
    iniciar(async () => {
      const resultado = await editarUsuario(getValues())
      if (!resultado.ok) {
        aplicarErroresServidor(setError, resultado, CAMPOS)
        return
      }
      onSucio(false)
      toast.success("Cambios guardados", {
        description: nombreVisible(usuario),
      })
      onGuardado()
    })
  )

  return (
    <FormProvider {...formulario}>
      <form
        onSubmit={enviar}
        onChange={() => onSucio(true)}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
          {errorServidor ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden />
              <AlertDescription>{errorServidor}</AlertDescription>
            </Alert>
          ) : null}

          <Field>
            <FieldLabel htmlFor="usuario-email-lectura">
              Correo electrónico
            </FieldLabel>
            <Input
              id="usuario-email-lectura"
              value={usuario.email}
              readOnly
              disabled
            />
            <FieldDescription>
              El correo identifica la cuenta y no se puede cambiar desde aquí.
            </FieldDescription>
          </Field>

          <CamposUsuario
            roles={rolesAsignables}
            organizaciones={organizaciones}
            rolBloqueado={!puedeCambiarRol(actor, usuario.id)}
            deshabilitado={pendiente}
          />
        </div>

        <SheetFooter className="border-t bg-muted/30 sm:flex-row sm:justify-end">
          <SheetClose
            render={
              <Button variant="outline" type="button" disabled={pendiente} />
            }
          >
            Cancelar
          </SheetClose>
          <Button
            type="submit"
            disabled={pendiente || bloqueado || !formState.isDirty}
          >
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

/** Hoja lateral de edición (nombre, celular, rol y organización). */
export function HojaEditarUsuario({
  usuario,
  abierta,
  onAbiertaChange,
}: {
  usuario: UsuarioDetalle
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
}) {
  const [sucio, setSucio] = useState(false)
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)

  function cambiarAbierta(valor: boolean) {
    if (!valor && sucio) {
      setConfirmarDescarte(true)
      return
    }
    setSucio(false)
    onAbiertaChange(valor)
  }

  return (
    <>
      <Sheet open={abierta} onOpenChange={cambiarAbierta}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full gap-0 data-[side=right]:sm:max-w-md"
        >
          <SheetHeader className="flex-row items-start gap-3 border-b px-5 py-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
              <UserPen className="size-5" aria-hidden />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <SheetTitle className="text-base font-semibold">
                Editar usuario
              </SheetTitle>
              <SheetDescription className="truncate">
                {nombreVisible(usuario)}
              </SheetDescription>
            </div>
            <SheetClose
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Cerrar" />
              }
            >
              <X aria-hidden />
            </SheetClose>
          </SheetHeader>
          {/* Base UI desmonta el contenido al cerrar: cada apertura parte de los datos actuales. */}
          <FormularioEditarUsuario
            usuario={usuario}
            onSucio={setSucio}
            onGuardado={() => onAbiertaChange(false)}
          />
        </SheetContent>
      </Sheet>

      <DialogoConfirmacion
        abierto={confirmarDescarte}
        onAbiertoChange={setConfirmarDescarte}
        titulo="¿Descartar los cambios?"
        descripcion="Perderás lo que modificaste en este usuario."
        textoConfirmar="Descartar"
        textoCancelar="Seguir editando"
        destructivo
        onConfirmar={() => {
          setSucio(false)
          onAbiertaChange(false)
        }}
      />
    </>
  )
}
