import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MENSAJES_FACTURACION } from "../errores"
import { ID_ESTADO_FACTURA } from "../foco"
import type { FichaFactura, NotaCreditoFactura } from "../tipos"
import { avisoDeFactura, EstadoFactura } from "./estado-factura"

const AHORA = new Date("2026-10-23T15:00:00Z")

type Base = Parameters<typeof avisoDeFactura>[0]

function factura(cambios: Partial<Base> = {}): Base {
  return {
    estado: "EMITIDA",
    numero: "FE1234",
    saldo: 6_000_000,
    fechaVencimiento: "2026-11-22",
    pagadaAt: null,
    valorNotasCredito: 0,
    ...cambios,
  }
}

const nota: NotaCreditoFactura = {
  id: "n1",
  numero: "NC125",
  cude: "ab".repeat(48),
  fechaEmision: "2026-10-23",
  valor: 6_000_000,
  anulaFactura: true,
  motivo: "Campaña cancelada por completo.",
  registradaAt: "2026-10-23T15:00:00Z",
}

const opciones = { desactualizada: false, notaQueAnula: null, ahora: AHORA }

describe("avisoDeFactura", () => {
  it("borrador: qué falta para expedirla, o que está desactualizado", () => {
    expect(
      avisoDeFactura(factura({ estado: "BORRADOR", numero: null }), opciones)
    ).toMatchObject({ tono: "info", titulo: "Borrador: falta expedirla" })
    expect(
      avisoDeFactura(factura({ estado: "BORRADOR", numero: null }), {
        ...opciones,
        desactualizada: true,
      })
    ).toMatchObject({
      tono: "peligro",
      titulo: "Borrador desactualizado",
      texto: MENSAJES_FACTURACION.borradorDesactualizado,
    })
  })

  it("emitida y con pago parcial: el saldo y el vencimiento en voz de quien cobra", () => {
    const emitida = avisoDeFactura(factura(), opciones)
    expect(emitida.titulo).toMatch(/^Emitida · por cobrar \$\s?6\.000\.000$/)
    expect(emitida.texto).toMatch(/^Vence en 30 días\./)
    const parcial = avisoDeFactura(
      factura({ estado: "PAGADA_PARCIAL", fechaVencimiento: "2026-10-20" }),
      opciones
    )
    expect(parcial.tono).toBe("peligro")
    expect(parcial.texto).toMatch(/^Venció hace 3 días\./)
  })

  it("vencida: aparece en la cartera vencida (LIQ-008 c3)", () => {
    const vencida = avisoDeFactura(
      factura({ estado: "VENCIDA", fechaVencimiento: "2026-10-11" }),
      opciones
    )
    expect(vencida).toMatchObject({ tono: "peligro" })
    expect(vencida.texto).toMatch(/Venció hace 12 días.*cartera vencida/)
  })

  it("anulada con la referencia de su nota crédito (LIQ-008 c4) o borrador anulado", () => {
    expect(
      avisoDeFactura(factura({ estado: "ANULADA", saldo: 0 }), {
        ...opciones,
        notaQueAnula: nota,
      }).titulo
    ).toBe("Anulada con la nota crédito NC125")
    expect(
      avisoDeFactura(factura({ estado: "ANULADA", numero: null }), opciones)
        .titulo
    ).toBe("Borrador anulado")
  })

  it("pagada: desde cuándo", () => {
    expect(
      avisoDeFactura(
        factura({
          estado: "PAGADA",
          saldo: 0,
          pagadaAt: "2026-10-20T15:00:00Z",
        }),
        opciones
      ).texto
    ).toBe("Sin saldo pendiente desde el 20 de octubre de 2026.")
  })
})

describe("EstadoFactura", () => {
  it("es una región con nombre y enfocable (recibe el foco tras un cambio)", () => {
    render(
      <EstadoFactura
        factura={factura() as FichaFactura}
        desactualizada={false}
        notaQueAnula={null}
        ahora={AHORA}
      />
    )
    const region = screen.getByRole("region", {
      name: /^Emitida · por cobrar/,
    })
    expect(region).toHaveAttribute("id", ID_ESTADO_FACTURA)
    expect(region).toHaveAttribute("tabindex", "-1")
  })
})
