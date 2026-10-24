import { describe, expect, it } from "vitest"

import {
  esquemaConfirmarFactura,
  esquemaFirmarArchivo,
  esquemaFormularioFactura,
  esquemaPaginaPagos,
  esquemaPrepararFactura,
  esquemaRegistrarFactura,
} from "./schemas"

const LIQUIDACION = "0199f3a0-0000-7000-8000-0000000005a1"

function errorDe(resultado: {
  success: boolean
  error?: { issues: { message: string }[] }
}): string | undefined {
  return resultado.success ? undefined : resultado.error?.issues[0]?.message
}

describe("número de la factura", () => {
  it("se limpia y se pasa a mayúsculas, como lo guarda la BD", () => {
    const resultado = esquemaFormularioFactura.safeParse({
      liquidacionId: LIQUIDACION,
      numero: "  fe-1234 ",
    })
    expect(resultado.success && resultado.data.numero).toBe("FE-1234")
  })

  it("explica qué falta o qué sobra", () => {
    const con = (numero: string) =>
      errorDe(
        esquemaFormularioFactura.safeParse({
          liquidacionId: LIQUIDACION,
          numero,
        })
      )
    expect(con("   ")).toBe("Escribe el número de tu factura.")
    expect(con("FE/12")).toMatch(/letras, números, espacios y guiones/)
    expect(con("-12")).toMatch(/letras, números/)
    expect(con("A".repeat(61))).toBe("El número admite hasta 60 caracteres.")
    expect(con("SETT 99-1")).toBeUndefined()
  })
})

describe("entradas de las acciones", () => {
  it("piden identificadores válidos y un archivo conocido", () => {
    expect(esquemaPaginaPagos.safeParse({ antesId: "x" }).success).toBe(false)
    expect(
      esquemaFirmarArchivo.safeParse({
        liquidacionId: LIQUIDACION,
        archivo: "soporte_pago",
      }).success
    ).toBe(true)
    expect(
      esquemaFirmarArchivo.safeParse({
        liquidacionId: LIQUIDACION,
        archivo: "datos_bancarios",
      }).success
    ).toBe(false)
  })

  it("la factura solo admite PDF de hasta 10 MB", () => {
    const descripcion = {
      nombre: "factura.pdf",
      tipo: "application/pdf",
      tamano: 120_000,
      sha256: null,
      dimensiones: null,
      duracionSeg: null,
      conMiniatura: false,
    }
    expect(
      esquemaPrepararFactura.safeParse({
        liquidacionId: LIQUIDACION,
        descripcion,
      }).success
    ).toBe(true)
    expect(
      esquemaPrepararFactura.safeParse({
        liquidacionId: LIQUIDACION,
        descripcion: { ...descripcion, tipo: "image/png" },
      }).success
    ).toBe(false)
    expect(
      errorDe(
        esquemaPrepararFactura.safeParse({
          liquidacionId: LIQUIDACION,
          descripcion: { ...descripcion, tamano: 11 * 1024 * 1024 },
        })
      )
    ).toMatch(/supera el máximo/)
    expect(
      esquemaConfirmarFactura.safeParse({
        liquidacionId: LIQUIDACION,
        archivo: {
          ...descripcion,
          bucket: "soportes",
          ruta: `liquidacion/${LIQUIDACION}/factura/x.pdf`,
          rutaMiniatura: null,
        },
      }).success
    ).toBe(true)
  })

  it("registrar exige la ruta del PDF subido", () => {
    expect(
      errorDe(
        esquemaRegistrarFactura.safeParse({
          liquidacionId: LIQUIDACION,
          numero: "FE-1",
          archivoPath: "",
        })
      )
    ).toBe("Adjunta el PDF de tu factura.")
  })
})
