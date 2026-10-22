import { describe, expect, it } from "vitest"

import {
  codigoVencido,
  esElegible,
  estadoCuenta,
  ordenarCuentas,
  requiereAccion,
  ultimoRechazo,
  verificacionEnCurso,
} from "./estado-cuenta"
import type { VerificacionCuentaMedio } from "./tipos"

const AHORA = new Date("2026-10-22T15:00:00Z")
const PARAMETROS = { diasVigencia: 30, diasGracia: 7 }
const DIA = 86_400_000

function haceDias(dias: number): string {
  return new Date(AHORA.getTime() - dias * DIA).toISOString()
}

function enMinutos(minutos: number): string {
  return new Date(AHORA.getTime() + minutos * 60_000).toISOString()
}

let secuencia = 0
function intento(
  cambios: Partial<VerificacionCuentaMedio> = {}
): VerificacionCuentaMedio {
  secuencia += 1
  return {
    id: `v-${secuencia}`,
    metodo: "MANUAL",
    estado: "PENDIENTE",
    seguidoresReportados: 45_000,
    seguidoresVerificados: null,
    tieneCaptura: true,
    capturaTipo: "image/webp",
    codigoExpiraAt: null,
    observaciones: null,
    creadaAt: haceDias(1),
    validadaAt: null,
    ...cambios,
  }
}

function cuenta(
  verificada: boolean,
  ultimaVerificacionAt: string | null,
  verificaciones: VerificacionCuentaMedio[] = []
) {
  return { verificada, ultimaVerificacionAt, verificaciones }
}

describe("verificacionEnCurso", () => {
  it("sin pendiente no hay nada en curso", () => {
    expect(
      verificacionEnCurso([intento({ estado: "APROBADA" })], AHORA)
    ).toBeNull()
  })

  it("una MANUAL con captura espera revisión y se puede reemplazar", () => {
    const enCurso = verificacionEnCurso([intento()], AHORA)
    expect(enCurso).toMatchObject({ tipo: "revision", puedeReemplazar: true })
  })

  it("un código vigente sin captura espera la captura", () => {
    const enCurso = verificacionEnCurso(
      [
        intento({
          metodo: "CODIGO_HISTORIA",
          tieneCaptura: false,
          codigoExpiraAt: enMinutos(30),
        }),
      ],
      AHORA
    )
    expect(enCurso?.tipo).toBe("esperando_captura")
  })

  it("un código vencido sin captura obliga a pedir otro", () => {
    const enCurso = verificacionEnCurso(
      [
        intento({
          metodo: "CODIGO_HISTORIA",
          tieneCaptura: false,
          codigoExpiraAt: enMinutos(-1),
        }),
      ],
      AHORA
    )
    expect(enCurso?.tipo).toBe("codigo_vencido")
  })

  it("la captura de un código ya vencido sigue en revisión, pero no se reemplaza", () => {
    const enCurso = verificacionEnCurso(
      [
        intento({
          metodo: "CODIGO_HISTORIA",
          tieneCaptura: true,
          codigoExpiraAt: enMinutos(-5),
        }),
      ],
      AHORA
    )
    expect(enCurso).toMatchObject({ tipo: "revision", puedeReemplazar: false })
  })
})

describe("codigoVencido", () => {
  it("solo aplica al método de código y vence en el instante exacto", () => {
    expect(
      codigoVencido(
        { metodo: "CODIGO_HISTORIA", codigoExpiraAt: AHORA.toISOString() },
        AHORA
      )
    ).toBe(true)
    expect(
      codigoVencido({ metodo: "MANUAL", codigoExpiraAt: enMinutos(-10) }, AHORA)
    ).toBe(false)
  })
})

describe("ultimoRechazo", () => {
  it("es el último intento resuelto si fue un rechazo", () => {
    const rechazo = intento({ estado: "RECHAZADA", observaciones: "Borrosa" })
    expect(ultimoRechazo([rechazo, intento({ estado: "APROBADA" })])).toBe(
      rechazo
    )
  })

  it("una aprobación posterior lo deja atrás", () => {
    expect(
      ultimoRechazo([
        intento({ estado: "APROBADA" }),
        intento({ estado: "RECHAZADA" }),
      ])
    ).toBeNull()
  })

  it("no cuenta mientras hay otro intento en curso", () => {
    expect(
      ultimoRechazo([intento(), intento({ estado: "RECHAZADA" })])
    ).toBeNull()
  })
})

