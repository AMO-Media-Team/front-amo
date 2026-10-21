"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Building2,
  CircleCheck,
  LockKeyhole,
  Mail,
  RadioTower,
  Smartphone,
  UserRound,
} from "lucide-react"
import { useEffect, useTransition } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"

import { actualizarPerfil } from "../actions"
import { celularParaMostrar } from "../celular"
import { type EntradaPerfil, esquemaPerfil } from "../schemas"
import type { PerfilPropio } from "../tipos"
import { AccionesPie, SeccionCuenta } from "./seccion-cuenta"

const CAMPOS = ["nombre", "celular"] as const

function CampoSoloLectura({
  id,
  etiqueta,
  valor,
  icono: Icono,
  ayuda,
}: {
  id: string
  etiqueta: string
  valor: string
  icono: typeof Mail
  ayuda: string
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
      <InputGroup className="h-10 bg-muted/40 dark:bg-muted/20">
        <InputGroupAddon align="inline-start" className="pl-3">
          <Icono aria-hidden className="size-4 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          value={valor}
          readOnly
          aria-readonly
          className="text-muted-foreground"
        />
        <InputGroupAddon align="inline-end" className="pr-3">
          <LockKeyhole
            aria-label="Solo lectura"
            className="size-3.5 text-muted-foreground/70"
          />
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription>{ayuda}</FieldDescription>
    </Field>
  )
}

/**
 * Datos personales editables (nombre y celular) y los que solo cambia la
 * administración (correo, rol, organización). Mismo esquema zod que la acción.
 */
export function FormularioPerfil({ perfil }: { perfil: PerfilPropio }) {
  const valoresIniciales: EntradaPerfil = {
    nombre: perfil.nombre ?? "",
    celular: celularParaMostrar(perfil.celular),
  }
  const formulario = useForm({
    resolver: zodResolver(esquemaPerfil),
    defaultValues: valoresIniciales,
    mode: "onTouched",
  })
  const [pendiente, iniciar] = useTransition()
  const { errors, isDirty } = formulario.formState

  // Guardia de cambios sin guardar al cerrar o recargar la pestaña.
  useEffect(() => {
    if (!isDirty) return
    const avisar = (evento: BeforeUnloadEvent) => evento.preventDefault()
    window.addEventListener("beforeunload", avisar)
    return () => window.removeEventListener("beforeunload", avisar)
  }, [isDirty])

  const enviar = formulario.handleSubmit(() =>
    iniciar(async () => {
      const valores = formulario.getValues()
      const resultado = await actualizarPerfil(valores)
      if (!resultado.ok) {
        aplicarErroresServidor(formulario.setError, resultado, CAMPOS)
        return
      }
      const normalizados = esquemaPerfil.parse(valores)
      formulario.reset({
        nombre: normalizados.nombre,
        celular: normalizados.celular ?? "",
      })
      toast.success("Perfil actualizado")
    })
  )

  const organizacion = perfil.organizacion
  const errorGeneral = errors.root?.servidor?.message

  return (
    <form onSubmit={enviar} noValidate>
      <SeccionCuenta
        id="datos"
        titulo="Datos personales"
        descripcion="Así te verán tu equipo y los administradores de AMO."
        icono={UserRound}
        pie={
          <>
            <p className="text-xs text-muted-foreground">
              {isDirty
                ? "Tienes cambios sin guardar."
                : "Tus datos están al día."}
            </p>
            <AccionesPie>
              <Button
                type="button"
                variant="ghost"
                disabled={!isDirty || pendiente}
                onClick={() => formulario.reset()}
              >
                Descartar
              </Button>
              <Button type="submit" disabled={!isDirty || pendiente}>
                {pendiente ? (
                  <Spinner data-icon="inline-start" aria-hidden />
                ) : (
                  <CircleCheck data-icon="inline-start" aria-hidden />
                )}
                Guardar cambios
              </Button>
            </AccionesPie>
          </>
        }
      >
        <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
          {errorGeneral ? (
            <Alert variant="destructive" className="md:col-span-2">
              <AlertDescription>{errorGeneral}</AlertDescription>
            </Alert>
          ) : null}

          <Field data-invalid={Boolean(errors.nombre) || undefined}>
            <FieldLabel htmlFor="perfil-nombre">Nombre completo</FieldLabel>
            <InputGroup className="h-10">
              <InputGroupAddon align="inline-start" className="pl-3">
                <UserRound
                  aria-hidden
                  className="size-4 text-muted-foreground"
                />
              </InputGroupAddon>
              <InputGroupInput
                id="perfil-nombre"
                autoComplete="name"
                aria-invalid={Boolean(errors.nombre) || undefined}
                aria-describedby={
                  errors.nombre ? "perfil-nombre-error" : "perfil-nombre-ayuda"
                }
                {...formulario.register("nombre")}
              />
            </InputGroup>
            {errors.nombre ? (
              <FieldError id="perfil-nombre-error">
                {errors.nombre.message}
              </FieldError>
            ) : (
              <FieldDescription id="perfil-nombre-ayuda">
                Nombre y apellido, como quieres que te identifiquen.
              </FieldDescription>
            )}
          </Field>

          <Field data-invalid={Boolean(errors.celular) || undefined}>
            <FieldLabel htmlFor="perfil-celular">Celular</FieldLabel>
            <InputGroup className="h-10">
              <InputGroupAddon align="inline-start" className="pl-3">
                <Smartphone
                  aria-hidden
                  className="size-4 text-muted-foreground"
                />
              </InputGroupAddon>
              <InputGroupInput
                id="perfil-celular"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="300 123 4567"
                aria-invalid={Boolean(errors.celular) || undefined}
                aria-describedby={
                  errors.celular
                    ? "perfil-celular-error"
                    : "perfil-celular-ayuda"
                }
                {...formulario.register("celular")}
              />
            </InputGroup>
            {errors.celular ? (
              <FieldError id="perfil-celular-error">
                {errors.celular.message}
              </FieldError>
            ) : (
              <FieldDescription id="perfil-celular-ayuda">
                Celular de Colombia (10 dígitos). Opcional.
              </FieldDescription>
            )}
          </Field>

          <CampoSoloLectura
            id="perfil-correo"
            etiqueta="Correo electrónico"
            valor={perfil.email}
            icono={Mail}
            ayuda="Con él ingresas. Para cambiarlo, escribe a un administrador."
          />

          {organizacion ? (
            <CampoSoloLectura
              id="perfil-organizacion"
              etiqueta={
                organizacion.tipo === "ANUNCIANTE" ? "Anunciante" : "Medio"
              }
              valor={organizacion.nombre ?? "Pendiente de sincronizar"}
              icono={
                organizacion.tipo === "ANUNCIANTE" ? Building2 : RadioTower
              }
              ayuda="La organización la asigna la administración."
            />
          ) : (
            <CampoSoloLectura
              id="perfil-organizacion"
              etiqueta="Organización"
              valor="Equipo AMO"
              icono={Building2}
              ayuda="Las cuentas internas no pertenecen a un anunciante ni a un medio."
            />
          )}
        </div>
      </SeccionCuenta>
    </form>
  )
}
