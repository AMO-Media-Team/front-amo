import { describe, expect, it } from "vitest"

import { etiquetaAccion } from "@/features/mis-campanas/siguiente-accion"
import { rangoDesdePreset } from "@/lib/fechas"

import {
  accionesDelInicio,
  anioDelTope,
  claveAccion,
  enlazaSubirNivel,
  esNegocioEnCurso,
  ESTADOS_CONSULTA_EN_CURSO,
  etiquetaEstado,
  etiquetaNivel,
  formatoMonto,
  granularidadGananciasPorDefecto,
  pasoEstado,
  progresoTope,
  publicacionesPorAsignacion,
  RUTA_SUBIR_DE_NIVEL,
  serieGanancias,
  textoVentana,
  tituloGanado,
  ventanaGanancias,
} from "./datos"
import {
  AHORA_MEDIO,
  enMinutos,
  filasAcciones,
  NEGOCIOS_MEDIO,
} from "./fixtures"

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

describe("enlace para subir de nivel (DSH-006)", () => {
  const umbrales = { tope: 30_000_000, alerta: 0.8, bloqueo: 0.95 }

  it("solo cerca del tope o en el bloqueo", () => {
    const estado = (consumido: number, tope: number | null = umbrales.tope) =>
      enlazaSubirNivel(progresoTope({ ...umbrales, tope, consumido }))
    expect(estado(10_000_000)).toBe(false)
    // Un medio al 82 % de su tope.
    expect(estado(24_600_000)).toBe(true)
    expect(estado(29_000_000)).toBe(true)
    expect(estado(4_000_000, null)).toBe(false)
  })

  it("lleva a la guía del camino al siguiente nivel en «Mi medio»", () => {
    expect(RUTA_SUBIR_DE_NIVEL).toBe("/mi-medio/nivel#subir-de-nivel")
  })
})

describe("accionesDelInicio (DSH-006)", () => {
  const acciones = accionesDelInicio(filasAcciones(AHORA_MEDIO), {
    ahora: AHORA_MEDIO,
    plazoCargaHoras: 48,
    publicacionesPorAsignacion: publicacionesPorAsignacion(NEGOCIOS_MEDIO),
  })

  it("primero lo que ya se puede hacer, por plazo; al final lo que aún no se habilita", () => {
    expect(acciones.map((accion) => accion.codigo)).toEqual([
      "PUBLICAR",
      "CARGAR_METRICA_H24",
      "DESCARGAR_NUEVA_VERSION",
      "CORREGIR_EVIDENCIA",
      "CARGAR_METRICA_D7",
    ])
    // El corte de 7 días se habilita 48 h antes de vencer: dentro de 10 h.
    expect(acciones.at(-1)?.disponibleDesde).toBe(
      enMinutos(AHORA_MEDIO, 10 * 60)
    )
  })

  it("cada acción lleva directo a su pantalla, con su publicación y su corte", () => {
    expect(acciones.map((accion) => accion.ruta)).toEqual([
      "/mis-campanas/a1/evidencia",
      "/mis-campanas/a2/metricas?numero=1&corte=H24",
      "/mis-campanas/a3/contenido",
      "/mis-campanas/a4/evidencia?numero=2",
      "/mis-campanas/a5/metricas?numero=2&corte=D7",
    ])
  })

  it("con varias publicaciones en la oferta, la etiqueta dice a cuál va", () => {
    const metrica = acciones.find((accion) => accion.asignacionId === "a5")
    expect(metrica?.etiqueta).toBe(
      etiquetaAccion("CARGAR_METRICA", {
        numero: 2,
        corte: "D7",
        variasPublicaciones: true,
      })
    )
    expect(metrica?.etiqueta).toMatch(/publicación 2/)
  })

  it("una publicación que vence en 5 horas va primero si es lo más urgente", () => {
    const [primera] = accionesDelInicio(
      filasAcciones(AHORA_MEDIO).filter((fila) => fila.asignacionId !== "a1"),
      { ahora: AHORA_MEDIO }
    )
    expect(primera?.venceAt).toBe(enMinutos(AHORA_MEDIO, 5 * 60))
  })

  it("omite lo que esta versión no conoce y acepta filas sin número ni corte", () => {
    expect(acciones.some((accion) => accion.asignacionId === "a6")).toBe(false)
    const [descarga] = accionesDelInicio(
      [
        {
          asignacionId: "a9",
          ofertaTitulo: "Oferta",
          accion: "DESCARGAR",
          venceAt: null,
        },
      ],
      { ahora: AHORA_MEDIO }
    )
    expect(descarga).toMatchObject({
      tipo: "DESCARGAR",
      numero: null,
      corte: null,
      ruta: "/mis-campanas/a9/contenido",
    })
  })

  it("una clave distinta por acción, aunque compartan asignación", () => {
    const claves = accionesDelInicio(
      [
        {
          asignacionId: "a1",
          ofertaTitulo: "O",
          accion: "CARGAR_METRICA_H24",
          venceAt: null,
          numero: 1,
          corte: "H24",
        },
        {
          asignacionId: "a1",
          ofertaTitulo: "O",
          accion: "CARGAR_METRICA_H24",
          venceAt: null,
          numero: 2,
          corte: "H24",
        },
        {
          asignacionId: "a1",
          ofertaTitulo: "O",
          accion: "CORREGIR_METRICAS",
          venceAt: null,
          numero: 1,
          corte: "H24",
        },
      ],
      { ahora: AHORA_MEDIO }
    ).map(claveAccion)
    expect(new Set(claves).size).toBe(3)
  })

  it("cada personalizado rechazado es su propia acción y lleva a corregir el suyo", () => {
    const fila = (metricaId: string) => ({
      asignacionId: "a1",
      ofertaTitulo: "O",
      accion: "CORREGIR_METRICAS",
      venceAt: null,
      numero: 1,
      corte: "PERSONALIZADO" as const,
      metricaId,
    })
    const acciones = accionesDelInicio([fila("m1"), fila("m2")], {
      ahora: AHORA_MEDIO,
    })
    expect(new Set(acciones.map(claveAccion)).size).toBe(2)
    expect(acciones.map((accion) => accion.ruta)).toEqual([
      "/mis-campanas/a1/metricas?numero=1&corte=PERSONALIZADO&metrica=m1",
      "/mis-campanas/a1/metricas?numero=1&corte=PERSONALIZADO&metrica=m2",
    ])
    expect(acciones[0]?.etiqueta).toBe("Corrige el corte personalizado")
  })
})

