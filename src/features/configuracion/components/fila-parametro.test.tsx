import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import type { Parametro, PermisosConfiguracion } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  guardarParametro: vi.fn(),
  historialCambios: vi.fn(),
}))
vi.mock("../actions", () => acciones)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ProveedorConfiguracion } from "./contexto-configuracion"
import { FilaParametro } from "./fila-parametro"

const SOLO_LECTURA: PermisosConfiguracion = {
  editar: false,
  comisiones: false,
  tarifas: false,
  tributario: false,
  catalogos: false,
  verAuditoria: false,
  datosSensibles: false,
}

const PLAZO: Parametro = {
  clave: "disputas.plazo_recarga_horas",
  tipo: "ENTERO",
  valor: 24,
  minimo: 1,
  maximo: 168,
  opciones: null,
  modulo: "disputas",
  descripcion: "Horas para cargar la evidencia después de ganar la disputa.",
  unidad: "h",
  esPublica: false,
  pendienteValidacion: false,
  actualizadoAt: "2026-10-01T12:00:00+00:00",
}

const COMISION: Parametro = {
  ...PLAZO,
  clave: "comision.porcentaje_global",
  tipo: "PORCENTAJE",
  valor: 0.2,
  minimo: 0,
  maximo: 0.5,
  modulo: "comision",
  descripcion: "Comisión de la plataforma sobre el monto bruto.",
  unidad: "%",
  pendienteValidacion: true,
}

function renderizar(
  parametro: Parametro,
  permisos: Partial<PermisosConfiguracion> = {}
) {
  render(
    <ProveedorConfiguracion permisos={{ ...SOLO_LECTURA, ...permisos }}>
      <ul>
        <FilaParametro parametro={parametro} />
      </ul>
    </ProveedorConfiguracion>
  )
}

beforeEach(() => {
  acciones.guardarParametro.mockReset()
  acciones.historialCambios.mockReset()
})

