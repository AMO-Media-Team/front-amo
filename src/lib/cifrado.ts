import "server-only"

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto"

import { esClaveCifradoValida } from "./env-esquema"
import { getEnvServidor } from "./env.server"

/**
 * Cifrado de datos sensibles en el servidor (documentos de identidad, datos de
 * pago): AES-256-GCM con la llave de `AMO_CIFRADO_KEY` (`k<n>:<base64 de 32
 * bytes>`). La llave nunca entra a la base de datos (docs/modelo-datos.md §12).
 *
 * - Formato guardado: `v<n>:<iv>:<datos>:<etiqueta>`, donde `n` es la versión
 *   de la llave. Las partes van en base64 estándar; los CHECK de
 *   `medios_privado` y `perfiles_privado` admiten base64 y base64url
 *   (`^v[0-9]+:`) y `descifrar` acepta ambos.
 * - Rotación: la llave nueva va en `AMO_CIFRADO_KEY` (otra versión) y la de
 *   antes en `AMO_CIFRADO_KEY_ANTERIOR`; `descifrar` elige por versión y
 *   `requiereRecifrar` señala lo que falta pasar a la llave nueva.
 * - Huella: HMAC-SHA256 (hex) con una subllave HKDF de la llave, para detectar
 *   duplicados sin revelar el valor. Cambia con la llave: al rotar hay que
 *   recalcularlas (mientras tanto, `huellasVigentes` busca con ambas).
 */

const ALGORITMO = "aes-256-gcm"
const BYTES_IV = 12
const BYTES_ETIQUETA = 16
const BYTES_SUBLLAVE = 32
const VERSION_LLAVE = /^k(\d+):/
const VALOR_CIFRADO =
  /^v(\d+):([A-Za-z0-9+/=_-]+):([A-Za-z0-9+/=_-]+):([A-Za-z0-9+/=_-]+)$/
const SAL_HUELLA = "amo-front/huella"
const INFO_HUELLA = "amo:huella:hmac-sha256:v1"
const SEPARADORES_IDENTIFICADOR = /[\s.\-]/g
const MASCARA = "••••"

export class ErrorCifrado extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorCifrado"
  }
}

export interface LlavesCifrado {
  /** Valor de `AMO_CIFRADO_KEY`: con ella se cifra todo lo nuevo. */
  actual: string
  /** Valor de `AMO_CIFRADO_KEY_ANTERIOR` durante una rotación. */
  anterior?: string
}

export interface Cifrador {
  /**
   * `contexto` (opcional) son datos asociados autenticados: ata el valor a su
   * fila (p. ej. `medios_privado:<medio_id>:datos_pago`) para que no sirva
   * copiado en otra. Hay que pasar el mismo al descifrar.
   */
  cifrar(texto: string, contexto?: string): string
  descifrar(valor: string, contexto?: string): string
  /** HMAC-SHA256 hex (64) del identificador normalizado, con la llave actual. */
  huella(texto: string): string
  /** Huella con la llave actual y, si hay rotación en curso, con la anterior. */
  huellasVigentes(texto: string): string[]
  /** ¿El valor está cifrado con una llave distinta de la actual? */
  requiereRecifrar(valor: string): boolean
}

interface Llave {
  version: number
  aes: Buffer
  huella: Buffer
}

interface PartesCifradas {
  version: number
  iv: Buffer
  datos: Buffer
  etiqueta: Buffer
}

function leerLlave(valor: string, variable: string): Llave {
  if (!esClaveCifradoValida(valor)) {
    throw new ErrorCifrado(
      `${variable} no tiene el formato k<n>:<base64 de 32 bytes>.`
    )
  }
  const separador = valor.indexOf(":")
  const aes = Buffer.from(valor.slice(separador + 1), "base64")
  const huella = Buffer.from(
    hkdfSync("sha256", aes, SAL_HUELLA, INFO_HUELLA, BYTES_SUBLLAVE)
  )
  return { version: Number(VERSION_LLAVE.exec(valor)?.[1]), aes, huella }
}

function leerLlaves({ actual, anterior }: LlavesCifrado): {
  actual: Llave
  porVersion: ReadonlyMap<number, Llave>
} {
  const llaveActual = leerLlave(actual, "AMO_CIFRADO_KEY")
  const porVersion = new Map([[llaveActual.version, llaveActual]])
  if (anterior) {
    const llaveAnterior = leerLlave(anterior, "AMO_CIFRADO_KEY_ANTERIOR")
    if (llaveAnterior.version === llaveActual.version) {
      throw new ErrorCifrado(
        "AMO_CIFRADO_KEY_ANTERIOR debe tener una versión (k<n>) distinta de AMO_CIFRADO_KEY."
      )
    }
    porVersion.set(llaveAnterior.version, llaveAnterior)
  }
  return { actual: llaveActual, porVersion }
}

function separarPartes(valor: string): PartesCifradas {
  const partes = VALOR_CIFRADO.exec(valor)
  if (!partes) {
    throw new ErrorCifrado(
      "El valor cifrado no tiene el formato v<n>:<iv>:<datos>:<etiqueta>."
    )
  }
  const [, version, iv, datos, etiqueta] = partes
  const separadas = {
    version: Number(version),
    iv: Buffer.from(iv, "base64"),
    datos: Buffer.from(datos, "base64"),
    etiqueta: Buffer.from(etiqueta, "base64"),
  }
  if (
    separadas.iv.length !== BYTES_IV ||
    separadas.etiqueta.length !== BYTES_ETIQUETA
  ) {
    throw new ErrorCifrado("El valor cifrado está incompleto o dañado.")
  }
  return separadas
}

