import { describe, expect, it } from "vitest"

import {
  avisosEstimacion,
  cantidadDe,
  cifraEstimada,
  cifraMedios,
  cuposDeConteo,
  cuposPedidos,
  inversionFranja,
  parametrosEstimacion,
  porcentajeRecargo,
  resumenElegibles,
  SIN_ESTIMACION,
  seguidoresEfectivos,
  seguidoresParaEstimar,
  textoElegibles,
  totalesEstimacion,
} from "./estimador"
import type { ValoresOferta } from "./schemas"
import type { EstimacionFranja } from "./tipos"

const F1 = "01a16525-06d6-7561-a2b0-c9c0c170233b"
const F2 = "01a16525-06d6-7a62-8210-53a84c657170"
const F3 = "01a16525-06d6-773d-92f1-ab54a3a50a05"
const FRANJAS = [
  { id: F1, nombre: "30.000 – 60.000" },
  { id: F2, nombre: "60.001 – 120.000" },
  { id: F3, nombre: "Más de 120.000" },
]

const FILAS: EstimacionFranja[] = [
  {
    franjaId: F1,
    mediosElegibles: 79,
    precioMediano: 350_000,
    inversionEstimada: 350_000,
    alcanceMediano: 6_359,
  },
  // Menos medios de los configurados: la BD no dice cuántos ni da cifras.
  {
    franjaId: F2,
    mediosElegibles: null,
    precioMediano: null,
    inversionEstimada: null,
    alcanceMediano: null,
  },
  {
    franjaId: F3,
    mediosElegibles: 60,
    precioMediano: 1_200_000,
    inversionEstimada: 1_200_000,
    alcanceMediano: null,
  },
]

describe("seguidoresEfectivos", () => {
  it("nunca baja del umbral de AMO (20.000 pedidos con umbral de 30.000 → 30.000)", () => {
    expect(seguidoresEfectivos(20_000, 30_000)).toBe(30_000)
    expect(seguidoresEfectivos(null, 30_000)).toBe(30_000)
    expect(seguidoresEfectivos(50_000, 30_000)).toBe(50_000)
  })

  it("para estimar se aproxima hacia abajo a múltiplos de 5.000, como la BD", () => {
    expect(seguidoresParaEstimar(41_234, 30_000)).toBe(40_000)
    expect(seguidoresParaEstimar(47_300, 30_000)).toBe(45_000)
    expect(seguidoresParaEstimar(50_000, 30_000)).toBe(50_000)
    expect(seguidoresParaEstimar(20_000, 30_000)).toBe(30_000)
    expect(seguidoresParaEstimar(null, 30_000)).toBe(30_000)
  })
})

describe("cupos", () => {
  it("lee las cifras escritas y deja solo las franjas con cupos", () => {
    expect(cantidadDe("12")).toBe(12)
    expect(cantidadDe("1.000")).toBe(1000)
    expect(cantidadDe("")).toBe(0)
    expect(cantidadDe("dos")).toBe(0)
    expect(cantidadDe("2,5")).toBe(0)
    expect(
      cuposPedidos([
        { franjaId: F1, cantidad: "5" },
        { franjaId: F2, cantidad: "" },
        { franjaId: F3, cantidad: 0 },
      ])
    ).toEqual({ [F1]: 5 })
  })

  it("estima con un cupo por franja (el precio no depende de cuántos)", () => {
    expect(cuposDeConteo(FRANJAS)).toEqual({ [F1]: 1, [F2]: 1, [F3]: 1 })
  })
})

