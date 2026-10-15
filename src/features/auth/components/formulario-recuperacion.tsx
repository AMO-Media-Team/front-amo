"use client"

import { ArrowLeft, MailCheck } from "lucide-react"
import { useActionState, useState } from "react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"

import type { CamposFormularioAuth } from "../acciones-contrato"
import { ACCIONES_AUTH } from "./acciones"
import { AlertaFormulario } from "./alerta-formulario"
import { BotonEnviar } from "./boton-enviar"
import { CampoEmail } from "./campos"
import { errorDeCampo, errorGeneral } from "./estado-formulario"

const CAMPOS = {
  email: "email",
} as const satisfies Record<
  string,
  CamposFormularioAuth["solicitarRecuperacion"]
>

/**
 * La respuesta es la misma exista o no la cuenta (sin enumeración de
 * usuarios). Sin SMTP propio el correo puede no llegar: la acción envía un
 * aviso con la vía alternativa (un administrador genera el enlace).
 */
function SolicitudEnviada({ aviso }: { aviso?: string }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-5 rounded-2xl border bg-card/60 p-6 motion-safe:animate-aparecer-arriba"
    >
      <span className="grid size-11 place-items-center rounded-xl bg-success/10 text-success ring-1 ring-success/20">
        <MailCheck className="size-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-2">
        <p className="font-heading text-lg font-semibold">Revisa tu correo</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Si el correo pertenece a una cuenta activa, te enviamos un enlace para
          crear una contraseña nueva. Puede tardar unos minutos.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          ¿No llega? Revisa la carpeta de spam.
        </p>
        {aviso ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {aviso}
          </p>
        ) : null}
      </div>
      <EnlaceBoton
        variant="outline"
        size="lg"
        className="h-10"
        href="/ingresar"
      >
        <ArrowLeft data-icon="inline-start" aria-hidden />
        Volver a ingresar
      </EnlaceBoton>
    </div>
  )
}

export function FormularioRecuperacion() {
  const [estado, accion] = useActionState(
    ACCIONES_AUTH.solicitarRecuperacion,
    null
  )
  const [email, setEmail] = useState("")

  if (estado?.ok) return <SolicitudEnviada aviso={estado.datos.aviso} />

  return (
    <form action={accion} className="flex flex-col gap-5">
      <AlertaFormulario mensaje={errorGeneral(estado)} />
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
      <BotonEnviar textoPendiente="Enviando enlace…" className="mt-1">
        Enviar enlace
      </BotonEnviar>
    </form>
  )
}