/**
 * Forma canónica de un identificador (documento, cuenta) para la huella y el
 * resumen: sin espacios, puntos ni guiones, y en mayúsculas.
 */
export function normalizarIdentificador(texto: string): string {
  return texto
    .normalize("NFKC")
    .replace(SEPARADORES_IDENTIFICADOR, "")
    .toUpperCase()
}

/**
 * Últimos 4 caracteres del identificador normalizado. Con 4 o menos devuelve
 * vacío: mostrarlos sería revelar el valor entero.
 */
export function ultimos4(texto: string): string {
  const normalizado = normalizarIdentificador(texto)
  return normalizado.length > 4 ? normalizado.slice(-4) : ""
}

/** Largo máximo del resumen (`medios_privado_datos_pago_resumen_chk`). */
export const LARGO_MAXIMO_RESUMEN = 60

/**
 * Resumen para la interfaz (`•••• 1234`, `Nequi •••• 4821`) sin descifrar. Una
 * etiqueta larga se recorta con «…» para no pasar de `LARGO_MAXIMO_RESUMEN`.
 */
export function enmascarar(texto: string, etiqueta?: string): string {
  const resumen = [MASCARA, ultimos4(texto)].filter(Boolean).join(" ")
  const prefijo = etiqueta?.trim().replace(/\s+/g, " ")
  if (!prefijo) return resumen
  const espacio = LARGO_MAXIMO_RESUMEN - resumen.length - 1
  const recortado =
    prefijo.length > espacio
      ? `${prefijo.slice(0, espacio - 1).trimEnd()}…`
      : prefijo
  return `${recortado} ${resumen}`
}

export function crearCifrador(llaves: LlavesCifrado): Cifrador {
  const { actual, porVersion } = leerLlaves(llaves)

  function calcularHuella(llave: Llave, texto: string): string {
    const normalizado = normalizarIdentificador(texto)
    if (!normalizado) {
      throw new ErrorCifrado("No se calcula la huella de un texto vacío.")
    }
    return createHmac("sha256", llave.huella)
      .update(normalizado, "utf8")
      .digest("hex")
  }

  return {
    cifrar(texto, contexto) {
      if (texto.length === 0) {
        throw new ErrorCifrado("No se cifra un texto vacío.")
      }
      const iv = randomBytes(BYTES_IV)
      const cifrador = createCipheriv(ALGORITMO, actual.aes, iv, {
        authTagLength: BYTES_ETIQUETA,
      })
      if (contexto !== undefined) cifrador.setAAD(Buffer.from(contexto, "utf8"))
      const datos = Buffer.concat([
        cifrador.update(texto, "utf8"),
        cifrador.final(),
      ])
      const etiqueta = cifrador.getAuthTag()
      return [
        `v${actual.version}`,
        iv.toString("base64"),
        datos.toString("base64"),
        etiqueta.toString("base64"),
      ].join(":")
    },

    descifrar(valor, contexto) {
      const { version, iv, datos, etiqueta } = separarPartes(valor)
      const llave = porVersion.get(version)
      if (!llave) {
        throw new ErrorCifrado(
          `No hay una llave configurada para la versión ${version}: revisa AMO_CIFRADO_KEY y AMO_CIFRADO_KEY_ANTERIOR.`
        )
      }
      const descifrador = createDecipheriv(ALGORITMO, llave.aes, iv, {
        authTagLength: BYTES_ETIQUETA,
      })
      descifrador.setAuthTag(etiqueta)
      if (contexto !== undefined) {
        descifrador.setAAD(Buffer.from(contexto, "utf8"))
      }
      try {
        return Buffer.concat([
          descifrador.update(datos),
          descifrador.final(),
        ]).toString("utf8")
      } catch {
        throw new ErrorCifrado(
          "No se pudo descifrar: la llave o el contexto no corresponden, o el valor fue alterado."
        )
      }
    },

    huella(texto) {
      return calcularHuella(actual, texto)
    },

    huellasVigentes(texto) {
      const otras = [...porVersion.values()].filter((llave) => llave !== actual)
      return [actual, ...otras].map((llave) => calcularHuella(llave, texto))
    },

    requiereRecifrar(valor) {
      return separarPartes(valor).version !== actual.version
    },
  }
}

let cifradorDelEntorno: Cifrador | undefined

/** Cifrador con las llaves del entorno (memoizado por proceso, como `getEnvServidor`). */
function cifradorEntorno(): Cifrador {
  cifradorDelEntorno ??= crearCifrador({
    actual: getEnvServidor().AMO_CIFRADO_KEY,
    anterior: getEnvServidor().AMO_CIFRADO_KEY_ANTERIOR,
  })
  return cifradorDelEntorno
}

/** `v<n>:<iv>:<datos>:<etiqueta>` con la llave actual. */
export function cifrar(texto: string, contexto?: string): string {
  return cifradorEntorno().cifrar(texto, contexto)
}

/** Descifra con la llave de la versión del valor; lanza `ErrorCifrado` si no puede. */
export function descifrar(valor: string, contexto?: string): string {
  return cifradorEntorno().descifrar(valor, contexto)
}

/** HMAC-SHA256 hex del identificador normalizado (unicidad sin revelar). */
export function huella(texto: string): string {
  return cifradorEntorno().huella(texto)
}

export function huellasVigentes(texto: string): string[] {
  return cifradorEntorno().huellasVigentes(texto)
}

export function requiereRecifrar(valor: string): boolean {
  return cifradorEntorno().requiereRecifrar(valor)
}
