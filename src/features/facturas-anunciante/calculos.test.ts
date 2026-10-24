import { describe, expect, it } from "vitest"

import { agruparConceptos, condicionEstados, resumenPorPagar } from "./calculos"
import type { ConceptoFactura, FacturaConSaldo } from "./tipos"

const HOY = "2026-10-23"

function factura(
  id: string,
  parcial: Partial<FacturaConSaldo> = {}
): FacturaConSaldo {
  return {
    id,
    numero: `FE${id}`,
    estado: "EMITIDA",
    fechaVencimiento: "2026-11-30",
    saldo: 100,
    ...parcial,
  }
}

describe("resumenPorPagar", () => {
  it("suma el saldo, separa lo vencido y elige la que vence primero", () => {
    const resumen = resumenPorPagar(
      [
        factura("1", { saldo: 1_000.1, fechaVencimiento: "2026-11-15" }),
        factura("2", {
          estado: "VENCIDA",
          saldo: 200.2,
          fechaVencimiento: "2026-09-01",
        }),
        // Vencida por fecha aunque la tarea programada aún no la marque.
        factura("3", { saldo: 300.3, fechaVencimiento: "2026-10-22" }),
        factura("4", {
          estado: "PAGADA_PARCIAL",
          saldo: 50,
          fechaVencimiento: "2026-10-28",
        }),
        factura("5", { estado: "PAGADA", saldo: 0 }),
      ],
      HOY
    )
    expect(resumen.porPagar).toBe(1_550.6)
    expect(resumen.facturasPorPagar).toBe(4)
    expect(resumen.vencido).toBe(500.5)
    expect(resumen.facturasVencidas).toBe(2)
    expect(resumen.proximo).toEqual({
      id: "4",
      numero: "FE4",
      fechaVencimiento: "2026-10-28",
      saldo: 50,
      plazo: { texto: "Vence en 5 días", tono: "aviso", dias: 5 },
      otrasElMismoDia: 0,
    })
  })

  it("si varias vencen el mismo día, muestra la de mayor saldo y cuenta las demás", () => {
    const { proximo } = resumenPorPagar(
      [
        factura("a", { saldo: 10, fechaVencimiento: HOY }),
        factura("b", { saldo: 90, fechaVencimiento: HOY }),
        factura("c", { saldo: 50, fechaVencimiento: HOY }),
      ],
      HOY
    )
    expect(proximo?.id).toBe("b")
    expect(proximo?.plazo.texto).toBe("Vence hoy")
    expect(proximo?.otrasElMismoDia).toBe(2)
  })

  it("sin facturas con saldo, todo en cero y sin próximo vencimiento", () => {
    expect(
      resumenPorPagar([factura("x", { estado: "ANULADA", saldo: 0 })], HOY)
    ).toEqual({
      porPagar: 0,
      facturasPorPagar: 0,
      vencido: 0,
      facturasVencidas: 0,
      proximo: null,
    })
  })

  it("las que no tienen fecha de vencimiento cuentan en el saldo, no en el próximo", () => {
    const resumen = resumenPorPagar(
      [factura("s", { fechaVencimiento: null, saldo: 70 })],
      HOY
    )
    expect(resumen.porPagar).toBe(70)
    expect(resumen.proximo).toBeNull()
  })
})

function concepto(
  id: string,
  parcial: Partial<ConceptoFactura> = {}
): ConceptoFactura {
  return {
    id,
    campanaId: "c1",
    campana: "Navidad",
    medioId: "m1",
    medio: "Radio Pasto",
    plataforma: "INSTAGRAM",
    formato: "Post de feed",
    oferta: "Post navideño",
    verificadaAt: "2026-10-01T15:00:00Z",
    valor: 100,
    estado: "VERIFICADA",
    ...parcial,
  }
}

describe("agruparConceptos", () => {
  it("agrupa por campaña con su total, el de mayor valor primero", () => {
    const grupos = agruparConceptos([
      concepto("1", { valor: 100.1 }),
      concepto("2", {
        campanaId: "c2",
        campana: "Vacaciones",
        valor: 500,
      }),
      concepto("3", { valor: 200.2, verificadaAt: "2026-09-01T15:00:00Z" }),
    ])
    expect(grupos.map((grupo) => [grupo.campana, grupo.total])).toEqual([
      ["Vacaciones", 500],
      ["Navidad", 300.3],
    ])
    // Dentro del grupo, por fecha de verificación.
    expect(grupos[1].conceptos.map((c) => c.id)).toEqual(["3", "1"])
  })

  it("sin conceptos no hay grupos", () => {
    expect(agruparConceptos([])).toEqual([])
  })
})

describe("condicionEstados", () => {
  it("sin estados no filtra", () => {
    expect(condicionEstados([], HOY)).toBeNull()
    expect(condicionEstados(["BORRADOR"], HOY)).toBeNull()
  })

  it("«Vencida» incluye las que vencieron por fecha", () => {
    expect(condicionEstados(["VENCIDA"], HOY)).toBe(
      "estado.eq.VENCIDA,and(estado.in.(EMITIDA,PAGADA_PARCIAL),fecha_vencimiento.lt.2026-10-23)"
    )
  })

  it("«Por pagar» y «Pago parcial» excluyen las vencidas por fecha", () => {
    expect(condicionEstados(["EMITIDA", "PAGADA"], HOY)).toBe(
      "and(estado.eq.EMITIDA,or(fecha_vencimiento.is.null,fecha_vencimiento.gte.2026-10-23)),estado.eq.PAGADA"
    )
    expect(condicionEstados(["PAGADA_PARCIAL", "PAGADA_PARCIAL"], HOY)).toBe(
      "and(estado.eq.PAGADA_PARCIAL,or(fecha_vencimiento.is.null,fecha_vencimiento.gte.2026-10-23))"
    )
  })

  it("rechaza un `hoy` que no es una fecha (nada crudo llega al filtro)", () => {
    expect(() => condicionEstados(["PAGADA"], "2026-10-23),x")).toThrow()
  })
})
