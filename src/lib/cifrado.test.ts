// @vitest-environment node
import { createHash, createHmac } from "node:crypto"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  crearCifrador,
  enmascarar,
  ErrorCifrado,
  normalizarIdentificador,
  ultimos4,
} from "./cifrado"

vi.mock("server-only", () => ({}))

const BYTES_1 = Buffer.alloc(32, 1)
const BYTES_2 = Buffer.alloc(32, 2)
const LLAVE_1 = `k1:${BYTES_1.toString("base64")}`
const LLAVE_2 = `k2:${BYTES_2.toString("base64")}`

/** CHECK vigente de `medios_privado` (migración e2_onboarding_medio). */
const CHECK_MEDIOS =
  /^v[0-9]+:[A-Za-z0-9+/=_-]+:[A-Za-z0-9+/=_-]+:[A-Za-z0-9+/=_-]+$/
/** CHECK de `perfiles_privado` (identidad_rbac): solo v1 y base64 estándar. */
const CHECK_PERFILES = /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/

const DOCUMENTO = "1.023.456.789"
const CUENTA = "Nequi 300 123 4821 — titular: Íñigo Pérez"

function alterar(valor: string, indiceParte: number): string {
  const partes = valor.split(":")
  const bytes = Buffer.from(partes[indiceParte], "base64")
  bytes[0] ^= 0xff
  partes[indiceParte] = bytes.toString("base64")
  return partes.join(":")
}

describe("crearCifrador · cifrar y descifrar", () => {
  const cifrador = crearCifrador({ actual: LLAVE_1 })

  it("descifra lo que cifra, incluido texto con tildes y símbolos", () => {
    expect(cifrador.descifrar(cifrador.cifrar(CUENTA))).toBe(CUENTA)
    expect(cifrador.descifrar(cifrador.cifrar("x"))).toBe("x")
  })

  it("usa un IV distinto en cada cifrado", () => {
    const primero = cifrador.cifrar(DOCUMENTO)
    const segundo = cifrador.cifrar(DOCUMENTO)
    expect(primero).not.toBe(segundo)
    expect(primero.split(":")[1]).not.toBe(segundo.split(":")[1])
  })

  it("respeta el formato que exigen los CHECK de la BD", () => {
    const valor = cifrador.cifrar(DOCUMENTO)
    expect(valor).toMatch(CHECK_MEDIOS)
    expect(valor).toMatch(CHECK_PERFILES)
    const [version, iv, , etiqueta] = valor.split(":")
    expect(version).toBe("v1")
    expect(Buffer.from(iv, "base64")).toHaveLength(12)
    expect(Buffer.from(etiqueta, "base64")).toHaveLength(16)
  })

  it("la versión del valor es la de la llave", () => {
    const cifradorK7 = crearCifrador({
      actual: `k7:${BYTES_2.toString("base64")}`,
    })
    expect(cifradorK7.cifrar("dato")).toMatch(/^v7:/)
  })

  it("acepta valores en base64url", () => {
    const valor = cifrador.cifrar("dato con ñ y ü ~~~ ???")
    const url = valor
      .split(":")
      .map((parte, i) => (i === 0 ? parte : base64AUrl(parte)))
      .join(":")
    expect(cifrador.descifrar(url)).toBe("dato con ñ y ü ~~~ ???")
  })

  it("detecta cualquier alteración del IV, los datos o la etiqueta", () => {
    const valor = cifrador.cifrar(DOCUMENTO)
    for (const parte of [1, 2, 3]) {
      expect(() => cifrador.descifrar(alterar(valor, parte))).toThrow(
        ErrorCifrado
      )
    }
  })

  it("rechaza valores mal formados o incompletos", () => {
    expect(() => cifrador.descifrar("texto plano")).toThrow(/formato/)
    expect(() => cifrador.descifrar("v1:AAAA:AAAA:AAAA")).toThrow(/dañado/)
    expect(() => cifrador.descifrar("")).toThrow(ErrorCifrado)
  })

  it("no cifra texto vacío", () => {
    expect(() => cifrador.cifrar("")).toThrow(ErrorCifrado)
  })

  it("con otra llave de la misma versión no descifra", () => {
    const otra = crearCifrador({ actual: `k1:${BYTES_2.toString("base64")}` })
    expect(() => otra.descifrar(cifrador.cifrar(DOCUMENTO))).toThrow(
      ErrorCifrado
    )
  })

  it("ata el valor a su contexto (datos asociados)", () => {
    const valor = cifrador.cifrar(CUENTA, "medios_privado:m-1:datos_pago")
    expect(cifrador.descifrar(valor, "medios_privado:m-1:datos_pago")).toBe(
      CUENTA
    )
    expect(() =>
      cifrador.descifrar(valor, "medios_privado:m-2:datos_pago")
    ).toThrow(ErrorCifrado)
    expect(() => cifrador.descifrar(valor)).toThrow(ErrorCifrado)
  })

  it("los mensajes de error nunca incluyen el valor ni la llave", () => {
    const valor = cifrador.cifrar(DOCUMENTO)
    const errores: string[] = []
    for (const intento of [
      () => crearCifrador({ actual: LLAVE_2 }).descifrar(valor),
      () => cifrador.descifrar(alterar(valor, 2)),
      () => crearCifrador({ actual: "k1:corta" }),
    ]) {
      try {
        intento()
      } catch (error) {
        errores.push(String(error))
      }
    }
    expect(errores).toHaveLength(3)
    for (const mensaje of errores) {
      expect(mensaje).not.toContain(DOCUMENTO)
      expect(mensaje).not.toContain(BYTES_1.toString("base64"))
      expect(mensaje).not.toContain("corta")
    }
  })
})

