import { afterEach, describe, expect, it, vi } from "vitest"

import { descargarArchivo, MIME, nombreArchivo } from "./descarga"
import { componerImagenGrafico } from "./imagen"
import { proporcionViewBox } from "./logo"
import { argb, COLOR_DOCUMENTO, rgb, selloGeneracion } from "./marca"

describe("marca de los documentos", () => {
  it("convierte HEX a ARGB (ExcelJS) y RGB (jsPDF)", () => {
    expect(argb("#7549de")).toBe("FF7549DE")
    expect(rgb("#7549DE")).toEqual([117, 73, 222])
    expect(COLOR_DOCUMENTO.primario).toBe("#7549DE")
  })

  it("el sello de generación usa la hora de Bogotá aunque el servidor esté en UTC", () => {
    const sello = selloGeneracion(new Date("2026-10-01T02:30:00Z")).replace(
      /[\u00a0\u202f]/g,
      " "
    )
    expect(sello).toMatch(
      /^30 de septiembre de 2026(,| a las) 9:30 p\. ?m\. \(hora de Bogotá\)$/
    )
  })
})

describe("logo", () => {
  it("lee la proporción del viewBox (con comas o espacios)", () => {
    expect(proporcionViewBox('<svg viewBox="0 0 400 100">')).toBe(4)
    expect(proporcionViewBox('<svg viewBox="0,0,300,150">')).toBe(2)
    expect(proporcionViewBox("<svg>")).toBeNull()
    expect(proporcionViewBox('<svg viewBox="0 0 0 10">')).toBeNull()
  })
})

describe("descarga", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("nombra el archivo sin tildes y con la fecha de Bogotá", () => {
    expect(
      nombreArchivo(
        "Resumen ejecutivo: Nariño",
        "xlsx",
        new Date("2026-10-01T03:00:00Z")
      )
    ).toBe("resumen-ejecutivo-narino-2026-09-30.xlsx")
  })

  it("descarga con un enlace temporal y libera la URL", () => {
    vi.useFakeTimers()
    const crear = vi.fn(() => "blob:amo/1")
    const liberar = vi.fn()
    Object.assign(URL, { createObjectURL: crear, revokeObjectURL: liberar })
    const clic = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {})

    descargarArchivo("hola", "prueba.pdf", MIME.pdf)

    expect(crear).toHaveBeenCalledWith(expect.any(Blob))
    expect(clic).toHaveBeenCalledOnce()
    expect(document.querySelector("a[download]")).toBeNull()
    vi.runAllTimers()
    expect(liberar).toHaveBeenCalledWith("blob:amo/1")
  })
})

describe("componerImagenGrafico", () => {
  const ESTILO = {
    superficie: "#15111f",
    texto: "#f2effa",
    textoSecundario: "#a59eb8",
    fuente: "Geist",
  }

  function lienzo(ancho: number, alto: number, anchoCss = 0) {
    const origen = document.createElement("canvas")
    origen.width = ancho
    origen.height = alto
    Object.defineProperty(origen, "clientWidth", { value: anchoCss })
    return origen
  }

  it("agrega márgenes, cabecera y pie alrededor del gráfico", () => {
    const resultado = componerImagenGrafico(lienzo(600, 300), {
      estilo: ESTILO,
      titulo: "GMV",
      descripcion: "Mensual",
    })
    // 24 px de margen por lado; 22 + 18 + 12 de cabecera; 22 de pie con el sello.
    expect(resultado.width).toBe(648)
    expect(resultado.height).toBe(300 + 48 + 52 + 22)
  })

  it("dibuja la leyenda arriba en gráficos anchos", () => {
    const leyenda = [
      { nombre: "GMV", color: "#8c66ee", marca: "bloque" as const },
      { nombre: "Take rate", color: "#d95926", marca: "linea" as const },
    ]
    const resultado = componerImagenGrafico(lienzo(600, 300), {
      estilo: ESTILO,
      leyenda,
      conSello: false,
    })
    // Una fila de 18 px + 12 de separación; el ancho no cambia.
    expect(resultado.width).toBe(648)
    expect(resultado.height).toBe(300 + 48 + 30)
  })

  it("en gráficos casi cuadrados (dona) la leyenda va al lado", () => {
    const leyenda = ["A", "B", "C"].map((nombre) => ({
      nombre,
      color: "#8c66ee",
      marca: "bloque" as const,
      valor: "10 %",
    }))
    const resultado = componerImagenGrafico(lienzo(240, 240), {
      estilo: ESTILO,
      leyenda,
      conSello: false,
    })
    expect(resultado.width).toBeGreaterThan(240 + 48 + 24)
    expect(resultado.height).toBe(240 + 48)
  })

  it("la disposición pedida manda sobre la forma del gráfico", () => {
    const leyenda = [
      { nombre: "GMV", color: "#8c66ee", marca: "bloque" as const },
    ]
    // Combo estirado por su fila (casi cuadrado): la leyenda sigue arriba.
    const arriba = componerImagenGrafico(lienzo(400, 380), {
      estilo: ESTILO,
      leyenda,
      leyendaAlLado: false,
      conSello: false,
    })
    expect(arriba.width).toBe(400 + 48)
    expect(arriba.height).toBe(380 + 48 + 30)
    const alLado = componerImagenGrafico(lienzo(900, 300), {
      estilo: ESTILO,
      leyenda,
      leyendaAlLado: true,
      conSello: false,
    })
    expect(alLado.width).toBeGreaterThan(900 + 48 + 24)
    expect(alLado.height).toBe(300 + 48)
  })

  it("respeta la densidad del lienzo (devicePixelRatio)", () => {
    const resultado = componerImagenGrafico(lienzo(1200, 600, 600), {
      estilo: ESTILO,
      conSello: false,
    })
    expect(resultado.width).toBe(1200 + 96)
    expect(resultado.height).toBe(600 + 96)
  })
})
