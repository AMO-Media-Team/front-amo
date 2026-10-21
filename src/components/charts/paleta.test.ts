// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  ATENUADO,
  CATEGORICA,
  claseSecuencial,
  colorCategorico,
  conAlfa,
  contraste,
  esHex,
  limitesClases,
  luminancia,
  MAXIMO_SERIES,
  mezclar,
  type ModoTema,
  ORDINAL,
  rampaOrdinal,
  SECUENCIAL,
  tintaSobre,
} from "./paleta"
import { construirTemaGraficos } from "./tema"

const SUPERFICIE: Readonly<Record<ModoTema, string>> = {
  claro: "#ffffff",
  oscuro: "#15111f",
}

const CSS = readFileSync(
  path.resolve(__dirname, "../../app/globals.css"),
  "utf8"
)

type SelectorTema = ":root" | ".dark"

const SELECTOR: Readonly<Record<ModoTema, SelectorTema>> = {
  claro: ":root",
  oscuro: ".dark",
}

/** Declaraciones del bloque de un tema en globals.css. */
function bloqueTema(selector: SelectorTema): string {
  const escapado = selector.replace(".", "\\.")
  const bloque = new RegExp(`^${escapado} \\{([\\s\\S]*?)^\\}`, "m").exec(
    CSS
  )?.[1]
  expect(bloque, `bloque ${selector} en globals.css`).toBeDefined()
  return bloque ?? ""
}

/** Valor HEX de un token (`--muted`) en el bloque de un tema. */
function token(selector: SelectorTema, nombre: string): string {
  const valor = new RegExp(`${nombre}:\\s*(#[0-9a-f]{6})`, "i").exec(
    bloqueTema(selector)
  )?.[1]
  return valor?.toLowerCase() ?? ""
}

/** `--chart-1..8` del bloque de un tema en globals.css. */
function tokensChart(selector: SelectorTema): string[] {
  return Array.from({ length: 8 }, (_, i) =>
    token(selector, `--chart-${i + 1}`)
  )
}

function monotona(colores: readonly string[], sentido: "sube" | "baja") {
  const valores = colores.map(luminancia)
  return valores.every((valor, i) =>
    i === 0
      ? true
      : sentido === "sube"
        ? valor > valores[i - 1]
        : valor < valores[i - 1]
  )
}