describe("crearCifrador · llaves y rotación", () => {
  it("valida el formato de las llaves sin revelarlas", () => {
    expect(() => crearCifrador({ actual: "secreto" })).toThrow(
      /AMO_CIFRADO_KEY no tiene el formato/
    )
    expect(() =>
      crearCifrador({ actual: LLAVE_1, anterior: "k0:xyz" })
    ).toThrow(/AMO_CIFRADO_KEY_ANTERIOR no tiene el formato/)
  })

  it("exige versiones distintas para la llave actual y la anterior", () => {
    expect(() =>
      crearCifrador({
        actual: LLAVE_1,
        anterior: `k1:${BYTES_2.toString("base64")}`,
      })
    ).toThrow(/versión/)
  })

  it("descifra con la llave anterior y cifra con la nueva", () => {
    const antes = crearCifrador({ actual: LLAVE_1 })
    const valorViejo = antes.cifrar(CUENTA)
    const rotado = crearCifrador({ actual: LLAVE_2, anterior: LLAVE_1 })
    expect(rotado.descifrar(valorViejo)).toBe(CUENTA)
    expect(rotado.requiereRecifrar(valorViejo)).toBe(true)
    const valorNuevo = rotado.cifrar(CUENTA)
    expect(valorNuevo).toMatch(/^v2:/)
    expect(rotado.requiereRecifrar(valorNuevo)).toBe(false)
  })

  it("sin la llave de esa versión lo informa", () => {
    const valorViejo = crearCifrador({ actual: LLAVE_1 }).cifrar(CUENTA)
    expect(() =>
      crearCifrador({ actual: LLAVE_2 }).descifrar(valorViejo)
    ).toThrow(/versión 1/)
  })
})

