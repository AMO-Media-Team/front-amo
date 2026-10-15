"use client"

import { useTransition } from "react"
import type { FieldValues, Path, UseFormReturn } from "react-hook-form"

import {
  aplicarErroresServidor,
  ERROR_SERVIDOR,
} from "@/features/usuarios/components/errores-formulario"
import type { ResultadoAccion } from "@/lib/result"

export const MENSAJE_SIN_RESPUESTA =
  "No pudimos comunicarnos con el servidor. Revisa tu conexión e intenta de nuevo; lo que escribiste sigue aquí."

/**
 * Envío de un formulario a su Server Action: valida en el cliente con el
 * esquema zod, manda los valores TAL COMO SE ESCRIBIERON (el servidor aplica
 * el mismo esquema con sus transformaciones) y lleva los errores del
 * servidor a sus campos o al error general.
 */
export function useEnvio<
  TValores extends FieldValues,
  TContexto,
  TSalida,
  TDatos,
>({
  formulario,
  accion,
  campos,
  onExito,
}: {
  formulario: UseFormReturn<TValores, TContexto, TSalida>
  accion: (valores: TValores) => Promise<ResultadoAccion<TDatos>>
  /** Campos que pueden recibir un error del servidor. */
  campos: readonly Path<TValores>[]
  onExito: (datos: TDatos) => void
}) {
  const [pendiente, iniciar] = useTransition()
  const enviar = formulario.handleSubmit(() =>
    iniciar(async () => {
      let resultado: ResultadoAccion<TDatos>
      try {
        resultado = await accion(formulario.getValues())
      } catch {
        // Sin red o con el servidor caído la acción LANZA: si el error subiera
        // al límite de la sección, se perdería lo escrito en el formulario.
        formulario.setError(ERROR_SERVIDOR, {
          type: "server",
          message: MENSAJE_SIN_RESPUESTA,
        })
        return
      }
      if (!resultado.ok) {
        aplicarErroresServidor(formulario.setError, resultado, campos)
        return
      }
      onExito(resultado.datos)
    })
  )
  return {
    enviar,
    pendiente,
    errorGeneral: formulario.formState.errors.root?.servidor?.message,
    sucio: formulario.formState.isDirty,
  }
}
