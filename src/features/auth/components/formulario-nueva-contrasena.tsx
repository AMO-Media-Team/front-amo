"use client"

import { type FormEvent, useActionState, useId, useRef, useState } from "react"

import type { CamposFormularioAuth } from "../acciones-contrato"
import { ACCIONES_AUTH } from "./acciones"
import { AlertaFormulario } from "./alerta-formulario"
import { BotonEnviar } from "./boton-enviar"
import { CampoContrasena } from "./campos"
import {
  errorDeCampo,
  errorGeneral,
  useNavegarTrasExito,
} from "./estado-formulario"
import { MedidorContrasena } from "./medidor-contrasena"
import { evaluarContrasena } from "./politica-contrasena"

const CAMPOS = {
  password: "password",
  confirmacion: "confirmacion",
} as const satisfies Record<
  string,
  | CamposFormularioAuth["restablecerContrasena"]
  | CamposFormularioAuth["cambiarContrasenaObligatoria"]
>

const MENSAJE_POLITICA = "La contraseña aún no cumple todas las reglas."

/** La diferencia se señala al terminar de escribir (o al enviar), no con cada tecla. */
function errorConfirmacionLocal(
  contrasena: string,
  confirmacion: string,
  intentado: boolean
): string | undefined {
  if (intentado && !confirmacion) return "Escribe de nuevo la contraseña."
  const terminoDeEscribir =
    intentado || confirmacion.length >= contrasena.length
  if (confirmacion && terminoDeEscribir && confirmacion !== contrasena) {
    return "Las contraseñas no coinciden."
  }
  return undefined
}

interface FormularioNuevaContrasenaProps {
  /** `restablecer`: enlace de recuperación. `obligatoria`: primer ingreso o contraseña temporal. */
  variante: "restablecer" | "obligatoria"
}

export function FormularioNuevaContrasena({
  variante,
}: FormularioNuevaContrasenaProps) {
  const [estado, accion] = useActionState(
    variante === "restablecer"
      ? ACCIONES_AUTH.restablecerContrasena
      : ACCIONES_AUTH.cambiarContrasenaObligatoria,
    null
  )
  useNavegarTrasExito(estado)

  const idMedidor = useId()
  const refContrasena = useRef<HTMLInputElement>(null)
  const refConfirmacion = useRef<HTMLInputElement>(null)
  const [contrasena, setContrasena] = useState("")
  const [confirmacion, setConfirmacion] = useState("")
  // Los errores locales se muestran solo tras el primer intento de envío.
  const [intentado, setIntentado] = useState(false)

  const cumplePolitica = evaluarContrasena(contrasena).valida
  const coinciden = contrasena === confirmacion

  const errorContrasena =
    (intentado && !cumplePolitica ? MENSAJE_POLITICA : undefined) ??
    errorDeCampo(estado, CAMPOS.password)
  const errorConfirmacion =
    errorConfirmacionLocal(contrasena, confirmacion, intentado) ??
    errorDeCampo(estado, CAMPOS.confirmacion)

  // Valida en el navegador antes de enviar: evita un viaje al servidor y
  // lleva el foco al primer campo con problemas. El servidor valida igual.
  const validarAntesDeEnviar = (evento: FormEvent<HTMLFormElement>) => {
    setIntentado(true)
    if (cumplePolitica && coinciden) return
    evento.preventDefault()
    const campo = cumplePolitica ? refConfirmacion : refContrasena
    campo.current?.focus()
  }

  return (
    <form
      action={accion}
      onSubmit={validarAntesDeEnviar}
      noValidate
      className="flex flex-col gap-5"
    >
      <AlertaFormulario mensaje={errorGeneral(estado)} />

      <div className="flex flex-col gap-4">
        <CampoContrasena
          ref={refContrasena}
          name={CAMPOS.password}
          etiqueta="Contraseña nueva"
          autoComplete="new-password"
          autoFocus
          value={contrasena}
          onChange={(evento) => setContrasena(evento.target.value)}
          aria-describedby={idMedidor}
          error={errorContrasena}
        />
        <MedidorContrasena id={idMedidor} valor={contrasena} />
      </div>

      <CampoContrasena
        ref={refConfirmacion}
        name={CAMPOS.confirmacion}
        etiqueta="Confirma la contraseña"
        autoComplete="new-password"
        value={confirmacion}
        onChange={(evento) => setConfirmacion(evento.target.value)}
        error={errorConfirmacion}
      />

      <BotonEnviar textoPendiente="Guardando…" className="mt-1">
        {variante === "restablecer"
          ? "Guardar y continuar"
          : "Cambiar contraseña"}
      </BotonEnviar>
    </form>
  )
}
