"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CircleAlert, KeyRound, Link2, UserPlus, X } from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"

import { crearUsuario } from "../actions"
import {
  conReglasDeRol,
  type EntradaCrearUsuario,
  esquemaCrearUsuario,
} from "../schemas"
import type { MetodoAlta } from "../tipos"
import { CamposUsuario, faltaOrganizacion } from "./campos-usuario"
import { useGestionUsuarios } from "./contexto-gestion"
import {
  type CredencialParaMostrar,
  DialogoCredencial,
} from "./dialogo-credencial"
import { aplicarErroresServidor } from "./errores-formulario"

const VALORES_INICIALES: EntradaCrearUsuario = {
  nombre: "",
  email: "",
  celular: "",
  rolId: "",
  organizacionId: null,
  metodo: "ENLACE",
}

const CAMPOS = [
  "nombre",
  "email",
  "celular",
  "rolId",
  "organizacionId",
  "metodo",
] as const

function OpcionMetodo({
  valor,
  titulo,
  descripcion,
  Icono,
  recomendado = false,
}: {
  valor: MetodoAlta
  titulo: string
  descripcion: string
  Icono: typeof Link2
  recomendado?: boolean
}) {
  const id = `metodo-${valor.toLowerCase()}`
  return (
    <FieldLabel htmlFor={id}>
      <Field orientation="horizontal">
        <Icono className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <FieldContent>
          <FieldTitle>
            {titulo}
            {recomendado ? (
              <Badge
                variant="secondary"
                className="h-4.5 px-1.5 text-[0.6875rem]"
              >
                Recomendado
              </Badge>
            ) : null}
          </FieldTitle>
          <FieldDescription>{descripcion}</FieldDescription>
        </FieldContent>
        <RadioGroupItem value={valor} id={id} />
      </Field>
    </FieldLabel>
  )
}

function FormularioCrearUsuario({
  onCreado,
  onSucio,
}: {
  onCreado: (datos: CredencialParaMostrar) => void
  onSucio: (sucio: boolean) => void
}) {
  const { rolesAsignables, organizaciones, smtpConfigurado } =
    useGestionUsuarios()
  const esquema = useMemo(
    () => conReglasDeRol(esquemaCrearUsuario, rolesAsignables),
    [rolesAsignables]
  )
  const formulario = useForm({
    resolver: zodResolver(esquema),
    defaultValues: VALORES_INICIALES,
    mode: "onTouched",
  })
  const { control, register, formState, handleSubmit, getValues, setError } =
    formulario
  const [pendiente, iniciar] = useTransition()
  const rolId = useWatch({ control, name: "rolId" })
  const bloqueado = faltaOrganizacion(rolesAsignables, organizaciones, rolId)
  const errorServidor = formState.errors.root?.servidor?.message

  // Se envían los valores tal como se escribieron: el servidor aplica el MISMO
  // esquema (con sus transformaciones) que acaba de validar el cliente.
  const enviar = handleSubmit(() =>
    iniciar(async () => {
      const entrada = getValues()
      const resultado = await crearUsuario(entrada)
      if (!resultado.ok) {
        aplicarErroresServidor(setError, resultado, CAMPOS)
        return
      }
      onSucio(false)
      toast.success("Usuario creado", { description: resultado.datos.email })
      onCreado({
        credencial: resultado.datos.credencial,
        email: resultado.datos.email,
        motivo: "alta",
      })
    })
  )

  return (
    <FormProvider {...formulario}>
      <form
        onSubmit={enviar}
        onChange={() => onSucio(true)}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
        aria-describedby={errorServidor ? "crear-usuario-error" : undefined}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
          {errorServidor ? (
            <Alert variant="destructive" id="crear-usuario-error">
              <CircleAlert aria-hidden />
              <AlertDescription>{errorServidor}</AlertDescription>
            </Alert>
          ) : null}

          <Field data-invalid={formState.errors.email ? true : undefined}>
            <FieldLabel htmlFor="usuario-email">Correo electrónico</FieldLabel>
            <Input
              id="usuario-email"
              type="email"
              autoComplete="off"
              inputMode="email"
              autoFocus
              disabled={pendiente}
              aria-invalid={formState.errors.email ? true : undefined}
              {...register("email")}
            />
            <FieldDescription>
              Será su usuario para ingresar a AMO.
            </FieldDescription>
            <FieldError errors={[formState.errors.email]} />
          </Field>

          <CamposUsuario
            roles={rolesAsignables}
            organizaciones={organizaciones}
            deshabilitado={pendiente}
          />

          <Controller
            control={control}
            name="metodo"
            render={({ field }) => (
              <FieldSet>
                <FieldLegend variant="label">Método de acceso</FieldLegend>
                <RadioGroup
                  value={field.value}
                  onValueChange={(valor) => {
                    field.onChange(valor)
                    onSucio(true)
                  }}
                  disabled={pendiente}
                >
                  <OpcionMetodo
                    valor="ENLACE"
                    titulo="Enlace de invitación"
                    Icono={Link2}
                    recomendado
                    descripcion={
                      smtpConfigurado
                        ? "Le enviamos un enlace de un solo uso por correo para que cree su contraseña."
                        : "Generamos un enlace de un solo uso para que cree su contraseña; tú se lo compartes."
                    }
                  />
                  <OpcionMetodo
                    valor="CONTRASENA"
                    titulo="Contraseña temporal"
                    Icono={KeyRound}
                    descripcion="Generamos una contraseña segura; deberá cambiarla al primer ingreso."
                  />
                </RadioGroup>
              </FieldSet>
            )}
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
          <Button type="submit" disabled={pendiente || bloqueado}>
            {pendiente ? (
              <Spinner aria-label="Creando" data-icon="inline-start" />
            ) : (
              <UserPlus data-icon="inline-start" aria-hidden />
            )}
            Crear usuario
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  )
}

