import { describe, expect, it } from "vitest"

import {
  BANCOS,
  BILLETERAS,
  CARACTERES_DOCUMENTO,
  contextoCifrado,
  type CuentaPago,
  entidadDeCuenta,
  leerCuentaPago,
  normalizarNumeroDocumento,
  OTRA_ENTIDAD,
  REGLAS_DOCUMENTO,
  serializarCuentaPago,
  TIPOS_CUENTA_BD,
  TIPOS_DOCUMENTO_IDENTIDAD_BD,
} from "./datos-pago"

const ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"

const BANCARIA: CuentaPago = {
  metodo: "BANCARIO",
  banco: "Bancolombia",
  tipoCuenta: "AHORROS",
  numero: "03012345678",
}

const BILLETERA: CuentaPago = {
  metodo: "BILLETERA",
  proveedor: "Nequi",
  numero: "3001234821",
}

describe("contextoCifrado", () => {
  it("sigue la convención <tabla>:<id>:<columna> del brief", () => {
    expect(contextoCifrado(ID, "datos_pago_cifrados")).toBe(
      `medios_privado:${ID}:datos_pago_cifrados`
    )
    expect(contextoCifrado(ID, "numero_documento_cifrado")).toBe(
      `medios_privado:${ID}:numero_documento_cifrado`
    )
  })
})

describe("catálogos", () => {
  it("coinciden con los enum de la BD", () => {
    expect(TIPOS_DOCUMENTO_IDENTIDAD_BD).toEqual([
      "CC",
      "CE",
      "PPT",
      "PASAPORTE",
      "NIT",
    ])
    expect(TIPOS_CUENTA_BD).toEqual(["AHORROS", "CORRIENTE"])
  })

  it("no repite entidades ni choca con la opción «Otra»", () => {
    for (const lista of [BANCOS, BILLETERAS]) {
      expect(new Set(lista).size).toBe(lista.length)
      expect(lista).not.toContain(OTRA_ENTIDAD)
      for (const nombre of lista) expect(nombre.length).toBeLessThanOrEqual(40)
    }
  })

  it("hay una regla por cada tipo de documento", () => {
    for (const tipo of TIPOS_DOCUMENTO_IDENTIDAD_BD) {
      const regla = REGLAS_DOCUMENTO[tipo]
      expect(regla.mensaje.length).toBeGreaterThan(0)
      expect(regla.patron.test(normalizarNumeroDocumento(regla.ejemplo))).toBe(
        true
      )
    }
  })
})

describe("valor cifrado (contrato con la revisión y la dispersión)", () => {
  it("serializa con la versión del formato", () => {
    expect(JSON.parse(serializarCuentaPago(BANCARIA))).toEqual({
      v: 1,
      ...BANCARIA,
    })
    expect(serializarCuentaPago(BILLETERA)).toBe(
      '{"v":1,"metodo":"BILLETERA","proveedor":"Nequi","numero":"3001234821"}'
    )
  })

  it("lee de vuelta lo que serializa", () => {
    expect(leerCuentaPago(serializarCuentaPago(BANCARIA))).toEqual(BANCARIA)
    expect(leerCuentaPago(serializarCuentaPago(BILLETERA))).toEqual(BILLETERA)
  })

  it("rechaza lo que no cumple el contrato", () => {
    expect(leerCuentaPago("no es json")).toBeNull()
    expect(leerCuentaPago("{}")).toBeNull()
    expect(leerCuentaPago(JSON.stringify({ ...BANCARIA, v: 2 }))).toBeNull()
    expect(
      leerCuentaPago(JSON.stringify({ v: 1, ...BANCARIA, numero: "12-34" }))
    ).toBeNull()
    expect(
      leerCuentaPago(JSON.stringify({ v: 1, ...BANCARIA, tipoCuenta: "CDT" }))
    ).toBeNull()
  })

  it("la entidad del resumen es el banco o el proveedor", () => {
    expect(entidadDeCuenta(BANCARIA)).toBe("Bancolombia")
    expect(entidadDeCuenta(BILLETERA)).toBe("Nequi")
  })
})

describe("normalizarNumeroDocumento", () => {
  it("deja solo dígitos y letras, en mayúsculas", () => {
    expect(normalizarNumeroDocumento("1.023.456.789")).toBe("1023456789")
    expect(normalizarNumeroDocumento(" ab-12 34 ")).toBe("AB1234")
    expect(normalizarNumeroDocumento("900.123.456-8")).toBe("9001234568")
  })

  it("normaliza dígitos de ancho completo", () => {
    expect(normalizarNumeroDocumento("１２３４５")).toBe("12345")
  })
})

describe("CARACTERES_DOCUMENTO", () => {
  it("admite separadores comunes y rechaza símbolos", () => {
    expect(CARACTERES_DOCUMENTO.test("1.023.456-789 ")).toBe(true)
    expect(CARACTERES_DOCUMENTO.test("AB123456")).toBe(true)
    expect(CARACTERES_DOCUMENTO.test("123/456")).toBe(false)
    expect(CARACTERES_DOCUMENTO.test("123_456")).toBe(false)
  })
})