describe("crearCifrador · huella", () => {
  const cifrador = crearCifrador({ actual: LLAVE_1 })

  it("es HMAC-SHA256 en hex (64) y determinista", () => {
    const valor = cifrador.huella(DOCUMENTO)
    expect(valor).toMatch(/^[0-9a-f]{64}$/)
    expect(cifrador.huella(DOCUMENTO)).toBe(valor)
  })

  it("normaliza el identificador antes de calcularla", () => {
    expect(cifrador.huella("1.023.456.789")).toBe(cifrador.huella("1023456789"))
    expect(cifrador.huella(" ab-12 3 ")).toBe(cifrador.huella("AB123"))
    expect(cifrador.huella("1023456789")).not.toBe(
      cifrador.huella("1023456788")
    )
  })

  it("usa una subllave: no coincide con un hash simple ni con la llave cruda", () => {
    const valor = cifrador.huella("1023456789")
    expect(valor).not.toBe(
      createHash("sha256").update("1023456789").digest("hex")
    )
    expect(valor).not.toBe(
      createHmac("sha256", BYTES_1).update("1023456789").digest("hex")
    )
  })

  it("cambia con la llave; durante la rotación se busca con ambas", () => {
    const rotado = crearCifrador({ actual: LLAVE_2, anterior: LLAVE_1 })
    const [actual, anterior] = rotado.huellasVigentes(DOCUMENTO)
    expect(actual).toBe(rotado.huella(DOCUMENTO))
    expect(anterior).toBe(cifrador.huella(DOCUMENTO))
    expect(actual).not.toBe(anterior)
    expect(cifrador.huellasVigentes(DOCUMENTO)).toEqual([
      cifrador.huella(DOCUMENTO),
    ])
  })

  it("no calcula la huella de un texto vacío", () => {
    expect(() => cifrador.huella(" . - ")).toThrow(ErrorCifrado)
  })
})

describe("resúmenes sin descifrar", () => {
  it("normalizarIdentificador quita espacios, puntos y guiones", () => {
    expect(normalizarIdentificador(" 1.023.456-789 ")).toBe("1023456789")
    expect(normalizarIdentificador("ab 12")).toBe("AB12")
  })

  it("ultimos4 devuelve los cuatro últimos caracteres significativos", () => {
    expect(ultimos4("1.023.456.789")).toBe("6789")
    expect(ultimos4("ES12 3456 7890 1234")).toBe("1234")
  })

  it("ultimos4 no revela un valor de 4 caracteres o menos", () => {
    expect(ultimos4("1234")).toBe("")
    expect(ultimos4("12")).toBe("")
  })

  it("enmascarar arma el resumen para la interfaz", () => {
    expect(enmascarar("1.023.456.789")).toBe("•••• 6789")
    expect(enmascarar("3001234821", "Nequi")).toBe("Nequi •••• 4821")
    expect(enmascarar("123")).toBe("••••")
    expect(enmascarar("1023456789").length).toBeLessThanOrEqual(20)
    const largo = enmascarar("3001234821", `Banco ${"Muy ".repeat(30)}Largo`)
    expect(largo.length).toBeLessThanOrEqual(60)
    expect(largo).toMatch(/^Banco Muy .*… •••• 4821$/)
  })
})

describe("funciones con las llaves del entorno", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function importarConEntorno(entorno: Record<string, string>) {
    vi.resetModules()
    vi.stubEnv("AMO_SERVIDOR_SECRET", "x".repeat(40))
    for (const [nombre, valor] of Object.entries(entorno)) {
      vi.stubEnv(nombre, valor)
    }
    return import("./cifrado")
  }

  it("cifran y descifran con AMO_CIFRADO_KEY", async () => {
    const modulo = await importarConEntorno({
      AMO_CIFRADO_KEY: LLAVE_1,
      AMO_CIFRADO_KEY_ANTERIOR: "",
    })
    const valor = modulo.cifrar(DOCUMENTO)
    expect(valor).toMatch(/^v1:/)
    expect(modulo.descifrar(valor)).toBe(DOCUMENTO)
    expect(modulo.huella(DOCUMENTO)).toBe(
      crearCifrador({ actual: LLAVE_1 }).huella(DOCUMENTO)
    )
    expect(modulo.huellasVigentes(DOCUMENTO)).toHaveLength(1)
    expect(modulo.requiereRecifrar(valor)).toBe(false)
  })

  it("leen AMO_CIFRADO_KEY_ANTERIOR para rotar", async () => {
    const valorViejo = crearCifrador({ actual: LLAVE_1 }).cifrar(CUENTA)
    const modulo = await importarConEntorno({
      AMO_CIFRADO_KEY: LLAVE_2,
      AMO_CIFRADO_KEY_ANTERIOR: LLAVE_1,
    })
    expect(modulo.descifrar(valorViejo)).toBe(CUENTA)
    expect(modulo.requiereRecifrar(valorViejo)).toBe(true)
    expect(modulo.huellasVigentes(DOCUMENTO)).toHaveLength(2)
  })
})

function base64AUrl(base64: string): string {
  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}
