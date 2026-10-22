import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

import type { FilaPertinencia } from "../pertinencia"

const acciones = vi.hoisted(() => ({
  agregarPertinencia: vi.fn(),
  editarPertinencia: vi.fn(),
  quitarPertinencia: vi.fn(),
}))
vi.mock("../actions", () => acciones)
// El selector de territorio carga el catálogo con Server Actions (solo al
// clasificar un municipio nuevo, que aquí no se abre).
vi.mock("@/features/territorio/actions", () => ({
  listarDepartamentosActivos: vi.fn(),
  listarMunicipiosActivos: vi.fn(),
}))

import { PertinenciaMedio } from "./pertinencia-medio"

const MEDIO = {
  id: "0192f3a4-5b6c-7d8e-9f01-0000000000aa",
  nombre: "Radio Pasto",
}

const PASTO: FilaPertinencia = {
  municipioCodigo: "52001",
  municipio: "Pasto",
  departamento: "Nariño",
  multiplicador: 1.15,
  notas: "Sede y audiencia principal",
  clasificadoPor: "Ana Gómez",
  clasificadoAt: "2026-10-01T15:00:00.000Z",
}

function renderizar(filas: FilaPertinencia[] = [PASTO], puedeEditar = true) {
  const usuario = userEvent.setup()
  render(
    <PertinenciaMedio medio={MEDIO} filas={filas} puedeEditar={puedeEditar} />
  )
  return usuario
}

beforeEach(() => {
  for (const accion of Object.values(acciones)) {
    accion.mockReset().mockResolvedValue(exito())
  }
})

describe("PertinenciaMedio", () => {
  it("lista cada municipio con su multiplicador y su efecto en el precio", () => {
    renderizar()
    const tabla = screen.getByRole("table", {
      name: "Multiplicador geográfico de Radio Pasto por municipio",
    })
    const fila = within(tabla).getByRole("row", { name: /Pasto/ })
    expect(fila).toHaveTextContent("1,150 ×")
    expect(fila).toHaveTextContent("Sube el precio 15")
    expect(fila).toHaveTextContent("Sede y audiencia principal")
  })

  it("sin el permiso solo se consulta", () => {
    renderizar([PASTO], false)
    expect(screen.queryByRole("button", { name: /Editar|Quitar/ })).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Clasificar municipio" })
    ).toBeNull()
  })

  it("vacía, invita a clasificar el primer municipio", () => {
    renderizar([])
    expect(screen.getByText("Sin municipios clasificados")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Clasificar municipio" })
    ).toBeInTheDocument()
  })

  it("edita el multiplicador con los botones y muestra su efecto", async () => {
    const usuario = renderizar()
    await usuario.click(screen.getByRole("button", { name: "Editar Pasto" }))
    const hoja = screen.getByRole("dialog", { name: "Pertinencia en Pasto" })
    const campo = within(hoja).getByLabelText("Multiplicador")
    expect(campo).toHaveValue("1,150")

    await usuario.click(
      within(hoja).getByRole("button", { name: "Subir 0,05" })
    )
    expect(campo).toHaveValue("1,200")
    expect(hoja).toHaveTextContent("Sube el precio 20")

    await usuario.click(
      within(hoja).getByRole("button", { name: "Guardar cambios" })
    )
    await waitFor(() =>
      expect(acciones.editarPertinencia).toHaveBeenCalledWith({
        medioId: MEDIO.id,
        municipioCodigo: "52001",
        multiplicador: 1.2,
        notas: "Sede y audiencia principal",
      })
    )
  })

  it("un multiplicador fuera de rango no se envía", async () => {
    const usuario = renderizar()
    await usuario.click(screen.getByRole("button", { name: "Editar Pasto" }))
    const hoja = screen.getByRole("dialog", { name: "Pertinencia en Pasto" })
    const campo = within(hoja).getByLabelText("Multiplicador")
    await usuario.clear(campo)
    await usuario.type(campo, "2")
    await usuario.click(
      within(hoja).getByRole("button", { name: "Guardar cambios" })
    )
    expect(
      await within(hoja).findByText(
        "El multiplicador va de 0,500 a 1,500 (1,000 = sin ajuste)."
      )
    ).toBeInTheDocument()
    expect(acciones.editarPertinencia).not.toHaveBeenCalled()
  })

  it("quitar pide confirmación", async () => {
    const usuario = renderizar()
    await usuario.click(screen.getByRole("button", { name: "Quitar Pasto" }))
    const dialogo = screen.getByRole("alertdialog", { name: "¿Quitar Pasto?" })
    await usuario.click(within(dialogo).getByRole("button", { name: "Quitar" }))
    await waitFor(() =>
      expect(acciones.quitarPertinencia).toHaveBeenCalledWith({
        medioId: MEDIO.id,
        municipioCodigo: "52001",
      })
    )
  })
})
