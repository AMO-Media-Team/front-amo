"use client"

import { UserRound } from "lucide-react"
import { useActionState } from "react"

import type { CamposFormularioAuth } from "../acciones-contrato"
import { ACCIONES_AUTH } from "./acciones"
import { AlertaFormulario } from "./alerta-formulario"
import { BotonEnviar } from "./boton-enviar"
import { errorGeneral, useNavegarTrasExito } from "./estado-formulario"

const CAMPOS = {
  tokenHash: "token_hash",
  tipo: "type",
  siguiente: "next",
} as const satisfies Record<string, CamposFormularioAuth["confirmarEnlace"]>

interface ConfirmacionEnlaceProps {
  tokenHash: string
  tipo: string
  siguiente?: string
  /** Correo ya enmascarado (`an•••@gmail.com`), si el enlace lo trae. */
  emailEnmascarado?: string | null
  textoBoton: string
}

/**
 * El token se consume solo al pulsar "Continuar" (POST a la acción). Los
 * antivirus y previsualizadores de correo abren los enlaces con GET: así no
 * gastan el enlace antes que la persona.
 */
export function ConfirmacionEnlace({
  tokenHash,
  tipo,
  siguiente,
  emailEnmascarado,
  textoBoton,
}: ConfirmacionEnlaceProps) {
  const [estado, accion] = useActionState(ACCIONES_AUTH.confirmarEnlace, null)
  useNavegarTrasExito(estado)

  return (
    <form action={accion} className="flex flex-col gap-5">
      <AlertaFormulario mensaje={errorGeneral(estado)} />

      {emailEnmascarado ? (
        <div className="flex items-center gap-3 rounded-2xl border bg-card/60 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <UserRound className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Cuenta</p>
            <p className="truncate font-medium">{emailEnmascarado}</p>
          </div>
        </div>
      ) : null}

      <input type="hidden" name={CAMPOS.tokenHash} value={tokenHash} />
      <input type="hidden" name={CAMPOS.tipo} value={tipo} />
      {siguiente ? (
        <input type="hidden" name={CAMPOS.siguiente} value={siguiente} />
      ) : null}

      <BotonEnviar textoPendiente="Verificando enlace…">
        {textoBoton}
      </BotonEnviar>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Por seguridad, el enlace solo se usa cuando pulsas el botón.
      </p>
    </form>
  )
}
