import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  TIPOS_TRANSICION,
  TransicionPagina,
  TransicionVista,
} from "./transicion-vista"

type PropsRecibidas = Record<string, unknown> & { children?: ReactNode }

const estado = vi.hoisted(() => ({
  reducido: false,
  props: [] as PropsRecibidas[],
}))

vi.mock("motion/react", () => ({
  useReducedMotion: () => estado.reducido,
}))

// Doble de ViewTransition: registra las props y pinta los hijos tal cual.
vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>()
  return {
    ...real,
    ViewTransition: (props: PropsRecibidas) => {
      estado.props.push(props)
      return props.children
    },
  }
})

const ultimasProps = () => estado.props.at(-1)

beforeEach(() => {
  estado.reducido = false
  estado.props = []
})

describe("TransicionVista", () => {
  it("pasa las clases de animación tal cual", () => {
    render(
      <TransicionVista enter="pagina" name="detalle">
        <p>Contenido</p>
      </TransicionVista>
    )
    expect(screen.getByText("Contenido")).toBeInTheDocument()
    expect(ultimasProps()).toMatchObject({ enter: "pagina", name: "detalle" })
  })

  it("anula todas las animaciones con movimiento reducido sin desmontar a los hijos", () => {
    estado.reducido = true
    render(
      <TransicionVista enter="pagina" share="morph" name="detalle">
        <p>Contenido</p>
      </TransicionVista>
    )
    expect(screen.getByText("Contenido")).toBeInTheDocument()
    expect(ultimasProps()).toMatchObject({
      name: "detalle",
      default: "none",
      enter: "none",
      exit: "none",
      update: "none",
      share: "none",
    })
  })
})

describe("TransicionPagina", () => {
  it("anima entrada y salida según el tipo de navegación", () => {
    render(
      <TransicionPagina>
        <p>Página</p>
      </TransicionPagina>
    )
    const clases = {
      [TIPOS_TRANSICION.adelante]: "nav-adelante",
      [TIPOS_TRANSICION.atras]: "nav-atras",
      default: "pagina",
    }
    expect(ultimasProps()).toMatchObject({
      enter: clases,
      exit: clases,
      update: "none",
      default: "none",
    })
  })
})
