"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { RefreshCw, TriangleAlert, UserRound } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useId, useMemo, useTransition } from "react"
import {
  FormProvider,
  useForm,
  useFormContext,
  useFormState,
} from "react-hook-form"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { CampoTexto } from "@/features/configuracion/components/campos"
import { useEnvio } from "@/features/configuracion/components/use-envio"
import {
  BarraGuardar,
  useSalidaSinGuardar,
} from "@/features/mi-medio/components/guardado"
import { SeccionFormulario } from "@/features/mi-medio/components/seccion-formulario"

import { type ContactoGuardado, guardarContactoEmpresa } from "../actions"
import { CONTACTO_DESACTUALIZADO } from "../errores"
import { valoresContacto } from "../filas"
import { ANCLA_CONTACTO } from "../rutas"
import {
  CAMPOS_CONTACTO,
  type EntradaContactoEmpresa,
  esquemaContactoEmpresa,
} from "../schemas"
import type { ContactoEmpresa } from "../tipos"

type CampoEntrada = "correo" | "celular"

/**
 * Campo de texto con el teclado y el autocompletado que corresponden (correo,
 * teléfono): en el celular aparece el teclado adecuado.
 */
function CampoConTeclado({
  nombre,
  etiqueta,
  descripcion,
  opcional,
  tipo,
  autoComplete,
  placeholder,
  deshabilitado,
}: {
  nombre: CampoEntrada
  etiqueta: string
  descripcion?: string
  opcional?: boolean
  tipo: "email" | "tel"
  autoComplete: string
  placeholder: string
  deshabilitado?: boolean
}) {
  const { control, register, getFieldState } =
    useFormContext<EntradaContactoEmpresa>()
  const estado = useFormState({ control, name: nombre })
  const { error } = getFieldState(nombre, estado)
  const id = useId()
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {etiqueta}
        {opcional ? (
          <span className="font-normal text-muted-foreground">(opcional)</span>
        ) : null}
      </FieldLabel>
      <Input
        id={id}
        type={tipo}
        inputMode={tipo}
        autoComplete={autoComplete}
        placeholder={placeholder}
        disabled={deshabilitado}
        aria-invalid={error ? true : undefined}
        {...register(nombre)}
      />
      {descripcion ? <FieldDescription>{descripcion}</FieldDescription> : null}
      <FieldError errors={[error]} />
    </Field>
  )
}

/**
 * Persona de contacto de la empresa (`anunciantes_privado`): a quien escribe el
 * equipo AMO sobre la verificación, las campañas y la facturación. Mientras no
 * haya cambios sin guardar, refleja lo que trae el servidor; con cambios, la
 * acción comprueba la versión para no pisar lo que guardó otra persona.
 */
export function FormularioContacto({
  contacto,
}: {
  contacto: ContactoEmpresa
}) {
  const router = useRouter()
  const [cargando, iniciarCarga] = useTransition()
  const valoresServidor = useMemo(() => valoresContacto(contacto), [contacto])
  const formulario = useForm({
    resolver: zodResolver(esquemaContactoEmpresa),
    defaultValues: valoresServidor,
    mode: "onTouched",
  })
  const { enviar, pendiente, errorGeneral, sucio } = useEnvio({
    formulario,
    accion: guardarContactoEmpresa,
    campos: CAMPOS_CONTACTO,
    onExito: ({ actualizadoAt }: ContactoGuardado) => {
      formulario.reset({ ...formulario.getValues(), version: actualizadoAt })
      toast.success("Persona de contacto guardada")
    },
  })
  const dialogoSalida = useSalidaSinGuardar(sucio && !pendiente)

  useEffect(() => {
    if (!sucio && !pendiente) formulario.reset(valoresServidor)
  }, [sucio, pendiente, valoresServidor, formulario])

  return (
    <FormProvider {...formulario}>
      <form
        id={ANCLA_CONTACTO}
        onSubmit={enviar}
        noValidate
        aria-label="Persona de contacto"
        className="flex scroll-mt-20 flex-col gap-5"
      >
        {errorGeneral === CONTACTO_DESACTUALIZADO ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden />
            <AlertTitle>No guardamos tus cambios</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <p>{errorGeneral}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={cargando}
                onClick={() => {
                  formulario.reset(valoresServidor)
                  iniciarCarga(() => router.refresh())
                }}
              >
                {cargando ? (
                  <Spinner data-icon="inline-start" aria-hidden />
                ) : (
                  <RefreshCw data-icon="inline-start" aria-hidden />
                )}
                Cargar los datos vigentes
              </Button>
            </AlertDescription>
          </Alert>
        ) : errorGeneral ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden />
            <AlertDescription>{errorGeneral}</AlertDescription>
          </Alert>
        ) : null}

        <SeccionFormulario
          icono={UserRound}
          titulo="Persona de contacto"
          descripcion="A quien escribe el equipo de AMO sobre la verificación, tus campañas y la facturación. Solo la ven tu equipo y AMO."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <CampoTexto
              nombre="nombre"
              etiqueta="Nombre completo"
              placeholder="Laura Gómez"
              deshabilitado={pendiente}
              className="md:col-span-2"
            />
            <CampoConTeclado
              nombre="correo"
              etiqueta="Correo"
              tipo="email"
              autoComplete="email"
              placeholder="laura@empresa.com"
              deshabilitado={pendiente}
            />
            <CampoConTeclado
              nombre="celular"
              etiqueta="Celular"
              opcional
              tipo="tel"
              autoComplete="tel"
              placeholder="300 123 4567"
              descripcion="Si es de otro país, escríbelo con su indicativo (+1…)."
              deshabilitado={pendiente}
            />
            <CampoTexto
              nombre="direccion"
              etiqueta="Dirección"
              opcional
              placeholder="Calle 93 # 11-20, oficina 501"
              descripcion="Donde recibe correspondencia la empresa."
              deshabilitado={pendiente}
              className="md:col-span-2"
            />
          </div>
        </SeccionFormulario>

        <BarraGuardar
          visible={sucio || pendiente}
          pendiente={pendiente}
          onDescartar={() => formulario.reset()}
          textoGuardar="Guardar contacto"
        />
      </form>
      {dialogoSalida}
    </FormProvider>
  )
}
