"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { KeyRound } from "lucide-react"
import { useState, useTransition } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { CampoContrasena } from "@/features/auth/components/campos"
import { MedidorContrasena } from "@/features/auth/components/medidor-contrasena"
import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"

import { cambiarContrasena } from "../actions"
import {
  type EntradaCambioContrasena,
  esquemaCambioContrasena,
} from "../schemas"

const CAMPOS = ["actual", "nueva", "confirmacion"] as const

const VALORES: EntradaCambioContrasena = {
  actual: "",
  nueva: "",
  confirmacion: "",
  cerrarOtras: true,
}

/**
 * Cambio de contraseña: la actual (reautenticación), la nueva con medidor de
 * fortaleza y, por defecto, cierre de las demás sesiones.
 */
export function DialogoContrasena() {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const formulario = useForm({
    resolver: zodResolver(esquemaCambioContrasena),
    defaultValues: VALORES,
    mode: "onTouched",
  })
  const nueva = useWatch({ control: formulario.control, name: "nueva" })
  const { errors } = formulario.formState

  const cambiarAbierto = (siguiente: boolean) => {
    if (pendiente) return
    setAbierto(siguiente)
    if (!siguiente) formulario.reset(VALORES)
  }

  const enviar = formulario.handleSubmit(() =>
    iniciar(async () => {
      const resultado = await cambiarContrasena(formulario.getValues())
      if (!resultado.ok) {
        aplicarErroresServidor(formulario.setError, resultado, CAMPOS)
        return
      }
      toast.success("Contraseña actualizada", {
        description: resultado.datos.sesionesCerradas
          ? "Cerramos tu sesión en los demás dispositivos."
          : "Úsala la próxima vez que ingreses.",
      })
      setAbierto(false)
      formulario.reset(VALORES)
    })
  )

  return (
    <Dialog open={abierto} onOpenChange={cambiarAbierto}>
      <DialogTrigger render={<Button variant="outline" />}>
        <KeyRound data-icon="inline-start" aria-hidden />
        Cambiar contraseña
      </DialogTrigger>
      <DialogContent className="gap-5 sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            Cambiar contraseña
          </DialogTitle>
          <DialogDescription>
            Primero confirma la actual. La nueva debe ser distinta y cumplir la
            política de seguridad.
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-contrasena"
          onSubmit={enviar}
          noValidate
          className="flex flex-col gap-5"
        >
          {errors.root?.servidor?.message ? (
            <Alert variant="destructive">
              <AlertDescription>
                {errors.root.servidor.message}
              </AlertDescription>
            </Alert>
          ) : null}

          <CampoContrasena
            etiqueta="Contraseña actual"
            autoComplete="current-password"
            error={errors.actual?.message}
            disabled={pendiente}
            {...formulario.register("actual")}
          />
          <div className="flex flex-col gap-3">
            <CampoContrasena
              etiqueta="Contraseña nueva"
              autoComplete="new-password"
              error={errors.nueva?.message}
              disabled={pendiente}
              {...formulario.register("nueva")}
            />
            <MedidorContrasena valor={nueva ?? ""} />
          </div>
          <CampoContrasena
            etiqueta="Repite la contraseña nueva"
            autoComplete="new-password"
            error={errors.confirmacion?.message}
            disabled={pendiente}
            {...formulario.register("confirmacion")}
          />

          <Controller
            control={formulario.control}
            name="cerrarOtras"
            render={({ field }) => (
              <Field
                orientation="horizontal"
                className="rounded-xl border bg-muted/30 p-3.5"
              >
                <FieldContent>
                  <FieldLabel htmlFor="cerrar-otras">
                    Cerrar la sesión en los demás dispositivos
                  </FieldLabel>
                  <FieldDescription>
                    Recomendado si crees que alguien más conoce tu contraseña.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="cerrar-otras"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={pendiente}
                />
              </Field>
            )}
          />
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={pendiente}
            onClick={() => cambiarAbierto(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form="form-contrasena" disabled={pendiente}>
            {pendiente ? (
              <Spinner data-icon="inline-start" aria-hidden />
            ) : null}
            {pendiente ? "Actualizando…" : "Actualizar contraseña"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
