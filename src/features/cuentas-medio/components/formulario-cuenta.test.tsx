import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  registrarCuenta: vi.fn(),
  editarCuenta: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import {
  type CuentaExistente,
  esRepetida,
  FormularioCuenta,
  perfilNuevo,
} from "./formulario-cuenta"

const EXISTENTES: CuentaExistente[] = [
  { id: "c-1", plataforma: "INSTAGRAM", handle: "noticiasdelsur" },
  { id: "c-2", plataforma: "FACEBOOK", handle: "NoticiasDelSur" },
]

function renderizar(
  props: Partial<Parameters<typeof FormularioCuenta>[0]> = {}
) {
  const onGuardada = vi.fn()
  const onPendiente = vi.fn()
  render(
    <>
      <FormularioCuenta
        id="formulario"
        existentes={EXISTENTES}
        onGuardada={onGuardada}
        onPendiente={onPendiente}
        {...props}
      />
      <button type="submit" form="formulario">
        Guardar
      </button>
    </>
  )
  return { onGuardada, onPendiente }
}

beforeEach(() => {
  acciones.registrarCuenta.mockReset()
  acciones.editarCuenta.mockReset()
})

describe("esRepetida", () => {
  it("compara la red y el usuario sin distinguir mayúsculas", () => {
    expect(esRepetida(EXISTENTES, "INSTAGRAM", "NoticiasDelSur", null)).toBe(
      true
    )
    expect(esRepetida(EXISTENTES, "TIKTOK", "noticiasdelsur", null)).toBe(false)
  })

  it("al editar no se compara con la misma cuenta", () => {
    expect(esRepetida(EXISTENTES, "INSTAGRAM", "noticiasdelsur", "c-1")).toBe(
      false
    )
  })
})

describe("perfilNuevo", () => {
  it("en el alta resuelve el usuario de lo escrito (usuario o enlace)", () => {
    expect(perfilNuevo("INSTAGRAM", "@NoticiasDelSur", null)).toBe(
      "noticiasdelsur"
    )
    expect(
      perfilNuevo("TIKTOK", "https://www.tiktok.com/@noticias.sur", null)
    ).toBe("noticias.sur")
  })

  it("al editar, el perfil sin cambios no viaja (aunque no cumpla las reglas de hoy)", () => {
    expect(perfilNuevo("FACEBOOK", "@ab", "@ab")).toBeNull()
    expect(perfilNuevo("INSTAGRAM", "  @medio.sur ", "@medio.sur")).toBeNull()
  })

  it("al editar, un perfil cambiado se resuelve; uno inválido no", () => {
    expect(perfilNuevo("INSTAGRAM", "@medio.norte", "@medio.sur")).toBe(
      "medio.norte"
    )
    expect(perfilNuevo("INSTAGRAM", "con espacios", "@medio.sur")).toBeNull()
  })
})

describe("FormularioCuenta · alta", () => {
  it("muestra cómo se guardará el perfil mientras se escribe", async () => {
    const usuario = userEvent.setup()
    renderizar()
    await usuario.click(screen.getByRole("radio", { name: "TikTok" }))
    await usuario.type(
      screen.getByLabelText("Usuario o enlace del perfil"),
      "https://www.tiktok.com/@Radio.Pasto"
    )
    expect(screen.getByText(/Lo guardaremos como/).textContent).toMatch(
      /@radio\.pasto · tiktok\.com\/@radio\.pasto/
    )
  })

  it("valida antes de enviar: red elegida y perfil de esa red", async () => {
    const usuario = userEvent.setup()
    renderizar()
    await usuario.click(screen.getByRole("button", { name: "Guardar" }))
    expect(await screen.findByText("Elige la red social.")).toBeInTheDocument()
    expect(acciones.registrarCuenta).not.toHaveBeenCalled()

    await usuario.click(screen.getByRole("radio", { name: "Facebook" }))
    await usuario.type(
      screen.getByLabelText("Usuario o enlace del perfil"),
      "instagram.com/radio"
    )
    await usuario.click(screen.getByRole("button", { name: "Guardar" }))
    expect(
      await screen.findByText(/Ese enlace es de Instagram/)
    ).toBeInTheDocument()
  })

  it("avisa de una cuenta que el medio ya registró sin ir al servidor", async () => {
    const usuario = userEvent.setup()
    renderizar()
    await usuario.click(screen.getByRole("radio", { name: "Instagram" }))
    await usuario.type(
      screen.getByLabelText("Usuario o enlace del perfil"),
      "@NoticiasDelSur"
    )
    await usuario.click(screen.getByRole("button", { name: "Guardar" }))
    expect(
      await screen.findByText(/Ya registraste esta cuenta/)
    ).toBeInTheDocument()
    expect(acciones.registrarCuenta).not.toHaveBeenCalled()
  })

  it("envía lo escrito tal cual y avisa al terminar", async () => {
    const usuario = userEvent.setup()
    acciones.registrarCuenta.mockResolvedValue(
      exito({ id: "nueva", actualizadaAt: "2026-10-22T15:00:00Z" })
    )
    const { onGuardada, onPendiente } = renderizar()
    await usuario.click(screen.getByRole("radio", { name: "Instagram" }))
    await usuario.type(
      screen.getByLabelText("Usuario o enlace del perfil"),
      "@Radio.Pasto"
    )
    await usuario.type(screen.getByLabelText(/Tarifa de referencia/), "250.000")
    await usuario.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() =>
      expect(onGuardada).toHaveBeenCalledWith(
        { id: "nueva", actualizadaAt: "2026-10-22T15:00:00Z" },
        "radio.pasto"
      )
    )
    expect(acciones.registrarCuenta).toHaveBeenCalledWith({
      plataforma: "INSTAGRAM",
      perfil: "@Radio.Pasto",
      tarifa: "250.000",
    })
    expect(onPendiente).toHaveBeenNthCalledWith(1, true)
    expect(onPendiente).toHaveBeenLastCalledWith(false)
  })

  it("lleva el error del servidor a su campo", async () => {
    const usuario = userEvent.setup()
    acciones.registrarCuenta.mockResolvedValue(
      fallo("Esa cuenta ya está registrada en AMO.", {
        perfil: ["Esa cuenta ya está registrada en AMO."],
      })
    )
    renderizar()
    await usuario.click(screen.getByRole("radio", { name: "Instagram" }))
    await usuario.type(
      screen.getByLabelText("Usuario o enlace del perfil"),
      "otra_cuenta"
    )
    await usuario.click(screen.getByRole("button", { name: "Guardar" }))
    expect(
      await screen.findByText("Esa cuenta ya está registrada en AMO.")
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("Usuario o enlace del perfil")
    ).toHaveAttribute("aria-invalid", "true")
  })
})

