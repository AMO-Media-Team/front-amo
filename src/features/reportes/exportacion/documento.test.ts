import { describe, expect, it } from "vitest"

import type { ImagenPng } from "@/lib/export/logo"
import type { DocumentoPdf, SeccionPdf } from "@/lib/export/pdf"

import { REPORTES, SLUGS_REPORTE, type SlugReporte } from "../catalogo"
import { contenidoReporte } from "../definiciones"
import { AHORA_EJEMPLO, datosEjemplo, datosVacios } from "../fixtures"
import type { ContenidoReporte, DatosReporte } from "../tipos"
import {
  anchoRelativoImagen,
  construirDocumentoPdf,
  construirLibro,
  type EncabezadoDocumento,
  ESCALA_GRAFICO,
  type ImagenGrafico,
  MAXIMO_FILAS_PDF,
} from "./documento"
import { DENSIDAD_CAPTURA, filasGraficosPdf } from "./tamanos"

function preparar(slug: SlugReporte, vacio = false) {
  const datos = vacio ? datosVacios(slug) : datosEjemplo(slug)
  const contenido = contenidoReporte({ reporte: slug, datos } as DatosReporte)
  const encabezado: EncabezadoDocumento = {
    reporte: REPORTES[slug],
    contexto: datos.contexto,
    generadoPor: "Laura Restrepo",
    fecha: AHORA_EJEMPLO,
  }
  return { contenido, encabezado }
}

const imagen = (ancho = 2016, alto = 900): ImagenPng => ({
  dataUrl: "data:image/png;base64,AAAA",
  ancho,
  alto,
})

/** Una imagen por fila del PDF, como las entrega la captura. */
function imagenesDe(
  contenido: ContenidoReporte,
  slug: SlugReporte
): ImagenGrafico[] {
  return filasGraficosPdf(
    contenido.vista.graficos,
    REPORTES[slug].orientacionPdf
  ).map((fila) => ({ ids: fila.map((g) => g.id), imagen: imagen() }))
}

const de = <T extends SeccionPdf["tipo"]>(doc: DocumentoPdf, tipo: T) =>
  doc.secciones.filter(
    (seccion): seccion is Extract<SeccionPdf, { tipo: T }> =>
      seccion.tipo === tipo
  )

describe("construirLibro", () => {
  it.each(SLUGS_REPORTE)(
    "%s: portada, indicadores, detalle, hojas y definiciones",
    (slug) => {
      const { contenido, encabezado } = preparar(slug)
      const libro = construirLibro(contenido, encabezado)

      expect(libro.titulo).toBe(REPORTES[slug].titulo)
      expect(libro.subtitulo).toBe(REPORTES[slug].proposito)
      expect(libro.filtros).toBe(encabezado.contexto.filtros)
      expect(libro.generadoPor).toBe("Laura Restrepo")
      expect(libro.fecha).toBe(AHORA_EJEMPLO)

      const nombres = libro.hojas.map((hoja) => hoja.nombre)
      expect(nombres[0]).toBe("Indicadores")
      expect(nombres[1]).toBe("Detalle")
      expect(nombres.at(-1)).toBe("Cómo leer")
      expect(new Set(nombres).size).toBe(nombres.length)
      for (const hoja of libro.hojas) {
        for (const fila of hoja.filas)
          expect(fila).toHaveLength(hoja.columnas.length)
      }
    }
  )

  it("la hoja de indicadores trae valor, anterior, variación y definición", () => {
    const { contenido, encabezado } = preparar("finanzas")
    const [indicadores] = construirLibro(contenido, encabezado).hojas
    expect(indicadores.descripcion).toMatch(
      /^Variación frente al periodo anterior/
    )
    expect(indicadores.filas).toHaveLength(8)
    const [titulo, valor, anterior, variacion, , queMide] = indicadores.filas[0]
    expect(titulo).toBe("GMV verificado")
    expect(String(valor)).toMatch(/^\$/)
    expect(String(anterior)).toMatch(/^\$/)
    expect(String(variacion)).toMatch(/%$/)
    expect(String(queMide).length).toBeGreaterThan(20)
  })

  it("la muestra (n) solo acompaña a las tasas, no a los montos ni a los conteos", () => {
    const { contenido, encabezado } = preparar("resumen-ejecutivo")
    const [indicadores] = construirLibro(contenido, encabezado).hojas
    const n = (titulo: string) =>
      indicadores.filas.find((fila) => fila[0] === titulo)?.[4]
    expect(n("GMV verificado")).toBeNull()
    expect(n("Negocios cerrados")).toBeNull()
    expect(n("Tasa de cumplimiento")).toEqual(expect.any(Number))
    expect(n("Take rate")).toEqual(expect.any(Number))
  })

  it("un indicador que es una foto lo dice en lugar de una variación", () => {
    const { contenido, encabezado } = preparar("usuarios-accesos")
    const [indicadores] = construirLibro(contenido, encabezado).hojas
    const sinMfa = indicadores.filas.find(
      (fila) => fila[0] === "Sin verificación en dos pasos"
    )
    expect(sinMfa?.[2]).toBe("—")
    expect(sinMfa?.[3]).toBe("Foto de hoy, sin comparativo")
    const sinIngreso = indicadores.filas.find(
      (fila) => fila[0] === "Cuentas activas sin ingresos"
    )
    expect(sinIngreso?.[2]).toBe("—")
    expect(sinIngreso?.[3]).toBe("Sobre las cuentas de hoy, sin comparativo")
  })

  it("el detalle del Excel va completo aunque el PDF lo recorte", () => {
    const { contenido, encabezado } = preparar("cartera")
    const filas = Array.from(
      { length: MAXIMO_FILAS_PDF + 50 },
      () => contenido.tabla.filas[0]
    )
    const libro = construirLibro(
      { ...contenido, tabla: { ...contenido.tabla, filas } },
      encabezado
    )
    expect(libro.hojas[1].filas).toHaveLength(MAXIMO_FILAS_PDF + 50)
  })
})