/**
 * Botón "Crear usuario" + hoja lateral con el formulario. Tras crearlo muestra
 * UNA vez el enlace o la contraseña temporal. Si hay datos sin guardar, pide
 * confirmación antes de cerrar.
 */
export function BotonCrearUsuario() {
  const [abierta, setAbierta] = useState(false)
  const [sucio, setSucio] = useState(false)
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)
  const [credencial, setCredencial] = useState<CredencialParaMostrar | null>(
    null
  )
  // Remontar el formulario en cada apertura lo deja limpio.
  const [version, setVersion] = useState(0)

  function cambiarAbierta(valor: boolean) {
    if (!valor && sucio) {
      setConfirmarDescarte(true)
      return
    }
    if (valor) setVersion((actual) => actual + 1)
    setSucio(false)
    setAbierta(valor)
  }

  return (
    <>
      <Sheet open={abierta} onOpenChange={cambiarAbierta}>
        <SheetTrigger render={<Button />}>
          <UserPlus data-icon="inline-start" aria-hidden />
          Crear usuario
        </SheetTrigger>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full gap-0 data-[side=right]:sm:max-w-md"
        >
          <SheetHeader className="flex-row items-start gap-3 border-b px-5 py-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
              <UserPlus className="size-5" aria-hidden />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <SheetTitle className="text-base font-semibold">
                Nuevo usuario
              </SheetTitle>
              <SheetDescription>
                Invita a una persona y define qué puede hacer en AMO.
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
          <FormularioCrearUsuario
            key={version}
            onSucio={setSucio}
            onCreado={(datos) => {
              setAbierta(false)
              setCredencial(datos)
            }}
          />
        </SheetContent>
      </Sheet>

      <DialogoConfirmacion
        abierto={confirmarDescarte}
        onAbiertoChange={setConfirmarDescarte}
        titulo="¿Descartar el nuevo usuario?"
        descripcion="Perderás los datos que escribiste."
        textoConfirmar="Descartar"
        textoCancelar="Seguir editando"
        destructivo
        onConfirmar={() => {
          setSucio(false)
          setAbierta(false)
        }}
      />

      <DialogoCredencial
        datos={credencial}
        onCerrar={() => setCredencial(null)}
      />
    </>
  )
}
