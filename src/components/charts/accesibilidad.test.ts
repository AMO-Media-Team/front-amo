import { describe, expect, it } from "vitest"

import {
  datosApiladas,
  datosCombo,
  datosDona,
  datosEmbudo,
  datosMapaCalor,
  datosRanking,
  datosTendencia,
  enumerar,
} from "./accesibilidad"
import { completarMatriz } from "./datos"

/** Intl usa espacios duros (U+00A0, U+202F): se normalizan para comparar. */
const plano = (texto: string) => texto.replace(/[\u00a0\u202f]/g, " ")

const ETIQUETAS = ["jul", "ago", "sept"]

describe("enumerar", () => {
  it("une en español con «y»", () => {
    expect(enumerar([])).toBe("")
    expect(enumerar(["A"])).toBe("A")
    expect(enumerar(["A", "B"])).toBe("A y B")
    expect(enumerar(["A", "B", "C"])).toBe("A, B y C")
  })
})

describe("datosTendencia", () => {
  const datos = datosTendencia({
    titulo: "GMV verificado",
    etiquetas: ETIQUETAS,
    series: [{ id: "gmv", nombre: "GMV", valores: [100, 300, 200] }],
    anterior: {
      id: "ant",
      nombre: "Periodo anterior",
      valores: [90, 100, 110],
    },
    formato: "numero",
  })

  it("resume el último valor, el cambio y el máximo", () => {
    expect(plano(datos.resumen)).toBe(
      "GMV verificado. GMV: 200 en sept (↑ +100,0% desde jul); máximo 300 en ago."
    )
  })

  it("la tabla incluye cada serie y el periodo anterior", () => {
    expect(datos.tabla.columnas.map((c) => c.titulo)).toEqual([
      "Periodo",
      "GMV",
      "Periodo anterior",
    ])
    expect(datos.tabla.filas[1]).toEqual(["ago", "300", "100"])
  })

  it("sin etiquetas lo dice y una serie vacía se describe sin datos", () => {
    expect(
      datosTendencia({
        titulo: "GMV",
        etiquetas: [],
        series: [],
        formato: "cop",
      }).resumen
    ).toBe("GMV: sin datos en el periodo.")
    const vacia = datosTendencia({
      titulo: "GMV",
      etiquetas: ETIQUETAS,
      series: [{ id: "g", nombre: "GMV", valores: [null, null, null] }],
      formato: "cop",
    })
    expect(vacia.resumen).toBe("GMV. GMV: sin datos.")
    expect(vacia.tabla.filas[0]).toEqual(["jul", "—"])
  })
})

describe("datosCombo", () => {
  it("formatea cada serie con su propio formato", () => {
    const datos = datosCombo({
      titulo: "GMV y take rate",
      etiquetas: ["jul"],
      barras: {
        id: "gmv",
        nombre: "GMV",
        valores: [1_234_567],
        formato: "cop",
      },
      linea: {
        id: "tr",
        nombre: "Take rate",
        valores: [0.2],
        formato: "porcentaje",
      },
    })
    expect(datos.tabla.filas[0].map(plano)).toEqual([
      "jul",
      "$ 1.234.567",
      "20,0%",
    ])
    expect(plano(datos.resumen)).toContain("Take rate: 20,0% en jul")
  })
})

describe("datosRanking", () => {
  it("nombra a los tres primeros y calcula la participación", () => {
    const datos = datosRanking({
      titulo: "Top departamentos",
      elementos: [
        { id: "05", nombre: "Antioquia", valor: 50 },
        { id: "11", nombre: "Bogotá", valor: 30 },
        { id: "76", nombre: "Valle", valor: 15 },
        { id: "08", nombre: "Atlántico", valor: 5 },
      ],
      formato: "numero",
      nombreValor: "Asignaciones",
      nombreCategoria: "Departamento",
    })
    expect(datos.resumen).toBe(
      "Top departamentos. Encabeza Antioquia (50), Bogotá (30) y Valle (15)."
    )
    expect(datos.tabla.filas[0].map(plano)).toEqual([
      "Antioquia",
      "50",
      "50,0%",
    ])
  })
})

describe("datosApiladas", () => {
  it("suma el total por categoría y nombra el mayor", () => {
    const datos = datosApiladas({
      titulo: "Asignaciones por plataforma",
      categorias: ["jul", "ago"],
      series: [
        { id: "fb", nombre: "Facebook", valores: [3, 5] },
        { id: "ig", nombre: "Instagram", valores: [4, null] },
      ],
      formato: "numero",
    })
    expect(datos.resumen).toBe(
      "Asignaciones por plataforma. 2 series (Facebook y Instagram). Mayor total: jul con 7."
    )
    expect(datos.tabla.filas[1]).toEqual(["ago", "5", "—", "5"])
  })
})

describe("datosDona", () => {
  it("agrega una fila de total al 100 %", () => {
    const datos = datosDona({
      titulo: "Mezcla",
      segmentos: [
        { id: "fb", nombre: "Facebook", valor: 25 },
        { id: "ig", nombre: "Instagram", valor: 75 },
      ],
      formato: "numero",
    })
    expect(plano(datos.resumen)).toBe(
      "Mezcla. Total 100: Facebook 25,0% y Instagram 75,0%."
    )
    expect(datos.tabla.filas.at(-1)?.map(plano)).toEqual([
      "Total",
      "100",
      "100,0%",
    ])
  })

  it("sin total no divide por cero", () => {
    expect(
      datosDona({ titulo: "Mezcla", segmentos: [], formato: "numero" }).resumen
    ).toBe("Mezcla: sin datos en el periodo.")
  })
})

describe("datosEmbudo", () => {
  it("cuenta de dónde a dónde llega y la mayor caída", () => {
    const datos = datosEmbudo({
      titulo: "Embudo",
      etapas: [
        { id: "v", nombre: "Vistas", cantidad: 1000 },
        { id: "a", nombre: "Aceptadas", cantidad: 200 },
        { id: "p", nombre: "Pagadas", cantidad: 150 },
      ],
      unidad: { singular: "par", plural: "pares" },
    })
    expect(plano(datos.resumen)).toBe(
      "Embudo. De 1.000 pares en «Vistas» a 150 en «Pagadas» (15,0% del inicio). La mayor caída es de «Vistas» a «Aceptadas»: pasa el 20,0%."
    )
    expect(datos.tabla.filas[0].map(plano)).toEqual([
      "Vistas",
      "1.000",
      "—",
      "100,0%",
    ])
  })
})

describe("datosMapaCalor", () => {
  it("identifica el pico y lista las 24 franjas × 7 días", () => {
    const celdas = completarMatriz([
      { diaSemana: 2, hora: 10, cantidad: 12 },
      { diaSemana: 5, hora: 18, cantidad: 3 },
    ])
    const datos = datosMapaCalor({
      titulo: "Actividad",
      celdas,
      unidad: { singular: "acceso", plural: "accesos" },
    })
    expect(datos.resumen).toBe(
      "Actividad. 15 accesos en total. El pico es el martes de 10:00–11:00, con 12 accesos."
    )
    expect(datos.tabla.filas).toHaveLength(24)
    expect(datos.tabla.columnas).toHaveLength(8)
    expect(datos.tabla.filas[10][2]).toBe("12")
  })

  it("sin actividad lo dice", () => {
    expect(
      datosMapaCalor({
        titulo: "Actividad",
        celdas: completarMatriz([]),
        unidad: { singular: "acceso", plural: "accesos" },
      }).resumen
    ).toBe("Actividad: sin actividad en el periodo.")
  })
})
