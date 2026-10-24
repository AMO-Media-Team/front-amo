import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { liquidacion, liquidacionPorFacturar } from "../fixtures"
import type { RetencionAgrupada } from "../tipos"

vi.mock("../actions", () => ({ firmarArchivoLiquidacion: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock("next/navigation", () => ({ usePathname: () => "/ganancias/x" }))

import {
  AvisoLiquidacionAnulada,
  CabeceraLiquidacionMedio,
  DesgloseLiquidacion,
  DocumentoSoporteLiquidacion,
  PagoLiquidacion,
  PublicacionesLiquidacion,
} from "./detalle-liquidacion"

/** Los separadores de Intl (U+00A0, U+202F) como espacios, para comparar. */
const plano = (texto: string | null) => (texto ?? "").replace(/[  ]/g, " ")

const HOY = "2026-10-22"

const RETENCIONES: RetencionAgrupada[] = [
  {
    clave: "f",
    tipo: "RETEFUENTE",
    concepto: "SERVICIOS",
    tarifa: 0.06,
    base: 8_000_000,
    valor: 480_000,
    municipioCodigo: null,
    municipio: null,
  },
  {
    clave: "i",
    tipo: "RETEICA",
    concepto: "ICA",
    tarifa: 0.00966,
    base: 8_000_000,
    valor: 77_280,
    municipioCodigo: "11001",
    municipio: "Bogotá, D.C.",
  },
]

function filas() {
  return screen
    .getAllByRole("term")
    .map((termino) => plano(termino.parentElement?.textContent ?? ""))
}

describe("liquidación anulada", () => {
  it("la cabecera dice que se anuló y que su neto no se paga", () => {
    render(
      <CabeceraLiquidacionMedio
        liquidacion={liquidacion({ estado: "ANULADA" })}
        hoy={HOY}
      />
    )
    expect(
      screen.getByRole("heading", { level: 1, name: "1 – 15 oct 2026" })
    ).toBeVisible()
    expect(screen.getByText("Anulada")).toBeVisible()
    expect(screen.getByText("Neto (anulado: no se paga)")).toBeVisible()
    expect(screen.queryByText(/Recib/)).not.toBeInTheDocument()
  })

  it("el aviso explica adónde volvieron sus publicaciones y lleva a «Por liquidar»", () => {
    render(<AvisoLiquidacionAnulada />)
    const aviso = screen.getByRole("region", {
      name: "Esta liquidación se anuló",
    })
    expect(aviso).toHaveTextContent(
      "Sus publicaciones volvieron a Por liquidar y entrarán en el próximo corte."
    )
    expect(
      within(aviso).getByRole("link", { name: "Ver lo que tengo por liquidar" })
    ).toHaveAttribute("href", "/ganancias#por-liquidar")
    expect(within(aviso).queryByRole("button")).not.toBeInTheDocument()
  })
})

describe("DesgloseLiquidacion", () => {
  it("del valor de la pauta al neto, con cada retención, su tarifa, base y municipio", () => {
    render(
      <DesgloseLiquidacion
        liquidacion={liquidacion()}
        retenciones={RETENCIONES}
      />
    )
    expect(filas()).toEqual([
      "Valor de la pauta$ 10.000.000Lo que pagó el anunciante por tus publicaciones.",
      "Comisión de AMO− $ 2.000.000",
      "Tu valor antes de retenciones$ 8.000.000",
      "Retención en la fuente− $ 480.000Servicios · 6 % · base $ 8.000.000",
      "ReteICA− $ 77.280Bogotá, D.C. · 9,66 ‰ · base $ 8.000.000",
      "Neto que recibiste$ 7.442.720",
    ])
  })

  it("con la comisión oculta no muestra bruto ni comisión; sin detalle, las retenciones por tipo", () => {
    render(
      <DesgloseLiquidacion
        liquidacion={liquidacion({
          estado: "APROBADA",
          montoBruto: null,
          montoComision: null,
        })}
        retenciones={[]}
      />
    )
    expect(filas()).toEqual([
      "Tu valor antes de retenciones$ 8.000.000",
      "Retención en la fuente− $ 480.000",
      "ReteICA− $ 77.280",
      "Neto a recibir$ 7.442.720",
    ])
  })
})

describe("PagoLiquidacion", () => {
  it("una pagada muestra la fecha, la referencia y el soporte descargable (MED-015 c1)", () => {
    const { container: pago } = render(
      <PagoLiquidacion liquidacion={liquidacion()} hoy={HOY} />
    )
    expect(within(pago).getByRole("heading", { name: "Pago" })).toBeVisible()
    expect(within(pago).getByText("21 oct 2026")).toBeVisible()
    expect(within(pago).getByText("TRF-20261021-1")).toBeVisible()
    expect(
      within(pago).getByRole("button", {
        name: "Soporte de pago del periodo 1 – 15 oct 2026",
      })
    ).toBeVisible()
  })

  it("mientras no se paga dice cuándo se espera", () => {
    render(
      <PagoLiquidacion
        liquidacion={liquidacionPorFacturar({
          fechaPagoEstimada: "2026-10-20",
        })}
        hoy={HOY}
      />
    )
    expect(
      screen.getByText("Hasta el 20 oct 2026: va con retraso")
    ).toBeVisible()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})

describe("DocumentoSoporteLiquidacion", () => {
  it("sin CUDS: «Pendiente de transmisión a la DIAN», con su PDF", () => {
    render(<DocumentoSoporteLiquidacion liquidacion={liquidacion()} />)
    expect(screen.getByText("DSF2")).toBeVisible()
    expect(screen.getByText("Pendiente de transmisión a la DIAN")).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "Documento soporte del periodo 1 – 15 oct 2026",
      })
    ).toBeVisible()
  })

  it("con CUDS lo muestra completo; en borrador explica cuándo llega", () => {
    const cuds = "ab".repeat(48)
    const { unmount } = render(
      <DocumentoSoporteLiquidacion
        liquidacion={liquidacion({
          documento: {
            numero: "DSF2",
            fecha: "2026-10-17",
            estado: "EMITIDO",
            cuds,
            conArchivo: false,
          },
        })}
      />
    )
    expect(screen.getByText(cuds)).toBeVisible()
    expect(screen.getByText(/Estamos generando el PDF/)).toBeVisible()
    unmount()
    render(
      <DocumentoSoporteLiquidacion
        liquidacion={liquidacion({ estado: "BORRADOR", documento: null })}
      />
    )
    expect(
      screen.getByText(/Lo emitimos cuando aprobemos esta liquidación/)
    ).toBeVisible()
  })
})

describe("PublicacionesLiquidacion", () => {
  it("cada publicación con su campaña (si se puede abrir), valor y neto", () => {
    render(
      <PublicacionesLiquidacion
        enlazarCampanas
        lineas={[
          {
            asignacionId: "a1",
            oferta: "Post de feed · Amor y Amistad",
            marca: "Marca Uno",
            anunciante: "Marca Uno",
            plataforma: "INSTAGRAM",
            formato: "Post de feed",
            publicadaAt: "2026-10-05T23:34:16+00:00",
            verificadaAt: "2026-10-14T22:15:18+00:00",
            montoBruto: null,
            montoComision: null,
            montoMedio: 448_000,
            retenciones: [],
            montoRetenciones: 22_248,
            montoNeto: 425_752,
          },
        ]}
      />
    )
    expect(
      screen.getByRole("link", { name: "Post de feed · Amor y Amistad" })
    ).toHaveAttribute("href", "/mis-campanas/a1")
    const item = screen.getByRole("listitem")
    expect(plano(item.textContent)).toContain("$ 448.000")
    expect(plano(item.textContent)).toContain("neto $ 425.752")
  })
})
