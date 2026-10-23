import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import type { DisputaDetalle, MensajeDisputa } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  enviarMensajeDisputa: vi.fn(),
  prepararAdjuntoDisputa: vi.fn(),
  confirmarAdjuntoDisputa: vi.fn(),
  firmarAdjuntoDisputa: vi.fn(),
}))
vi.mock("../actions", () => acciones)

/** El adjunto: la prueba decide si hay uno elegido y cómo termina su subida. */
const carga = vi.hoisted(() => ({
  subida: { activa: false, cancelar: () => {} },
  elegida: null as File | null,
  vistaPrevia: null,
  lista: null,
  elemento: null,
  elegir: vi.fn(),
  descartar: vi.fn(),
  reintentar: () => {},
  obtener: vi.fn(),
}))
vi.mock("@/components/archivos/use-carga-captura", () => ({
  useCargaCaptura: () => carga,
}))

import { HiloDisputa } from "./hilo-disputa"

const DISPUTA: DisputaDetalle = {
  id: "0192f3a4-5b6c-7d8e-9f01-0000000000d1",
  asignacionId: "0192f3a4-5b6c-7d8e-9f01-0000000000a1",
  estado: "EN_REVISION",
  motivo: "METRICAS",
  parte: "ANUNCIANTE",
  descripcion: "El alcance reportado no coincide con la captura.",
  estadoOrigen: "METRICAS_CARGADAS",
  resolucion: null,
  estadoResultante: null,
  creadaAt: "2026-10-20T15:00:00Z",
  actualizadaAt: "2026-10-20T15:00:00Z",
  resueltaAt: null,
}

const MENSAJES: MensajeDisputa[] = [
  {
    id: 1,
    autorParte: "MEDIO",
    autorNombre: "Radio Pasto",
    autorPersona: "Ana Ruiz",
    esMio: false,
    mensaje: "Adjunto la captura del panel.",
    adjunto: { tipo: "image/webp", nombre: "Adjunto del 21 oct 2026.webp" },
    interno: false,
    creadoAt: "2026-10-21T15:00:00Z",
  },
  {
    id: 2,
    autorParte: "ADMIN",
    autorNombre: "Equipo AMO",
    autorPersona: "Carlos Díaz",
    esMio: true,
    mensaje: "Las cifras cuadran con la captura.",
    adjunto: null,
    interno: true,
    creadoAt: "2026-10-22T15:00:00Z",
  },
]

beforeEach(() => {
  for (const accion of Object.values(acciones)) accion.mockReset()
  carga.elegida = null
  carga.elegir.mockReset()
  carga.descartar.mockReset()
  carga.obtener.mockReset()
  acciones.enviarMensajeDisputa.mockResolvedValue(exito({ mensajeId: 3 }))
  acciones.firmarAdjuntoDisputa.mockResolvedValue(
    exito({ url: "https://firmada.test/a.webp", vigenciaSegundos: 300 })
  )
})

function mensajes() {
  return within(
    screen.getByRole("list", { name: "Mensajes de la disputa" })
  ).getAllByRole("listitem")
}

