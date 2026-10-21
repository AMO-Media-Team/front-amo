import { describe, expect, it } from "vitest"

import { entradaVacia, filaMezcla } from "../fixtures"
import { cpmGlobal, reglaMejorCpm } from "./cpm"

const plano = (texto: string | undefined) =>
  (texto ?? "").replace(/[\u00a0\u202f]/g, " ")

// Familia de impresiones: 30 M / 3 M + 50 M / 2,5 M + 36 M / 2 M → CPM global ≈ 15.467.
const MEZCLA = [
  filaMezcla("INSTAGRAM", "reel", "Reels", 10_000, { gmv: 30_000_000 }),
  filaMezcla("INSTAGRAM", "post", "Publicaciones", 20_000, { gmv: 50_000_000 }),
  filaMezcla("FACEBOOK", "post", "Publicaciones", 18_000, {
    gmv: 36_000_000,
    asignaciones: 40,
  }),
]

describe("cpmGlobal", () => {
  it("es cociente de sumas, no promedio de CPM", () => {
    expect(cpmGlobal(MEZCLA)).toBeCloseTo((116_000_000 / 7_500_000) * 1000, 3)
  })

  it("ignora filas sin CPM y sin datos da null", () => {
    expect(
      cpmGlobal([filaMezcla("TIKTOK", "video", "Videos", null)])
    ).toBeNull()
    expect(cpmGlobal([])).toBeNull()
  })
})

describe("reglaMejorCpm", () => {
  it("destaca la combinación ≥ 20 % más barata que su familia", () => {
    const insight = reglaMejorCpm(entradaVacia({ mezclaPlataformas: MEZCLA }))
    expect(insight).toMatchObject({
      id: "cpm-instagram-reel",
      regla: 4,
      severidad: "positivo",
      titulo: "Reels en Instagram: el CPM más eficiente",
      metrica: "cpm_efectivo",
      valor: 10_000,
    })
    expect(plano(insight?.detalle)).toBe(
      "Reels en Instagram entrega mil impresiones por $ 10.000, 35% por debajo del promedio de Facebook e Instagram ($ 15.467)."
    )
    expect(insight?.accion?.href).toBe(
      "/reportes/desempeno-campanas?plataforma=INSTAGRAM&desde=2026-09-01&hasta=2026-09-30"
    )
  })

  it("no dispara si la mejor no está al menos 20 % por debajo", () => {
    const pareja = [
      filaMezcla("INSTAGRAM", "reel", "Reels", 14_000),
      filaMezcla("FACEBOOK", "post", "Publicaciones", 16_000),
    ]
    expect(
      reglaMejorCpm(entradaVacia({ mezclaPlataformas: pareja }))
    ).toBeNull()
  })

  it("exige dos combinaciones con muestra suficiente en la familia", () => {
    const pocaMuestra = MEZCLA.map((fila, i) =>
      i === 0 ? fila : { ...fila, asignaciones: 19 }
    )
    expect(
      reglaMejorCpm(entradaVacia({ mezclaPlataformas: pocaMuestra }))
    ).toBeNull()
    expect(
      reglaMejorCpm(entradaVacia({ mezclaPlataformas: MEZCLA.slice(0, 1) }))
    ).toBeNull()
    expect(reglaMejorCpm(entradaVacia())).toBeNull()
  })

  it("una combinación con poca muestra no puede ganar aunque sea más barata", () => {
    const conRuido = [
      ...MEZCLA,
      filaMezcla("FACEBOOK", "historia", "Historias", 2_000, {
        asignaciones: 5,
        gmv: 1_000_000,
      }),
    ]
    expect(
      reglaMejorCpm(entradaVacia({ mezclaPlataformas: conRuido }))?.id
    ).toBe("cpm-instagram-reel")
  })

  it("TikTok se compara solo dentro de su familia (reproducciones)", () => {
    const tiktok = [
      filaMezcla("TIKTOK", "video", "Videos", 4_000, { gmv: 20_000_000 }),
      filaMezcla("TIKTOK", "live", "En vivo", 12_000, { gmv: 24_000_000 }),
    ]
    const insight = reglaMejorCpm(entradaVacia({ mezclaPlataformas: tiktok }))
    expect(insight?.id).toBe("cpm-tiktok-video")
    expect(plano(insight?.detalle)).toBe(
      "Videos en TikTok entrega mil reproducciones por $ 4.000, 36% por debajo del promedio de TikTok ($ 6.286)."
    )
  })

  it("entre familias gana la de mayor mejora relativa", () => {
    const ambas = [
      ...MEZCLA,
      filaMezcla("TIKTOK", "video", "Videos", 4_000, { gmv: 20_000_000 }),
      filaMezcla("TIKTOK", "live", "En vivo", 12_000, { gmv: 24_000_000 }),
    ]
    expect(reglaMejorCpm(entradaVacia({ mezclaPlataformas: ambas }))?.id).toBe(
      "cpm-tiktok-video"
    )
  })

  it("en empate de CPM prefiere más asignaciones y luego el nombre", () => {
    const empate = [
      filaMezcla("INSTAGRAM", "reel", "Reels", 8_000, { asignaciones: 25 }),
      filaMezcla("FACEBOOK", "reel", "Reels", 8_000, { asignaciones: 50 }),
      filaMezcla("INSTAGRAM", "post", "Publicaciones", 30_000),
    ]
    expect(reglaMejorCpm(entradaVacia({ mezclaPlataformas: empate }))?.id).toBe(
      "cpm-facebook-reel"
    )
    const empateTotal = empate.map((fila) => ({ ...fila, asignaciones: 30 }))
    expect(
      reglaMejorCpm(entradaVacia({ mezclaPlataformas: empateTotal }))?.id
    ).toBe("cpm-facebook-reel")
  })
})
