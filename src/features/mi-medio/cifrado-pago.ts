import "server-only"

import {
  type Cifrador,
  cifrar,
  descifrar,
  enmascarar,
  huella,
} from "@/lib/cifrado"
import type { Json } from "@/types/database.types"

import {
  contextoCifrado,
  type CuentaPago,
  entidadDeCuenta,
  leerCuentaPago,
  serializarCuentaPago,
  type TipoDocumentoIdentidad,
} from "./datos-pago"
import type { DatosPagoMedio } from "./schemas"

/**
 * Cifrado de los datos de pago del medio en el servidor (MED-004), con las
 * convenciones del brief de la fase 1:
 *
 * - contexto = `medios_privado:<medio_id>:<columna>` (`contextoCifrado`);
 * - huella del documento = `huella(`${tipo}:${numero}`)` con el número
 *   normalizado: el mismo número con dos tipos distintos no choca;
 * - resúmenes con `enmascarar` (`•••• 1234`, `Nequi •••• 4821`, ≤ 60).
 *
 * El resultado es el `p_datos` de `guardar_datos_pago_medio_srv`: una clave
 * ausente conserva lo guardado (número o cuenta que no se volvieron a escribir).
 */

type CifradorPago = Pick<Cifrador, "cifrar" | "huella">

const CIFRADOR_ENTORNO: CifradorPago = { cifrar, huella }

/** Huella del documento (unicidad entre medios sin revelar el número). */
export function huellaDocumento(
  tipo: TipoDocumentoIdentidad,
  numeroNormalizado: string,
  cifrador: CifradorPago = CIFRADOR_ENTORNO
): string {
  return cifrador.huella(`${tipo}:${numeroNormalizado}`)
}

export function datosRpcPago(
  medioId: string,
  datos: DatosPagoMedio,
  cifrador: CifradorPago = CIFRADOR_ENTORNO
): Record<string, Json> {
  const p: Record<string, Json> = {
    titular_nombre: datos.titularNombre,
    tipo_documento: datos.tipoDocumento,
    es_declarante: datos.esDeclarante,
    obligado_facturar: datos.obligadoFacturar,
    responsable_iva: datos.responsableIva,
  }
  if (datos.numeroDocumento) {
    p.numero_documento_cifrado = cifrador.cifrar(
      datos.numeroDocumento,
      contextoCifrado(medioId, "numero_documento_cifrado")
    )
    p.numero_documento_hash = huellaDocumento(
      datos.tipoDocumento,
      datos.numeroDocumento,
      cifrador
    )
    p.numero_documento_resumen = enmascarar(datos.numeroDocumento)
  }
  if (datos.cuenta) {
    p.metodo_pago = datos.cuenta.metodo
    p.datos_pago_cifrados = cifrador.cifrar(
      serializarCuentaPago(datos.cuenta),
      contextoCifrado(medioId, "datos_pago_cifrados")
    )
    p.datos_pago_resumen = enmascarar(
      datos.cuenta.numero,
      entidadDeCuenta(datos.cuenta)
    )
  }
  return p
}

/**
 * Para la revisión de AMO y la dispersión de pagos: `datos_pago_cifrados`
 * (obtenido con `revelar_privado_srv` o como servicio) → cuenta en claro.
 * `null` si el valor no cumple el contrato; lanza `ErrorCifrado` si la llave o
 * el contexto no corresponden.
 */
export function descifrarCuentaPago(
  medioId: string,
  valor: string
): CuentaPago | null {
  return leerCuentaPago(
    descifrar(valor, contextoCifrado(medioId, "datos_pago_cifrados"))
  )
}

/** `numero_documento_cifrado` → número normalizado en claro. */
export function descifrarNumeroDocumento(medioId: string, valor: string) {
  return descifrar(valor, contextoCifrado(medioId, "numero_documento_cifrado"))
}
