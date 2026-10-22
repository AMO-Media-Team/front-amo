import { describe, expect, it } from "vitest"

import { formatearFecha } from "@/lib/format"

import { estadoCuenta } from "./estado-cuenta"
import {
  accionPrincipal,
  agruparCodigo,
  avisoCuenta,
  deletrearCodigo,
  describirFranjas,
  estadoIntento,
  fraseResumen,
  INSTRUCCIONES_ESTADISTICAS,
  METODOS_VERIFICACION,
  pistaFranja,
  resumirCuentas,
  seguidoresIntento,
  textoVigencia,
} from "./presentacion"
import type { FranjaSeguidores, VerificacionCuentaMedio } from "./tipos"

const AHORA = new Date("2026-10-22T15:00:00Z")
const PARAMETROS = { diasVigencia: 30, diasGracia: 7 }
const DIA = 86_400_000

function haceDias(dias: number): string {
  return new Date(AHORA.getTime() - dias * DIA).toISOString()
}

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
    creadaAt: haceDias(1),
    validadaAt: null,
    ...cambios,
  }
}

function escenario(
  verificada: boolean,
  ultimaVerificacionAt: string | null,
  verificaciones: VerificacionCuentaMedio[] = []
) {
  const cuenta = {
    handle: "noticias",
    verificada,
    ultimaVerificacionAt,
    verificaciones,
  }
  return { cuenta, estado: estadoCuenta(cuenta, PARAMETROS, AHORA) }
}

function aviso(...args: Parameters<typeof escenario>) {
  const { cuenta, estado } = escenario(...args)
  return avisoCuenta(estado, cuenta, PARAMETROS)
}

const FRANJAS: FranjaSeguidores[] = [
  {
    id: "f1",
    clave: "F1",
    nombre: "30.000 – 60.000",
    seguidoresMin: 30_000,
    seguidoresMax: 60_000,
  },
  {
    id: "f3",
    clave: "F3",
    nombre: "Más de 120.000",
    seguidoresMin: 120_001,
    seguidoresMax: null,
  },
]

describe("avisoCuenta", () => {
  it("cuenta nueva: invita a verificarla y explica cómo", () => {
    expect(aviso(false, null)).toMatchObject({
      icono: "verificar",
      tono: "neutro",
      titulo: "Verifica esta cuenta",
    })
  })

  it("en revisión: cuándo y con cuántos seguidores se envió", () => {
    const enviada = haceDias(1)
    expect(aviso(false, null, [intento({ creadaAt: enviada })])).toEqual({
      icono: "revision",
      tono: "info",
      titulo: "Estamos revisando tu verificación",
      descripcion: `La enviaste el ${formatearFecha(enviada)} con 45.000 seguidores. Te avisaremos cuando la revisemos.`,
      venceAt: null,
    })
  })

  it("reverificación en revisión de una cuenta verificada", () => {
    expect(aviso(true, haceDias(28), [intento()])?.titulo).toBe(
      "Estamos revisando la reverificación"
    )
  })

  it("código sin captura: pide publicarlo y lleva la cuenta regresiva", () => {
    const vence = enMinutos(25)
    const resultado = aviso(false, null, [
      intento({
        metodo: "CODIGO_HISTORIA",
        tieneCaptura: false,
        codigoExpiraAt: vence,
      }),
    ])
    expect(resultado).toMatchObject({
      icono: "captura",
      tono: "aviso",
      titulo: "Falta la captura de la historia",
      venceAt: vence,
    })
    expect(resultado?.descripcion).toContain("@noticias")
  })

  it("código vencido: ofrece uno nuevo o la captura de estadísticas", () => {
    expect(
      aviso(false, null, [
        intento({
          metodo: "CODIGO_HISTORIA",
          tieneCaptura: false,
          codigoExpiraAt: enMinutos(-3),
        }),
      ])
    ).toMatchObject({
      icono: "vencido",
      titulo: "El código venció sin la captura",
    })
  })

  it("rechazo: muestra el motivo sin duplicar el punto final", () => {
    const resultado = aviso(false, null, [
      intento({
        estado: "RECHAZADA",
        observaciones: "La captura no muestra la fecha. ",
      }),
    ])
    expect(resultado).toMatchObject({
      icono: "rechazo",
      tono: "peligro",
      titulo: "No aprobamos la verificación",
      descripcion:
        "Motivo: La captura no muestra la fecha. Corrígelo y vuelve a intentarlo.",
    })
  })

  it("rechazo sin observaciones: consejo genérico", () => {
    expect(
      aviso(false, null, [intento({ estado: "RECHAZADA" })])?.descripcion
    ).toMatch(/captura clara/)
  })

  it("una cuenta al día no lleva aviso", () => {
    expect(aviso(true, haceDias(5))).toBeNull()
  })

  it("por vencer: fecha límite, días y la gracia", () => {
    const resultado = aviso(true, haceDias(27))
    expect(resultado?.tono).toBe("aviso")
    expect(resultado?.descripcion).toBe(
      "Faltan 3 días. Si vence, tienes 7 días de gracia; después la cuenta deja de recibir ofertas hasta que la reverifiques."
    )
  })

  it("en gracia y vencida", () => {
    expect(aviso(true, haceDias(36))?.descripcion).toMatch(/\(falta 1 día\)/)
    expect(aviso(true, haceDias(29))?.descripcion).toMatch(/^Falta 1 día\./)
    expect(aviso(true, haceDias(50))).toMatchObject({
      icono: "vencido",
      tono: "peligro",
      titulo: "La verificación venció",
    })
  })
})

