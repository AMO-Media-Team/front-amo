import { describe, expect, it } from "vitest"

import {
  documentoFijo,
  DOCUMENTOS_NIVEL_1,
  medioFijo,
  NIVELES_FIJOS,
  pagoFijo,
  resumenCompleto,
  SIN_PAGO,
} from "./fixtures"
import {
  avisoTope,
  AYUDA_DOCUMENTO,
  documentosNuevos,
  GUIA_NIVEL,
  nivelPorNumero,
  nivelSiguiente,
  tituloNivel,
  vistaNivel,
} from "./nivel"
import { NIVEL_MAXIMO } from "./requisitos"
import type { ConsumoTope } from "./tipos"
import { Constants } from "@/types/database.types"

const [N1, N2, N3] = NIVELES_FIJOS

const verificado = (nivel: number) =>
  medioFijo({
    estado: "VERIFICADO",
    nivel,
    verificadoAt: "2026-06-01T12:00:00Z",
  })

const consumo = (consumido: number, tope: number | null = 30_000_000) =>
  ({ tope, consumido, anio: 2026 }) satisfies ConsumoTope

describe("catálogos de ayuda", () => {
  it("cada tipo de documento tiene su ayuda", () => {
    for (const tipo of Constants.public.Enums.documento_medio_tipo) {
      expect(AYUDA_DOCUMENTO[tipo].length).toBeGreaterThan(20)
    }
  })

  it("hay guía para llegar a cada nivel", () => {
    for (let nivel = 1; nivel <= NIVEL_MAXIMO; nivel += 1) {
      expect(GUIA_NIVEL[nivel]?.pasos.length).toBeGreaterThan(0)
    }
  })
})

describe("nivelPorNumero, nivelSiguiente y documentosNuevos", () => {
  it("encuentra el nivel o devuelve null", () => {
    expect(nivelPorNumero(NIVELES_FIJOS, 2)).toBe(N2)
    expect(nivelPorNumero(NIVELES_FIJOS, 4)).toBeNull()
  })

  it("el siguiente de 0 es el 1 y del máximo no hay", () => {
    expect(nivelSiguiente(NIVELES_FIJOS, 0)).toBe(N1)
    expect(nivelSiguiente(NIVELES_FIJOS, 1)).toBe(N2)
    expect(nivelSiguiente(NIVELES_FIJOS, 3)).toBeNull()
  })

  it("lista solo lo que el nivel siguiente agrega", () => {
    expect(documentosNuevos(N1, N2)).toEqual(["RUT"])
    expect(documentosNuevos(N2, N3)).toEqual([
      "CAMARA_COMERCIO",
      "RUT_SOCIEDAD",
    ])
    expect(documentosNuevos(null, N1)).toEqual(N1.documentosRequeridos)
  })

  it("titula el nivel con su nombre", () => {
    expect(tituloNivel(N2, 2)).toBe("Nivel 2 · Persona natural con RUT")
    expect(tituloNivel(null, 2)).toBe("Nivel 2")
    expect(tituloNivel(null, 0)).toBe("Sin nivel")
  })
})

describe("vistaNivel · durante el alta", () => {
  const resumen = resumenCompleto({ medio: medioFijo() })

  it("sin nivel vigente: el objetivo es el 1 con todo lo que pide", () => {
    const vista = vistaNivel(resumen, null)
    expect(vista.numero).toBe(0)
    expect(vista.actual).toBeNull()
    expect(vista.consumo).toEqual({ tipo: "sin-nivel" })
    expect(vista.objetivo?.nivel).toBe(N1)
    expect(vista.objetivo?.nuevos.map((r) => r.tipo)).toEqual([
      "CEDULA_FRENTE",
      "CEDULA_REVERSO",
      "PRUEBA_VIDA",
      "CERT_BILLETERA",
    ])
    expect(vista.objetivo?.guia).toBe(GUIA_NIVEL[1])
  })

  it("con la cédula y el certificado cargados está listo (la prueba de vida es facultativa)", () => {
    expect(vistaNivel(resumen, null).objetivo?.cargado).toBe(true)
  })

  it("sin método de pago no está listo", () => {
    const vista = vistaNivel(
      resumenCompleto({ medio: medioFijo(), pago: SIN_PAGO }),
      null
    )
    expect(vista.faltaMetodoPago).toBe(true)
    expect(vista.objetivo?.cargado).toBe(false)
  })

  it("un medio RECHAZADO con nivel en la BD sigue sin nivel vigente", () => {
    const vista = vistaNivel(
      resumenCompleto({ medio: medioFijo({ estado: "RECHAZADO", nivel: 1 }) }),
      consumo(0)
    )
    expect(vista.numero).toBe(0)
    expect(vista.consumo.tipo).toBe("sin-nivel")
  })
})

