import "server-only"

/**
 * Descifrado de los datos de pago que devuelve `datos_dispersion_srv` (paso 1
 * de LIQ-005). Ocurre solo en el servidor y solo para armar el archivo: nada
 * de lo descifrado se registra, se devuelve ni se guarda fuera del CSV. Si un
 * medio no se puede leer (llave, contexto o formato), el archivo no se genera
 * y se nombra el medio (su nombre no es un dato reservado).
 */
import {
  descifrarCuentaPago,
  descifrarNumeroDocumento,
} from "@/features/mi-medio/cifrado-pago"
import type { Database } from "@/types/database.types"

import type { PagoDescifrado } from "./archivo-pagos"

export type FilaDispersionCifrada =
  Database["public"]["Functions"]["datos_dispersion_srv"]["Returns"][number]

export type ResultadoDescifrado =
  { ok: true; pagos: PagoDescifrado[] } | { ok: false; medios: string[] }

function descifrarFila(fila: FilaDispersionCifrada): PagoDescifrado | null {
  const titular = fila.titular_nombre?.trim()
  if (
    !titular ||
    !fila.tipo_documento ||
    !fila.datos_pago_cifrados ||
    !fila.numero_documento_cifrado
  ) {
    return null
  }
  try {
    const cuenta = descifrarCuentaPago(fila.medio_id, fila.datos_pago_cifrados)
    const numeroDocumento = descifrarNumeroDocumento(
      fila.medio_id,
      fila.numero_documento_cifrado
    ).trim()
    // El método guardado y el de la cuenta cifrada deben coincidir.
    if (!cuenta || !numeroDocumento || cuenta.metodo !== fila.metodo_pago) {
      return null
    }
    return {
      liquidacionId: fila.liquidacion_id,
      medio: fila.medio,
      tipoDocumento: fila.tipo_documento,
      numeroDocumento,
      titular,
      cuenta,
      montoNeto: Number(fila.monto_neto),
    }
  } catch {
    // ErrorCifrado (llave o contexto): sin detalle en logs ni respuesta.
    return null
  }
}

export function descifrarPagos(
  filas: readonly FilaDispersionCifrada[]
): ResultadoDescifrado {
  const pagos: PagoDescifrado[] = []
  const ilegibles = new Set<string>()
  for (const fila of filas) {
    const pago = descifrarFila(fila)
    if (pago) pagos.push(pago)
    else ilegibles.add(fila.medio)
  }
  return ilegibles.size > 0
    ? {
        ok: false,
        medios: [...ilegibles].sort((a, b) => a.localeCompare(b, "es-CO")),
      }
    : { ok: true, pagos }
}
