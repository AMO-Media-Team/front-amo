import { describe, expect, it } from "vitest"

import { Constants } from "@/types/database.types"

import {
  abreviarCufe,
  describirCobertura,
  diasEntre,
  ESQUEMAS_FACTURACION,
  esquemaDe,
  ESTADOS_FACTURA_ANUNCIANTE,
  estadoVisible,
  etiquetaMedioPago,
  extensionDe,
  nombreArchivoFactura,
  ORDEN_ESTADOS_VISIBLES,
  plazoFactura,
} from "./presentacion"

const HOY = "2026-10-23"

describe("catálogo de estados", () => {
  it("nombra cada estado de la BD en voz de la empresa", () => {
    expect(Object.keys(ESTADOS_FACTURA_ANUNCIANTE).sort()).toEqual(
      [...Constants.public.Enums.factura_estado].sort()
    )
    expect(ESTADOS_FACTURA_ANUNCIANTE.EMITIDA.etiqueta).toBe("Por pagar")
    expect(ESTADOS_FACTURA_ANUNCIANTE.VENCIDA.tono).toBe("peligro")
  })

  it("el filtro ofrece todo menos el borrador, primero lo vencido", () => {
    expect(ORDEN_ESTADOS_VISIBLES).not.toContain("BORRADOR")
    expect(ORDEN_ESTADOS_VISIBLES[0]).toBe("VENCIDA")
    expect(ORDEN_ESTADOS_VISIBLES).toHaveLength(
      Constants.public.Enums.factura_estado.length - 1
    )
  })
})

describe("estadoVisible", () => {
  it("una factura con saldo y el vencimiento pasado ya es «Vencida»", () => {
    expect(
      estadoVisible(
        { estado: "EMITIDA", fechaVencimiento: "2026-10-22", saldo: 10 },
        HOY
      )
    ).toBe("VENCIDA")
    expect(
      estadoVisible(
        { estado: "PAGADA_PARCIAL", fechaVencimiento: "2026-09-01", saldo: 5 },
        HOY
      )
    ).toBe("VENCIDA")
  })

  it("el día del vencimiento aún no está vencida; pagadas y anuladas no cambian", () => {
    expect(
      estadoVisible(
        { estado: "EMITIDA", fechaVencimiento: HOY, saldo: 10 },
        HOY
      )
    ).toBe("EMITIDA")
    expect(
      estadoVisible(
        { estado: "PAGADA", fechaVencimiento: "2026-01-01", saldo: 0 },
        HOY
      )
    ).toBe("PAGADA")
    expect(
      estadoVisible(
        { estado: "ANULADA", fechaVencimiento: "2026-01-01", saldo: 0 },
        HOY
      )
    ).toBe("ANULADA")
    expect(
      estadoVisible(
        { estado: "EMITIDA", fechaVencimiento: null, saldo: 10 },
        HOY
      )
    ).toBe("EMITIDA")
  })
})

describe("diasEntre", () => {
  it("cuenta días de calendario, también entre meses y años", () => {
    expect(diasEntre("2026-10-23", "2026-10-28")).toBe(5)
    expect(diasEntre("2026-10-23", "2026-10-11")).toBe(-12)
    expect(diasEntre("2026-12-30", "2027-01-02")).toBe(3)
    expect(diasEntre("2026-03-07", "2026-03-09")).toBe(2)
  })

  it("un texto que no es fecha da `null`", () => {
    expect(diasEntre("23/10/2026", HOY)).toBeNull()
  })
})

describe("plazoFactura", () => {
  const conSaldo = (fechaVencimiento: string) => ({
    estado: "EMITIDA" as const,
    fechaVencimiento,
    saldo: 1000,
  })

  it("dice cuánto falta o cuánto hace, con su tono", () => {
    expect(plazoFactura(conSaldo("2026-11-07"), HOY)).toEqual({
      texto: "Vence en 15 días",
      tono: "neutro",
      dias: 15,
    })
    expect(plazoFactura(conSaldo("2026-10-28"), HOY)).toEqual({
      texto: "Vence en 5 días",
      tono: "aviso",
      dias: 5,
    })
    expect(plazoFactura(conSaldo("2026-10-24"), HOY)?.texto).toBe(
      "Vence mañana"
    )
    expect(plazoFactura(conSaldo(HOY), HOY)?.texto).toBe("Vence hoy")
    expect(plazoFactura(conSaldo("2026-10-22"), HOY)).toEqual({
      texto: "Venció ayer",
      tono: "peligro",
      dias: -1,
    })
    expect(plazoFactura(conSaldo("2026-10-11"), HOY)?.texto).toBe(
      "Venció hace 12 días"
    )
    expect(plazoFactura(conSaldo("2023-07-12"), HOY)?.texto).toBe(
      "Venció hace 1.199 días"
    )
  })

  it("sin saldo, pagada, anulada o sin fecha no hay plazo", () => {
    expect(
      plazoFactura({ estado: "PAGADA", fechaVencimiento: HOY, saldo: 0 }, HOY)
    ).toBeNull()
    expect(
      plazoFactura({ estado: "ANULADA", fechaVencimiento: HOY, saldo: 0 }, HOY)
    ).toBeNull()
    expect(
      plazoFactura({ estado: "EMITIDA", fechaVencimiento: null, saldo: 5 }, HOY)
    ).toBeNull()
    expect(
      plazoFactura({ estado: "EMITIDA", fechaVencimiento: HOY, saldo: 0 }, HOY)
    ).toBeNull()
  })
})

describe("abreviarCufe", () => {
  it("conserva el inicio y el final de un CUFE de 96 caracteres", () => {
    const cufe = `3fa94c1b${"0".repeat(82)}9e02d1`
    expect(abreviarCufe(cufe)).toBe("3fa94c1b…9e02d1")
  })

  it("uno corto queda tal cual", () => {
    expect(abreviarCufe(" abc123 ")).toBe("abc123")
  })
})

describe("textos", () => {
  it("medios de pago y modalidad con nombre legible", () => {
    expect(etiquetaMedioPago("CONSIGNACION")).toBe("Consignación")
    expect(etiquetaMedioPago("RARO")).toBe("RARO")
    expect(esquemaDe("MANDATO")).toBe("MANDATO")
    expect(esquemaDe("otro")).toBe("COMPRA_REVENTA")
    expect(ESQUEMAS_FACTURACION.MANDATO.descripcion).toMatch(/terceros/)
  })

  it("cobertura: la campaña, consolidada o archivada", () => {
    expect(describirCobertura({ id: "c", nombre: "Navidad" })).toBe("Navidad")
    expect(describirCobertura(null)).toBe("Consolidada")
    expect(describirCobertura({ id: "c", nombre: null })).toBe(
      "Campaña archivada"
    )
  })

  it("nombres de archivo legibles con su extensión", () => {
    expect(extensionDe("factura/x/DEMO1.PDF")).toBe("pdf")
    expect(extensionDe("pago/x/sin-extension")).toBe("pdf")
    expect(extensionDe("pago/x/soporte.jpeg")).toBe("jpeg")
    expect(
      nombreArchivoFactura({ tipo: "factura", numero: "FE1042" }, "pdf")
    ).toBe("Factura FE1042.pdf")
    expect(
      nombreArchivoFactura(
        { tipo: "pago", numero: "FE1042", fecha: "2026-10-21" },
        "png"
      )
    ).toBe("Soporte de pago FE1042 2026-10-21.png")
    expect(
      nombreArchivoFactura({ tipo: "nota_credito", numero: "NC7" }, "pdf")
    ).toBe("Nota credito NC7.pdf")
  })
})
