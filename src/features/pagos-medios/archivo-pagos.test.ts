import { describe, expect, it } from "vitest"

import {
  COLUMNAS_ARCHIVO_PAGOS,
  construirArchivoPagos,
  nombreArchivoPagos,
  type PagoDescifrado,
  referenciaPago,
  valorEnPesos,
} from "./archivo-pagos"

const BANCARIO: PagoDescifrado = {
  liquidacionId: "01a16b3e-402f-7646-a2fd-611fb53e04e4",
  medio: "Radio Pasto",
  tipoDocumento: "CC",
  numeroDocumento: "1085123456",
  titular: "Ana Gómez",
  cuenta: {
    metodo: "BANCARIO",
    banco: "Bancolombia",
    tipoCuenta: "AHORROS",
    numero: "03012345678",
  },
  montoNeto: 911_002.5,
}

const BILLETERA: PagoDescifrado = {
  liquidacionId: "0199f3a0-0000-7000-8000-00000000a501",
  medio: "La Voz; del Sur",
  tipoDocumento: "PPT",
  numeroDocumento: "X1234567",
  titular: "=Juan Pérez",
  cuenta: { metodo: "BILLETERA", proveedor: "Nequi", numero: "3001234567" },
  montoNeto: 150_000.49,
}

describe("referenciaPago", () => {
  it("es LIQ-{fecha del archivo}-{8 primeros del id}", () => {
    expect(referenciaPago(BANCARIO.liquidacionId, "2026-10-23")).toBe(
      "LIQ-20261023-01a16b3e"
    )
  })

  it("rechaza una fecha que no es AAAA-MM-DD o un id corto", () => {
    expect(() => referenciaPago(BANCARIO.liquidacionId, "23/10/2026")).toThrow()
    expect(() => referenciaPago("abc", "2026-10-23")).toThrow()
  })
})

describe("valorEnPesos", () => {
  it("redondea a pesos (los bancos no dispersan centavos)", () => {
    expect(valorEnPesos(911_002.5)).toBe(911_003)
    expect(valorEnPesos(150_000.49)).toBe(150_000)
    expect(valorEnPesos(0)).toBe(0)
  })

  it("rechaza valores negativos o que no son números", () => {
    expect(() => valorEnPesos(-1)).toThrow()
    expect(() => valorEnPesos(Number.NaN)).toThrow()
  })
})

describe("construirArchivoPagos", () => {
  const csv = construirArchivoPagos([BANCARIO, BILLETERA], "2026-10-23")
  const lineas = csv.replace(/^﻿/, "").split("\r\n")

  it("lleva BOM, separador «;», CRLF y una fila por liquidación", () => {
    expect(csv.startsWith("﻿")).toBe(true)
    expect(lineas).toHaveLength(3)
    expect(lineas[0]).toBe(
      COLUMNAS_ARCHIVO_PAGOS.map((columna) => columna.titulo).join(";")
    )
  })

  it("escribe la cuenta bancaria con códigos estables y el valor sin decimales", () => {
    expect(lineas[1]).toBe(
      "CC;1085123456;Ana Gómez;BANCARIO;Bancolombia;AHORROS;03012345678;911003;LIQ-20261023-01a16b3e;Radio Pasto"
    )
  })

  it("en una billetera deja vacío el tipo de cuenta y protege fórmulas y separadores", () => {
    expect(lineas[2]).toBe(
      'PPT;X1234567;\'=Juan Pérez;BILLETERA;Nequi;;3001234567;150000;LIQ-20261023-0199f3a0;"La Voz; del Sur"'
    )
  })

  it("sin pagos, solo el encabezado", () => {
    expect(
      construirArchivoPagos([], "2026-10-23").replace(/^﻿/, "").split("\r\n")
    ).toHaveLength(1)
  })
})

describe("nombreArchivoPagos", () => {
  it("nombra el archivo con su fecha", () => {
    expect(nombreArchivoPagos("2026-10-23")).toBe(
      "archivo-pagos-2026-10-23.csv"
    )
    expect(() => nombreArchivoPagos("hoy")).toThrow()
  })
})
