import { render, screen, within } from "@testing-library/react"
import type { Route } from "next"
import { describe, expect, it } from "vitest"

import {
  AvisoModoAsistido,
  ETIQUETA_AVISO_ASISTIDO,
} from "./aviso-modo-asistido"

const FICHA =
  "/operacion/anunciantes/e2e00000-0000-4000-8000-00000000a001" as Route

function aviso() {
  return screen.getByRole("note", { name: ETIQUETA_AVISO_ASISTIDO })
}

describe("AvisoModoAsistido", () => {
  it("dice por cuenta de quién se actúa, la bitácora y el aviso a la empresa", () => {
    render(
      <AvisoModoAsistido
        anunciante="Café Sierra Alta"
        estado="VERIFICADO"
        enlace={FICHA}
      />
    )
    expect(aviso()).toHaveTextContent(
      "Estás actuando por cuenta de Café Sierra Alta. Cada cambio queda en la bitácora a tu nombre y se le avisa a la empresa."
    )
    expect(
      within(aviso()).getByRole("link", { name: "Café Sierra Alta" })
    ).toHaveAttribute("href", FICHA)
    // Verificada: no hay nada que advertir.
    expect(aviso()).not.toHaveTextContent(/exige la empresa verificada/)
  })

  it("con la empresa sin verificar, dice hasta dónde se puede llegar", () => {
    render(<AvisoModoAsistido anunciante="Ferretería" estado="PENDIENTE" />)
    expect(aviso()).toHaveTextContent(
      "Puedes preparar borradores; activar y enviar a revisión exige la empresa verificada."
    )
    expect(aviso()).toHaveTextContent("En verificación")
    // Sin permiso para la ficha, el nombre no enlaza.
    expect(within(aviso()).queryByRole("link")).toBeNull()
  })

  it("sin anunciante elegido pide elegirlo y no advierte nada aún", () => {
    render(<AvisoModoAsistido anunciante={null} estado={null} />)
    expect(aviso()).toHaveTextContent(
      /^Elige la empresa por cuenta de la cual actúas\./
    )
    expect(aviso()).not.toHaveTextContent(/exige la empresa verificada/)
  })
})
