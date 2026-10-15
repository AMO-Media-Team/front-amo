"use client"

import Link from "next/link"
import { useActionState, useState } from "react"

import type { CamposFormularioAuth } from "../acciones-contrato"
import { ACCIONES_AUTH } from "./acciones"
import { AlertaFormulario } from "./alerta-formulario"
import { BotonEnviar } from "./boton-enviar"
import { CampoContrasena, CampoEmail } from "./campos"
import {
  errorDeCampo,
  errorGeneral,
  useNavegarTrasExito,
} from "./estado-formulario"

const CAMPOS = {
  email: "email",
  password: "password",
  next: "next",
} as const satisfies Record<string, CamposFormularioAuth["iniciarSesion"]>

interface FormularioIngresoProps {
  /** Ruta a la que volver tras ingresar (`?next=` validado en la página). */
  siguiente?: string
  /** Aviso según `?motivo=` (sesión cerrada, inactividad, enlace vencido…). */
  aviso?: string
}

export function FormularioIngreso({
  siguiente,
  aviso,
}: FormularioIngresoProps) {
  const [estado, accion] = useActionState(ACCIONES_AUTH.iniciarSesion, null)
  // Controlado: React limpia los campos no controlados tras cada envío y el
  // correo debe conservarse si el ingreso falla (la contraseña sí se limpia).
  const [email, setEmail] = useState("")
  useNavegarTrasExito(estado)

  const error = errorGeneral(estado)

  return (
    <form action={accion} className="flex flex-col gap-5">
      <AlertaFormulario mensaje={error ? undefined : aviso} tono="info" />
      <AlertaFormulario mensaje={error} />

      <CampoEmail
        name={CAMPOS.email}
        etiqueta="Correo electrónico"
        placeholder="tu@empresa.com"
        value={email}
        onChange={(evento) => setEmail(evento.target.value)}
        required
        autoFocus
        error={errorDeCampo(estado, CAMPOS.email)}
      />
      <CampoContrasena
        name={CAMPOS.password}
        etiqueta="Contraseña"
        autoComplete="current-password"
        required
        error={errorDeCampo(estado, CAMPOS.password)}
        accionEtiqueta={
          <Link
            href="/recuperar"
            className="rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:anillo-foco"
          >
            ¿La olvidaste?
          </Link>
        }
      />
      {siguiente ? (
        <input type="hidden" name={CAMPOS.next} value={siguiente} />
      ) : null}

      <BotonEnviar textoPendiente="Ingresando…" className="mt-1">
        Ingresar
      </BotonEnviar>
    </form>
  )
}
