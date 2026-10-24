import { afterEach, describe, expect, it, vi } from "vitest"

import { destinoFocoPagos, ID_DESTINO_FOCO_PAGOS, rescatarFoco } from "./foco"

afterEach(() => {
  document.body.innerHTML = ""
  vi.restoreAllMocks()
})

function enfocable(id: string): HTMLElement {
  const elemento = document.createElement("h2")
  elemento.id = id
  elemento.tabIndex = -1
  document.body.append(elemento)
  return elemento
}

/** Ejecuta los cuadros pendientes de inmediato. */
function cuadrosInmediatos() {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((llamada) => {
    llamada(0)
    return 0
  })
}

describe("destinoFocoPagos", () => {
  it("prefiere el título de la vista y, sin él, el contenido principal", () => {
    const contenido = enfocable("contenido")
    expect(destinoFocoPagos()).toBe(contenido)
    const titulo = enfocable(ID_DESTINO_FOCO_PAGOS)
    expect(destinoFocoPagos()).toBe(titulo)
  })
})

describe("rescatarFoco", () => {
  it("si el foco cayó en <body>, lo lleva al destino", () => {
    cuadrosInmediatos()
    const titulo = enfocable(ID_DESTINO_FOCO_PAGOS)
    rescatarFoco()
    expect(document.activeElement).toBe(titulo)
  })

  it("no lo mueve si sigue en un control de la página", () => {
    cuadrosInmediatos()
    enfocable(ID_DESTINO_FOCO_PAGOS)
    const boton = document.createElement("button")
    document.body.append(boton)
    boton.focus()
    rescatarFoco()
    expect(document.activeElement).toBe(boton)
  })
})
