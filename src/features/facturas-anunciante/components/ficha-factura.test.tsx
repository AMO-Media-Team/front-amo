import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { agruparConceptos } from "../calculos"
import type {
  ConceptoFactura,
  FacturaDetalle,
  NotaCreditoFactura,
  PagoFactura,
} from "../tipos"

vi.mock("../actions", () => ({ firmarArchivoFactura: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }))
vi.mock("next/navigation", () => ({
  usePathname: () => "/facturas/x",
  useRouter: () => ({ push: vi.fn() }),
}))

import { CabeceraFactura } from "./cabecera-factura"
import { ConceptosFactura } from "./conceptos-factura"
import { NotasCreditoFactura } from "./notas-credito-factura"
import { PagosFactura } from "./pagos-factura"
import { ResumenFacturas } from "./resumen-facturas"
import { TotalesFactura } from "./totales-factura"

/** Los separadores de Intl (U+00A0, U+202F) como espacios, para comparar. */
const plano = (texto: string | null | undefined) =>
  (texto ?? "").replace(/[  ]/g, " ")

const FACTURA: FacturaDetalle = {
  id: "0199f3a0-0000-7000-8000-00000000f001",
  numero: "FE1042",
  estado: "PAGADA_PARCIAL",
  fechaEmision: "2026-10-01",
  fechaVencimiento: "2026-10-31",
  plazo: { texto: "Vence en 8 días", tono: "neutro", dias: 8 },
  periodoDesde: "2026-09-01",
  periodoHasta: "2026-09-30",
  esquema: "MANDATO",
  porcentajeIva: 0.19,
  subtotal: 1_000_000,
  iva: 190_000,
  valorTerceros: 4_000_000,
  total: 5_190_000,
  pagado: 2_000_000,
  valorNotasCredito: 190_000,
  saldo: 3_000_000,
  cufe: `ab${"0".repeat(94)}`,
  tienePdf: true,
  campana: null,
  pagadaAt: null,
  anuladaAt: null,
  esDemo: false,
}

describe("TotalesFactura", () => {
  it("muestra el documento en mandato: IVA, terceros, pagado con retenciones, notas y saldo", () => {
    render(<TotalesFactura factura={FACTURA} retenciones={110_000} />)
    const texto = plano(document.body.textContent)
    expect(texto).toMatch(/IVA \(19\s?%\)\$ 190\.000/)
    expect(texto).toContain("Ingreso recibido para terceros")
    expect(texto).toContain("$ 4.000.000")
    expect(texto).toContain("Total$ 5.190.000")
    expect(texto).toContain("Incluye $ 110.000 de retenciones que practicaste.")
    expect(texto).toContain("Notas crédito")
    expect(texto).toContain("menos $ 190.000")
    expect(texto).toContain("Saldo por pagar$ 3.000.000")
  })

  it("en compra y reventa no hay ingreso para terceros ni notas si no las hubo", () => {
    render(
      <TotalesFactura
        factura={{
          ...FACTURA,
          esquema: "COMPRA_REVENTA",
          valorTerceros: 0,
          valorNotasCredito: 0,
        }}
        retenciones={0}
      />
    )
    const texto = plano(document.body.textContent)
    expect(texto).not.toContain("terceros")
    expect(texto).not.toContain("Notas crédito")
    expect(texto).not.toContain("retenciones")
  })
})

