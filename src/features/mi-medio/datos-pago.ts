/**
 * Datos de pago del medio (módulo puro, MED-004): catálogos del formulario,
 * reglas del número de documento y el CONTRATO del valor que se cifra en
 * `medios_privado.datos_pago_cifrados`.
 *
 * Contrato (lo leen la revisión de AMO y la dispersión de pagos):
 * - Texto claro antes de cifrar: JSON de `CuentaPago` con `v: 1`, p. ej.
 *   `{"v":1,"metodo":"BANCARIO","banco":"Bancolombia","tipoCuenta":"AHORROS","numero":"03012345678"}`
 *   o `{"v":1,"metodo":"BILLETERA","proveedor":"Nequi","numero":"3001234567"}`.
 *   El número va normalizado (solo dígitos).
 * - Contexto del cifrado (datos asociados): `contextoCifrado(medioId, columna)`
 *   = `"medios_privado:<medio_id>:<columna>"`; el mismo al descifrar.
 * - Número de documento: se cifra normalizado (`normalizarNumeroDocumento`) y
 *   su huella es `huella(`${tipo}:${numero}`)`.
 */
import { z } from "zod"

import type { Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

export type TipoDocumentoIdentidad = Enums["documento_identidad_tipo"]
export type MetodoPago = Enums["metodo_pago"]

export const TIPOS_DOCUMENTO_IDENTIDAD_BD: readonly TipoDocumentoIdentidad[] = [
  "CC",
  "CE",
  "PPT",
  "PASAPORTE",
  "NIT",
]

export const METODOS_PAGO_BD: readonly MetodoPago[] = ["BANCARIO", "BILLETERA"]

/** Cómo se nombra cada tipo de documento en el formulario. */
export const TIPOS_DOCUMENTO_IDENTIDAD: Readonly<
  Record<TipoDocumentoIdentidad, string>
> = {
  CC: "Cédula de ciudadanía",
  CE: "Cédula de extranjería",
  PPT: "Permiso por Protección Temporal (PPT)",
  PASAPORTE: "Pasaporte",
  NIT: "NIT",
}

/** Sigla corta para el resumen («CC •••• 6789»). */
export const SIGLAS_DOCUMENTO: Readonly<
  Record<TipoDocumentoIdentidad, string>
> = {
  CC: "CC",
  CE: "CE",
  PPT: "PPT",
  PASAPORTE: "Pasaporte",
  NIT: "NIT",
}

export const METODOS_PAGO: Readonly<Record<MetodoPago, string>> = {
  BANCARIO: "Cuenta bancaria",
  BILLETERA: "Billetera digital",
}

/** Columnas cifradas de `medios_privado`. */
export type ColumnaCifrada = "numero_documento_cifrado" | "datos_pago_cifrados"

/** Datos asociados del cifrado: atan el valor a su fila y columna. */
export function contextoCifrado(medioId: string, columna: ColumnaCifrada) {
  return `medios_privado:${medioId}:${columna}`
}

// ── Catálogos del formulario ────────────────────────────────────────────────

/** Opción del selector que abre el campo de texto libre. */
export const OTRA_ENTIDAD = "OTRA"

/** Entidades más usadas en Colombia (el formulario admite otra por nombre). */
export const BANCOS: readonly string[] = [
  "Bancolombia",
  "Banco de Bogotá",
  "Davivienda",
  "BBVA Colombia",
  "Banco de Occidente",
  "Banco Popular",
  "Banco AV Villas",
  "Banco Caja Social",
  "Scotiabank Colpatria",
  "Banco Agrario de Colombia",
  "Itaú",
  "Banco Falabella",
  "Banco Pichincha",
  "Bancoomeva",
  "Banco GNB Sudameris",
  "Banco W",
  "Bancamía",
  "Banco Mundo Mujer",
  "Banco Finandina",
  "Banco Serfinanza",
  "Lulo Bank",
  "Nu Colombia",
]

export const BILLETERAS: readonly string[] = [
  "Nequi",
  "Daviplata",
  "Movii",
  "Dale!",
  "RappiPay",
  "Ualá",
]

export const TIPOS_CUENTA = {
  AHORROS: "Ahorros",
  CORRIENTE: "Corriente",
} as const

export type TipoCuenta = keyof typeof TIPOS_CUENTA

export const TIPOS_CUENTA_BD = Object.keys(TIPOS_CUENTA) as TipoCuenta[]

// ── Valor cifrado ───────────────────────────────────────────────────────────

export const VERSION_DATOS_PAGO = 1

export type CuentaPago =
  | {
      metodo: "BANCARIO"
      banco: string
      tipoCuenta: TipoCuenta
      /** Solo dígitos. */
      numero: string
    }
  | {
      metodo: "BILLETERA"
      proveedor: string
      /** Solo dígitos (el celular asociado a la billetera). */
      numero: string
    }

const textoEntidad = z.string().trim().min(2).max(60)
const soloDigitos = z.string().regex(/^\d{5,20}$/)

const esquemaValorCifrado = z.discriminatedUnion("metodo", [
  z.object({
    v: z.literal(VERSION_DATOS_PAGO),
    metodo: z.literal("BANCARIO"),
    banco: textoEntidad,
    tipoCuenta: z.enum(TIPOS_CUENTA_BD),
    numero: soloDigitos,
  }),
  z.object({
    v: z.literal(VERSION_DATOS_PAGO),
    metodo: z.literal("BILLETERA"),
    proveedor: textoEntidad,
    numero: soloDigitos,
  }),
])

/** `CuentaPago` → texto claro que se cifra (con la versión del formato). */
export function serializarCuentaPago(cuenta: CuentaPago): string {
  return JSON.stringify({ v: VERSION_DATOS_PAGO, ...cuenta })
}

/** Texto claro descifrado → `CuentaPago`, o `null` si no cumple el contrato. */
export function leerCuentaPago(texto: string): CuentaPago | null {
  let valor: unknown
  try {
    valor = JSON.parse(texto)
  } catch {
    return null
  }
  const resultado = esquemaValorCifrado.safeParse(valor)
  if (!resultado.success) return null
  const { v: _version, ...cuenta } = resultado.data
  return cuenta
}

/** Banco o proveedor: la etiqueta del resumen («Nequi •••• 4821»). */
export function entidadDeCuenta(cuenta: CuentaPago): string {
  return cuenta.metodo === "BANCARIO" ? cuenta.banco : cuenta.proveedor
}

// ── Número de documento ─────────────────────────────────────────────────────

/** Solo dígitos y letras, en mayúsculas (forma de la huella y del cifrado). */
export function normalizarNumeroDocumento(texto: string): string {
  return texto
    .normalize("NFKC")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase()
}

/** Lo que se acepta al escribir: dígitos, letras y separadores comunes. */
export const CARACTERES_DOCUMENTO = /^[0-9A-Za-z.\-\s]*$/

interface ReglaDocumento {
  patron: RegExp
  mensaje: string
  /** Teclado del celular. */
  teclado: "numeric" | "text"
  ejemplo: string
}

/**
 * Formatos por tipo (sobre el número normalizado). El NIT lleva su dígito de
 * verificación al final; se comprueba aparte con la regla de la DIAN.
 */
export const REGLAS_DOCUMENTO: Readonly<
  Record<TipoDocumentoIdentidad, ReglaDocumento>
> = {
  CC: {
    patron: /^\d{5,10}$/,
    mensaje: "La cédula tiene entre 5 y 10 dígitos.",
    teclado: "numeric",
    ejemplo: "1.023.456.789",
  },
  CE: {
    patron: /^\d{3,10}$/,
    mensaje: "La cédula de extranjería tiene entre 3 y 10 dígitos.",
    teclado: "numeric",
    ejemplo: "123456",
  },
  PPT: {
    patron: /^\d{4,12}$/,
    mensaje: "El PPT tiene entre 4 y 12 dígitos.",
    teclado: "numeric",
    ejemplo: "1234567",
  },
  PASAPORTE: {
    patron: /^[0-9A-Z]{5,15}$/,
    mensaje: "El pasaporte tiene entre 5 y 15 letras o números.",
    teclado: "text",
    ejemplo: "AB123456",
  },
  NIT: {
    patron: /^\d{7,16}$/,
    mensaje:
      "Escribe el NIT con su dígito de verificación, por ejemplo 900.123.456-8.",
    teclado: "numeric",
    ejemplo: "900.123.456-8",
  },
}
