import { describe, expect, it } from "vitest"

import { VALORES_VACIOS } from "./campos-metricas"
import {
  caeBajoLaTolerancia,
  cifrasDe,
  leerTolerancia,
  TOLERANCIA_CORTES_POR_DEFECTO,
  validarCoherencia,
} from "./coherencia"
import type { CorteComparable, ValoresMetricas } from "./tipos"

function valores(cambios: Partial<ValoresMetricas>): ValoresMetricas {
  return { ...VALORES_VACIOS, ...cambios }
}

function corte(cambios: Partial<CorteComparable>): CorteComparable {
  return {
    id: "otro",
    corte: "H72",
    estado: "PENDIENTE",
    alcance: 1000,
    impresiones: 2000,
    interacciones: 100,
    ...cambios,
  }
}

const INSTAGRAM = valores({
  alcance: 1000,
  impresiones: 2000,
  meGusta: 60,
  comentarios: 20,
  compartidos: 10,
  guardados: 10,
})

describe("cifrasDe", () => {
  it("normaliza como la BD: TikTok usa espectadores y reproducciones", () => {
    expect(cifrasDe(INSTAGRAM)).toEqual({
      alcance: 1000,
      impresiones: 2000,
      interacciones: 100,
    })
    expect(
      cifrasDe(
        valores({ reproducciones: 500, espectadoresUnicos: 300, meGusta: 7 })
      )
    ).toEqual({ alcance: 300, impresiones: 500, interacciones: 7 })
  })
})

describe("caeBajoLaTolerancia", () => {
  it("admite justo el 2 % de baja y rechaza un poco más", () => {
    expect(caeBajoLaTolerancia(98, 100, 0.02)).toBe(false)
    expect(caeBajoLaTolerancia(97, 100, 0.02)).toBe(true)
    expect(caeBajoLaTolerancia(980_000, 1_000_000, 0.02)).toBe(false)
    expect(caeBajoLaTolerancia(979_999, 1_000_000, 0.02)).toBe(true)
  })

  it("es exacta donde la coma flotante fallaría", () => {
    // 0,07 × 100 = 7,000000000000001 en coma flotante: 93 cae justo en el borde.
    expect(caeBajoLaTolerancia(93, 100, 0.07)).toBe(false)
    expect(caeBajoLaTolerancia(1, 1, 0)).toBe(false)
    expect(caeBajoLaTolerancia(0, 1, 0)).toBe(true)
  })
})

describe("leerTolerancia", () => {
  it("lee el número o el texto de la configuración dentro de sus límites", () => {
    expect(leerTolerancia(0.05)).toBe(0.05)
    expect(leerTolerancia("0.1")).toBe(0.1)
    expect(leerTolerancia(0.5)).toBe(TOLERANCIA_CORTES_POR_DEFECTO)
    expect(leerTolerancia(null)).toBe(TOLERANCIA_CORTES_POR_DEFECTO)
    expect(leerTolerancia("abc")).toBe(TOLERANCIA_CORTES_POR_DEFECTO)
  })
})

describe("validarCoherencia · por fila", () => {
  it("unas cifras que cuadran no tienen problemas", () => {
    expect(
      validarCoherencia({
        plataforma: "INSTAGRAM",
        corte: "H24",
        valores: INSTAGRAM,
        otros: [],
        tolerancia: 0.02,
      })
    ).toEqual([])
  })

  it("impresiones menores que el alcance (en el campo de impresiones)", () => {
    expect(
      validarCoherencia({
        plataforma: "FACEBOOK",
        corte: "H24",
        valores: valores({ alcance: 1000, impresiones: 900 }),
        otros: [],
        tolerancia: 0.02,
      })
    ).toEqual([
      {
        campo: "impresiones",
        mensaje:
          "Las impresiones (900) no pueden ser menos que el alcance (1.000).",
      },
    ])
  })

  it("en TikTok compara reproducciones con espectadores únicos", () => {
    const [problema] = validarCoherencia({
      plataforma: "TIKTOK",
      corte: "H24",
      valores: valores({ reproducciones: 100, espectadoresUnicos: 150 }),
      otros: [],
      tolerancia: 0.02,
    })
    expect(problema).toEqual({
      campo: "reproducciones",
      mensaje:
        "Las reproducciones (100) no pueden ser menos que los espectadores únicos (150).",
    })
  })

  it("interacciones que superan las impresiones", () => {
    const problemas = validarCoherencia({
      plataforma: "INSTAGRAM",
      corte: "PERSONALIZADO",
      valores: valores({
        alcance: 50,
        impresiones: 80,
        meGusta: 70,
        guardados: 20,
      }),
      otros: [],
      tolerancia: 0.02,
    })
    expect(problemas).toEqual([
      {
        campo: "interacciones",
        mensaje:
          "Las interacciones suman 90 y no pueden superar las impresiones (80).",
      },
    ])
  })
})

