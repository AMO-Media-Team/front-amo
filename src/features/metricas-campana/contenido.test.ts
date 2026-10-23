import { describe, expect, it } from "vitest"

import {
  construirDocumentoPdf,
  construirLibro,
} from "@/features/reportes/exportacion/documento"

import {
  avisoParciales,
  columnasCorte,
  contenidoMetricas,
  encabezadoMetricas,
  ETIQUETA_CAMPANA,
  filasDeCorte,
  filtrosDocumento,
  graficoDeCorte,
  indicadoresEficiencia,
  indicadoresResultados,
  notasMetricas,
  vistaMetricas,
} from "./contenido"
import { DIMENSIONES } from "./dimensiones"
import { datosMetricas } from "./fixtures"

const SIN_PARCIALES = {
  conCortes: 0,
  alcance: 0,
  impresiones: 0,
  interacciones: 0,
  enEjecucion: 0,
}

describe("filasDeCorte", () => {
  it("el corte por fecha va en orden y nombrado por día", () => {
    const filas = filasDeCorte(datosMetricas(), "fecha")
    expect(filas.map((f) => f.nombre)).toEqual(["18 oct", "21 oct"])
  })

  it("con verificaciones de más de un mes se nombra por semana", () => {
    const filas = filasDeCorte(
      datosMetricas({ periodo: { desde: "2026-08-01", hasta: "2026-10-21" } }),
      "fecha"
    )
    expect(filas[0].nombre).toMatch(/^Sem\. /)
  })

  it("los demás cortes conservan el orden de la BD", () => {
    expect(
      filasDeCorte(datosMetricas(), "municipio").map((f) => f.nombre)
    ).toEqual(["Bogotá, D.C.", "Arauca, Arauca", "Chía, Cundinamarca"])
  })
})

describe("indicadores", () => {
  it("el consolidado trae las cinco métricas y la inversión, sin comparativo", () => {
    const indicadores = indicadoresResultados(datosMetricas())
    expect(indicadores.map((i) => [i.titulo, i.valor])).toEqual([
      ["Inversión verificada", 4_500_000],
      ["Alcance acumulado", 140_000],
      ["Impresiones", 200_000],
      ["Interacciones", 8_900],
      ["Reproducciones", 140_000],
      ["Clics en el enlace", 0],
    ])
    for (const indicador of indicadores) {
      expect(indicador.sinComparativo).toBe(ETIQUETA_CAMPANA)
      expect(indicador.definicion).not.toBeNull()
    }
  })

  it("las razones de una campaña se informan siempre, con su n si es pequeña", () => {
    const [cpm, , engagement] = indicadoresEficiencia(datosMetricas())
    expect(cpm).toMatchObject({
      titulo: "CPM efectivo",
      unidad: "COP",
      sentido: "menor",
      n: 3,
      nMinimo: 20,
    })
    expect(cpm.valor).toBeCloseTo(22_500, 6)
    expect(engagement).toMatchObject({ unidad: "%", sentido: "mayor" })
    expect(engagement.valor).not.toBeNull()
  })
})

describe("gráficos", () => {
  it("hay uno por corte y, sin verificadas, todos explican que falta", () => {
    const vacios = datosMetricas({
      periodo: null,
      cortes: { plataforma: [], medio: [], municipio: [], fecha: [] },
    })
    for (const dimension of DIMENSIONES) {
      const grafico = graficoDeCorte(vacios, dimension)
      expect(grafico.vacio).toMatchObject({
        titulo: "Aún no hay negocios verificados",
      })
    }
  })

  it("la fecha combina inversión y alcance por día, con los días vacíos en cero", () => {
    const grafico = graficoDeCorte(datosMetricas(), "fecha")
    if (grafico.tipo !== "combo") throw new Error("se esperaba un combo")
    expect(grafico.etiquetas).toEqual(["18 oct", "19 oct", "20 oct", "21 oct"])
    expect(grafico.barras.valores).toEqual([1_000_000, 0, 0, 1_000_000])
    expect(grafico.vacio).toBe(false)
  })

  it("medio y municipio son rankings de alcance; plataforma, una dona", () => {
    expect(graficoDeCorte(datosMetricas(), "medio")).toMatchObject({
      tipo: "ranking",
      titulo: "Medios con más alcance",
      limite: 10,
    })
    expect(graficoDeCorte(datosMetricas(), "municipio")).toMatchObject({
      tipo: "ranking",
      nombreCategoria: "Municipio",
    })
    expect(graficoDeCorte(datosMetricas(), "plataforma")).toMatchObject({
      tipo: "dona",
      etiquetaTotal: "Alcance acumulado",
    })
  })
})

