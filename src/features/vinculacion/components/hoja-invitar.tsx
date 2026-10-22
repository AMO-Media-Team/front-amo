"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  CircleAlert,
  KeyRound,
  Link2,
  type LucideIcon,
  MailPlus,
  X,
} from "lucide-react"
import { type ComponentProps, useMemo, useState, useTransition } from "react"
import {
  Controller,
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
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
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { CampoMunicipio } from "@/features/gestion-medios/components/campo-municipio"
import { TIPOS_MEDIO } from "@/features/operacion/estados"
import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"
import { Constants } from "@/types/database.types"

import { invitarSolicitud } from "../actions"
import {
  MEDIO_NUEVO,
  opcionesMedio,
  type SolicitudParaInvitar,
  valoresInvitacion,
} from "../invitacion"
import {
  CAMPOS_INVITAR,
  type EntradaInvitarSolicitud,
  esquemaInvitarSolicitud,
} from "../schemas"
import { useColaSolicitudes } from "./proveedor-cola"
import { useFocoTrasEnvio } from "./use-foco-tras-envio"

const OPCIONES_TIPO = Constants.public.Enums.medio_tipo.map((tipo) => ({
  value: tipo,
  label: TIPOS_MEDIO[tipo],
}))

function OpcionRadio({
  id,
  valor,
  titulo,
  descripcion,
  icono: Icono,
  insignia,
}: {
  id: string
  valor: string
  titulo: string
  descripcion: string
  icono?: LucideIcon
  insignia?: string
}) {
  return (
    <FieldLabel htmlFor={id}>
      <Field orientation="horizontal">
        {Icono ? (
          <Icono className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        ) : null}
        <FieldContent>
          <FieldTitle className="flex-wrap">
            <span className="break-words">{titulo}</span>
            {insignia ? (
              <Badge
                variant="secondary"
                className="h-4.5 px-1.5 text-[0.6875rem]"
              >
                {insignia}
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

function CampoTexto({
  nombre,
  etiqueta,
  ayuda,
  opcional = false,
  deshabilitado,
  ...input
}: {
  nombre: "nombreMedio" | "contactoNombre" | "email" | "celular"
  etiqueta: string
  ayuda?: string
  opcional?: boolean
  deshabilitado: boolean
} & Pick<
  ComponentProps<"input">,
  "type" | "inputMode" | "autoComplete" | "spellCheck"
>) {
  const { register, getFieldState, formState } =
    useFormContext<EntradaInvitarSolicitud>()
  const { error, invalid } = getFieldState(nombre, formState)
  const id = `invitar-${nombre}`
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>
        {etiqueta}
        {opcional ? (
          <span className="font-normal text-muted-foreground">(opcional)</span>
        ) : null}
      </FieldLabel>
      <Input
        id={id}
        disabled={deshabilitado}
        aria-invalid={invalid || undefined}
        aria-describedby={
          [ayuda ? `${id}-ayuda` : null, invalid ? `${id}-error` : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        {...input}
        {...register(nombre)}
      />
      {ayuda ? (
        <FieldDescription id={`${id}-ayuda`}>{ayuda}</FieldDescription>
      ) : null}
      <FieldError id={`${id}-error`} errors={[error]} />
    </Field>
  )
}

function CampoTipo({ deshabilitado }: { deshabilitado: boolean }) {
  const { control } = useFormContext<EntradaInvitarSolicitud>()
  return (
    <Controller
      control={control}
      name="tipo"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor="invitar-tipo">Tipo de medio</FieldLabel>
          <Select
            value={field.value || null}
            onValueChange={(valor) => field.onChange(valor ?? "")}
            items={OPCIONES_TIPO}
            disabled={deshabilitado}
          >
            <SelectTrigger
              id="invitar-tipo"
              ref={field.ref}
              onBlur={field.onBlur}
              aria-invalid={fieldState.invalid || undefined}
              aria-describedby={
                fieldState.invalid ? "invitar-tipo-error" : undefined
              }
              className="w-full"
            >
              <SelectValue placeholder="Elige el tipo" />
            </SelectTrigger>
            <SelectContent>
              {OPCIONES_TIPO.map((opcion) => (
                <SelectItem key={opcion.value} value={opcion.value}>
                  {opcion.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="invitar-tipo-error" errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}

function CampoRol({
  roles,
  deshabilitado,
}: {
  roles: readonly { id: string; nombre: string }[]
  deshabilitado: boolean
}) {
  const { control } = useFormContext<EntradaInvitarSolicitud>()
  if (roles.length === 1) {
    return (
      <FieldDescription>
        Entrará con el rol «{roles[0].nombre}».
      </FieldDescription>
    )
  }
  const opciones = roles.map((rol) => ({ value: rol.id, label: rol.nombre }))
  return (
    <Controller
      control={control}
      name="rolId"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor="invitar-rol">Rol</FieldLabel>
          <Select
            value={field.value || null}
            onValueChange={(valor) => field.onChange(valor ?? "")}
            items={opciones}
            disabled={deshabilitado}
          >
            <SelectTrigger
              id="invitar-rol"
              ref={field.ref}
              onBlur={field.onBlur}
              aria-invalid={fieldState.invalid || undefined}
              aria-describedby={
                fieldState.invalid ? "invitar-rol-error" : undefined
              }
              className="w-full"
            >
              <SelectValue placeholder="Elige el rol" />
            </SelectTrigger>
            <SelectContent>
              {opciones.map((opcion) => (
                <SelectItem key={opcion.value} value={opcion.value}>
                  {opcion.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="invitar-rol-error" errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}

type CampoInvitar = (typeof CAMPOS_INVITAR)[number]

interface MedioRegistrado {
  id: string
  nombre: string
}

function FormularioInvitar({
  solicitud,
  onInvitada,
  onSucio,
}: {
  solicitud: SolicitudParaInvitar
  onInvitada: () => void
  onSucio: (sucio: boolean) => void
}) {
  const { capacidades, roles, smtpConfigurado, mostrarCredencial } =
    useColaSolicitudes()
  const formulario = useForm({
    resolver: zodResolver(esquemaInvitarSolicitud),
    defaultValues: valoresInvitacion(solicitud, roles, capacidades),
    mode: "onTouched",
  })
  const {
    control,
    formState,
    handleSubmit,
    getValues,
    setError,
    setFocus,
    setValue,
  } = formulario
  const [pendiente, iniciar] = useTransition()
  // Medio que quedó registrado en un intento cuya cuenta falló: se reutiliza.
  const [registrado, setRegistrado] = useState<MedioRegistrado | null>(null)
  const medioElegido = useWatch({ control, name: "medioExistenteId" })
  const opciones = useMemo(
    () =>
      opcionesMedio(
        solicitud,
        solicitud.coincidencias,
        capacidades.registrarMedio,
        registrado
      ),
    [solicitud, capacidades.registrarMedio, registrado]
  )
  const errorServidor = formState.errors.root?.servidor?.message
  const errorMedio = formState.errors.medioExistenteId?.message

  const enfocarTrasEnvio = useFocoTrasEnvio<CampoInvitar>(pendiente, setFocus)

  // Se envían los valores tal como se escribieron: el servidor aplica el
  // MISMO esquema (con sus transformaciones) que acaba de validar el cliente.
  const enviar = handleSubmit(() =>
    iniciar(async () => {
      const entrada = getValues()
      const resultado = await invitarSolicitud(entrada)
      if (!resultado.ok) {
        if ("medioRegistrado" in resultado && resultado.medioRegistrado) {
          setRegistrado(resultado.medioRegistrado)
          setValue("medioExistenteId", resultado.medioRegistrado.id)
        }
        aplicarErroresServidor(setError, resultado, CAMPOS_INVITAR)
        // Que el medio sí quedó registrado se dice aunque el error sea de un campo.
        if ("medioRegistrado" in resultado && resultado.medioRegistrado) {
          setError("root.servidor", {
            type: "server",
            message: resultado.error,
          })
        }
        enfocarTrasEnvio(
          CAMPOS_INVITAR.find((campo) => resultado.erroresCampo?.[campo]) ??
            null
        )
        return
      }
      const { medio, email, credencial, advertencia } = resultado.datos
      onSucio(false)
      onInvitada()
      toast.success("Solicitud atendida", {
        description:
          entrada.medioExistenteId === MEDIO_NUEVO
            ? `Registramos «${medio.nombre}» e invitamos a ${email}.`
            : `Invitamos a ${email} a «${medio.nombre}».`,
      })
      if (advertencia) toast.warning(advertencia, { duration: 15_000 })
      mostrarCredencial({ credencial, email, motivo: "alta" })
    })
  )

  return (
    <FormProvider {...formulario}>
      <form
        onSubmit={enviar}
        onChange={() => onSucio(true)}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
        aria-describedby={errorServidor ? "invitar-error" : undefined}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
          {errorServidor ? (
            <Alert variant="destructive" id="invitar-error" role="alert">
              <CircleAlert aria-hidden />
              <AlertDescription>{errorServidor}</AlertDescription>
            </Alert>
          ) : null}

          <FieldSet>
            <FieldLegend variant="label">Medio</FieldLegend>
            {opciones.length > 1 ? (
              <Controller
                control={control}
                name="medioExistenteId"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={(valor) => {
                      field.onChange(valor)
                      onSucio(true)
                    }}
                    disabled={pendiente}
                    aria-label="Medio al que se vincula la persona"
                    aria-invalid={errorMedio ? true : undefined}
                  >
                    {opciones.map((opcion, indice) => (
                      <OpcionRadio
                        key={opcion.valor || "nuevo"}
                        id={`invitar-medio-${indice}`}
                        valor={opcion.valor}
                        titulo={opcion.titulo}
                        descripcion={opcion.descripcion}
                      />
                    ))}
                  </RadioGroup>
                )}
              />
            ) : opciones[0] && opciones[0].valor !== MEDIO_NUEVO ? (
              <FieldDescription>
                Se vinculará a «{opciones[0].titulo}» ({opciones[0].descripcion}
                ).
              </FieldDescription>
            ) : (
              <FieldDescription>
                Se registrará como medio nuevo, en verificación, con estos
                datos.
              </FieldDescription>
            )}
            {errorMedio ? <FieldError>{errorMedio}</FieldError> : null}

            {medioElegido === MEDIO_NUEVO ? (
              <div className="flex flex-col gap-4 rounded-xl border bg-muted/20 p-4">
                <CampoTexto
                  nombre="nombreMedio"
                  etiqueta="Nombre del medio"
                  autoComplete="off"
                  deshabilitado={pendiente}
                />
                <CampoTipo deshabilitado={pendiente} />
                <CampoMunicipio deshabilitado={pendiente} />
              </div>
            ) : null}
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">Persona de contacto</FieldLegend>
            <CampoTexto
              nombre="contactoNombre"
              etiqueta="Nombre"
              autoComplete="off"
              deshabilitado={pendiente}
            />
            <CampoTexto
              nombre="email"
              etiqueta="Correo electrónico"
              type="email"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              ayuda="Será su usuario para ingresar a AMO."
              deshabilitado={pendiente}
            />
            <CampoTexto
              nombre="celular"
              etiqueta="Celular"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              opcional
              deshabilitado={pendiente}
            />
            <CampoRol roles={roles} deshabilitado={pendiente} />
          </FieldSet>

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
                  <OpcionRadio
                    id="invitar-metodo-enlace"
                    valor="ENLACE"
                    titulo="Enlace de invitación"
                    icono={Link2}
                    insignia="Recomendado"
                    descripcion={
                      smtpConfigurado
                        ? "Le enviamos un enlace de un solo uso por correo para que cree su contraseña."
                        : "Generamos un enlace de un solo uso para que cree su contraseña; tú se lo compartes."
                    }
                  />
                  <OpcionRadio
                    id="invitar-metodo-contrasena"
                    valor="CONTRASENA"
                    titulo="Contraseña temporal"
                    icono={KeyRound}
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
          <Button type="submit" disabled={pendiente}>
            {pendiente ? (
              <Spinner aria-label="Invitando" data-icon="inline-start" />
            ) : (
              <MailPlus data-icon="inline-start" aria-hidden />
            )}
            Invitar
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  )
}

/**
 * Hoja «Invitar»: llega con los datos de la solicitud listos para confirmar.
 * Registra el medio (o usa el elegido), crea la cuenta de la persona de
 * contacto con la organización fija y marca la solicitud INVITADA. Si hay
 * cambios sin enviar, pide confirmación antes de cerrar.
 */
export function HojaInvitar({
  solicitud,
  abierta,
  onAbiertaChange,
}: {
  solicitud: SolicitudParaInvitar
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
              <MailPlus className="size-5" aria-hidden />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <SheetTitle className="text-base font-semibold break-words">
                Invitar a {solicitud.nombreMedio}
              </SheetTitle>
              <SheetDescription>
                Creamos la cuenta de {solicitud.contactoNombre} vinculada al
                medio. Revisa los datos y confirma.
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
          {/* El contenido se desmonta al cerrar: cada apertura empieza limpia. */}
          <FormularioInvitar
            solicitud={solicitud}
            onSucio={setSucio}
            onInvitada={() => {
              setSucio(false)
              onAbiertaChange(false)
            }}
          />
        </SheetContent>
      </Sheet>

      <DialogoConfirmacion
        abierto={confirmarDescarte}
        onAbiertoChange={setConfirmarDescarte}
        titulo="¿Descartar los cambios?"
        descripcion="La solicitud seguirá en la cola sin atender."
        textoConfirmar="Descartar cambios"
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