describe("textoVigencia", () => {
  it("describe cada tramo de la vigencia", () => {
    expect(textoVigencia(escenario(false, null).estado)).toBe("Sin verificar")
    const vigente = escenario(true, haceDias(10)).estado
    expect(textoVigencia(vigente)).toMatch(/^Vence el .+ · en 20 días$/)
    expect(textoVigencia(escenario(true, haceDias(33)).estado)).toMatch(
      /^Venció el .+ · gracia hasta el .+$/
    )
    expect(textoVigencia(escenario(true, haceDias(60)).estado)).toMatch(
      /^Venció el /
    )
  })
})

describe("resumirCuentas y fraseResumen", () => {
  it("cuenta las elegibles, las de revisión y las que piden algo", () => {
    const estados = [
      escenario(true, haceDias(5)).estado,
      escenario(true, haceDias(33)).estado,
      escenario(false, null, [intento()]).estado,
      escenario(false, null).estado,
      escenario(true, haceDias(60)).estado,
    ]
    const resumen = resumirCuentas(estados)
    expect(resumen).toEqual({
      total: 5,
      elegibles: 2,
      enRevision: 1,
      pendientes: 3,
    })
    expect(fraseResumen(resumen)).toBe(
      "2 de 5 cuentas reciben ofertas · 1 en revisión · 3 necesitan tu atención."
    )
  })

  it("frases para ninguna cuenta y para una sola", () => {
    expect(
      fraseResumen({ total: 0, elegibles: 0, enRevision: 0, pendientes: 0 })
    ).toBe("Aún no registras cuentas.")
    expect(
      fraseResumen({ total: 1, elegibles: 1, enRevision: 0, pendientes: 0 })
    ).toBe("1 de 1 cuenta recibe ofertas.")
  })
})

describe("código", () => {
  it("se agrupa en dos mitades y se deletrea para el lector de pantalla", () => {
    expect(agruparCodigo("K7P4XQ")).toBe("K7P 4XQ")
    expect(agruparCodigo("ABCDEFG")).toBe("ABCD EFG")
    expect(agruparCodigo("AB")).toBe("AB")
    expect(deletrearCodigo("K7P")).toBe("K, 7, P")
  })
})

