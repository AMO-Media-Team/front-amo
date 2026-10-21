import { describe, expect, it } from "vitest"

import { rangoDesdePreset } from "@/lib/fechas"

import {
  anioDelTope,
  type AsignacionEnCurso,
  cuentaRegresiva,
  etiquetaAccion,
  etiquetaEstado,
  etiquetaNivel,
  formatoMonto,
  granularidadGananciasPorDefecto,
  negociosEnCurso,
  ofertasDistintas,
  pasoEstado,
  progresoTope,
  serieGanancias,
  textoVentana,
  tituloGanado,
  ventanaGanancias,
} from "./datos"

const AHORA = new Date("2026-10-01T15:00:00Z")
const plano = (texto: string) => texto.replace(/[  ]/g, " ")

describe("tituloGanado", () => {
  it("nombra el periodo como lo piensa el medio", () => {
    const titulo = (preset: Parameters<typeof rangoDesdePreset>[0]) =>
      tituloGanado(rangoDesdePreset(preset, AHORA))
    expect(titulo("esteMes")).toBe("Ganado este mes")
    expect(titulo("mesAnterior")).toBe("Ganado en septiembre")
    expect(titulo("ultimos30")).toBe("Ganado en los últimos 30 días")
    expect(titulo("esteAno")).toBe("Ganado este año")
  })
})

describe("progresoTope (§7.1.1)", () => {
  const umbrales = { tope: 10_000_000, alerta: 0.8, bloqueo: 0.95 }

  it("normal por debajo del 80 %, con el margen hasta el bloqueo", () => {
    expect(progresoTope({ ...umbrales, consumido: 5_000_000 })).toEqual({
      estado: "normal",
      fraccion: 0.5,
      porcentaje: 0.5,
      margenHastaBloqueo: 4_500_000,
    })
  })

  it("alerta desde el 80 % y bloqueo desde el 95 % (umbrales incluidos)", () => {
    expect(progresoTope({ ...umbrales, consumido: 8_000_000 }).estado).toBe(
      "alerta"
    )
    const bloqueo = progresoTope({ ...umbrales, consumido: 9_500_000 })
    expect(bloqueo.estado).toBe("bloqueo")
    expect(bloqueo.margenHastaBloqueo).toBe(0)
  })

  it("acota la barra a [0, 1] pero conserva el porcentaje real", () => {
    const excedido = progresoTope({ ...umbrales, consumido: 12_000_000 })
    expect(excedido.fraccion).toBe(1)
    expect(excedido.porcentaje).toBeCloseTo(1.2)
  })

  it("un nivel sin tope (o con tope 0) no dibuja barra", () => {
    for (const tope of [null, 0]) {
      expect(progresoTope({ ...umbrales, tope, consumido: 1 })).toEqual({
        estado: "sin-tope",
        fraccion: 0,
        porcentaje: null,
        margenHastaBloqueo: null,
      })
    }
  })
})

describe("cuentaRegresiva", () => {
  const en = (minutos: number) =>
    new Date(AHORA.getTime() + minutos * 60_000).toISOString()

  it.each([
    [-180, "vencida", "Venció hace 3 h"],
    [0, "vencida", "Venció hace 1 min"],
    [135, "critica", "Vence en 2 h 15 min"],
    [6 * 60, "pronto", "Vence en 6 h"],
    [23 * 60 + 59, "pronto", "Vence en 23 h 59 min"],
    [24 * 60, "holgada", "Vence en 1 día"],
    [26 * 60, "holgada", "Vence en 1 día 2 h"],
    [4 * 24 * 60 + 30, "holgada", "Vence en 4 días"],
  ] as const)("%i min → %s (%s)", (minutos, urgencia, texto) => {
    const cuenta = cuentaRegresiva(en(minutos), AHORA)
    expect(cuenta.urgencia).toBe(urgencia)
    expect(cuenta.texto).toBe(texto)
    expect(cuenta.minutosRestantes).toBe(minutos)
  })

  it("sin fecha límite (o ilegible) no inventa urgencia", () => {
    for (const vence of [null, "no-es-fecha"]) {
      expect(cuentaRegresiva(vence, AHORA)).toEqual({
        urgencia: "holgada",
        texto: "Sin fecha límite",
        minutosRestantes: null,
      })
    }
  })
})

