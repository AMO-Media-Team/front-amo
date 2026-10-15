import { describe, expect, it } from "vitest"

import { mediosEnRiesgoDesdeRpc, mezclaDesdeRpc, numero } from "./adaptadores"
import { entradaVacia } from "./fixtures"
import { reglaMejorCpm } from "./reglas/cpm"

describe("numero", () => {
  it("acepta números y texto numérico de PostgREST", () => {
    expect(numero(12)).toBe(12)
    expect(numero("184320000.50")).toBe(184_320_000.5)
    expect(numero(null)).toBeNull()
    expect(numero("")).toBeNull()
    expect(numero("NaN")).toBeNull()
  })
})

describe("adaptadores de las RPC de analítica", () => {
  it("mezcla_plataformas alimenta la regla del CPM", () => {
    const mezcla = mezclaDesdeRpc([
      {
        plataforma: "INSTAGRAM",
        formato_clave: "reel",
        formato_nombre: "Reels",
        asignaciones: "30",
        gmv: "30000000",
        cpm_efectivo: "10000",
      },
      {
        plataforma: "FACEBOOK",
        formato_clave: "post",
        formato_nombre: "Publicaciones",
        asignaciones: 40,
        gmv: 36_000_000,
        cpm_efectivo: 18_000,
      },
      {
        plataforma: "TIKTOK",
        formato_clave: "video",
        formato_nombre: "Videos",
        asignaciones: 3,
        gmv: 1_000,
        cpm_efectivo: null,
      },
    ])
    expect(mezcla[0]).toEqual({
      plataforma: "INSTAGRAM",
      formatoClave: "reel",
      formatoNombre: "Reels",
      asignaciones: 30,
      gmv: 30_000_000,
      cpmEfectivo: 10_000,
    })
    expect(mezcla[2].cpmEfectivo).toBeNull()
    expect(reglaMejorCpm(entradaVacia({ mezclaPlataformas: mezcla }))?.id).toBe(
      "cpm-instagram-reel"
    )
  })

  it("salud_medios + medios_en_riesgo dan la entrada de la regla 3", () => {
    const riesgo = mediosEnRiesgoDesdeRpc(
      [
        { segmento: "activos", cantidad: 200, gmv_en_juego: 0 },
        { segmento: "en_riesgo", cantidad: "12", gmv_en_juego: "18400000" },
      ],
      [
        {
          medio_id: "m1",
          nombre: "Eco Tunja",
          departamento: "Boyacá",
          gmv_90d: "4100000",
        },
      ],
      612_000_000
    )
    expect(riesgo).toEqual({
      cantidad: 12,
      gmvEnJuego: 18_400_000,
      gmvVerificado90d: 612_000_000,
      top: [
        {
          id: "m1",
          nombre: "Eco Tunja",
          departamento: "Boyacá",
          gmv90d: 4_100_000,
        },
      ],
    })
    expect(mediosEnRiesgoDesdeRpc([], [])).toBeUndefined()
  })
})