describe("validarCoherencia · entre cortes", () => {
  it("INT-005: un 7 días con menos alcance que el de 72 horas se bloquea", () => {
    const problemas = validarCoherencia({
      plataforma: "INSTAGRAM",
      corte: "D7",
      valores: { ...INSTAGRAM, alcance: 900, impresiones: 2100 },
      otros: [corte({ corte: "H72", alcance: 1000, impresiones: 2000 })],
      tolerancia: 0.02,
    })
    expect(problemas).toEqual([
      {
        campo: "alcance",
        mensaje:
          "En el corte de 72 horas, el alcance fue 1.000. Un corte posterior no puede quedar por debajo (se admite hasta un 2% menos).",
      },
    ])
  })

  it("admite la baja dentro de la tolerancia", () => {
    expect(
      validarCoherencia({
        plataforma: "INSTAGRAM",
        corte: "D7",
        valores: { ...INSTAGRAM, alcance: 980, impresiones: 1960, meGusta: 58 },
        otros: [corte({ corte: "H72" })],
        tolerancia: 0.02,
      })
    ).toEqual([])
  })

  it("un corte anterior no puede superar al posterior más de la tolerancia", () => {
    const problemas = validarCoherencia({
      plataforma: "TIKTOK",
      corte: "H24",
      valores: valores({
        reproducciones: 5000,
        espectadoresUnicos: 1000,
        meGusta: 100,
      }),
      otros: [
        corte({
          corte: "D7",
          alcance: 1000,
          impresiones: 4000,
          interacciones: 100,
        }),
      ],
      tolerancia: 0.02,
    })
    expect(problemas).toEqual([
      {
        campo: "reproducciones",
        mensaje:
          "En el corte de 7 días, las reproducciones fueron 4.000. Este corte es anterior y no puede superarlo en más del 2%.",
      },
    ])
  })

  it("compara las interacciones y muestra cada campo una sola vez", () => {
    const problemas = validarCoherencia({
      plataforma: "INSTAGRAM",
      corte: "D7",
      valores: { ...INSTAGRAM, meGusta: 10 },
      otros: [
        corte({ id: "a", corte: "H24", interacciones: 90 }),
        corte({ id: "b", corte: "H72", interacciones: 95 }),
      ],
      tolerancia: 0.02,
    })
    expect(problemas.map((p) => p.campo)).toEqual(["interacciones"])
  })

  it("ignora los rechazados, el mismo corte y los personalizados", () => {
    expect(
      validarCoherencia({
        plataforma: "INSTAGRAM",
        corte: "D7",
        valores: {
          ...INSTAGRAM,
          alcance: 10,
          impresiones: 20,
          meGusta: 0,
          comentarios: 0,
          compartidos: 0,
          guardados: 0,
        },
        otros: [
          corte({ corte: "H72", estado: "RECHAZADA" }),
          corte({ corte: "D7" }),
          corte({ corte: "PERSONALIZADO" }),
        ],
        tolerancia: 0.02,
      })
    ).toEqual([])
  })

  it("el personalizado no se compara con los cortes fijos", () => {
    expect(
      validarCoherencia({
        plataforma: "INSTAGRAM",
        corte: "PERSONALIZADO",
        valores: valores({ alcance: 10, impresiones: 20 }),
        otros: [corte({ corte: "H24" })],
        tolerancia: 0.02,
      })
    ).toEqual([])
  })

  it("respeta otra tolerancia configurada", () => {
    const entrada = {
      plataforma: "INSTAGRAM" as const,
      corte: "H72" as const,
      valores: { ...INSTAGRAM, alcance: 950 },
      otros: [
        corte({
          corte: "H24",
          alcance: 1000,
          impresiones: 1000,
          interacciones: 0,
        }),
      ],
    }
    expect(validarCoherencia({ ...entrada, tolerancia: 0.05 })).toEqual([])
    expect(
      validarCoherencia({ ...entrada, tolerancia: 0.02 }).map((p) => p.campo)
    ).toEqual(["alcance"])
  })
})
