import { describe, expect, it } from "vitest"

import {
  calidadDeCuenta,
  calidadDeCuentas,
  cambioProgramado,
  CLAVES_CALIDAD,
  diaEnFrase,
  explicacionCalidad,
  formatearFactor,
  multiplicadorVigente,
  PARAMETROS_CALIDAD_POR_DEFECTO as PARAMETROS,
  parametrosDesdeConfiguracion,
  pasosDelCalculo,
  presentarSituacion,
  resumenMultiplicador,
  situacionCalidad,
  textoBaseCalculo,
  textoCambio,
  textoPublicaciones,
} from "./calidad"
import type { CuentaCalidad } from "./tipos"

/** 10:00 del 23 de octubre de 2026 en Bogotá. */
const AHORA = new Date("2026-10-23T15:00:00Z")
/** 00:00 del 30 de octubre en Bogotá: desde cuándo rige un cambio anunciado hoy. */
const DESDE = "2026-10-30T05:00:00Z"

/** Los separadores de Intl (U+00A0, U+202F) como espacios, para comparar. */
const plano = (texto: string) => texto.replace(/[  ]/g, " ")

function cuenta(cambios: Partial<CuentaCalidad> = {}): CuentaCalidad {
  return {
    id: "c1",
    plataforma: "INSTAGRAM",
    handle: "noticias.pereira",
    seguidores: 48_000,
    franja: { clave: "F1", nombre: "30.000 – 60.000" },
    alcanceMediano: 2_016,
    indice: 0.042,
    indiceFranja: 0.0375,
    multiplicador: 1,
    proximo: null,
    proximoDesde: null,
    publicacionesVerificadas: 20,
    calculadoAt: "2026-10-19T11:00:00Z",
    ...cambios,
  }
}

describe("parametrosDesdeConfiguracion", () => {
  it("lee los valores jsonb (números, texto numérico y el corte)", () => {
    expect(
      parametrosDesdeConfiguracion([
        { clave: CLAVES_CALIDAD.minimoPublicaciones, valor: 3 },
        { clave: CLAVES_CALIDAD.ventanaPublicaciones, valor: "15" },
        { clave: CLAVES_CALIDAD.piso, valor: "0.80" },
        { clave: CLAVES_CALIDAD.techo, valor: 1.25 },
        { clave: CLAVES_CALIDAD.corteReferencia, valor: "H72" },
        { clave: CLAVES_CALIDAD.diasAvisoCambio, valor: 14 },
      ])
    ).toEqual({
      minimoPublicaciones: 3,
      ventanaPublicaciones: 15,
      piso: 0.8,
      techo: 1.25,
      corteReferencia: "H72",
      diasAvisoCambio: 14,
    })
  })

  it("sin filas (el medio no lee la configuración) rigen los sembrados", () => {
    expect(parametrosDesdeConfiguracion([])).toEqual(PARAMETROS)
  })

  it("lo ilegible o incoherente cae al valor sembrado", () => {
    expect(
      parametrosDesdeConfiguracion([
        { clave: CLAVES_CALIDAD.minimoPublicaciones, valor: 2.5 },
        { clave: CLAVES_CALIDAD.ventanaPublicaciones, valor: null },
        { clave: CLAVES_CALIDAD.corteReferencia, valor: "PERSONALIZADO" },
        { clave: CLAVES_CALIDAD.diasAvisoCambio, valor: "" },
      ])
    ).toEqual(PARAMETROS)
    // Un piso sobre 1 o por encima del techo: ambos vuelven a los sembrados.
    expect(
      parametrosDesdeConfiguracion([
        { clave: CLAVES_CALIDAD.piso, valor: 1.2 },
        { clave: CLAVES_CALIDAD.techo, valor: 1.1 },
      ])
    ).toMatchObject({ piso: 0.7, techo: 1.4 })
  })
})

describe("multiplicadorVigente (PRC-003)", () => {
  it("con menos de 5 publicaciones verificadas es 1,0 aunque haya otro guardado", () => {
    expect(
      multiplicadorVigente(
        { multiplicador: 1.3, publicacionesVerificadas: 3 },
        PARAMETROS
      )
    ).toBe(1)
  })

  it("con historial rige el guardado, dentro del piso y el techo", () => {
    const vigente = (multiplicador: number) =>
      multiplicadorVigente(
        { multiplicador, publicacionesVerificadas: 5 },
        PARAMETROS
      )
    expect(vigente(1.12)).toBe(1.12)
    expect(vigente(1.9)).toBe(1.4)
    expect(vigente(0.4)).toBe(0.7)
    expect(vigente(0.7844)).toBe(0.784)
  })
})

