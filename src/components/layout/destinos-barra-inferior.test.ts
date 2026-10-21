import { describe, expect, it } from "vitest"

import { filtrarNavegacion } from "@/lib/auth/navegacion"
import type { ClavePermiso } from "@/lib/auth/permisos"

import {
  destinosBarraInferior,
  MAXIMO_DESTINOS_BARRA,
} from "./destinos-barra-inferior"

const navegacionMedio = (permisos: ClavePermiso[]) =>
  filtrarNavegacion({ rol: { tipo: "MEDIO" }, permisos })

describe("destinosBarraInferior", () => {
  it("Inicio primero y, de la cuenta, Avisos y Perfil con títulos cortos", () => {
    const destinos = destinosBarraInferior(
      navegacionMedio([
        "inicio.medio",
        "notificaciones.ver",
        "cuenta.gestionar",
      ])
    )
    expect(destinos.map((d) => [d.id, d.titulo])).toEqual([
      ["inicio", "Inicio"],
      ["notificaciones", "Avisos"],
      ["perfil", "Perfil"],
    ])
    expect(destinos[0].item.href).toBe("/inicio")
  })

  it("las secciones de la barra lateral van antes que las de la cuenta", () => {
    const destinos = destinosBarraInferior(
      navegacionMedio([
        "inicio.medio",
        "reportes.ver",
        "notificaciones.ver",
        "cuenta.gestionar",
      ])
    )
    expect(destinos.map((d) => d.id)).toEqual([
      "inicio",
      "reportes",
      "notificaciones",
      "perfil",
    ])
  })

  it("nunca pasa del máximo ni repite destinos", () => {
    const navegacion = navegacionMedio([
      "inicio.medio",
      "reportes.ver",
      "notificaciones.ver",
      "cuenta.gestionar",
    ])
    const duplicada = [...navegacion, ...navegacion]
    const destinos = destinosBarraInferior(duplicada)
    expect(destinos).toHaveLength(MAXIMO_DESTINOS_BARRA)
    expect(new Set(destinos.map((d) => d.id)).size).toBe(destinos.length)
    expect(destinosBarraInferior(navegacion, 2).map((d) => d.id)).toEqual([
      "inicio",
      "reportes",
    ])
  })

  it("sin permisos de navegación no hay destinos", () => {
    expect(destinosBarraInferior(navegacionMedio([]))).toEqual([])
  })
})