describe("avisoParciales", () => {
  it("sin nada pendiente no hay aviso", () => {
    expect(avisoParciales(3, SIN_PARCIALES)).toBeNull()
  })

  it("dice cuántos están verificados y qué falta", () => {
    expect(
      avisoParciales(8, {
        ...SIN_PARCIALES,
        conCortes: 3,
        alcance: 12_345,
        enEjecucion: 5,
      })
    ).toBe(
      "Resultados parciales: el consolidado incluye solo 8 negocios verificados. Además, 3 negocios ya tienen cortes aprobados (12.345 personas alcanzadas hasta ahora) y 5 siguen en ejecución; se suman cuando el equipo AMO los verifique."
    )
  })

  it("concuerda en singular y sin verificadas", () => {
    expect(avisoParciales(0, { ...SIN_PARCIALES, enEjecucion: 1 })).toBe(
      "Resultados parciales: todavía no hay negocios verificados. 1 negocio sigue en ejecución; se suma cuando el equipo AMO lo verifique."
    )
    expect(
      avisoParciales(1, { ...SIN_PARCIALES, conCortes: 1, alcance: 900 })
    ).toBe(
      "Resultados parciales: el consolidado incluye solo 1 negocio verificado. Además, 1 negocio ya tiene cortes aprobados (900 personas alcanzadas hasta ahora); se suma cuando el equipo AMO lo verifique."
    )
  })
})

describe("contenidoMetricas", () => {
  it("la tabla es la del corte elegido y el Excel suma los otros tres", () => {
    const contenido = contenidoMetricas(datosMetricas(), "municipio")
    expect(contenido.tabla.titulo).toBe("Resultados por municipio")
    expect(contenido.tabla.filas).toHaveLength(3)
    expect(contenido.tabla.columnas[0].titulo).toBe("Municipio")
    expect(contenido.hojas.map((h) => h.nombre)).toEqual([
      "Por plataforma",
      "Por medio",
      "Por fecha",
    ])
    // El PDF deja fuera reproducciones y clics (están en los indicadores y en el Excel).
    expect(contenido.tabla.columnasPdf).toHaveLength(
      columnasCorte("municipio").length - 2
    )
    expect(contenido.notas).toEqual(notasMetricas(20))
  })

  it("la columna n es el tamaño de muestra de cada fila", () => {
    const contenido = contenidoMetricas(datosMetricas(), "municipio")
    const indice = contenido.tabla.columnas.findIndex(
      (c) => c.titulo === "Negocios (n)"
    )
    expect(contenido.tabla.filas.map((fila) => fila[indice])).toEqual([1, 1, 1])
  })

  it("los avisos de la vista incluyen los resultados parciales", () => {
    const vista = vistaMetricas(
      datosMetricas({ parciales: { ...SIN_PARCIALES, enEjecucion: 2 } })
    )
    expect(vista.avisos).toHaveLength(1)
    expect(vista.indicadores).toHaveLength(10)
    expect(vista.graficos).toHaveLength(4)
  })
})

describe("documentos de marca", () => {
  it("la portada lleva la campaña, la vigencia y el corte", () => {
    expect(filtrosDocumento(datosMetricas(), "medio")).toEqual([
      { etiqueta: "Campaña", valor: "Temporada navideña" },
      { etiqueta: "Marca", valor: "Café Sierra Alta" },
      { etiqueta: "Vigencia", valor: expect.stringContaining("oct") },
      { etiqueta: "Corte", valor: "Medio" },
      { etiqueta: "Negocios", valor: "Solo verificados (3)" },
    ])
  })

  it("el PDF trae filtros, indicadores, gráficos, detalle y notas", () => {
    const datos = datosMetricas()
    const contenido = contenidoMetricas(datos, "plataforma")
    const encabezado = encabezadoMetricas(
      datos,
      "plataforma",
      "Ana Anunciante",
      new Date("2026-10-22T15:00:00Z")
    )
    const imagen = {
      dataUrl: "data:image/png;base64,AAAA",
      ancho: 800,
      alto: 400,
    }
    const pdf = construirDocumentoPdf(contenido, encabezado, [
      { ids: ["corte-fecha"], imagen },
    ])
    expect(pdf.titulo).toBe("Métricas de campaña")
    expect(pdf.orientacion).toBe("horizontal")
    expect(pdf.filtros).toContainEqual({
      etiqueta: "Corte",
      valor: "Plataforma",
    })
    const tipos = pdf.secciones.map((s) => s.tipo)
    expect(tipos[0]).toBe("indicadores")
    expect(tipos).toContain("imagen")
    expect(tipos).toContain("tabla")
    const libro = construirLibro(contenido, encabezado)
    expect(libro.hojas.map((h) => h.nombre)).toEqual([
      "Indicadores",
      "Detalle",
      "Por medio",
      "Por municipio",
      "Por fecha",
      "Cómo leer",
    ])
  })
})