describe("historial", () => {
  it("nombra el estado de cada intento para el medio", () => {
    expect(estadoIntento(intento({ estado: "APROBADA" }), AHORA)).toEqual({
      etiqueta: "Aprobada",
      tono: "exito",
    })
    expect(
      estadoIntento(intento({ estado: "RECHAZADA" }), AHORA).etiqueta
    ).toBe("No aprobada")
    expect(estadoIntento(intento(), AHORA).etiqueta).toBe("En revisión")
    expect(
      estadoIntento(
        intento({
          metodo: "CODIGO_HISTORIA",
          tieneCaptura: false,
          codigoExpiraAt: enMinutos(-1),
        }),
        AHORA
      ).etiqueta
    ).toBe("Código vencido")
    expect(
      estadoIntento(
        intento({
          metodo: "CODIGO_HISTORIA",
          tieneCaptura: false,
          codigoExpiraAt: enMinutos(10),
        }),
        AHORA
      ).etiqueta
    ).toBe("Falta la captura")
  })

  it("muestra los seguidores verificados si los hay; si no, los reportados", () => {
    expect(seguidoresIntento(intento())).toBe("45.000 seguidores reportados")
    expect(seguidoresIntento(intento({ seguidoresVerificados: 44_800 }))).toBe(
      "44.800 seguidores verificados"
    )
  })

  it("cada método tiene nombre y explicación", () => {
    for (const metodo of Object.values(METODOS_VERIFICACION)) {
      expect(metodo.etiqueta).not.toBe("")
      expect(metodo.descripcion).not.toBe("")
    }
    for (const texto of Object.values(INSTRUCCIONES_ESTADISTICAS)) {
      expect(texto).toMatch(/Estadísticas/)
    }
  })
})

describe("pistaFranja y describirFranjas", () => {
  it("avisa por debajo del umbral sin impedir la verificación", () => {
    expect(pistaFranja(12_000, FRANJAS, 30_000)).toEqual({
      tono: "aviso",
      texto:
        "Las cuentas con menos de 30.000 seguidores no reciben ofertas. Puedes verificarla igual y volver a hacerlo cuando crezca.",
    })
  })

  it("dice en qué franja quedaría (en minúscula dentro de la frase)", () => {
    expect(pistaFranja(45_000, FRANJAS, 30_000)?.texto).toBe(
      "Con 45.000 seguidores quedaría en la franja 30.000 – 60.000. La franja final depende de los seguidores que verifiquemos."
    )
    expect(pistaFranja(500_000, FRANJAS, 30_000)?.texto).toContain(
      "en la franja más de 120.000."
    )
  })

  it("sin cifra válida o sin franja que la cubra, no dice nada", () => {
    expect(pistaFranja(null, FRANJAS, 30_000)).toBeNull()
    expect(pistaFranja(0, FRANJAS, 30_000)).toBeNull()
    expect(pistaFranja(45_000.5, FRANJAS, 30_000)).toBeNull()
    expect(pistaFranja(90_000, FRANJAS, 30_000)).toBeNull()
  })

  it("enumera las franjas", () => {
    expect(describirFranjas(FRANJAS)).toBe("30.000 – 60.000 · Más de 120.000")
  })
})

describe("accionPrincipal", () => {
  function accion(...args: Parameters<typeof escenario>) {
    return accionPrincipal(escenario(...args).estado)
  }

  it("verificar una cuenta nueva o rechazada", () => {
    expect(accion(false, null)).toEqual({
      tipo: "verificar",
      etiqueta: "Verificar cuenta",
      destacada: true,
    })
    expect(
      accion(false, null, [intento({ estado: "RECHAZADA" })])?.etiqueta
    ).toBe("Verificar de nuevo")
  })

  it("cargar la captura de un código vigente; pedir otro si venció", () => {
    expect(
      accion(false, null, [
        intento({
          metodo: "CODIGO_HISTORIA",
          tieneCaptura: false,
          codigoExpiraAt: enMinutos(15),
        }),
      ])?.tipo
    ).toBe("cargar_captura")
    expect(
      accion(false, null, [
        intento({
          metodo: "CODIGO_HISTORIA",
          tieneCaptura: false,
          codigoExpiraAt: enMinutos(-15),
        }),
      ])?.tipo
    ).toBe("pedir_codigo")
  })

  it("en revisión solo se ofrece cambiar la captura, como acción secundaria", () => {
    expect(accion(false, null, [intento()])).toEqual({
      tipo: "cambiar_captura",
      etiqueta: "Cambiar la captura",
      destacada: false,
    })
    expect(
      accion(false, null, [
        intento({ metodo: "CODIGO_HISTORIA", codigoExpiraAt: enMinutos(-5) }),
      ])
    ).toBeNull()
  })

  it("reverificar cuando vence o tras un rechazo; al día, no", () => {
    expect(accion(true, haceDias(5))).toBeNull()
    expect(accion(true, haceDias(27))?.etiqueta).toBe("Reverificar")
    expect(
      accion(true, haceDias(5), [intento({ estado: "RECHAZADA" })])?.etiqueta
    ).toBe("Reverificar de nuevo")
  })
})
