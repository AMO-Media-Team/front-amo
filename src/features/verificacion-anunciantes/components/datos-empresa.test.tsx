import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { ExpedienteAnunciante } from "../tipos"
import { DatosEmpresa } from "./datos-empresa"

const ANUNCIANTE: ExpedienteAnunciante["anunciante"] = {
  id: "0192f3a4-5b6c-7d8e-9f01-0000000000aa",
  nombreComercial: "Café del Sur",
  razonSocial: "Café del Sur S.A.S.",
  identificacion: "900.123.456-7",
  tipoIdentificacion: "NIT",
  paisIso2: "CO",
  pais: "Colombia",
  ciudad: "Pasto",
  sector: null,
  estado: "PENDIENTE",
  motivoEstado: null,
  enviadoAt: null,
  verificadoAt: null,
  verificadoPor: null,
  identificacionCambiadaAt: null,
}

describe("DatosEmpresa", () => {
  it("muestra la razón social y el NIT con su dígito para compararlos", () => {
    render(<DatosEmpresa anunciante={ANUNCIANTE} />)
    expect(screen.getByText("Razón social").nextSibling).toHaveTextContent(
      "Café del Sur S.A.S."
    )
    expect(screen.getByText("NIT").nextSibling).toHaveTextContent(
      "900.123.456-7"
    )
    expect(screen.getByText("Sector").nextSibling).toHaveTextContent(
      "Sin registrar"
    )
    expect(
      screen.getByText(/la empresa corrige estos datos/)
    ).toBeInTheDocument()
  })

  it("una empresa del exterior se identifica con su identificación tributaria", () => {
    render(
      <DatosEmpresa
        anunciante={{
          ...ANUNCIANTE,
          identificacion: "EIN 12-3456789",
          tipoIdentificacion: "Identificación tributaria",
          paisIso2: "US",
          pais: "Estados Unidos",
          ciudad: "Miami",
        }}
      />
    )
    expect(
      screen.getByText("Identificación tributaria").nextSibling
    ).toHaveTextContent("EIN 12-3456789")
  })

  it("verificada, avisa que la identificación solo la corrige el equipo AMO", () => {
    render(
      <DatosEmpresa anunciante={{ ...ANUNCIANTE, estado: "VERIFICADO" }} />
    )
    expect(
      screen.getByText(/solo las corrige el equipo AMO/)
    ).toBeInTheDocument()
  })
})
