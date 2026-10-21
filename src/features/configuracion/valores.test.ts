import { describe, expect, it } from "vitest"

import {
  decimalesPorcentaje,
  describirDiferencia,
  equivalenciaTiempo,
  fraccionAPorcentaje,
  leerValor,
  normalizarValor,
  porcentajeAFraccion,
  presentarValor,
  redondear,
  sonIguales,
} from "./valores"

const ESPACIO = /[\s  ]/g
const limpio = (texto: string) => texto.replace(ESPACIO, " ")

describe("leerValor", () => {
  it("interpreta cada tipo y rechaza lo que no corresponde", () => {
    expect(leerValor("ENTERO", 30)).toBe(30)
    expect(leerValor("PORCENTAJE", "0.2")).toBeNull()
    expect(leerValor("BOOLEANO", true)).toBe(true)
    expect(leerValor("TEXTO", "D7")).toBe("D7")
    expect(leerValor("LISTA_TEXTO", ["CO", "VE"])).toEqual(["CO", "VE"])
    expect(leerValor("LISTA_TEXTO", ["CO", 3])).toBeNull()
    expect(leerValor("MAPA_DECIMAL", { FACEBOOK: 3 })).toEqual({ FACEBOOK: 3 })
    expect(leerValor("MAPA_DECIMAL", { FACEBOOK: "3" })).toBeNull()
    expect(leerValor("MAPA_DECIMAL", [1])).toBeNull()
  })
})

describe("porcentajes", () => {
  it("convierte entre fracción y porcentaje sin ruido de coma flotante", () => {
    expect(fraccionAPorcentaje(0.155)).toBe(15.5)
    expect(fraccionAPorcentaje(0.07)).toBe(7)
    expect(porcentajeAFraccion(15.5)).toBe(0.155)
    expect(porcentajeAFraccion(7)).toBe(0.07)
    expect(redondear(0.1 + 0.2, 4)).toBe(0.3)
  })

  it("elige los decimales justos", () => {
    expect(decimalesPorcentaje(0.2)).toBe(0)
    expect(decimalesPorcentaje(0.155)).toBe(1)
    expect(decimalesPorcentaje(0.1234)).toBe(2)
  })
})

describe("normalizarValor y sonIguales", () => {
  it("ordena listas por sus opciones y quita repetidos", () => {
    expect(
      normalizarValor({ tipo: "LISTA_TEXTO", opciones: ["H24", "H72", "D7"] }, [
        "D7",
        "H24",
        "D7",
      ])
    ).toEqual(["H24", "D7"])
    expect(
      normalizarValor({ tipo: "LISTA_TEXTO", opciones: null }, ["VE", "CO"])
    ).toEqual(["CO", "VE"])
  })

  it("compara listas como conjuntos, números con tolerancia y mapas por clave", () => {
    expect(sonIguales(["H24", "D7"], ["D7", "H24"])).toBe(true)
    expect(sonIguales(0.1 + 0.2, 0.3)).toBe(true)
    expect(sonIguales({ A: 1, B: 2 }, { B: 2, A: 1 })).toBe(true)
    expect(sonIguales({ A: 1 }, { A: 1, B: 2 })).toBe(false)
    expect(sonIguales(true, false)).toBe(false)
    expect(sonIguales(null, null)).toBe(true)
  })
})