describe("estadoCuenta", () => {
  it("una cuenta nueva está sin verificar y se puede editar y quitar", () => {
    const estado = estadoCuenta(cuenta(false, null), PARAMETROS, AHORA)
    expect(estado.principal).toBe("sin_verificar")
    expect(estado.diasRestantes).toBeNull()
    expect(estado.acciones).toEqual({
      editarPerfil: true,
      editarTarifa: true,
      quitar: true,
      verificar: "verificar",
      cargarCaptura: false,
      reemplazarCaptura: false,
    })
  })

  it("en revisión no se edita el usuario, no se quita ni se pide otra verificación", () => {
    const estado = estadoCuenta(
      cuenta(false, null, [intento()]),
      PARAMETROS,
      AHORA
    )
    expect(estado.principal).toBe("en_revision")
    expect(estado.acciones).toMatchObject({
      editarPerfil: false,
      editarTarifa: true,
      quitar: false,
      verificar: null,
      reemplazarCaptura: true,
    })
  })

  it("un código sin captura deja la cuenta incompleta y pide la captura", () => {
    const estado = estadoCuenta(
      cuenta(false, null, [
        intento({
          metodo: "CODIGO_HISTORIA",
          tieneCaptura: false,
          codigoExpiraAt: enMinutos(20),
        }),
      ]),
      PARAMETROS,
      AHORA
    )
    expect(estado.principal).toBe("incompleta")
    expect(estado.acciones.cargarCaptura).toBe(true)
    expect(estado.acciones.editarPerfil).toBe(true)
  })

  it("rechazada cuando el último intento no se aprobó", () => {
    const estado = estadoCuenta(
      cuenta(false, null, [intento({ estado: "RECHAZADA" })]),
      PARAMETROS,
      AHORA
    )
    expect(estado.principal).toBe("rechazada")
    expect(estado.rechazo).not.toBeNull()
  })

  it("verificada hace 10 días: vigente, con 20 días por delante", () => {
    const estado = estadoCuenta(cuenta(true, haceDias(10)), PARAMETROS, AHORA)
    expect(estado.principal).toBe("vigente")
    expect(estado.diasRestantes).toBe(20)
    expect(estado.acciones).toMatchObject({
      editarPerfil: false,
      quitar: false,
      verificar: "reverificar",
    })
  })

  it("por vencer en los últimos días de la vigencia", () => {
    const estado = estadoCuenta(cuenta(true, haceDias(27)), PARAMETROS, AHORA)
    expect(estado.principal).toBe("por_vencer")
    expect(estado.diasRestantes).toBe(3)
  })

  it("en gracia: los días cuentan hasta dejar de ser elegible", () => {
    const estado = estadoCuenta(cuenta(true, haceDias(32)), PARAMETROS, AHORA)
    expect(estado.principal).toBe("en_gracia")
    expect(estado.diasRestantes).toBe(5)
  })

  it("vencida tras la gracia, sin días restantes", () => {
    const estado = estadoCuenta(cuenta(true, haceDias(40)), PARAMETROS, AHORA)
    expect(estado.principal).toBe("vencida")
    expect(estado.diasRestantes).toBeNull()
  })

  it("una verificada que se reverifica conserva su vigencia como estado", () => {
    const estado = estadoCuenta(
      cuenta(true, haceDias(28), [intento()]),
      PARAMETROS,
      AHORA
    )
    expect(estado.principal).toBe("por_vencer")
    expect(estado.enCurso?.tipo).toBe("revision")
    expect(estado.acciones.verificar).toBeNull()
  })
})

describe("requiereAccion y esElegible", () => {
  it("las cuentas al día o en revisión no piden nada", () => {
    expect(requiereAccion("vigente")).toBe(false)
    expect(requiereAccion("en_revision")).toBe(false)
    expect(requiereAccion("vencida")).toBe(true)
    expect(requiereAccion("incompleta")).toBe(true)
  })

  it("la gracia todavía recibe ofertas; vencida no", () => {
    expect(esElegible("en_gracia")).toBe(true)
    expect(esElegible("por_vencer")).toBe(true)
    expect(esElegible("vencida")).toBe(false)
    expect(esElegible("sin_verificar")).toBe(false)
  })
})

describe("ordenarCuentas", () => {
  it("Instagram, Facebook y TikTok; dentro de cada red, por antigüedad", () => {
    const orden = ordenarCuentas([
      { id: "t", plataforma: "TIKTOK", creadaAt: "2026-01-01" },
      { id: "f", plataforma: "FACEBOOK", creadaAt: "2026-01-01" },
      { id: "i2", plataforma: "INSTAGRAM", creadaAt: "2026-03-01" },
      { id: "i1", plataforma: "INSTAGRAM", creadaAt: "2026-02-01" },
    ] as const)
    expect(orden.map((c) => c.id)).toEqual(["i1", "i2", "f", "t"])
  })
})