describe("CabeceraFactura", () => {
  it("número, consolidada, periodo, estado con plazo y PDF", () => {
    render(
      <CabeceraFactura factura={FACTURA} notaQueAnula={null} verCampanas />
    )
    expect(
      screen.getByRole("heading", { level: 1, name: "Factura FE1042" })
    ).toBeVisible()
    expect(
      screen.getByText("Consolidada: cubre la pauta de varias campañas")
    ).toBeVisible()
    expect(screen.getByText("Pago parcial")).toBeVisible()
    expect(screen.getByText("Vence en 8 días")).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "Descargar PDF de la factura FE1042",
      })
    ).toBeVisible()
    expect(screen.getByRole("link", { name: "Facturas" })).toHaveAttribute(
      "href",
      "/facturas"
    )
  })

  it("vencida: el aviso dice cuánto queda por pagar", () => {
    render(
      <CabeceraFactura
        factura={{ ...FACTURA, estado: "VENCIDA", plazo: null }}
        notaQueAnula={null}
        verCampanas
      />
    )
    expect(
      plano(
        screen.getByRole("region", { name: /^Factura vencida/ }).textContent
      )
    ).toContain("quedan $ 3.000.000 por pagar")
  })

  it("anulada: nombra la nota crédito y aclara que no hay que pagarla", () => {
    const nota: NotaCreditoFactura = {
      id: "n1",
      numero: "NC7",
      fechaEmision: "2026-10-15",
      valor: 5_190_000,
      motivo: "Se anuló la campaña completa por error.",
      anulaFactura: true,
    }
    render(
      <CabeceraFactura
        factura={{ ...FACTURA, estado: "ANULADA", saldo: 0, plazo: null }}
        notaQueAnula={nota}
        verCampanas
      />
    )
    expect(
      screen.getByRole("region", {
        name: "Factura anulada: no tienes que pagarla",
      })
    ).toHaveTextContent("nota crédito NC7 del 15 de octubre de 2026")
  })

  it("por campaña: la campaña enlaza a su ficha si el rol la gestiona", () => {
    const campana = {
      id: "0199f3a0-0000-7000-8000-0000000c0001",
      nombre: "Navidad",
    }
    const { unmount } = render(
      <CabeceraFactura
        factura={{ ...FACTURA, campana }}
        notaQueAnula={null}
        verCampanas
      />
    )
    expect(screen.getByRole("link", { name: "Navidad" })).toHaveAttribute(
      "href",
      `/campanas/${campana.id}`
    )
    unmount()
    render(
      <CabeceraFactura
        factura={{ ...FACTURA, campana }}
        notaQueAnula={null}
        verCampanas={false}
      />
    )
    expect(screen.queryByRole("link", { name: "Navidad" })).toBeNull()
    expect(screen.getByText("Navidad")).toBeVisible()
  })
})

describe("PagosFactura y NotasCreditoFactura", () => {
  const pago: PagoFactura = {
    id: "p1",
    fecha: "2026-10-21",
    monto: 1_890_000,
    retenciones: 110_000,
    medioPago: "PSE",
    referencia: "REF-123",
    tieneSoporte: true,
  }

  it("cada pago con su valor, retenciones, medio, referencia y soporte", () => {
    render(<PagosFactura pagos={[pago]} conSaldo />)
    const [fila] = within(
      screen.getByRole("list", { name: "Pagos de la factura" })
    ).getAllByRole("listitem")
    expect(plano(fila.textContent)).toContain("$ 1.890.000")
    expect(fila).toHaveTextContent("21 de octubre de 2026")
    expect(fila).toHaveTextContent("PSE · Referencia REF-123")
    expect(plano(fila.textContent)).toContain(
      "Más $ 110.000 de retenciones que practicaste"
    )
    expect(
      within(fila).getByRole("button", {
        name: "Descargar el soporte del pago del 21 de octubre de 2026",
      })
    ).toBeVisible()
  })

  it("sin pagos, explica cuándo aparecerán", () => {
    render(<PagosFactura pagos={[]} conSaldo />)
    expect(
      screen.getByText(/Cuando AMO reciba tu pago lo verás aquí/)
    ).toBeVisible()
  })

  it("notas crédito con motivo y PDF; sin notas no se pinta nada", () => {
    const { container, unmount } = render(<NotasCreditoFactura notas={[]} />)
    expect(container).toBeEmptyDOMElement()
    unmount()
    render(
      <NotasCreditoFactura
        notas={[
          {
            id: "n1",
            numero: "NC7",
            fechaEmision: "2026-10-15",
            valor: 190_000,
            motivo: "Una publicación se canceló después de facturarse.",
            anulaFactura: false,
          },
        ]}
      />
    )
    const lista = screen.getByRole("list", {
      name: "Notas crédito de la factura",
    })
    expect(plano(lista.textContent)).toContain("rebaja de $ 190.000")
    expect(lista).toHaveTextContent("Una publicación se canceló")
    expect(
      within(lista).getByRole("button", {
        name: "Descargar el PDF de la nota crédito NC7",
      })
    ).toBeVisible()
  })
})