describe("HiloDisputa", () => {
  it("empieza con la apertura y muestra cada mensaje con su autor", () => {
    render(
      <HiloDisputa
        disputa={DISPUTA}
        mensajes={MENSAJES}
        perspectiva="interno"
        puedeEscribir
        puedeNotaInterna
        autorApertura="Almacenes El Faro"
      />
    )
    const [apertura, delMedio, nota] = mensajes()
    expect(apertura).toHaveTextContent("Almacenes El Faroabrió la disputa")
    expect(apertura).toHaveTextContent("Motivo: Métricas")
    expect(apertura).toHaveTextContent(DISPUTA.descripcion)
    expect(
      within(delMedio).getByRole("article", { name: "Radio Pasto" })
    ).toHaveTextContent("Medio · Ana Ruiz")
    expect(nota).toHaveTextContent("Nota interna · Solo la ve el equipo AMO")
    expect(within(nota).getByRole("article", { name: "Tú" })).toBeVisible()
    expect(screen.getByText("2 mensajes")).toBeVisible()
  })

  it("el adjunto se firma al abrirlo, no al pintar el hilo", async () => {
    const usuario = userEvent.setup()
    render(
      <HiloDisputa
        disputa={DISPUTA}
        mensajes={MENSAJES}
        perspectiva="anunciante"
        puedeEscribir
      />
    )
    expect(acciones.firmarAdjuntoDisputa).not.toHaveBeenCalled()
    await usuario.click(
      screen.getByRole("button", { name: "Ver la imagen adjunta" })
    )
    expect(screen.getByRole("dialog", { name: "Imagen adjunta" })).toBeVisible()
    await waitFor(() =>
      expect(acciones.firmarAdjuntoDisputa).toHaveBeenCalledWith({
        disputaId: DISPUTA.id,
        mensajeId: 1,
      })
    )
  })

  it("una parte responde y la caja dice quién lo verá", async () => {
    const usuario = userEvent.setup()
    render(
      <HiloDisputa
        disputa={DISPUTA}
        mensajes={[]}
        perspectiva="medio"
        puedeEscribir
      />
    )
    const caja = screen.getByRole("form", { name: "Responder en la disputa" })
    const campo = within(caja).getByLabelText("Mensaje")
    expect(campo).toHaveAccessibleDescription(
      "Lo que escribas y adjuntes lo verán el anunciante y el equipo AMO."
    )
    expect(
      within(caja).queryByLabelText(/Nota interna/)
    ).not.toBeInTheDocument()

    // Vacío: el error queda asociado al campo y no se envía nada.
    await usuario.click(within(caja).getByRole("button", { name: "Enviar" }))
    expect(within(caja).getByRole("alert")).toHaveTextContent(
      "Escribe el mensaje."
    )
    expect(campo).toHaveAttribute("aria-invalid", "true")
    expect(campo).toHaveFocus()
    expect(acciones.enviarMensajeDisputa).not.toHaveBeenCalled()

    await usuario.type(campo, "Publiqué a tiempo, adjunto la prueba.")
    await usuario.click(within(caja).getByRole("button", { name: "Enviar" }))
    await waitFor(() =>
      expect(acciones.enviarMensajeDisputa).toHaveBeenCalledWith({
        disputaId: DISPUTA.id,
        mensaje: "Publiqué a tiempo, adjunto la prueba.",
        adjuntoPath: null,
        interno: false,
      })
    )
    await waitFor(() => expect(campo).toHaveValue(""))
    expect(within(caja).getByRole("status")).toHaveTextContent(
      "Mensaje enviado."
    )
    expect(campo).toHaveFocus()
  })

  it("un fallo de la BD se muestra en la caja y conserva lo escrito", async () => {
    acciones.enviarMensajeDisputa.mockResolvedValue(
      fallo("Esta disputa ya se cerró: no admite mensajes nuevos.")
    )
    const usuario = userEvent.setup()
    render(
      <HiloDisputa
        disputa={DISPUTA}
        mensajes={[]}
        perspectiva="anunciante"
        puedeEscribir
      />
    )
    const caja = screen.getByRole("form", { name: "Responder en la disputa" })
    await usuario.type(within(caja).getByLabelText("Mensaje"), "¿Novedades?")
    await usuario.click(within(caja).getByRole("button", { name: "Enviar" }))
    expect(await within(caja).findByRole("alert")).toHaveTextContent(
      "Esta disputa ya se cerró"
    )
    expect(within(caja).getByLabelText("Mensaje")).toHaveValue("¿Novedades?")
  })

  it("envía el adjunto ya subido y no deja cambiar a nota interna mientras lo tenga", async () => {
    carga.elegida = new File(["x"], "captura.png", { type: "image/png" })
    carga.obtener.mockResolvedValue({
      ok: true,
      captura: { ruta: `disputa/${DISPUTA.id}/archivo.webp` },
    })
    const usuario = userEvent.setup()
    render(
      <HiloDisputa
        disputa={DISPUTA}
        mensajes={[]}
        perspectiva="interno"
        puedeEscribir
        puedeNotaInterna
      />
    )
    const caja = screen.getByRole("form", { name: "Responder en la disputa" })
    expect(within(caja).getByText("captura.png")).toBeVisible()
    expect(
      within(caja).getByRole("checkbox", { name: /Nota interna/ })
    ).toHaveAccessibleDescription(
      "Quita el adjunto para cambiar a quién va dirigido."
    )
    await usuario.type(
      within(caja).getByLabelText("Mensaje"),
      "La captura del panel."
    )
    await usuario.click(within(caja).getByRole("button", { name: "Enviar" }))
    await waitFor(() =>
      expect(acciones.enviarMensajeDisputa).toHaveBeenCalledWith({
        disputaId: DISPUTA.id,
        mensaje: "La captura del panel.",
        adjuntoPath: `disputa/${DISPUTA.id}/archivo.webp`,
        interno: false,
      })
    )
    expect(carga.descartar).toHaveBeenCalled()
  })

  it("si el adjunto no terminó de subir, lo dice y no envía", async () => {
    carga.elegida = new File(["x"], "captura.png", { type: "image/png" })
    carga.obtener.mockResolvedValue({
      ok: false,
      error: "Sin conexión: el archivo se subirá cuando vuelva.",
    })
    const usuario = userEvent.setup()
    render(
      <HiloDisputa
        disputa={DISPUTA}
        mensajes={[]}
        perspectiva="medio"
        puedeEscribir
      />
    )
    const caja = screen.getByRole("form", { name: "Responder en la disputa" })
    await usuario.type(within(caja).getByLabelText("Mensaje"), "Prueba.")
    await usuario.click(within(caja).getByRole("button", { name: "Enviar" }))
    expect(await within(caja).findByRole("alert")).toHaveTextContent(
      "Sin conexión"
    )
    expect(acciones.enviarMensajeDisputa).not.toHaveBeenCalled()
  })

  it("el equipo marca una nota interna y la caja cambia de destinatario", async () => {
    const usuario = userEvent.setup()
    render(
      <HiloDisputa
        disputa={DISPUTA}
        mensajes={[]}
        perspectiva="interno"
        puedeEscribir
        puedeNotaInterna
      />
    )
    await usuario.click(
      screen.getByRole("checkbox", {
        name: "Nota interna: solo la ve el equipo AMO",
      })
    )
    const caja = screen.getByRole("form", { name: "Nueva nota interna" })
    await usuario.type(
      within(caja).getByLabelText("Nota interna"),
      "Pedí la captura original."
    )
    await usuario.click(
      within(caja).getByRole("button", { name: "Guardar nota" })
    )
    await waitFor(() =>
      expect(acciones.enviarMensajeDisputa).toHaveBeenCalledWith(
        expect.objectContaining({ interno: true })
      )
    )
    // La marca se conserva: lo siguiente tampoco sale a las partes sin querer.
    expect(await within(caja).findByRole("status")).toHaveTextContent(
      "Nota interna guardada."
    )
    expect(screen.getByRole("checkbox", { name: /Nota interna/ })).toBeChecked()
  })

  it("cerrada: la parte ya no escribe; el equipo solo deja notas", () => {
    const cerrada = {
      ...DISPUTA,
      estado: "RESUELTA" as const,
      resueltaAt: "2026-10-23T15:00:00Z",
    }
    const { unmount } = render(
      <HiloDisputa
        disputa={cerrada}
        mensajes={[]}
        perspectiva="medio"
        puedeEscribir
      />
    )
    expect(screen.queryByRole("form")).not.toBeInTheDocument()
    expect(screen.getByText(/^La disputa se cerró el /)).toBeVisible()
    unmount()

    render(
      <HiloDisputa
        disputa={cerrada}
        mensajes={[]}
        perspectiva="interno"
        puedeEscribir
        puedeNotaInterna
      />
    )
    expect(
      screen.getByRole("form", { name: "Nueva nota interna" })
    ).toBeVisible()
    expect(
      screen.queryByRole("checkbox", { name: /Nota interna/ })
    ).not.toBeInTheDocument()
  })

  it("sin permiso de escribir (FINANZAS) es de solo lectura", () => {
    render(
      <HiloDisputa
        disputa={DISPUTA}
        mensajes={MENSAJES}
        perspectiva="interno"
        puedeEscribir={false}
      />
    )
    expect(screen.queryByRole("form")).not.toBeInTheDocument()
    expect(screen.getByText(/^Consulta en solo lectura/)).toBeVisible()
  })
})
