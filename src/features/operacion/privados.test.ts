import { describe, expect, it } from "vitest"

import { grupoPrivado, presentarRevelados } from "./privados"
import { esquemaRevelar } from "./schemas"

const ID = "0192f0a1-7b2c-7d3e-8f40-123456789abc"

describe("grupos de datos privados", () => {
  it("el medio tiene contacto y pago; el anunciante solo contacto", () => {
    expect(grupoPrivado("medio", "contacto")?.tabla).toBe("medios_privado")
    expect(grupoPrivado("medio", "pago")?.campos.map((c) => c.campo)).toContain(
      "datos_pago_resumen"
    )
    expect(grupoPrivado("anunciante", "contacto")?.tabla).toBe(
      "anunciantes_privado"
    )
    expect(grupoPrivado("anunciante", "pago")).toBeNull()
  })

  it("nunca pide los valores cifrados completos", () => {
    const campos = ["medio", "anunciante"].flatMap((entidad) =>
      (["contacto", "pago"] as const).flatMap(
        (grupo) =>
          grupoPrivado(entidad as "medio", grupo)?.campos.map((c) => c.campo) ??
          []
      )
    )
    // `numero_documento_cifrado`, `numero_documento_hash`, `datos_pago_cifrados`.
    expect(campos.filter((campo) => /cifrad|hash/.test(campo))).toEqual([])
    expect(campos).toContain("numero_documento_resumen")
    expect(campos).toContain("datos_pago_resumen")
  })

  it("presenta enums, booleanos y faltantes de forma legible", () => {
    const definicion = grupoPrivado("medio", "pago")
    if (!definicion) throw new Error("falta el grupo")
    const datos = presentarRevelados(definicion, {
      tipo_documento: "CC",
      metodo_pago: "BILLETERA",
      es_declarante: false,
      responsable_iva: true,
      datos_pago_resumen: "",
    })
    const valor = (etiqueta: string) =>
      datos.find((d) => d.etiqueta === etiqueta)?.valor
    expect(valor("Tipo de documento")).toBe("Cédula de ciudadanía")
    expect(valor("Método de pago")).toBe("Billetera digital")
    expect(valor("Declarante de renta")).toBe("No")
    expect(valor("Responsable de IVA")).toBe("Sí")
    expect(valor("Cuenta de pago")).toBeNull()
    expect(
      presentarRevelados(definicion, null).every((d) => d.valor === null)
    ).toBe(true)
  })
})

describe("esquemaRevelar", () => {
  it("acepta grupos existentes y rechaza el pago de un anunciante", () => {
    expect(
      esquemaRevelar.safeParse({ entidad: "medio", id: ID, grupo: "pago" })
        .success
    ).toBe(true)
    expect(
      esquemaRevelar.safeParse({ entidad: "anunciante", id: ID, grupo: "pago" })
        .success
    ).toBe(false)
    expect(
      esquemaRevelar.safeParse({
        entidad: "medio",
        id: "no-uuid",
        grupo: "contacto",
      }).success
    ).toBe(false)
  })
})
