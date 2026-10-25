import { readFileSync } from "node:fs"
import { join } from "node:path"

import { useTable } from "@tanstack/react-table"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { caracteristicasTabla, crearColumnas } from "./columnas"
import { VistaTarjetas } from "./vista-tarjetas"

type Fila = { id: string; medio: string; documento: string; neto: string }

const columna = crearColumnas<Fila>()
const COLUMNAS = columna.columns([
  columna.accessor("medio", {
    header: "Medio",
    meta: { titulo: "Medio", tarjeta: "titulo" },
  }),
  columna.accessor("documento", {
    header: "Documento del pago",
    meta: { titulo: "Documento del pago" },
    // Insignia de alto fijo y sin salto de línea, como `InsigniaTono`.
    cell: ({ getValue }) => (
      <span className="inline-flex h-6 w-fit shrink-0 items-center rounded-full px-2.5 text-xs whitespace-nowrap">
        {getValue()}
      </span>
    ),
  }),
  columna.accessor("neto", {
    header: "Neto",
    meta: { titulo: "Neto" },
  }),
])

const FILAS: Fila[] = [
  {
    id: "1",
    medio: "Noticias Leticia",
    documento: "Documento soporte DEMO2105",
    neto: "$ 743.168",
  },
]

function Tarjetas() {
  const tabla = useTable({
    features: caracteristicasTabla,
    columns: COLUMNAS,
    data: FILAS,
    getRowId: (fila) => fila.id,
    meta: { etiquetaFila: () => "" },
  })
  return <VistaTarjetas filas={tabla.getRowModel().rows} cargando={false} />
}

describe("VistaTarjetas", () => {
  it("el título va arriba y cada detalle como par etiqueta/valor", () => {
    render(<Tarjetas />)
    expect(screen.getByText("Noticias Leticia")).toBeInTheDocument()
    const terminos = screen.getAllByRole("term").map((t) => t.textContent)
    expect(terminos).toEqual(["Documento del pago", "Neto"])
  })

  it("cada valor envuelve sus insignias y textos sin salto (no desborda a 390 px)", () => {
    render(<Tarjetas />)
    // `valor-tarjeta` (globals.css) deja envolver lo `whitespace-nowrap`, lo
    // `truncate` y las insignias de alto fijo dentro de la columna.
    const valores = screen.getAllByRole("definition")
    expect(valores).toHaveLength(2)
    for (const valor of valores) {
      expect(valor).toHaveClass("valor-tarjeta")
      expect(valor).not.toHaveClass("truncate")
    }
    expect(screen.getByText("Documento soporte DEMO2105").closest("dd")).toBe(
      valores[0]
    )
  })

  it("la utilidad `valor-tarjeta` existe y alcanza insignias, nowrap y truncate", () => {
    const css = readFileSync(
      join(process.cwd(), "src", "app", "globals.css"),
      "utf8"
    )
    const inicio = css.indexOf("@utility valor-tarjeta")
    expect(inicio).toBeGreaterThan(-1)
    const regla = css.slice(inicio, css.indexOf("\n}\n", inicio))
    for (const selector of [
      ".whitespace-nowrap",
      ".truncate",
      '[data-slot="badge"]',
      ".rounded-full.whitespace-nowrap",
    ]) {
      expect(regla).toContain(selector)
    }
    expect(regla).toContain("white-space: normal")
    expect(regla).toContain("height: auto")
  })
})
