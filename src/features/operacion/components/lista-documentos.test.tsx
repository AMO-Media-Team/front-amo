import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ListaDocumentos } from "./lista-documentos"

const DESCRIPCION = "Solo metadatos de la revisión."

describe("ListaDocumentos", () => {
  it("sin documentos ni texto propio usa el aviso genérico", () => {
    render(<ListaDocumentos documentos={[]} descripcion={DESCRIPCION} />)
    expect(screen.getByText("Sin documentos cargados")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Los documentos que suba para su verificación aparecerán aquí."
      )
    ).toBeInTheDocument()
  })

  it("sin documentos explica quién los carga y ofrece el paso siguiente", () => {
    render(
      <ListaDocumentos
        documentos={[]}
        descripcion={DESCRIPCION}
        vacio={{
          descripcion: "Los carga el propio medio desde su cuenta.",
          accion: <button type="button">Invitar a su equipo</button>,
        }}
      />
    )
    expect(
      screen.getByText("Los carga el propio medio desde su cuenta.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Invitar a su equipo" })
    ).toBeInTheDocument()
  })

  it("con documentos lista cada uno con su estado y no muestra el vacío", () => {
    render(
      <ListaDocumentos
        documentos={[
          {
            id: "d1",
            tipo: "Cédula (frente)",
            estado: "PENDIENTE",
            venceAt: null,
            validadoAt: null,
            subidoAt: "2026-11-08T19:46:25Z",
            observaciones: null,
          },
        ]}
        descripcion={DESCRIPCION}
        vacio={{ descripcion: "No debe verse." }}
      />
    )
    expect(screen.getByText("Cédula (frente)")).toBeInTheDocument()
    expect(screen.queryByText("No debe verse.")).not.toBeInTheDocument()
  })
})