describe("inversión y totales", () => {
  it("multiplica el precio mediano por los cupos; sin precio no hay cifra", () => {
    expect(inversionFranja(FILAS[0], 5)).toBe(1_750_000)
    expect(inversionFranja(FILAS[1], 5)).toBeNull()
    expect(inversionFranja(undefined, 5)).toBeNull()
  })

  it("suma los medios de las franjas con cifra y cuenta las que tienen pocos", () => {
    expect(resumenElegibles(FILAS)).toEqual({ conocidos: 139, pocos: 1 })
  })

  it("con pocos medios en una franja no da la cifra exacta", () => {
    expect(textoElegibles({ conocidos: 42, pocos: 0 }, 5)).toBe(
      "42 medios elegibles"
    )
    expect(textoElegibles({ conocidos: 1, pocos: 0 }, 5)).toBe(
      "1 medio elegible"
    )
    expect(textoElegibles({ conocidos: 40, pocos: 2 }, 5)).toBe(
      "Al menos 40 medios elegibles"
    )
    expect(textoElegibles({ conocidos: 0, pocos: 3 }, 5)).toBe(
      "Menos de 5 medios elegibles por franja"
    )
    expect(cifraMedios(null, 5)).toBe("Menos de 5")
    expect(cifraMedios(1_079, 5)).toBe("1.079")
  })

  it("marca el total como parcial si una franja pedida no tiene cifra", () => {
    expect(totalesEstimacion(FILAS, { [F1]: 5, [F3]: 1 })).toEqual({
      cupos: 6,
      inversion: 2_950_000,
      parcial: false,
    })
    expect(totalesEstimacion(FILAS, { [F1]: 2, [F2]: 3 })).toEqual({
      cupos: 5,
      inversion: 700_000,
      parcial: true,
    })
    expect(totalesEstimacion(FILAS, { [F2]: 3 })).toEqual({
      cupos: 3,
      inversion: null,
      parcial: true,
    })
  })
})

describe("avisosEstimacion", () => {
  const base = {
    filas: FILAS,
    franjas: FRANJAS,
    presupuesto: 10_000_000,
    topeMonto: null,
    minimoCupos: 1,
    minimoEstimador: 5,
  }

  it("avisa si la inversión estimada supera el presupuesto máximo", () => {
    const avisos = avisosEstimacion({
      ...base,
      cupos: { [F1]: 5 },
      presupuesto: 1_000_000,
    })
    expect(avisos.map((a) => a.tipo)).toEqual(["presupuesto"])
    expect(avisos[0].mensaje).toMatch(/supera tu presupuesto máximo/)
  })

  it("avisa si el precio mediano de una franja con cupos supera el tope por medio", () => {
    // Campaña de $2.000.000 con tope del 15 %: ningún medio pasa de $300.000.
    const avisos = avisosEstimacion({
      ...base,
      cupos: { [F1]: 5 },
      topeMonto: 300_000,
    })
    expect(avisos.map((a) => a.tipo)).toEqual(["tope"])
    expect(avisos[0].mensaje).toMatch(
      /^En la franja 30\.000 – 60\.000 el precio mediano \(.*350\.000\) supera el tope por medio \(.*300\.000\): la mayoría de esos medios no podría aceptar\./
    )
    // Con el tope por encima, en franjas sin cupos o sin cifra, nada.
    expect(
      avisosEstimacion({ ...base, cupos: { [F1]: 5 }, topeMonto: 350_000 })
    ).toEqual([])
    expect(
      avisosEstimacion({ ...base, cupos: { [F3]: 1 }, topeMonto: 300_000 }).map(
        (a) => a.tipo
      )
    ).toEqual(["tope"])
    expect(avisosEstimacion({ ...base, cupos: {}, topeMonto: 1 })).toEqual([])
  })

  it("avisa si se piden más cupos que medios elegibles", () => {
    const avisos = avisosEstimacion({
      ...base,
      filas: [{ ...FILAS[0], mediosElegibles: 6 }],
      cupos: { [F1]: 8 },
    })
    expect(avisos).toEqual([
      {
        tipo: "medios",
        mensaje:
          "Pides 8 cupos en la franja 30.000 – 60.000 y hoy la cumplen 6 medios.",
      },
    ])
  })

  it("con pocos medios en la franja (sin cifra) avisa sin decir cuántos", () => {
    expect(avisosEstimacion({ ...base, cupos: { [F2]: 6 } })).toEqual([
      {
        tipo: "medios",
        mensaje:
          "Pides 6 cupos en la franja 60.001 – 120.000 y hoy la cumplen menos de 5 medios: algunos cupos quedarían libres.",
      },
    ])
    expect(avisosEstimacion({ ...base, cupos: { [F2]: 3 } })[0].mensaje).toBe(
      "En la franja 60.001 – 120.000 hoy la cumplen menos de 5 medios: puede que no se llenen tus 3 cupos."
    )
    expect(avisosEstimacion({ ...base, cupos: { [F2]: 1 } })).toEqual([
      {
        tipo: "medios",
        mensaje:
          "En la franja 60.001 – 120.000 hoy la cumplen menos de 5 medios: puede que tu cupo quede libre.",
      },
    ])
  })

  it("avisa de franjas sin medios y del mínimo de cupos", () => {
    const avisos = avisosEstimacion({
      ...base,
      filas: [{ ...FILAS[0], mediosElegibles: 0 }],
      cupos: { [F1]: 1 },
      presupuesto: null,
      minimoCupos: 3,
    })
    expect(avisos.map((a) => a.tipo)).toEqual(["medios", "minimo"])
    expect(avisos[0].mensaje).toMatch(/^Ningún medio cumple/)
  })

  it("sin cupos pedidos no avisa nada", () => {
    expect(
      avisosEstimacion({
        ...base,
        cupos: {},
        presupuesto: 1,
        minimoCupos: 3,
      })
    ).toEqual([])
  })
})

