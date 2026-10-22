import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  documentoFijo,
  DOCUMENTOS_NIVEL_1,
  medioFijo,
  resumenCompleto,
} from "../fixtures"
import type { ConsumoTope } from "../tipos"
import { VistaNivel } from "./vista-nivel"

const verificado = (nivel: number) =>
  medioFijo({
    estado: "VERIFICADO",
    nivel,
    verificadoAt: "2026-06-01T12:00:00Z",
  })

const consumo = (consumido: number, tope: number | null = 30_000_000) =>
  ({ tope, consumido, anio: 2026 }) satisfies ConsumoTope

describe("VistaNivel · durante el alta", () => {
  it("explica que aún no tiene nivel y cómo obtener el 1", () => {
    render(
      <VistaNivel
        resumen={resumenCompleto({ medio: medioFijo() })}
        consumo={null}
      />
    )
    expect(
      screen.getByRole("heading", { name: "Aún no tienes nivel" })
    ).toBeInTheDocument()
    const camino = screen.getByRole("region", {
      name: "Cómo obtener tu nivel 1",
    })
    expect(within(camino).getByText("Lo que debes cargar")).toBeInTheDocument()
    expect(within(camino).getByText("Opcional")).toBeInTheDocument()
    expect(
      within(camino).getByRole("link", { name: "Cargar documentos" })
    ).toHaveAttribute("href", "/mi-medio/documentos?nivel=1")
    expect(
      within(camino).getByRole("link", { name: "Ver mi lista de alta" })
    ).toHaveAttribute("href", "/mi-medio")
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("VistaNivel · verificado", () => {
  it("muestra su nivel, sus documentos y lo nuevo para subir", () => {
    render(
      <VistaNivel
        resumen={resumenCompleto({ medio: verificado(1) })}
        consumo={consumo(6_000_000)}
      />
    )
    expect(
      screen.getByText("Nivel 1 · Persona natural informal")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("meter", { name: "Avance del tope anual" })
    ).toBeInTheDocument()
    const documentos = screen.getByRole("region", {
      name: "Documentos de tu nivel",
    })
    expect(within(documentos).getAllByText("Aprobado")).toHaveLength(3)

    const camino = screen.getByRole("region", { name: "Cómo subir al nivel 2" })
    expect(
      within(camino).getByText("Lo nuevo que debes cargar")
    ).toBeInTheDocument()
    expect(within(camino).getByText("RUT")).toBeInTheDocument()
    // «Mis documentos» abre en el nivel verificado: el enlace pide el objetivo.
    expect(
      within(camino).getByRole("link", { name: "Cargar documentos" })
    ).toHaveAttribute("href", "/mi-medio/documentos?nivel=2")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("avisa desde el 80 % del tope y enlaza al camino para subir", () => {
    render(
      <VistaNivel
        resumen={resumenCompleto({ medio: verificado(1) })}
        consumo={consumo(25_000_000)}
      />
    )
    const aviso = screen.getByRole("alert")
    expect(aviso).toHaveTextContent("Llevas el 83% de tu tope anual")
    expect(
      within(aviso).getByRole("link", { name: "Mira cómo subir de nivel" })
    ).toHaveAttribute("href", "#subir-de-nivel")
  })

  it("con el RUT cargado dice que solo falta la revisión", () => {
    render(
      <VistaNivel
        resumen={resumenCompleto({
          medio: verificado(1),
          documentos: [
            ...DOCUMENTOS_NIVEL_1,
            documentoFijo({ tipo: "RUT", estado: "PENDIENTE" }),
          ],
        })}
        consumo={consumo(0)}
      />
    )
    expect(screen.getByText("Ya cargaste lo necesario")).toBeInTheDocument()
  })

  it("en el nivel 3 no hay tope ni nivel siguiente", () => {
    render(
      <VistaNivel
        resumen={resumenCompleto({ medio: verificado(3) })}
        consumo={consumo(0, null)}
      />
    )
    expect(
      screen.getByRole("heading", { name: "Estás en el nivel más alto" })
    ).toBeInTheDocument()
    expect(screen.getByText(/Tu nivel no tiene tope anual/)).toBeInTheDocument()
    expect(screen.queryByRole("meter")).toBeNull()
    const niveles = screen.getByRole("region", { name: "Los niveles de AMO" })
    expect(
      within(niveles)
        .getAllByRole("listitem")
        .filter((item) => item.getAttribute("aria-current") === "true")
    ).toHaveLength(1)
  })

  it("si no se pudo leer el consumo, lo dice sin inventar cifras", () => {
    render(
      <VistaNivel
        resumen={resumenCompleto({ medio: verificado(1) })}
        consumo={null}
      />
    )
    expect(
      screen.getByText(/No pudimos consultar cuánto llevas de tu tope/)
    ).toBeInTheDocument()
  })
})