describe("etiquetas de acciones y estados", () => {
  it("traduce las acciones de la RPC y humaniza las desconocidas", () => {
    expect(etiquetaAccion("CARGAR_METRICA_H72")).toBe("Cargar métricas de 72 h")
    expect(etiquetaAccion("REVISAR_BRIEF")).toBe("Revisar brief")
  })

  it("ubica cada estado en curso en su paso del recorrido", () => {
    expect(etiquetaEstado("CONTENIDO_ENTREGADO")).toBe("Por publicar")
    expect(etiquetaEstado("PAGADA")).toBe("PAGADA")
    expect(pasoEstado("ACEPTADA")).toBe(1)
    expect(pasoEstado("METRICAS_CARGADAS")).toBe(5)
    expect(pasoEstado("PAGADA")).toBe(0)
  })

  it("nivel con y sin nombre; año del tope según el fin del periodo", () => {
    expect(etiquetaNivel(2, "Persona natural con RUT")).toBe(
      "Nivel 2 · Persona natural con RUT"
    )
    expect(etiquetaNivel(1, null)).toBe("Nivel 1")
    expect(anioDelTope("2027-01-15")).toBe(2027)
  })
})

describe("ganancias", () => {
  it("semanas hasta un trimestre; meses en adelante", () => {
    expect(granularidadGananciasPorDefecto(92)).toBe("semana")
    expect(granularidadGananciasPorDefecto(93)).toBe("mes")
  })

  it("amplía la ventana a 12 semanas (desde un lunes) o 12 meses (desde el día 1)", () => {
    // 2026-10-01 es jueves: su lunes es el 28-sep; 11 semanas antes, el 13-jul.
    expect(ventanaGanancias("2026-10-01", "2026-10-01", "semana")).toEqual({
      desde: "2026-07-13",
      hasta: "2026-10-01",
    })
    expect(ventanaGanancias("2026-10-01", "2026-10-01", "mes")).toEqual({
      desde: "2025-11-01",
      hasta: "2026-10-01",
    })
  })

  it("no recorta un periodo que ya es más largo que la ventana mínima", () => {
    expect(ventanaGanancias("2025-01-01", "2026-10-01", "mes")).toEqual({
      desde: "2025-01-01",
      hasta: "2026-10-01",
    })
  })

  it("arma la serie con totales y describe la ventana", () => {
    const serie = serieGanancias(
      [
        { periodo: "2026-07-13", ganado: 300_000, pagado: 0, asignaciones: 2 },
        { periodo: "2026-07-20", ganado: 0, pagado: 250_000, asignaciones: 0 },
      ],
      "semana"
    )
    expect(serie).toMatchObject({
      desde: "2026-07-13",
      hasta: "2026-07-20",
      etiquetas: ["Sem. 13 jul", "Sem. 20 jul"],
      totalGanado: 300_000,
      totalPagado: 250_000,
      asignaciones: 2,
    })
    expect(plano(textoVentana(serie))).toBe("2 semanas desde el 13 jul")
    const mensual = serieGanancias(
      [{ periodo: "2025-11-01", ganado: 1, pagado: 0, asignaciones: 1 }],
      "mes"
    )
    expect(plano(textoVentana(mensual))).toBe("1 mes desde nov 2025")
    expect(textoVentana(serieGanancias([], "mes"))).toBe("")
  })
})

describe("negocios en curso", () => {
  const asignacion = (id: string, ofertaId: string): AsignacionEnCurso => ({
    id,
    ofertaId,
    estado: "ACEPTADA",
    plataforma: "INSTAGRAM",
    montoMedio: 100_000,
  })
  const asignaciones = [
    asignacion("a1", "o1"),
    asignacion("a2", "o2"),
    asignacion("a3", "o1"),
  ]

  it("consulta cada oferta una sola vez, en el orden de las asignaciones", () => {
    expect(ofertasDistintas(asignaciones)).toEqual(["o1", "o2"])
    expect(ofertasDistintas([])).toEqual([])
  })

  it("nombra cada negocio con su oferta y deja sin nombre al que no la trae", () => {
    const negocios = negociosEnCurso(asignaciones, [
      { id: "o1", titulo: "  Feria del Libro  ", marca: "  " },
    ])
    expect(negocios.map((n) => [n.id, n.titulo, n.marca])).toEqual([
      ["a1", "Feria del Libro", null],
      ["a2", null, null],
      ["a3", "Feria del Libro", null],
    ])
    expect(negocios[0]).toMatchObject({
      estado: "ACEPTADA",
      montoMedio: 100_000,
    })
  })
})

describe("formatoMonto", () => {
  it("pesos exactos hasta cien millones; abreviado desde ahí", () => {
    expect(formatoMonto(0)).toBe("cop")
    expect(formatoMonto(99_999_999)).toBe("cop")
    expect(formatoMonto(100_000_000)).toBe("copCompacto")
    expect(formatoMonto(-250_000_000)).toBe("copCompacto")
  })
})