describe("estados de los negocios en curso", () => {
  it("en la voz del medio y en su paso del recorrido", () => {
    expect(etiquetaEstado("CONTENIDO_ENTREGADO")).toBe("Por publicar")
    expect(etiquetaEstado("NO_EXISTE")).toBe("NO_EXISTE")
    expect(pasoEstado("ACEPTADA")).toBe(1)
    expect(pasoEstado("METRICAS_CARGADAS")).toBe(5)
    expect(pasoEstado("PAGADA")).toBe(0)
  })

  it("una disputa sigue en curso en el paso que tenía al abrirla (D72)", () => {
    expect(ESTADOS_CONSULTA_EN_CURSO).toContain("EN_DISPUTA")
    expect(esNegocioEnCurso("EN_DISPUTA", "EVIDENCIA_VALIDADA")).toBe(true)
    expect(pasoEstado("EN_DISPUTA", "EVIDENCIA_VALIDADA")).toBe(4)
    expect(etiquetaEstado("EN_DISPUTA")).toBe("En disputa")
    // El reclamo de una vencida no sigue en curso mientras se revisa; una
    // verificada en disputa ya cumplió su recorrido.
    expect(esNegocioEnCurso("EN_DISPUTA", "VENCIDA_SIN_PUBLICAR")).toBe(false)
    expect(esNegocioEnCurso("EN_DISPUTA", "VERIFICADA")).toBe(false)
    expect(esNegocioEnCurso("EN_DISPUTA")).toBe(false)
    expect(esNegocioEnCurso("PUBLICADA")).toBe(true)
    expect(esNegocioEnCurso("PAGADA")).toBe(false)
  })

  it("nivel con y sin nombre; año del tope según el fin del periodo", () => {
    expect(etiquetaNivel(2, "Persona natural con RUT")).toBe(
      "Nivel 2 · Persona natural con RUT"
    )
    expect(etiquetaNivel(1, null)).toBe("Nivel 1")
    expect(anioDelTope("2027-01-15")).toBe(2027)
  })

  it("publicaciones por asignación (solo las que se conocen)", () => {
    expect(publicacionesPorAsignacion(NEGOCIOS_MEDIO)).toEqual(
      new Map([
        ["a3", 1],
        ["a5", 2],
      ])
    )
    expect(
      publicacionesPorAsignacion([{ id: "x", publicaciones: undefined }]).size
    ).toBe(0)
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

describe("formatoMonto", () => {
  it("pesos exactos hasta cien millones; abreviado desde ahí", () => {
    expect(formatoMonto(0)).toBe("cop")
    expect(formatoMonto(99_999_999)).toBe("cop")
    expect(formatoMonto(100_000_000)).toBe("copCompacto")
    expect(formatoMonto(-250_000_000)).toBe("copCompacto")
  })
})