describe("paletas de datos", () => {
  it("la categórica refleja los tokens --chart-* de cada tema", () => {
    expect(CATEGORICA.claro).toEqual(tokensChart(":root"))
    expect(CATEGORICA.oscuro).toEqual(tokensChart(".dark"))
  })

  it.each(["claro", "oscuro"] as const)(
    "el tema sin lector (%s) refleja los tokens neutros y semánticos de globals.css",
    (modo) => {
      // El servidor y la hidratación pintan con estas constantes: si un token
      // cambia en el CSS y aquí no, el primer render deja de coincidir.
      const tema = construirTemaGraficos({ modo })
      const selector = SELECTOR[modo]
      expect({
        superficie: tema.superficie,
        texto: tema.texto,
        textoSecundario: tema.textoSecundario,
        eje: tema.eje,
        vacio: tema.vacio,
        primario: tema.primario,
        exito: tema.exito,
        aviso: tema.aviso,
        peligro: tema.peligro,
      }).toEqual({
        superficie: token(selector, "--card"),
        texto: token(selector, "--foreground"),
        textoSecundario: token(selector, "--muted-foreground"),
        eje: token(selector, "--border"),
        vacio: token(selector, "--muted"),
        primario: token(selector, "--primary"),
        exito: token(selector, "--success"),
        aviso: token(selector, "--warning"),
        peligro: token(selector, "--destructive"),
      })
    }
  )

  it("en oscuro `--muted` se distingue de popover, card y fondo y sostiene el texto (AA)", () => {
    const muted = token(".dark", "--muted")
    for (const superficie of ["--popover", "--card", "--background"]) {
      expect(
        contraste(muted, token(".dark", superficie)),
        `--muted sobre ${superficie}`
      ).toBeGreaterThanOrEqual(1.08)
    }
    for (const texto of ["--foreground", "--muted-foreground", "--primary"]) {
      expect(
        contraste(token(".dark", texto), muted),
        `${texto} sobre --muted`
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("todas las paletas son HEX (Chart.js no entiende oklch)", () => {
    const todas = (["claro", "oscuro"] as const).flatMap((modo) => [
      ...CATEGORICA[modo],
      ...ORDINAL[modo],
      ...SECUENCIAL[modo],
      ATENUADO[modo],
    ])
    expect(todas.every(esHex)).toBe(true)
  })

  it("en oscuro todas las series superan 3:1 sobre la tarjeta", () => {
    for (const color of CATEGORICA.oscuro) {
      expect(contraste(color, SUPERFICIE.oscuro)).toBeGreaterThanOrEqual(3)
    }
  })

  it.each(["claro", "oscuro"] as const)(
    "la rampa ordinal (%s) es monótona y su extremo tenue supera 2:1",
    (modo) => {
      // En claro va de claro a oscuro; en oscuro el ancla se invierte.
      const sentido = modo === "claro" ? "baja" : "sube"
      expect(monotona(ORDINAL[modo], sentido)).toBe(true)
      expect(
        contraste(ORDINAL[modo][0], SUPERFICIE[modo])
      ).toBeGreaterThanOrEqual(2)
    }
  )

  it.each(["claro", "oscuro"] as const)(
    "la secuencial (%s) crece en contraste con la superficie",
    (modo) => {
      const contrastes = SECUENCIAL[modo].map((c) =>
        contraste(c, SUPERFICIE[modo])
      )
      expect(contrastes.every((c, i) => i === 0 || c > contrastes[i - 1])).toBe(
        true
      )
    }
  )

  it("el gris de contexto es recesivo pero visible (≥ 2,5:1)", () => {
    expect(contraste(ATENUADO.claro, SUPERFICIE.claro)).toBeGreaterThanOrEqual(
      2.5
    )
    expect(
      contraste(ATENUADO.oscuro, SUPERFICIE.oscuro)
    ).toBeGreaterThanOrEqual(2.5)
  })
})

describe("colorCategorico", () => {
  const paleta = CATEGORICA.claro

  it("asigna los tonos en orden fijo", () => {
    expect(colorCategorico(0, paleta, "#999999")).toBe(paleta[0])
    expect(colorCategorico(7, paleta, "#999999")).toBe(paleta[7])
  })

  it("nunca recicla ni genera un noveno tono: usa el atenuado", () => {
    expect(MAXIMO_SERIES).toBe(8)
    expect(colorCategorico(8, paleta, "#999999")).toBe("#999999")
    expect(colorCategorico(-1, paleta, "#999999")).toBe("#999999")
  })
})

describe("rampaOrdinal", () => {
  const rampa = ORDINAL.claro

  it("reparte pocas etapas a lo largo de toda la rampa", () => {
    expect(rampaOrdinal(3, rampa)).toEqual([rampa[0], rampa[4], rampa[7]])
    expect(rampaOrdinal(2, rampa)).toEqual([rampa[0], rampa[7]])
  })

  it("usa el paso medio con una sola etapa y nada sin etapas", () => {
    expect(rampaOrdinal(1, rampa)).toEqual([rampa[3]])
    expect(rampaOrdinal(0, rampa)).toEqual([])
  })

  it("con más etapas que pasos repite el más intenso al final", () => {
    const colores = rampaOrdinal(10, rampa)
    expect(colores).toHaveLength(10)
    expect(colores.slice(0, 8)).toEqual([...rampa])
    expect(colores.slice(8)).toEqual([rampa[7], rampa[7]])
  })
})

describe("claseSecuencial y limitesClases", () => {
  it("-1 = sin actividad (cero, negativo, sin máximo)", () => {
    expect(claseSecuencial(0, 100, 5)).toBe(-1)
    expect(claseSecuencial(-3, 100, 5)).toBe(-1)
    expect(claseSecuencial(4, 0, 5)).toBe(-1)
    expect(claseSecuencial(Number.NaN, 100, 5)).toBe(-1)
  })

  it("clases de igual amplitud respecto del máximo", () => {
    expect(claseSecuencial(1, 100, 5)).toBe(0)
    expect(claseSecuencial(20, 100, 5)).toBe(0)
    expect(claseSecuencial(21, 100, 5)).toBe(1)
    expect(claseSecuencial(100, 100, 5)).toBe(4)
    expect(claseSecuencial(150, 100, 5)).toBe(4)
  })

  it("los límites de la leyenda coinciden con las clases", () => {
    expect(limitesClases(100, 5)).toEqual([20, 40, 60, 80, 100])
    expect(limitesClases(7, 5)).toEqual([2, 3, 5, 6, 7])
    expect(limitesClases(0, 5)).toEqual([])
  })
})

describe("utilidades de color", () => {
  it("mezcla en sRGB y convierte a rgba", () => {
    expect(mezclar("#000000", "#ffffff", 0.5)).toBe("#808080")
    expect(mezclar("#7549de", "#7549de", 0.3)).toBe("#7549de")
    expect(conAlfa("#7549de", 0.1)).toBe("rgba(117, 73, 222, 0.1)")
  })

  it("contraste WCAG y tinta legible sobre un relleno", () => {
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 5)
    expect(contraste("#ffffff", "#ffffff")).toBeCloseTo(1, 5)
    expect(tintaSobre("#332260")).toBe("#ffffff")
    expect(tintaSobre("#e1d7fd")).toBe("#1b1528")
  })

  it("reconoce HEX de 6 dígitos únicamente", () => {
    expect(esHex(" #A788F6 ")).toBe(true)
    expect(esHex("oklch(0.7 0.1 290)")).toBe(false)
    expect(esHex("#abc")).toBe(false)
  })
})