describe("FilaParametro", () => {
  it("muestra título, valor con unidad, rango y valor predeterminado", () => {
    renderizar(PLAZO)
    expect(
      screen.getByRole("heading", { name: "Plazo para recargar la evidencia" })
    ).toBeInTheDocument()
    expect(screen.getByText(PLAZO.descripcion)).toBeInTheDocument()
    expect(screen.getByText("Entre 1 y 168 h")).toBeInTheDocument()
    expect(screen.getByText("1 día")).toBeInTheDocument()
  })

  it("sin permiso de edición no ofrece editar ni historial", () => {
    renderizar(PLAZO)
    expect(
      screen.queryByRole("button", { name: /Editar/ })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Más acciones/ })
    ).not.toBeInTheDocument()
  })

  it("la comisión exige además el permiso de comisiones", () => {
    renderizar(COMISION, { editar: true })
    expect(
      screen.queryByRole("button", { name: /Editar/ })
    ).not.toBeInTheDocument()
    expect(screen.getByText("Por validar")).toBeInTheDocument()
  })

  it("valida en línea antes de pedir confirmación", async () => {
    const usuario = userEvent.setup()
    renderizar(PLAZO, { editar: true })

    await usuario.click(
      screen.getByRole("button", {
        name: "Editar Plazo para recargar la evidencia",
      })
    )
    const campo = screen.getByLabelText(
      "Nuevo valor de Plazo para recargar la evidencia"
    )
    await usuario.clear(campo)
    await usuario.type(campo, "999")
    await usuario.click(screen.getByRole("button", { name: "Revisar cambio" }))

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Debe estar entre 1 y 168."
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(acciones.guardarParametro).not.toHaveBeenCalled()
  })

  it("confirma con la diferencia y guarda con la marca de versión del registro", async () => {
    const usuario = userEvent.setup()
    acciones.guardarParametro.mockResolvedValue(
      exito({ actualizadoAt: "2026-10-05T15:00:00+00:00" })
    )
    renderizar(PLAZO, { editar: true })

    await usuario.click(
      screen.getByRole("button", {
        name: "Editar Plazo para recargar la evidencia",
      })
    )
    const campo = screen.getByLabelText(
      "Nuevo valor de Plazo para recargar la evidencia"
    )
    await usuario.clear(campo)
    await usuario.type(campo, "36{Enter}")

    const dialogo = await screen.findByRole("dialog")
    expect(
      within(dialogo).getByText("¿Cambiar «Plazo para recargar la evidencia»?")
    ).toBeInTheDocument()
    expect(within(dialogo).getByText("Valor actual")).toBeInTheDocument()
    expect(within(dialogo).getByText("24 h")).toBeInTheDocument()
    expect(within(dialogo).getByText("Nuevo valor")).toBeInTheDocument()
    expect(within(dialogo).getByText("36 h")).toBeInTheDocument()
    expect(within(dialogo).getByText("+12 h")).toBeInTheDocument()

    await usuario.click(
      within(dialogo).getByRole("button", { name: "Aplicar cambio" })
    )
    await waitFor(() =>
      expect(acciones.guardarParametro).toHaveBeenCalledWith({
        clave: PLAZO.clave,
        valor: 36,
        actualizadoAt: PLAZO.actualizadoAt,
      })
    )
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
  })

  it("un porcentaje se escribe de 0 a 100 y se envía como fracción", async () => {
    const usuario = userEvent.setup()
    acciones.guardarParametro.mockResolvedValue(exito({ actualizadoAt: "x" }))
    renderizar(COMISION, { editar: true, comisiones: true })

    await usuario.click(
      screen.getByRole("button", { name: "Editar Comisión global" })
    )
    const campo = screen.getByLabelText("Nuevo valor de Comisión global")
    expect(campo).toHaveValue("20")
    await usuario.clear(campo)
    await usuario.type(campo, "18,5{Enter}")

    const dialogo = await screen.findByRole("dialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Aplicar cambio" })
    )
    await waitFor(() =>
      expect(acciones.guardarParametro).toHaveBeenCalledWith(
        expect.objectContaining({ clave: COMISION.clave, valor: 0.185 })
      )
    )
  })

  it("si el servidor rechaza el cambio, el error se queda en el diálogo", async () => {
    const usuario = userEvent.setup()
    acciones.guardarParametro.mockResolvedValue(
      fallo("Otra persona cambió este dato mientras lo editabas.")
    )
    renderizar(PLAZO, { editar: true })

    await usuario.click(
      screen.getByRole("button", {
        name: "Editar Plazo para recargar la evidencia",
      })
    )
    const campo = screen.getByLabelText(
      "Nuevo valor de Plazo para recargar la evidencia"
    )
    await usuario.clear(campo)
    await usuario.type(campo, "48{Enter}")
    const dialogo = await screen.findByRole("dialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Aplicar cambio" })
    )

    expect(
      await within(dialogo).findByText(
        "Otra persona cambió este dato mientras lo editabas."
      )
    ).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("no pide confirmar un valor igual al actual", async () => {
    const usuario = userEvent.setup()
    renderizar(PLAZO, { editar: true })

    await usuario.click(
      screen.getByRole("button", {
        name: "Editar Plazo para recargar la evidencia",
      })
    )
    await usuario.click(screen.getByRole("button", { name: "Revisar cambio" }))

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText("Nuevo valor de Plazo para recargar la evidencia")
    ).not.toBeInTheDocument()
  })

  it("al cancelar con Escape devuelve el foco al botón «Editar»", async () => {
    const usuario = userEvent.setup()
    renderizar(PLAZO, { editar: true })
    const nombre = "Editar Plazo para recargar la evidencia"

    await usuario.click(screen.getByRole("button", { name: nombre }))
    expect(
      screen.getByLabelText("Nuevo valor de Plazo para recargar la evidencia")
    ).toHaveFocus()
    await usuario.keyboard("{Escape}")

    expect(screen.getByRole("button", { name: nombre })).toHaveFocus()
  })

  it("tras guardar, el foco vuelve al botón «Editar» y no se pierde en la página", async () => {
    const usuario = userEvent.setup()
    acciones.guardarParametro.mockResolvedValue(exito({ actualizadoAt: "x" }))
    renderizar(PLAZO, { editar: true })
    const nombre = "Editar Plazo para recargar la evidencia"

    await usuario.click(screen.getByRole("button", { name: nombre }))
    const campo = screen.getByLabelText(
      "Nuevo valor de Plazo para recargar la evidencia"
    )
    await usuario.clear(campo)
    await usuario.type(campo, "36{Enter}")
    const dialogo = await screen.findByRole("dialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Aplicar cambio" })
    )

    await waitFor(() =>
      expect(screen.getByRole("button", { name: nombre })).toHaveFocus()
    )
  })
})
