import { describe, expect, it } from "vitest"

import {
  esRutaAvatarPropia,
  esTipoAceptado,
  limitarEncuadre,
  regionRecorte,
  rutaAvatar,
} from "./avatar"

const PERFIL = "0192a0b0-1111-7000-8000-000000000001"
const OTRO = "0192a0b0-2222-7000-8000-000000000002"
const ARCHIVO = "0192a0b0-3333-4000-8000-000000000003"

describe("rutas de avatar", () => {
  it("construye y reconoce la ruta propia", () => {
    const ruta = rutaAvatar(PERFIL, ARCHIVO)
    expect(ruta).toBe(`perfil/${PERFIL}/${ARCHIVO}.webp`)
    expect(esRutaAvatarPropia(ruta, PERFIL)).toBe(true)
  })

  it("rechaza rutas de otro perfil, otras carpetas o con recorridos", () => {
    expect(esRutaAvatarPropia(rutaAvatar(OTRO, ARCHIVO), PERFIL)).toBe(false)
    expect(
      esRutaAvatarPropia(`anunciante/${PERFIL}/${ARCHIVO}.webp`, PERFIL)
    ).toBe(false)
    expect(
      esRutaAvatarPropia(`perfil/${PERFIL}/../${OTRO}/${ARCHIVO}.webp`, PERFIL)
    ).toBe(false)
    expect(esRutaAvatarPropia(`perfil/${PERFIL}/${ARCHIVO}.png`, PERFIL)).toBe(
      false
    )
  })

  it("solo acepta JPEG, PNG y WebP", () => {
    expect(esTipoAceptado("image/png")).toBe(true)
    expect(esTipoAceptado("image/gif")).toBe(false)
    expect(esTipoAceptado("image/svg+xml")).toBe(false)
  })
})

describe("geometría del recorte", () => {
  const horizontal = { ancho: 2000, alto: 1000 }

  it("sin zoom ni desplazamiento toma el cuadrado central", () => {
    expect(regionRecorte({ zoom: 1, x: 0, y: 0 }, horizontal, 300)).toEqual({
      x: 500,
      y: 0,
      lado: 1000,
    })
  })

  it("con zoom 2 toma la mitad del lado, centrada", () => {
    const region = regionRecorte({ zoom: 2, x: 0, y: 0 }, horizontal, 300)
    expect(region.lado).toBeCloseTo(500)
    expect(region.x).toBeCloseTo(750)
    expect(region.y).toBeCloseTo(250)
  })

  it("mover la imagen a la derecha muestra su parte izquierda", () => {
    const region = regionRecorte({ zoom: 1, x: 150, y: 0 }, horizontal, 300)
    expect(region.x).toBeCloseTo(0)
  })

  it("nunca deja bordes vacíos: limita zoom y desplazamiento", () => {
    expect(
      limitarEncuadre({ zoom: 1, x: 999, y: 50 }, horizontal, 300)
    ).toEqual({ zoom: 1, x: 150, y: 0 })
    expect(
      limitarEncuadre({ zoom: 0.2, x: 0, y: 0 }, horizontal, 300).zoom
    ).toBe(1)
    expect(
      limitarEncuadre({ zoom: 99, x: 0, y: 0 }, horizontal, 300).zoom
    ).toBe(4)
  })
})
