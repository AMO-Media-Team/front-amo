import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Isotipo } from "./isotipo"
import { Logotipo } from "./logotipo"
import { ISOTIPO, ISOTIPO_COMPACTO, LOGOS } from "./trazos"

describe("Isotipo", () => {
  it("se anuncia como imagen con el nombre de la marca", () => {
    render(<Isotipo size={48} />)
    expect(screen.getByRole("img", { name: "AMO" })).toBeInTheDocument()
  })

  it("usa la versión compacta hasta 24 px", () => {
    const { container, rerender } = render(<Isotipo size={16} />)
    const svg = () => container.querySelector("svg")
    expect(svg()).toHaveAttribute("viewBox", ISOTIPO_COMPACTO.viewBox)
    rerender(<Isotipo size={32} />)
    expect(svg()).toHaveAttribute("viewBox", ISOTIPO.viewBox)
  })

  it("calcula el ancho a partir de la proporción", () => {
    const { container } = render(<Isotipo size={100} />)
    expect(container.querySelector("svg")).toHaveAttribute(
      "width",
      String(100 * ISOTIPO.proporcion)
    )
  })

  it("enlaza el relleno con un gradiente de id único", () => {
    const { container } = render(
      <>
        <Isotipo size={40} />
        <Isotipo size={40} />
      </>
    )
    const ids = [...container.querySelectorAll("linearGradient")].map(
      (g) => g.id
    )
    expect(new Set(ids).size).toBe(2)
    const rellenos = [...container.querySelectorAll("path")].map((p) =>
      p.getAttribute("fill")
    )
    expect(rellenos).toEqual(ids.map((id) => `url(#${id})`))
  })

  it("en mono pinta con currentColor y sin gradiente", () => {
    const { container } = render(<Isotipo size={40} variante="mono" />)
    expect(container.querySelector("linearGradient")).toBeNull()
    expect(container.querySelector("path")).toHaveAttribute(
      "fill",
      "currentColor"
    )
  })

  it("puede ocultarse a lectores de pantalla", () => {
    const { container } = render(<Isotipo size={40} decorativo />)
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true"
    )
    expect(screen.queryByRole("img")).toBeNull()
  })
})

describe("Logotipo", () => {
  it("elige la composición según orientación y descriptor", () => {
    const { container, rerender } = render(<Logotipo />)
    const svg = () => container.querySelector("svg")
    expect(svg()).toHaveAttribute("viewBox", LOGOS.horizontal.viewBox)
    rerender(<Logotipo orientacion="vertical" conDescriptor />)
    expect(svg()).toHaveAttribute("viewBox", LOGOS.verticalDescriptor.viewBox)
  })

  it("en tono auto lleva las tintas de ambos fondos y elige con dark:", () => {
    const { container } = render(<Logotipo />)
    const palabra = container.querySelectorAll("path")[1]
    expect(palabra).toHaveClass("dark:fill-(--marca-oscuro)")
    expect(palabra.style.getPropertyValue("--marca-claro")).toBe("#261848")
    expect(palabra.style.getPropertyValue("--marca-oscuro")).toBe("#F6F3FF")
  })

  it("en mono pinta todo con currentColor y sin gradiente", () => {
    const { container } = render(<Logotipo variante="mono" conDescriptor />)
    expect(container.querySelector("linearGradient")).toBeNull()
    for (const path of container.querySelectorAll("path")) {
      expect(path).toHaveAttribute("fill", "currentColor")
    }
  })

  it("con tono fijo usa las tintas de marca", () => {
    const { container } = render(<Logotipo tono="claro" />)
    const palabra = container.querySelectorAll("path")[1]
    expect(palabra).toHaveAttribute("fill", "#261848")
  })
})