describe("vistaNivel · verificado", () => {
  it("nivel 1: sus documentos, el tope y solo el RUT como nuevo", () => {
    const vista = vistaNivel(
      resumenCompleto({ medio: verificado(1) }),
      consumo(12_000_000)
    )
    expect(vista.numero).toBe(1)
    expect(vista.actual?.nivel).toBe(N1)
    expect(vista.actual?.requisitos.map((r) => [r.tipo, r.situacion])).toEqual([
      ["CEDULA_FRENTE", "aprobado"],
      ["CEDULA_REVERSO", "aprobado"],
      ["PRUEBA_VIDA", "falta"],
      ["CERT_BILLETERA", "aprobado"],
    ])
    expect(vista.objetivo?.nivel).toBe(N2)
    expect(vista.objetivo?.nuevos.map((r) => [r.tipo, r.situacion])).toEqual([
      ["RUT", "falta"],
    ])
    expect(vista.objetivo?.cargado).toBe(false)
    expect(vista.consumo).toMatchObject({
      tipo: "con-tope",
      tope: 30_000_000,
      consumido: 12_000_000,
      anio: 2026,
      progreso: { estado: "normal", porcentaje: 0.4 },
    })
  })

  it("con el RUT en revisión, solo falta que AMO decida", () => {
    const vista = vistaNivel(
      resumenCompleto({
        medio: verificado(1),
        documentos: [
          ...DOCUMENTOS_NIVEL_1,
          documentoFijo({ tipo: "RUT", estado: "PENDIENTE" }),
        ],
      }),
      consumo(0)
    )
    expect(vista.objetivo?.cargado).toBe(true)
  })

  it("avisa desde el 80 % y bloquea desde el 95 %", () => {
    const resumen = resumenCompleto({ medio: verificado(1) })
    const estado = (consumido: number) => {
      const { consumo: c } = vistaNivel(resumen, consumo(consumido))
      return c.tipo === "con-tope" ? c.progreso.estado : c.tipo
    }
    expect(estado(23_999_999)).toBe("normal")
    expect(estado(24_000_000)).toBe("alerta")
    expect(estado(28_500_000)).toBe("bloqueo")
  })

  it("si la consulta del consumo falla, lo dice sin inventar cifras", () => {
    expect(
      vistaNivel(resumenCompleto({ medio: verificado(1) }), null).consumo
    ).toEqual({ tipo: "sin-datos" })
  })

  it("si kpis_medio no trae el tope, usa el de la tabla de niveles", () => {
    const { consumo: c } = vistaNivel(
      resumenCompleto({ medio: verificado(2) }),
      consumo(60_000_000, null)
    )
    expect(c).toMatchObject({ tipo: "con-tope", tope: 120_000_000 })
  })

  it("nivel 3: sin tope y sin nivel siguiente", () => {
    const vista = vistaNivel(
      resumenCompleto({ medio: verificado(3) }),
      consumo(500_000_000, null)
    )
    expect(vista.consumo).toEqual({ tipo: "sin-tope" })
    expect(vista.objetivo).toBeNull()
  })

  it("el certificado sigue al método de pago", () => {
    const vista = vistaNivel(
      resumenCompleto({
        medio: verificado(1),
        pago: pagoFijo({ metodoPago: "BANCARIO" }),
      }),
      consumo(0)
    )
    expect(vista.actual?.requisitos.at(-1)).toMatchObject({
      tipo: "CERT_BANCARIA",
      situacion: "falta",
    })
  })

  it("suspendido conserva su nivel", () => {
    const vista = vistaNivel(
      resumenCompleto({
        medio: medioFijo({ estado: "SUSPENDIDO", nivel: 2 }),
      }),
      consumo(0, 120_000_000)
    )
    expect(vista.numero).toBe(2)
    expect(vista.objetivo?.nivel).toBe(N3)
    expect(vista.objetivo?.nuevos.map((r) => r.tipo)).toEqual([
      "CAMARA_COMERCIO",
      "RUT_SOCIEDAD",
    ])
  })
})

describe("avisoTope", () => {
  const conTope = (consumido: number) =>
    vistaNivel(resumenCompleto({ medio: verificado(1) }), consumo(consumido))
      .consumo

  it("nada por debajo del 80 % ni sin tope", () => {
    expect(avisoTope(conTope(10_000_000), true)).toBeNull()
    expect(avisoTope({ tipo: "sin-tope" }, false)).toBeNull()
    expect(avisoTope({ tipo: "sin-nivel" }, true)).toBeNull()
  })

  it("desde el 80 % avisa y sugiere subir de nivel", () => {
    expect(avisoTope(conTope(25_200_000), true)).toEqual({
      tono: "aviso",
      titulo: "Llevas el 84% de tu tope anual",
      texto:
        "Desde el 95% no podrás aceptar ofertas nuevas en 2026. Sube de nivel para ampliar tu tope.",
    })
  })

  it("desde el 95 % dice hasta cuándo no puede aceptar", () => {
    expect(avisoTope(conTope(30_000_000), true)).toEqual({
      tono: "peligro",
      titulo: "Llegaste al 100% de tu tope anual",
      texto:
        "No puedes aceptar ofertas nuevas hasta el 1 de enero de 2027 o hasta que subas de nivel.",
    })
    expect(avisoTope(conTope(29_000_000), false)?.texto).toBe(
      "No puedes aceptar ofertas nuevas hasta el 1 de enero de 2027."
    )
  })
})