describe("presentarValor", () => {
  const unidad = (
    tipo: "ENTERO" | "DECIMAL" | "PORCENTAJE",
    u: string | null
  ) => ({
    tipo,
    unidad: u,
  })

  it("formatea porcentajes, pesos, multiplicadores y conteos", () => {
    expect(limpio(presentarValor(unidad("PORCENTAJE", "%"), 0.2).texto)).toBe(
      "20%"
    )
    expect(limpio(presentarValor(unidad("PORCENTAJE", "%"), 0.155).texto)).toBe(
      "15,5%"
    )
    expect(limpio(presentarValor(unidad("ENTERO", "COP"), 100).texto)).toBe(
      "$ 100"
    )
    expect(presentarValor(unidad("DECIMAL", "×"), 1.25).texto).toBe("1,25×")
    expect(presentarValor(unidad("ENTERO", "seguidores"), 30000).texto).toBe(
      "30.000 seguidores"
    )
    expect(presentarValor(unidad("ENTERO", "medios"), 1).texto).toBe("1 medio")
    expect(presentarValor(unidad("ENTERO", "días"), 1).texto).toBe("1 día")
  })

  it("añade una equivalencia exacta de tiempo cuando ayuda", () => {
    expect(presentarValor(unidad("ENTERO", "min"), 720)).toEqual({
      texto: "720 min",
      equivalencia: "12 horas",
    })
    expect(presentarValor(unidad("ENTERO", "días"), 1825).equivalencia).toBe(
      "5 años"
    )
    expect(presentarValor(unidad("ENTERO", "min"), 45).equivalencia).toBeNull()
    expect(equivalenciaTiempo(10080, "min")).toBe("7 días")
    expect(equivalenciaTiempo(72, "h")).toBe("3 días")
    expect(equivalenciaTiempo(120, "s")).toBe("2 minutos")
    expect(equivalenciaTiempo(14, "días")).toBe("2 semanas")
  })

  it("nombra opciones, listas y mapas en español", () => {
    expect(presentarValor({ tipo: "TEXTO", unidad: null }, "D7").texto).toBe(
      "7 días"
    )
    expect(
      presentarValor({ tipo: "LISTA_TEXTO", unidad: null }, [
        "H24",
        "H72",
        "D7",
      ]).texto
    ).toBe("24 horas, 72 horas y 7 días")
    expect(
      presentarValor({ tipo: "LISTA_TEXTO", unidad: null }, ["CO"], {
        etiquetas: { CO: "Colombia" },
      }).texto
    ).toBe("Colombia")
    expect(
      presentarValor(
        { tipo: "MAPA_DECIMAL", unidad: "×" },
        { FACEBOOK: 3, INSTAGRAM: 2 }
      ).texto
    ).toBe("Facebook 3× · Instagram 2×")
    expect(
      presentarValor({ tipo: "BOOLEANO", unidad: null }, false, {
        booleano: ["Visible", "Oculto"],
      }).texto
    ).toBe("Oculto")
    expect(presentarValor({ tipo: "ENTERO", unidad: null }, null).texto).toBe(
      "Valor no válido"
    )
  })

  it("muestra listas y mapas en el orden de las opciones, no en el del jsonb", () => {
    // Postgres devuelve las claves de un jsonb por longitud: TIKTOK antes que FACEBOOK.
    const opciones = ["FACEBOOK", "INSTAGRAM", "TIKTOK"]
    expect(
      presentarValor(
        { tipo: "MAPA_DECIMAL", unidad: "×", opciones },
        { TIKTOK: 20, FACEBOOK: 3, INSTAGRAM: 2 }
      ).texto
    ).toBe("Facebook 3× · Instagram 2× · TikTok 20×")
    expect(
      limpio(
        presentarValor(
          {
            tipo: "LISTA_TEXTO",
            unidad: null,
            opciones: ["H24", "H72", "D7"],
          },
          ["D7", "H24"]
        ).texto
      )
    ).toBe("24 horas y 7 días")
    // Sin opciones (países habituales) se respeta el orden guardado.
    expect(
      presentarValor({ tipo: "LISTA_TEXTO", unidad: null }, ["VE", "CO"], {
        etiquetas: { CO: "Colombia", VE: "Venezuela" },
      }).texto
    ).toBe("Venezuela y Colombia")
  })
})

describe("describirDiferencia", () => {
  it("expresa porcentajes en puntos porcentuales", () => {
    expect(
      describirDiferencia({ tipo: "PORCENTAJE", unidad: "%" }, 0.2, 0.22)
    ).toEqual({
      tipo: "numero",
      direccion: "sube",
      delta: "+2 p. p.",
      relativa: null,
    })
  })

  it("expresa números con unidad y variación relativa", () => {
    const diferencia = describirDiferencia(
      { tipo: "ENTERO", unidad: "min" },
      30,
      15
    )
    expect(diferencia).toMatchObject({
      tipo: "numero",
      direccion: "baja",
      delta: "−15 min",
    })
    if (diferencia.tipo !== "numero") throw new Error("tipo")
    expect(limpio(diferencia.relativa ?? "")).toBe("−50,0%")
  })

  it("lista lo que se agrega y lo que se quita", () => {
    expect(
      describirDiferencia(
        { tipo: "LISTA_TEXTO", unidad: null },
        ["H24", "D7"],
        ["H72", "D7"]
      )
    ).toEqual({
      tipo: "lista",
      agregados: ["72 horas"],
      quitados: ["24 horas"],
    })
  })

  it("compara mapas clave por clave", () => {
    expect(
      describirDiferencia(
        { tipo: "MAPA_DECIMAL", unidad: "×" },
        { FACEBOOK: 3, TIKTOK: 20 },
        { FACEBOOK: 3, TIKTOK: 25 }
      )
    ).toEqual({
      tipo: "mapa",
      cambios: [{ etiqueta: "TikTok", antes: "20×", despues: "25×" }],
    })
  })

  it("lista los cambios de un mapa en el orden de las opciones", () => {
    const diferencia = describirDiferencia(
      {
        tipo: "MAPA_DECIMAL",
        unidad: "×",
        opciones: ["FACEBOOK", "INSTAGRAM", "TIKTOK"],
      },
      { TIKTOK: 20, FACEBOOK: 3, INSTAGRAM: 2 },
      { TIKTOK: 25, FACEBOOK: 4, INSTAGRAM: 2 }
    )
    expect(diferencia).toEqual({
      tipo: "mapa",
      cambios: [
        { etiqueta: "Facebook", antes: "3×", despues: "4×" },
        { etiqueta: "TikTok", antes: "20×", despues: "25×" },
      ],
    })
  })

  it("un booleano o un texto es un cambio simple", () => {
    expect(
      describirDiferencia({ tipo: "BOOLEANO", unidad: null }, true, false)
    ).toEqual({
      tipo: "simple",
    })
  })
})