describe("construirDocumentoPdf", () => {
  it.each(SLUGS_REPORTE)(
    "%s: indicadores, gráficos, detalle y definiciones, en ese orden",
    (slug) => {
      const { contenido, encabezado } = preparar(slug)
      const imagenes = imagenesDe(contenido, slug)
      const doc = construirDocumentoPdf(contenido, encabezado, imagenes)

      expect(doc.titulo).toBe(REPORTES[slug].titulo)
      expect(doc.orientacion).toBe(REPORTES[slug].orientacionPdf)
      expect(doc.filtros).toBe(encabezado.contexto.filtros)
      expect(doc.fecha).toBe(AHORA_EJEMPLO)

      expect(doc.secciones[0].tipo).toBe("indicadores")
      expect(de(doc, "imagen")).toHaveLength(imagenes.length)
      const tablas = de(doc, "tabla")
      expect(tablas.map((t) => t.titulo)).toEqual([
        contenido.tabla.titulo,
        "Cómo leer este reporte",
      ])
      expect(doc.secciones.at(-1)).toBe(tablas[1])
      // Los gráficos van antes del detalle.
      const posicion = (seccion: SeccionPdf) => doc.secciones.indexOf(seccion)
      for (const img of de(doc, "imagen")) {
        expect(posicion(img)).toBeLessThan(posicion(tablas[0]))
      }
    }
  )

  it("el título de los indicadores nombra el comparativo sin paréntesis anidados", () => {
    const { contenido, encabezado } = preparar("resumen-ejecutivo")
    const [indicadores] = de(
      construirDocumentoPdf(contenido, encabezado, []),
      "indicadores"
    )
    expect(indicadores.titulo).toMatch(
      /^Indicadores · frente al mes anterior \(/
    )
    expect(indicadores.titulo).not.toMatch(/\(\w[^)]*\(/)
  })

  it("la cifra de cada tarjeta es corta: lo que la explica va en el detalle", () => {
    for (const slug of SLUGS_REPORTE) {
      const { contenido, encabezado } = preparar(slug, true)
      const [indicadores] = de(
        construirDocumentoPdf(contenido, encabezado, []),
        "indicadores"
      )
      for (const elemento of indicadores.elementos) {
        expect(elemento.valor.length).toBeLessThanOrEqual(16)
        expect(elemento.valor).not.toContain("Muestra")
      }
    }
    const { contenido, encabezado } = preparar("desempeno-campanas", true)
    const [indicadores] = de(
      construirDocumentoPdf(contenido, encabezado, []),
      "indicadores"
    )
    const cpm = indicadores.elementos.find((e) => e.etiqueta === "CPM efectivo")
    expect(cpm).toMatchObject({
      valor: "—",
      detalle: "Muestra insuficiente (n = 0)",
    })
  })

  it.each(SLUGS_REPORTE)(
    "%s sin movimientos: un solo aviso, sin gráficos vacíos",
    (slug) => {
      const { contenido, encabezado } = preparar(slug, true)
      const doc = construirDocumentoPdf(contenido, encabezado, [])
      expect(de(doc, "imagen")).toHaveLength(0)
      const titulos = de(doc, "texto").map((seccion) => seccion.titulo)
      const esperado =
        slug === "cartera"
          ? "No hay saldos por cobrar en esta fecha de corte"
          : "Este periodo todavía no tiene movimientos"
      expect(titulos).toContain(esperado)
      // Ningún gráfico deja su propio "sin datos".
      for (const grafico of contenido.vista.graficos) {
        expect(titulos).not.toContain(grafico.titulo)
      }
    }
  )

  it("en horizontal dos gráficos de media fila comparten imagen y unen sus pies", () => {
    const { contenido, encabezado } = preparar("desempeno-campanas")
    const imagenes = imagenesDe(contenido, "desempeno-campanas")
    expect(imagenes.map((fila) => fila.ids)).toEqual([
      ["campanas-gmv", "cupos"],
      ["plataforma-gmv", "plataforma-cpm"],
    ])
    const secciones = de(
      construirDocumentoPdf(contenido, encabezado, imagenes),
      "imagen"
    )
    expect(secciones).toHaveLength(2)
    expect(secciones[0].pie).toBeUndefined()
    expect(secciones[1].pie).toContain("TikTok (n = 14)")
  })

  it("un gráfico sin datos deja una línea que lo explica; uno que falló se omite", () => {
    const { contenido, encabezado } = preparar("cumplimiento-medios")
    const graficos = contenido.vista.graficos.map((g) =>
      g.id === "alertas"
        ? { ...g, vacio: { titulo: "Sin alertas de métricas en el periodo" } }
        : g
    )
    const parcial = { ...contenido, vista: { ...contenido.vista, graficos } }
    // De los tres con datos solo se pudo dibujar el primero.
    const doc = construirDocumentoPdf(parcial, encabezado, [
      { ids: ["resultado"], imagen: imagen() },
    ])
    expect(de(doc, "imagen")).toHaveLength(1)
    const textos = de(doc, "texto")
    expect(textos.map((t) => t.titulo)).toEqual([
      "Medios con más alertas de métricas",
    ])
    expect(textos[0].parrafos).toEqual([
      "Sin alertas de métricas en el periodo",
    ])
  })

  it("avisa cuando el detalle se recorta y remite al Excel", () => {
    const { contenido, encabezado } = preparar("cartera")
    const filasPdf = Array.from(
      { length: MAXIMO_FILAS_PDF + 7 },
      () => contenido.tabla.filasPdf[0]
    )
    const doc = construirDocumentoPdf(
      { ...contenido, tabla: { ...contenido.tabla, filasPdf } },
      encabezado,
      []
    )
    const [detalle] = de(doc, "tabla")
    expect(detalle.filas).toHaveLength(MAXIMO_FILAS_PDF)
    expect(detalle.nota).toContain(
      `${MAXIMO_FILAS_PDF} de ${MAXIMO_FILAS_PDF + 7} filas`
    )
    expect(detalle.nota).toContain("Excel")
  })

  it("una tabla vacía lo dice en su nota", () => {
    const { contenido, encabezado } = preparar("finanzas", true)
    const [detalle] = de(
      construirDocumentoPdf(contenido, encabezado, []),
      "tabla"
    )
    expect(detalle.filas).toHaveLength(0)
    expect(detalle.nota).toBe("Sin filas para los filtros elegidos.")
  })

  it("las definiciones van como tabla de término y significado", () => {
    const { contenido, encabezado } = preparar("cartera")
    const notas = de(
      construirDocumentoPdf(contenido, encabezado, []),
      "tabla"
    )[1]
    expect(notas.columnas.map((c) => c.titulo)).toEqual([
      "Término",
      "Qué significa",
    ])
    expect(notas.filas).toHaveLength(contenido.notas.length)
    expect(notas.filas[0][0]).toBe(contenido.notas[0].termino)
  })

  it("incluye hallazgos y avisos cuando los hay", () => {
    const { contenido, encabezado } = preparar("resumen-ejecutivo")
    const conTextos: ContenidoReporte = {
      ...contenido,
      vista: {
        ...contenido.vista,
        avisos: ["El corte por plataforma no admite el filtro de anunciante."],
        hallazgos: [
          {
            id: "h1",
            regla: 1,
            severidad: "atencion",
            titulo: "El GMV verificado bajó 18 %.",
            detalle: "Antioquia explica el 41 % del cambio.",
            magnitud: 0.18,
          },
        ],
      },
    }
    const textos = de(construirDocumentoPdf(conTextos, encabezado, []), "texto")
    expect(textos.map((t) => t.titulo)).toEqual(
      expect.arrayContaining(["Hallazgos del periodo", "Ten en cuenta"])
    )
    const hallazgos = textos.find((t) => t.titulo === "Hallazgos del periodo")
    expect(hallazgos?.parrafos[0]).toContain(
      "El GMV verificado bajó 18 %. Antioquia"
    )
  })
})

describe("anchoRelativoImagen", () => {
  const css = (ancho: number) => ancho * DENSIDAD_CAPTURA

  it("todos los gráficos se imprimen a la misma escala", () => {
    // 600 px CSS × 0,54 pt/px = 324 pt de los 762 del ancho útil horizontal.
    expect(anchoRelativoImagen(css(600), "horizontal")).toBeCloseTo(
      (600 * ESCALA_GRAFICO) / 762
    )
    expect(anchoRelativoImagen(css(600), "vertical")).toBeCloseTo(
      (600 * ESCALA_GRAFICO) / 515
    )
  })

  it("lo que no cabe a lo ancho se ajusta a la página", () => {
    expect(anchoRelativoImagen(css(1008), "vertical")).toBe(1)
    expect(anchoRelativoImagen(css(2000), "horizontal")).toBe(1)
  })

  it("el mapa nunca pasa de poco más de media página de ancho", () => {
    expect(anchoRelativoImagen(css(1008), "vertical", true)).toBe(0.55)
    expect(anchoRelativoImagen(css(300), "vertical", true)).toBeLessThan(0.55)
  })
})
