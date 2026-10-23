import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { ResumenMisCampanas } from "../tipos"
import { ResumenCampanas } from "./resumen-mis-campanas"

const RESUMEN: ResumenMisCampanas = {
  total: 3,
  activas: 1,
  borradores: 2,
  cerradas: 0,
  presupuestoActivas: 10_000_000,
  comprometidoActivas: 2_000_000,
}

describe("ResumenCampanas", () => {
  it("dice lo que falta por comprometer, no lo «libre» para ofertas nuevas", () => {
    render(<ResumenCampanas resumen={RESUMEN} />)
    // Las ofertas en revisión o publicadas reservan su presupuesto sin
    // comprometerlo: lo libre de verdad está en la ficha (`disponible_campana`).
    expect(screen.getByText(/sin comprometer$/)).toHaveTextContent(
      /^20\s?% del presupuesto activo · \$\s?8\.000\.000 sin comprometer$/
    )
    expect(screen.queryByText(/libres/)).toBeNull()
  })

  it("describe las activas sin prometer que ya tienen ofertas", () => {
    render(<ResumenCampanas resumen={RESUMEN} />)
    expect(
      screen.getByText("En curso: puedes enviar sus ofertas a revisión")
    ).toBeInTheDocument()
    expect(screen.queryByText(/revisión o en el marketplace/)).toBeNull()
  })
})