describe("FormularioCuenta · edición", () => {
  const EDICION = {
    cuenta: {
      id: "c-1",
      plataforma: "INSTAGRAM" as const,
      handle: "noticiasdelsur",
      tarifaReferencia: 300_000,
      actualizadaAt: "2026-10-20T10:00:00.123456+00:00",
    },
    perfilBloqueado:
      "Una cuenta verificada no cambia de usuario ni de enlace. Si ahora usas otra cuenta, regístrala como nueva.",
  }

  it("la red queda fija y el usuario de una cuenta verificada es de solo lectura", () => {
    renderizar({ edicion: EDICION })
    expect(screen.queryByRole("radio")).toBeNull()
    expect(screen.getByText("No se cambia")).toBeInTheDocument()
    const perfil = screen.getByLabelText("Usuario o enlace del perfil")
    expect(perfil).toHaveValue("@noticiasdelsur")
    expect(perfil).toHaveAttribute("readonly")
    expect(perfil).toHaveAccessibleDescription(/no cambia de usuario/)
    expect(screen.getByLabelText(/Tarifa de referencia/)).toHaveValue("300.000")
  })

  it("envía la versión de la cuenta para el bloqueo optimista", async () => {
    const usuario = userEvent.setup()
    acciones.editarCuenta.mockResolvedValue(
      exito({ id: "c-1", actualizadaAt: "nueva" })
    )
    const { onGuardada } = renderizar({ edicion: EDICION })
    const tarifa = screen.getByLabelText(/Tarifa de referencia/)
    await usuario.clear(tarifa)
    await usuario.type(tarifa, "350.000")
    await usuario.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() => expect(onGuardada).toHaveBeenCalled())
    expect(acciones.editarCuenta).toHaveBeenCalledWith({
      plataforma: "INSTAGRAM",
      perfil: null,
      tarifa: "350.000",
      cuentaId: "c-1",
      actualizadaAt: "2026-10-20T10:00:00.123456+00:00",
    })
    expect(onGuardada).toHaveBeenCalledWith(
      { id: "c-1", actualizadaAt: "nueva" },
      "noticiasdelsur"
    )
  })

  it("guarda la tarifa de una cuenta cuyo usuario no cumple las reglas de hoy", async () => {
    const usuario = userEvent.setup()
    acciones.editarCuenta.mockResolvedValue(
      exito({ id: "c-9", actualizadaAt: "nueva" })
    )
    const { onGuardada } = renderizar({
      edicion: {
        ...EDICION,
        cuenta: {
          ...EDICION.cuenta,
          id: "c-9",
          plataforma: "FACEBOOK",
          handle: "noticias_del_sur",
        },
      },
    })
    const tarifa = screen.getByLabelText(/Tarifa de referencia/)
    await usuario.clear(tarifa)
    await usuario.type(tarifa, "320.000")
    await usuario.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() => expect(onGuardada).toHaveBeenCalled())
    expect(acciones.editarCuenta).toHaveBeenCalledWith(
      expect.objectContaining({ perfil: null, tarifa: "320.000" })
    )
  })

  it("al editar una cuenta sin verificar, un usuario nuevo sí viaja y se valida", async () => {
    const usuario = userEvent.setup()
    acciones.editarCuenta.mockResolvedValue(
      exito({ id: "c-1", actualizadaAt: "nueva" })
    )
    renderizar({ edicion: { ...EDICION, perfilBloqueado: null } })
    const perfil = screen.getByLabelText("Usuario o enlace del perfil")
    await usuario.clear(perfil)
    await usuario.type(perfil, "@NoticiasDelSur.Oficial")
    await usuario.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() => expect(acciones.editarCuenta).toHaveBeenCalled())
    expect(acciones.editarCuenta).toHaveBeenCalledWith(
      expect.objectContaining({ perfil: "@NoticiasDelSur.Oficial" })
    )
  })
})
