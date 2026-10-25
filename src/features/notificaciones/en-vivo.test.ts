import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  ESPERAS_RECONEXION_MS,
  esperaReconexion,
  fijarEnVivo,
  INTERVALO_SONDEO_EN_VIVO_MS,
  INTERVALO_SONDEO_MS,
  intervaloSondeo,
  textoAnuncio,
  topicoUsuario,
  useEnVivo,
} from "./en-vivo"
import { esquemaAvisoEnVivo } from "./esquemas"

afterEach(() => fijarEnVivo(false))

describe("aviso en vivo: constantes", () => {
  it("el tópico es el de la política «realtime: tópico propio»", () => {
    expect(topicoUsuario("4f1c")).toBe("usuario:4f1c")
  })

  it("sondea cada 60 s sin canal y cada 5 min con él", () => {
    expect(intervaloSondeo(false)).toBe(INTERVALO_SONDEO_MS)
    expect(intervaloSondeo(true)).toBe(INTERVALO_SONDEO_EN_VIVO_MS)
    expect(INTERVALO_SONDEO_MS).toBe(60_000)
    expect(INTERVALO_SONDEO_EN_VIVO_MS).toBe(300_000)
  })

  it("la reconexión espera cada vez más, con tope", () => {
    expect(esperaReconexion(0)).toBe(1_000)
    expect(esperaReconexion(1)).toBe(5_000)
    expect(esperaReconexion(99)).toBe(ESPERAS_RECONEXION_MS.at(-1))
    expect(esperaReconexion(-3)).toBe(1_000)
  })
})

describe("textoAnuncio", () => {
  const aviso = { id: 9, tipo: "seguridad.alerta_pais_inusual", no_leidas: 3 }

  it("solo anuncia la prioridad 2, con la categoría y el conteo", () => {
    expect(textoAnuncio({ ...aviso, prioridad: 2 })).toBe(
      "Nuevo aviso urgente: Seguridad. Tienes 3 sin leer."
    )
    expect(textoAnuncio({ ...aviso, prioridad: 2, no_leidas: 1 })).toBe(
      "Nuevo aviso urgente: Seguridad. Tienes 1 sin leer."
    )
    expect(textoAnuncio({ ...aviso, prioridad: 1 })).toBeNull()
    expect(textoAnuncio({ ...aviso, prioridad: 0 })).toBeNull()
  })
})

describe("esquemaAvisoEnVivo", () => {
  it("acepta la carga del trigger (sin título)", () => {
    expect(
      esquemaAvisoEnVivo.safeParse({
        id: 12,
        tipo: "oferta.nueva_elegible",
        prioridad: 0,
        no_leidas: 4,
      }).success
    ).toBe(true)
  })

  it.each([
    { id: 0, tipo: "x", prioridad: 0, no_leidas: 1 },
    { id: 1, tipo: "", prioridad: 0, no_leidas: 1 },
    { id: 1, tipo: "x", prioridad: 5, no_leidas: 1 },
    { id: 1, tipo: "x", prioridad: 0, no_leidas: -1 },
    { id: 1, tipo: "x", prioridad: 0 },
    "texto",
    null,
  ])("descarta cargas inválidas (%j)", (carga) => {
    expect(esquemaAvisoEnVivo.safeParse(carga).success).toBe(false)
  })
})

describe("useEnVivo", () => {
  it("todas las vistas leen el mismo estado del canal", () => {
    const uno = renderHook(() => useEnVivo())
    const dos = renderHook(() => useEnVivo())
    expect(uno.result.current).toBe(false)
    act(() => fijarEnVivo(true))
    expect(uno.result.current).toBe(true)
    expect(dos.result.current).toBe(true)
    act(() => fijarEnVivo(false))
    expect(dos.result.current).toBe(false)
  })
})
