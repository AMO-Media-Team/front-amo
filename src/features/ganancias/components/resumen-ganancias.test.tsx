import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { RESUMEN } from "../fixtures"
import { ResumenGanancias } from "./resumen-ganancias"

/** Los separadores de Intl (U+00A0, U+202F) como espacios, para comparar. */
const plano = (texto: string | null) => (texto ?? "").replace(/[  ]/g, " ")

function monto(etiqueta: string) {
  const termino = screen.getByText(etiqueta, { selector: "dt" })
  return termino.parentElement as HTMLElement
}

describe("ResumenGanancias", () => {
  it("lo por liquidar se rotula «Estimado antes de retenciones» (MED-015 c2)", () => {
    render(<ResumenGanancias resumen={RESUMEN} />)
    expect(
      screen.getByRole("region", { name: "Resumen de tus ganancias" })
    ).toBeVisible()
    const porLiquidar = monto("Por liquidar")
    expect(plano(porLiquidar.textContent)).toContain("$ 1.707.440")
    expect(
      within(porLiquidar).getByText("Estimado antes de retenciones")
    ).toBeVisible()
    expect(
      within(porLiquidar).getByText("3 publicaciones verificadas")
    ).toBeVisible()
  })

  it("muestra lo ganado este mes, por pagar, pagado y retenido, y la regla", () => {
    render(<ResumenGanancias resumen={RESUMEN} />)
    expect(screen.getByText("Ganado este mes")).toBeVisible()
    expect(
      within(monto("Por pagar")).getByText("Próximo pago hasta el 23 oct 2026")
    ).toBeVisible()
    expect(plano(monto("Pagado a la fecha").textContent)).toContain(
      "$ 26.565.356"
    )
    expect(plano(monto("Retenciones practicadas").textContent)).toContain(
      "$ 1.377.516"
    )
    expect(
      screen.getByText(
        /Liquidamos cada quincena y pagamos en hasta 8 días\. El plazo se cuenta desde el cierre de cada periodo\./
      )
    ).toBeVisible()
  })

  it("sin nada por liquidar ni por pagar, no inventa fechas", () => {
    render(
      <ResumenGanancias
        resumen={{
          ...RESUMEN,
          porLiquidar: 0,
          asignacionesPorLiquidar: 0,
          porPagar: 0,
          proximoPagoEstimado: null,
          diasPago: null,
        }}
      />
    )
    expect(screen.queryByText(/Próximo pago/)).not.toBeInTheDocument()
    expect(screen.queryByText(/verificadas/)).not.toBeInTheDocument()
    expect(screen.getByText("Liquidamos cada quincena.")).toBeVisible()
  })
})
