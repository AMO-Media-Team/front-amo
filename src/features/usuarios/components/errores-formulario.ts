import type { FieldValues, Path, UseFormSetError } from "react-hook-form"

import type { ResultadoFallo } from "@/lib/result"

/** Clave del error general del servidor en `formState.errors.root`. */
export const ERROR_SERVIDOR = "root.servidor" as const

/**
 * Lleva un `ResultadoFallo` de una Server Action al formulario: cada error de
 * campo a su campo (`setError`) y el mensaje general a `root.servidor`. Enfoca
 * el primer campo con error para que teclado y lectores de pantalla lo noten.
 */
export function aplicarErroresServidor<T extends FieldValues>(
  setError: UseFormSetError<T>,
  resultado: ResultadoFallo,
  camposConocidos: readonly Path<T>[]
): void {
  const campos = Object.entries(resultado.erroresCampo ?? {}).filter(
    ([campo]) => (camposConocidos as readonly string[]).includes(campo)
  )
  campos.forEach(([campo, mensajes], indice) =>
    setError(
      campo as Path<T>,
      { type: "server", message: mensajes[0] },
      { shouldFocus: indice === 0 }
    )
  )
  if (campos.length === 0) {
    setError(ERROR_SERVIDOR, { type: "server", message: resultado.error })
  }
}