describe("cambioProgramado (PRC-004)", () => {
  it("anuncia el próximo con su fecha y dirección", () => {
    expect(cambioProgramado({ proximo: 1.12, proximoDesde: DESDE }, 1)).toEqual(
      { proximo: 1.12, desde: DESDE, direccion: "sube" }
    )
    expect(
      cambioProgramado({ proximo: 0.9, proximoDesde: DESDE }, 1)
    ).toMatchObject({ direccion: "baja" })
  })

  it("sin próximo, sin fecha o igual al vigente no hay cambio", () => {
    expect(cambioProgramado({ proximo: null, proximoDesde: null }, 1)).toBe(
      null
    )
    expect(cambioProgramado({ proximo: 1.2, proximoDesde: null }, 1)).toBe(null)
    expect(cambioProgramado({ proximo: 1, proximoDesde: DESDE }, 1)).toBe(null)
  })
})

describe("situacionCalidad", () => {
  it("sin el mínimo de publicaciones dice cuántas lleva", () => {
    expect(
      situacionCalidad(cuenta({ publicacionesVerificadas: 3 }), PARAMETROS)
    ).toEqual({ tipo: "sin-historial", llevas: 3, minimo: 5 })
  })

  it("sin índice propio o de la franja no compara", () => {
    for (const cambios of [
      { indice: null },
      { indiceFranja: null },
      { indiceFranja: 0 },
    ]) {
      expect(situacionCalidad(cuenta(cambios), PARAMETROS)).toEqual({
        tipo: "sin-referencia",
      })
    }
  })

  it("compara con la mediana de la franja y acota el resultado", () => {
    const encima = situacionCalidad(cuenta(), PARAMETROS)
    expect(encima).toMatchObject({
      tipo: "comparada",
      posicion: "encima",
      limite: null,
      resultado: 1.12,
    })
    // PRC-003: un índice que duplica la mediana queda en el techo de 1,4.
    expect(
      situacionCalidad(cuenta({ indice: 0.075 }), PARAMETROS)
    ).toMatchObject({ posicion: "encima", limite: "techo", resultado: 1.4 })
    expect(
      situacionCalidad(cuenta({ indice: 0.015 }), PARAMETROS)
    ).toMatchObject({ posicion: "debajo", limite: "piso", resultado: 0.7 })
    // Una diferencia que se lee «0 %» es la mediana.
    expect(
      situacionCalidad(cuenta({ indice: 0.03752 }), PARAMETROS)
    ).toMatchObject({ posicion: "mediana" })
  })
})