describe("textos del estimador", () => {
  it("muestra el recargo de exclusividad como porcentaje", () => {
    expect(porcentajeRecargo(1.25)).toBe("25 %")
    expect(porcentajeRecargo(1.125)).toBe("12,5 %")
  })

  it("dice «Sin estimación» en lugar de una cifra", () => {
    expect(cifraEstimada(null, "cop")).toBe(SIN_ESTIMACION)
    expect(cifraEstimada(6_359, "numero")).toBe("6.359")
    expect(cifraEstimada(350_000, "cop")).toMatch(/350\.000/)
  })
})

describe("parametrosEstimacion", () => {
  const valores: Pick<ValoresOferta, "que" | "quien" | "cuando"> = {
    que: { formatoIds: ["f"], titulo: "x", publicacionesPorMedio: "2" },
    quien: {
      segmentacion: { departamentos: ["05"], municipios: ["76001"] },
      categorias: ["c1"],
      seguidoresMinimos: "20.000",
      mediosExcluidos: [{ id: "m1", nombre: "Radio", municipio: null }],
    },
    cuando: {
      ventanaInicio: "",
      ventanaFin: "",
      fechaLimite: "",
      permanenciaDias: "7",
      cortes: ["H24"],
      exclusividad: true,
      exclusividadDias: "15",
    },
  }

  it("arma los parámetros con lo escrito en los pasos 1 a 3", () => {
    expect(parametrosEstimacion(valores, "formato", FRANJAS)).toEqual({
      formatoId: "formato",
      departamentos: ["05"],
      municipios: ["76001"],
      categorias: ["c1"],
      seguidoresMinimos: 20_000,
      cupos: { [F1]: 1, [F2]: 1, [F3]: 1 },
      exclusividadDias: 15,
      mediosExcluidos: ["m1"],
      publicaciones: 2,
    })
  })

  it("lo que aún no es válido no filtra ni recarga", () => {
    const parametros = parametrosEstimacion(
      {
        ...valores,
        que: { ...valores.que, publicacionesPorMedio: "40" },
        quien: { ...valores.quien, seguidoresMinimos: "muchos" },
        cuando: { ...valores.cuando, exclusividadDias: "0" },
      },
      "formato",
      FRANJAS
    )
    expect(parametros.publicaciones).toBe(1)
    expect(parametros.seguidoresMinimos).toBeNull()
    expect(parametros.exclusividadDias).toBeNull()
    expect(
      parametrosEstimacion(
        { ...valores, cuando: { ...valores.cuando, exclusividad: false } },
        "formato",
        FRANJAS
      ).exclusividadDias
    ).toBeNull()
  })
})