describe("ConceptosFactura", () => {
  const base: ConceptoFactura = {
    id: "0199f3a0-0000-7000-8000-0000000a0001",
    campanaId: "0199f3a0-0000-7000-8000-0000000c0001",
    campana: "Navidad",
    medioId: "m1",
    medio: "Radio Pasto",
    plataforma: "INSTAGRAM",
    formato: "Post de feed",
    oferta: "Post navideño",
    verificadaAt: "2026-09-10T15:00:00Z",
    valor: 350_000,
    estado: "VERIFICADA",
  }

  it("agrupa por campaña con su total y enlaza cada medio al seguimiento", () => {
    render(
      <ConceptosFactura
        grupos={agruparConceptos([
          base,
          {
            ...base,
            id: "0199f3a0-0000-7000-8000-0000000a0002",
            campanaId: "0199f3a0-0000-7000-8000-0000000c0002",
            campana: "Vacaciones",
            medio: "Noticias Tumaco",
            valor: 200_000,
            estado: "EN_DISPUTA",
          },
        ])}
        mandato={false}
        anulada={false}
        verSeguimiento
        verCampanas
      />
    )
    expect(
      plano(screen.getByText(/2 publicaciones de 2 campañas/).textContent)
    ).toBe("2 publicaciones de 2 campañas · $ 550.000 de pauta")
    const navidad = screen.getByRole("list", { name: "Conceptos de Navidad" })
    expect(
      within(navidad).getByRole("link", { name: "Radio Pasto" })
    ).toHaveAttribute(
      "href",
      `/campanas/${base.campanaId}?pestana=seguimiento&asignacion=${base.id}`
    )
    expect(navidad).toHaveTextContent(
      "Instagram · Post de feed · Post navideño"
    )
    // Una asignación facturada que entró en disputa se marca (D88).
    expect(
      screen.getByRole("list", { name: "Conceptos de Vacaciones" })
    ).toHaveTextContent("En disputa")
  })

  it("anulada sin conceptos: explica que la pauta quedó libre", () => {
    render(
      <ConceptosFactura
        grupos={[]}
        mandato={false}
        anulada
        verSeguimiento
        verCampanas
      />
    )
    expect(
      screen.getByText(/su pauta quedó libre para facturarse de nuevo/)
    ).toBeVisible()
  })
})

describe("ResumenFacturas", () => {
  it("por pagar, vencido con enlace al filtro y el próximo vencimiento con enlace a la factura", () => {
    render(
      <ResumenFacturas
        resumen={{
          porPagar: 7_800_000,
          facturasPorPagar: 3,
          vencido: 4_800_000,
          facturasVencidas: 1,
          proximo: {
            id: "0199f3a0-0000-7000-8000-00000000f001",
            numero: "FE1042",
            fechaVencimiento: "2026-10-28",
            saldo: 3_000_000,
            plazo: { texto: "Vence en 5 días", tono: "aviso", dias: 5 },
            otrasElMismoDia: 0,
          },
        }}
      />
    )
    const resumen = screen.getByRole("region", {
      name: "Resumen de tus facturas",
    })
    expect(resumen).toHaveTextContent("Saldo de 3 facturas")
    expect(
      within(resumen).getByRole("link", { name: "Vencido" })
    ).toHaveAttribute("href", "/facturas?estado=VENCIDA")
    expect(
      within(resumen).getByRole("link", { name: "Próximo vencimiento" })
    ).toHaveAttribute("href", "/facturas/0199f3a0-0000-7000-8000-00000000f001")
    expect(plano(resumen.textContent)).toContain(
      "Factura FE1042 · vence en 5 días (28 de oct de 2026)"
    )
  })

  it("al día: sin enlaces que lleven a listas vacías", () => {
    render(
      <ResumenFacturas
        resumen={{
          porPagar: 0,
          facturasPorPagar: 0,
          vencido: 0,
          facturasVencidas: 0,
          proximo: null,
        }}
      />
    )
    expect(screen.queryByRole("link")).toBeNull()
    expect(
      screen.getByText("Estás al día: no tienes saldos pendientes")
    ).toBeVisible()
    expect(screen.getByText("Ninguna factura por vencer")).toBeVisible()
  })
})
