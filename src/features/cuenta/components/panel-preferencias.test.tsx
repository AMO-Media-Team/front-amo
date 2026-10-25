import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/features/cuenta/actions", () => ({
  guardarPreferencias: vi.fn(),
}))

const { SeccionAvisosCorreo } = await import("./panel-preferencias")

function pintar(
  props: Partial<Parameters<typeof SeccionAvisosCorreo>[0]> = {}
) {
  const onCambiar = vi.fn()
  render(
    <SeccionAvisosCorreo
      tipoRol="MEDIO"
      email="medio@ejemplo.co"
      silenciadas={[]}
      onCambiar={onCambiar}
      {...props}
    />
  )
  return { onCambiar }
}

describe("SeccionAvisosCorreo", () => {
  it("muestra las categorías del tipo de rol, marcadas si no están silenciadas", () => {
    pintar({ silenciadas: ["pagos"] })
    const grupo = screen.getByRole("group", {
      name: "Avisos que recibes por correo",
    })
    expect(
      within(grupo).getByRole("checkbox", { name: "Evidencias y métricas" })
    ).toBeChecked()
    expect(
      within(grupo).getByRole("checkbox", { name: "Pagos y facturas" })
    ).not.toBeChecked()
    expect(
      within(grupo).queryByRole("checkbox", { name: "Pendientes del equipo" })
    ).toBeNull()
  })

  it("seguridad y datos personales están siempre activos y explican por qué", () => {
    pintar({ tipoRol: "ANUNCIANTE" })
    for (const nombre of ["Seguridad", "Tus datos personales"]) {
      const casilla = screen.getByRole("checkbox", { name: nombre })
      expect(casilla).toBeChecked()
      expect(casilla).toHaveAttribute("aria-disabled", "true")
      expect(casilla).toHaveAccessibleDescription(
        /Siempre te llegan por correo/
      )
    }
    expect(screen.getAllByText("Siempre activo")).toHaveLength(2)
  })

  it("al desmarcar silencia la categoría y al marcar la vuelve a recibir", async () => {
    const usuario = userEvent.setup()
    const { onCambiar } = pintar({ silenciadas: ["pagos"] })

    await usuario.click(screen.getByRole("checkbox", { name: "Disputas" }))
    expect(onCambiar).toHaveBeenLastCalledWith(["pagos", "disputas"])

    await usuario.click(
      screen.getByRole("checkbox", { name: "Pagos y facturas" })
    )
    expect(onCambiar).toHaveBeenLastCalledWith([])
  })

  it("avisa que el envío se activará pronto mientras esté apagado o no se sepa", () => {
    pintar({ correoHabilitado: false })
    expect(
      screen.getByText("El envío por correo se activará pronto.")
    ).toBeInTheDocument()
  })

  it("con el correo encendido dice a qué dirección escribe", () => {
    pintar({ correoHabilitado: true })
    expect(screen.getByText("medio@ejemplo.co")).toBeInTheDocument()
    expect(
      screen.queryByText("El envío por correo se activará pronto.")
    ).toBeNull()
  })

  it("el equipo AMO puede silenciar sus colas de trabajo", () => {
    pintar({ tipoRol: "ADMIN" })
    expect(
      screen.getByRole("checkbox", { name: "Pendientes del equipo" })
    ).toBeChecked()
    expect(screen.getAllByRole("checkbox")).toHaveLength(3)
  })

  it("una categoría sin plantilla de correo activa se deshabilita y lo explica", async () => {
    const usuario = userEvent.setup()
    const { onCambiar } = pintar({
      tipoRol: "ADMIN",
      correoHabilitado: true,
      categoriasConCorreo: ["seguridad", "privacidad", "ofertas"],
    })
    const pendientes = screen.getByRole("checkbox", {
      name: "Pendientes del equipo",
    })
    expect(pendientes).not.toBeChecked()
    expect(pendientes).toHaveAttribute("aria-disabled", "true")
    expect(pendientes).toHaveAccessibleDescription(
      /El equipo AMO aún no envía estos avisos por correo/
    )
    expect(screen.getByText("Sin correo por ahora")).toBeInTheDocument()

    await usuario.click(pendientes)
    expect(onCambiar).not.toHaveBeenCalled()
    // Las que sí salen siguen como siempre.
    expect(screen.getByRole("checkbox", { name: "Seguridad" })).toBeChecked()
    expect(screen.getAllByText("Siempre activo")).toHaveLength(2)
  })

  it("deshabilita solo las que no salen por correo", () => {
    pintar({
      silenciadas: ["pagos"],
      categoriasConCorreo: ["ofertas", "seguridad", "privacidad"],
    })
    for (const nombre of ["Pagos y facturas", "Disputas"]) {
      expect(screen.getByRole("checkbox", { name: nombre })).toHaveAttribute(
        "aria-disabled",
        "true"
      )
    }
    expect(
      screen.getByRole("checkbox", { name: "Ofertas y campañas" })
    ).not.toHaveAttribute("aria-disabled")
  })

  it("si no se sabe qué plantillas están activas, no deshabilita ninguna", () => {
    pintar({ tipoRol: "ADMIN", categoriasConCorreo: null })
    expect(
      screen.getByRole("checkbox", { name: "Pendientes del equipo" })
    ).toBeChecked()
    expect(screen.queryByText("Sin correo por ahora")).toBeNull()
  })
})
