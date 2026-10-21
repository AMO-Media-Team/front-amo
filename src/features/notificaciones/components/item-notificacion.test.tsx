import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { Notificacion } from "../tipos"
import { ItemNotificacion } from "./item-notificacion"

const notificacion: Notificacion = {
  id: 4,
  tipo: "seguridad.pais_inusual",
  titulo: "Ingreso desde un país inusual",
  mensaje: "Revisa el registro de accesos.",
  url: "/administracion/accesos",
  prioridad: "urgente",
  leida: false,
  creadaAt: "2026-09-30T15:00:00Z",
}

function enLista(elemento: React.ReactElement) {
  return render(<ul>{elemento}</ul>)
}

describe("ItemNotificacion", () => {
  it("anuncia que está sin leer y enlaza a la entidad", async () => {
    const onAbrir = vi.fn()
    enLista(<ItemNotificacion notificacion={notificacion} onAbrir={onAbrir} />)

    const enlace = screen.getByRole("link", {
      name: "Sin leer: Ingreso desde un país inusual",
    })
    expect(enlace).toHaveAttribute("href", "/administracion/accesos")
    expect(screen.getByText("Urgente")).toBeInTheDocument()
    expect(screen.getByText("Seguridad")).toBeInTheDocument()

    // jsdom no navega entre documentos: basta con comprobar el aviso.
    enlace.addEventListener("click", (evento) => evento.preventDefault())
    await userEvent.click(enlace)
    expect(onAbrir).toHaveBeenCalledWith(notificacion)
  })

  it("sin enlace ni marca de «sin leer» cuando no aplica", () => {
    enLista(
      <ItemNotificacion
        notificacion={{
          ...notificacion,
          url: null,
          leida: true,
          prioridad: "normal",
        }}
      />
    )
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(screen.queryByText(/Sin leer/)).not.toBeInTheDocument()
    expect(screen.queryByText("Urgente")).not.toBeInTheDocument()
  })
})