describe("textos", () => {
  it("factores con dos decimales (tres si los tiene)", () => {
    expect(formatearFactor(1)).toBe("1,00")
    expect(formatearFactor(1.12)).toBe("1,12")
    expect(formatearFactor(0.784)).toBe("0,784")
  })

  it("días en Bogotá; con el año solo si no es el actual", () => {
    expect(diaEnFrase(DESDE, AHORA)).toBe("30 de octubre")
    expect(diaEnFrase("2027-01-07T05:00:00Z", AHORA)).toBe("7 de enero de 2027")
    expect(diaEnFrase("no-es-fecha", AHORA)).toBe("no-es-fecha")
  })

  it("nombra las publicaciones según cuántas entraron al cálculo", () => {
    expect(textoPublicaciones(20, 20)).toBe("tus últimas 20 publicaciones")
    expect(textoPublicaciones(12, 20, "verificadas")).toBe(
      "tus 12 publicaciones verificadas"
    )
    expect(textoPublicaciones(1, 20)).toBe("tu publicación")
  })

  it("el aviso del cambio usa la voz de PRC-004", () => {
    const calidad = calidadDeCuenta(
      cuenta({ proximo: 1.12, proximoDesde: "2026-10-07T05:00:00Z" }),
      PARAMETROS
    )
    expect(textoCambio(calidad, PARAMETROS, AHORA)).toBe(
      "Desde el 7 de octubre pasará de 1,00 a 1,12 por el buen alcance de tus últimas 20 publicaciones."
    )
  })

  it("explica cada dirección del cambio sin culpar ni prometer", () => {
    const texto = (cambios: Partial<CuentaCalidad>) =>
      textoCambio(
        calidadDeCuenta(
          cuenta({ proximoDesde: DESDE, ...cambios }),
          PARAMETROS
        ),
        PARAMETROS,
        AHORA
      )
    expect(
      texto({ multiplicador: 0.8, proximo: 0.95, indice: 0.0356 })
    ).toMatch(/pasará de 0,80 a 0,95 porque mejoró el alcance de/)
    expect(texto({ multiplicador: 1, proximo: 0.85, indice: 0.032 })).toMatch(
      /quedó por debajo de la mediana de tu franja\.$/
    )
    expect(
      texto({ multiplicador: 1.3, proximo: 1.1, publicacionesVerificadas: 8 })
    ).toBe(
      "Desde el 30 de octubre pasará de 1,30 a 1,10 porque el alcance de tus 8 publicaciones se acercó a la mediana de tu franja."
    )
    expect(
      textoCambio(calidadDeCuenta(cuenta(), PARAMETROS), PARAMETROS, AHORA)
    ).toBe(null)
  })

  it("explica el multiplicador frente a la franja", () => {
    const explicar = (cambios: Partial<CuentaCalidad>) =>
      plano(
        explicacionCalidad(
          calidadDeCuenta(cuenta(cambios), PARAMETROS),
          PARAMETROS
        )
      )
    expect(explicar({})).toBe(
      "Tu alcance mediano es el 4,2% de tus seguidores; en las cuentas de Instagram de tu franja (30.000 – 60.000 seguidores) la mediana es el 3,8%. Estás un 12% por encima."
    )
    expect(explicar({ indice: 0.08 })).toMatch(
      /por encima: el multiplicador llega hasta 1,40\.$/
    )
    expect(
      explicar({
        indice: 0.01,
        franja: { clave: "F3", nombre: "Más de 120.000" },
      })
    ).toMatch(
      /de tu franja \(más de 120\.000 seguidores\).*Estás un 73% por debajo: el multiplicador no baja de 0,70\.$/
    )
    expect(explicar({ indice: 0.0375 })).toMatch(/Estás en la mediana\.$/)
    expect(explicar({ publicacionesVerificadas: 2 })).toBe(
      "Con menos de 5 publicaciones verificadas el multiplicador es 1,00: no sube ni baja lo que te pagan. Llevas 2 de 5."
    )
    expect(explicar({ indice: null, franja: null })).toBe(
      "Aún no hay suficientes cuentas de Instagram de tu franja para comparar tu alcance: mientras tanto, el multiplicador es 1,00."
    )
  })

  it("dice cuándo y con qué se calculó", () => {
    expect(textoBaseCalculo(cuenta(), PARAMETROS, AHORA)).toBe(
      "Calculado el 19 de octubre con tus últimas 20 publicaciones verificadas (métricas de 7 días)."
    )
    expect(
      textoBaseCalculo(
        cuenta({ publicacionesVerificadas: 0 }),
        PARAMETROS,
        AHORA
      )
    ).toBe("Calculado el 19 de octubre, aún sin publicaciones verificadas.")
    expect(
      textoBaseCalculo(cuenta({ calculadoAt: null }), PARAMETROS, AHORA)
    ).toMatch(/^Aún no se ha calculado: se calcula cada semana/)
  })

  it("el distintivo dice la situación con palabras, no solo con color", () => {
    const etiqueta = (cambios: Partial<CuentaCalidad>) =>
      presentarSituacion(situacionCalidad(cuenta(cambios), PARAMETROS))
    expect(etiqueta({})).toEqual({
      tono: "exito",
      etiqueta: "Por encima de tu franja",
    })
    expect(etiqueta({ indice: 0.02 })).toEqual({
      tono: "aviso",
      etiqueta: "Por debajo de tu franja",
    })
    expect(etiqueta({ indice: 0.0375 }).etiqueta).toBe(
      "En la mediana de tu franja"
    )
    expect(etiqueta({ publicacionesVerificadas: 0 }).etiqueta).toBe(
      "Sin historial suficiente"
    )
    expect(etiqueta({ indice: null }).etiqueta).toBe(
      "Sin referencia en tu franja"
    )
  })

  it("los pasos del cálculo usan los parámetros vigentes", () => {
    const pasos = pasosDelCalculo({
      ...PARAMETROS,
      ventanaPublicaciones: 15,
      diasAvisoCambio: 1,
    })
    expect(pasos).toHaveLength(4)
    expect(pasos[0]).toMatch(/últimas 15 publicaciones verificadas/)
    expect(pasos[1]).toMatch(/hasta 1,40.*hasta 0,70/)
    expect(pasos[2]).toBe(
      "Con menos de 5 publicaciones verificadas, el multiplicador es 1,00."
    )
    expect(pasos[3]).toMatch(/con 1 día de anticipación/)
  })
})

describe("calidad de varias cuentas", () => {
  const cuentas = [
    cuenta({ id: "tt", plataforma: "TIKTOK", handle: "zeta" }),
    cuenta({
      id: "ig2",
      handle: "Beta",
      multiplicador: 0.85,
      proximo: 0.92,
      proximoDesde: DESDE,
    }),
    cuenta({ id: "ig1", handle: "alfa", publicacionesVerificadas: 1 }),
  ]

  it("ordena por plataforma y handle (sin distinguir mayúsculas)", () => {
    expect(
      calidadDeCuentas(cuentas, PARAMETROS).map((c) => c.cuenta.id)
    ).toEqual(["ig1", "ig2", "tt"])
  })

  it("el resumen toma el vigente más bajo y su cambio", () => {
    const calidades = calidadDeCuentas(cuentas, PARAMETROS)
    expect(resumenMultiplicador(calidades, AHORA)).toEqual({
      valor: 0.85,
      nota: "El más bajo de tus 3 cuentas; pasará a 0,92 el 30 de octubre",
    })
    expect(resumenMultiplicador(calidades.slice(0, 1), AHORA)).toEqual({
      valor: 1,
      nota: "Ajusta tu pago según el alcance de tu cuenta",
    })
    expect(
      resumenMultiplicador(calidadDeCuentas([cuentas[1]], PARAMETROS), AHORA)
        ?.nota
    ).toBe("Pasará a 0,92 el 30 de octubre")
    expect(resumenMultiplicador([], AHORA)).toBe(null)
  })
})
