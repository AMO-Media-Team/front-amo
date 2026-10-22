import { describe, expect, it } from "vitest"

import { estadoCuenta } from "./estado-cuenta"
import {
  codigoVigenteEnPantalla,
  inicioVerificacion,
  pasoConVuelta,
  seguidoresPrevios,
  tituloPaso,
} from "./flujo-verificacion"
import type { CodigoGenerado, VerificacionCuentaMedio } from "./tipos"

const AHORA = new Date("2026-10-22T15:00:00Z")
const PARAMETROS = { diasVigencia: 30, diasGracia: 7 }

function enMinutos(minutos: number): string {
  return new Date(AHORA.getTime() + minutos * 60_000).toISOString()
}

function intento(
  cambios: Partial<VerificacionCuentaMedio> = {}
): VerificacionCuentaMedio {
  return {
    id: "v-1",
    metodo: "MANUAL",
    estado: "PENDIENTE",
    seguidoresReportados: 45_000,
    seguidoresVerificados: null,
    tieneCaptura: true,
    capturaTipo: "image/webp",
    codigoExpiraAt: null,
    observaciones: null,
    creadaAt: "2026-10-21T15:00:00Z",
    validadaAt: null,
    ...cambios,
  }
}

const CODIGO: CodigoGenerado = {
  verificacionId: "v-1",
  codigo: "K7P4XQ",
  expiraAt: enMinutos(40),
}

function estadoCon(verificaciones: VerificacionCuentaMedio[]) {
  return estadoCuenta(
    { verificada: false, ultimaVerificacionAt: null, verificaciones },
    PARAMETROS,
    AHORA
  )
}

const CODIGO_PENDIENTE = intento({
  metodo: "CODIGO_HISTORIA",
  tieneCaptura: false,
  codigoExpiraAt: enMinutos(40),
  seguidoresReportados: 41_000,
})

describe("inicioVerificacion", () => {
  it("sin nada en curso empieza eligiendo el método, con los seguidores del último intento", () => {
    const verificaciones = [
      intento({ estado: "RECHAZADA", seguidoresReportados: 38_000 }),
    ]
    expect(
      inicioVerificacion(estadoCon(verificaciones), verificaciones, null)
    ).toEqual({ paso: "metodo", codigo: null, seguidores: 38_000 })
  })

  it("un código que espera la captura abre la carga, con el código si se conserva", () => {
    const verificaciones = [CODIGO_PENDIENTE]
    const estado = estadoCon(verificaciones)
    expect(inicioVerificacion(estado, verificaciones, CODIGO)).toEqual({
      paso: "codigo-captura",
      codigo: CODIGO,
      seguidores: 41_000,
    })
    expect(inicioVerificacion(estado, verificaciones, null).codigo).toBeNull()
  })

  it("una captura de estadísticas en revisión abre su corrección", () => {
    const verificaciones = [intento({ seguidoresReportados: 52_000 })]
    expect(
      inicioVerificacion(estadoCon(verificaciones), verificaciones, null)
    ).toEqual({ paso: "manual", codigo: null, seguidores: 52_000 })
  })

  it("un código vencido vuelve a la elección del método", () => {
    const verificaciones = [
      intento({
        metodo: "CODIGO_HISTORIA",
        tieneCaptura: false,
        codigoExpiraAt: enMinutos(-1),
      }),
    ]
    expect(
      inicioVerificacion(estadoCon(verificaciones), verificaciones, CODIGO).paso
    ).toBe("metodo")
  })
})

describe("codigoVigenteEnPantalla", () => {
  it("solo sirve para la verificación que lo generó", () => {
    const estado = estadoCon([CODIGO_PENDIENTE])
    expect(codigoVigenteEnPantalla(estado, CODIGO)).toBe(CODIGO)
    expect(
      codigoVigenteEnPantalla(estado, { ...CODIGO, verificacionId: "otra" })
    ).toBeNull()
  })

  it("se descarta si el código venció", () => {
    const estado = estadoCon([
      { ...CODIGO_PENDIENTE, codigoExpiraAt: enMinutos(-1) },
    ])
    expect(codigoVigenteEnPantalla(estado, CODIGO)).toBeNull()
  })

  it("vale mientras la página aún no refleja la verificación recién creada", () => {
    expect(codigoVigenteEnPantalla(estadoCon([]), CODIGO)).toBe(CODIGO)
    expect(codigoVigenteEnPantalla(estadoCon([]), null)).toBeNull()
  })
})

describe("pasos", () => {
  it("«Atrás» solo desde pedir el código y desde la captura de estadísticas", () => {
    expect(pasoConVuelta("codigo-pedir")).toBe(true)
    expect(pasoConVuelta("manual")).toBe(true)
    expect(pasoConVuelta("metodo")).toBe(false)
    expect(pasoConVuelta("codigo-captura")).toBe(false)
  })

  it("títulos según el paso y si es una reverificación", () => {
    expect(tituloPaso("metodo", false)).toBe("Verificar la cuenta")
    expect(tituloPaso("metodo", true)).toBe("Reverificar la cuenta")
    expect(tituloPaso("codigo-captura", false)).toBe(
      "Publica el código y envía la captura"
    )
  })

  it("seguidores previos: los del intento más reciente", () => {
    expect(seguidoresPrevios([])).toBeNull()
    expect(
      seguidoresPrevios([
        { seguidoresReportados: 50_000 },
        { seguidoresReportados: 40_000 },
      ])
    ).toBe(50_000)
  })
})
