"use client"

import { useActionState, useRef, useState } from "react"

import type {
  CamposFormularioAuth,
  EstadoFormulario,
} from "../acciones-contrato"
import { ACCIONES_AUTH } from "./acciones"
import { AlertaFormulario } from "./alerta-formulario"
import { BotonEnviar } from "./boton-enviar"
import { CampoCodigo, LONGITUD_CODIGO } from "./campo-codigo"
import {
  errorDeCampo,
  errorGeneral,
  useNavegarTrasExito,
} from "./estado-formulario"

const CAMPOS = {
  codigo: "codigo",
  factorId: "factorId",
  siguiente: "next",
} as const satisfies Record<string, CamposFormularioAuth["verificarMfa"]>

interface FormularioVerificacionMfaProps {
  /** Factor recién enrolado; sin él, la acción usa el factor TOTP verificado. */
  factorId?: string
  /** Ruta interna a la que continuar tras verificar (`?next=` ya validado). */
  siguiente?: string
  textoBoton?: string
  ayuda?: string
  /** Enfoca el código al montar (desactivado cuando antes hay que escanear un QR). */
  enfocar?: boolean
}

/**
 * Código de 6 dígitos con autoenvío al completarlo. Si la verificación
 * falla, el código se borra para escribir el siguiente sin tener que limpiar.
 */
export function FormularioVerificacionMfa({
  factorId,
  siguiente,
  textoBoton = "Verificar",
  ayuda = "Escribe el código de 6 dígitos que muestra tu app autenticadora.",
  enfocar = true,
}: FormularioVerificacionMfaProps) {
  const formulario = useRef<HTMLFormElement>(null)
  const [codigo, setCodigo] = useState("")

  const [estado, accion, pendiente] = useActionState(
    async (previo: EstadoFormulario, datos: FormData) => {
      const resultado = await ACCIONES_AUTH.verificarMfa(previo, datos)
      if (!resultado?.ok) setCodigo("")
      return resultado
    },
    null
  )
  useNavegarTrasExito(estado)

  const enviarSiCompleto = () => {
    if (!pendiente) formulario.current?.requestSubmit()
  }

  return (
    <form ref={formulario} action={accion} className="flex flex-col gap-6">
      <AlertaFormulario mensaje={errorGeneral(estado)} />
      <CampoCodigo
        name={CAMPOS.codigo}
        valor={codigo}
        onCambio={setCodigo}
        onCompleto={enviarSiCompleto}
        deshabilitado={pendiente}
        autoFocus={enfocar}
        ayuda={ayuda}
        error={errorDeCampo(estado, CAMPOS.codigo)}
      />
      {factorId ? (
        <input type="hidden" name={CAMPOS.factorId} value={factorId} />
      ) : null}
      {siguiente ? (
        <input type="hidden" name={CAMPOS.siguiente} value={siguiente} />
      ) : null}
      <BotonEnviar
        textoPendiente="Verificando…"
        pendiente={pendiente}
        deshabilitado={codigo.length < LONGITUD_CODIGO}
      >
        {textoBoton}
      </BotonEnviar>
    </form>
  )
}
