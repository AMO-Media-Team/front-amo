import { describe, expect, it } from "vitest"

import { formatearCOP } from "@/lib/format"

import { interpretarErrorAceptar } from "./errores"
import {
  avisoAceptada,
  avisoCuenta,
  avisoTope,
  cabeEnTope,
  condicionesOferta,
  cuentaDestacada,
  cuentaPorDefecto,
  disponibilidadAceptar,
  ELEGIBILIDAD,
  formatoDeOferta,
  otraCuentaEnTope,
  pagoTarjeta,
  textoCortes,
  textoCupos,
  textoPublicaciones,
  topeSuperado,
  unirLista,
} from "./presentacion"
import type {
  AsignacionEnOferta,
  CuentaCotizada,
  DetalleOfertaMedio,
} from "./tipos"

const AHORA = new Date("2026-10-23T15:00:00.000Z")

function cotizada(id: string, monto: number | null, cupos = 2): CuentaCotizada {
  return {
    cuentaSocialId: id,
    handle: `cuenta.${id}`,
    franjaClave: "F1",
    cuposRestantes: cupos,
    cotizacion:
      monto === null
        ? null
        : {
            franjaClave: "F1",
            seguidores: 40_000,
            publicaciones: 1,
            multiplicadorCalidad: 1,
            multiplicadorGeografico: 1,
            multiplicadorExclusividad: 1,
            montoMedio: monto,
            desglose: null,
          },
    aviso: monto === null ? "Falta la tarifa de tu franja." : null,
    superaTopeCampana: false,
  }
}

type Disponibilidad = Parameters<typeof disponibilidadAceptar>[0]

function detalle(cambios: Partial<Disponibilidad> = {}): Disponibilidad {
  return {
    estado: "PUBLICADA",
    permiteMultiplesCupos: false,
    fechaLimiteAceptacion: "2026-10-25T22:00:00.000Z",
    ventanaFin: "2026-11-05T05:00:00.000Z",
    plataforma: "INSTAGRAM",
    cuentas: [cotizada("a", 180_000)],
    asignaciones: [],
    chocaExclusividad: false,
    ...cambios,
  } satisfies Pick<DetalleOfertaMedio, keyof Disponibilidad>
}

const ASIGNACION: AsignacionEnOferta = {
  id: "asig-1",
  estado: "ACEPTADA",
  handle: "cuenta.a",
  aceptadaAt: "2026-10-22T15:00:00.000Z",
  montoMedio: 180_000,
}

describe("elegibilidad", () => {
  it("cada motivo dice cómo resolverlo con un enlace a Mi medio", () => {
    expect(ELEGIBILIDAD.SIN_CUENTA_VIGENTE.accion.href).toBe(
      "/mi-medio/cuentas"
    )
    expect(ELEGIBILIDAD.NIVEL_0.accion.href).toBe("/mi-medio/nivel")
    expect(ELEGIBILIDAD.MEDIO_SUSPENDIDO.accion.href).toBe("/mi-medio")
    for (const entrada of Object.values(ELEGIBILIDAD)) {
      expect(entrada.titulo).not.toBe("")
      expect(entrada.accion.texto).not.toBe("")
    }
  })
})

describe("tarjeta del marketplace", () => {
  it("cupos en voz del medio", () => {
    expect(textoCupos(0)).toBe("Sin cupos en tu franja")
    expect(textoCupos(1)).toBe("Último cupo en tu franja")
    expect(textoCupos(3)).toBe("3 cupos en tu franja")
  })

  it("destaca la cuenta que más paga entre las que tienen cupo", () => {
    expect(
      cuentaDestacada([
        { cuposRestantes: 0, montoMedio: 900_000 },
        { cuposRestantes: 2, montoMedio: 150_000 },
        { cuposRestantes: 1, montoMedio: 200_000 },
      ])
    ).toEqual({ cuposRestantes: 1, montoMedio: 200_000 })
    expect(
      cuentaDestacada([
        { cuposRestantes: 1, montoMedio: null },
        { cuposRestantes: 4, montoMedio: null },
      ])
    ).toEqual({ cuposRestantes: 4, montoMedio: null })
    expect(cuentaDestacada([{ cuposRestantes: 0, montoMedio: 1 }])).toBeNull()
  })

  it("el pago dice «Hasta» solo si sus cuentas pagan distinto", () => {
    const una = pagoTarjeta({
      pagoMaximo: 180_000,
      cuentas: [
        {
          cuentaSocialId: "a",
          handle: "a",
          franjaClave: "F1",
          cuposRestantes: 1,
          montoMedio: 180_000,
        },
      ],
    })
    expect(una).toEqual({
      etiqueta: "Recibes",
      valor: formatearCOP(180_000),
      descripcion: `Recibes ${formatearCOP(180_000)}`,
    })
    const varias = pagoTarjeta({
      pagoMaximo: 250_000,
      cuentas: [
        {
          cuentaSocialId: "a",
          handle: "a",
          franjaClave: "F1",
          cuposRestantes: 1,
          montoMedio: 250_000,
        },
        {
          cuentaSocialId: "b",
          handle: "b",
          franjaClave: "F2",
          cuposRestantes: 1,
          montoMedio: 120_000,
        },
      ],
    })
    expect(varias.etiqueta).toBe("Hasta")
    expect(varias.descripcion).toBe(`Recibes hasta ${formatearCOP(250_000)}`)
    expect(pagoTarjeta({ pagoMaximo: null, cuentas: [] }).valor).toBe(
      "Por confirmar"
    )
  })

  it("formato, publicaciones y cortes legibles", () => {
    expect(formatoDeOferta({ formato: "Reel", plataforma: "INSTAGRAM" })).toBe(
      "Reel de Instagram"
    )
    expect(textoPublicaciones(1)).toBe("1 publicación")
    expect(textoPublicaciones(2)).toBe("2 publicaciones")
    expect(unirLista([])).toBe("")
    expect(unirLista(["a"])).toBe("a")
    expect(unirLista(["a", "b", "c"])).toBe("a, b y c")
    expect(textoCortes(["D7", "H24", "H72", "H24"])).toBe(
      "24 horas, 72 horas y 7 días"
    )
  })
})

describe("condiciones de la oferta", () => {
  it("siempre la etiqueta de publicidad, el copy sin editar y la permanencia", () => {
    const condiciones = condicionesOferta({
      permanenciaDias: 7,
      exclusividadDias: null,
      cortes: [],
    })
    expect(condiciones.map((c) => c.clave)).toEqual([
      "etiqueta",
      "copy",
      "permanencia",
    ])
    expect(condiciones[0]?.titulo).toBe("Etiqueta de publicidad obligatoria")
    expect(condiciones[2]?.titulo).toBe("Mantén la publicación 7 días")
  })

  it("suma exclusividad y cortes de métricas cuando la oferta los pide", () => {
    const condiciones = condicionesOferta({
      permanenciaDias: 1,
      exclusividadDias: 15,
      cortes: ["H24", "D7"],
    })
    expect(condiciones.map((c) => c.titulo)).toEqual([
      "Etiqueta de publicidad obligatoria",
      "No edites el texto",
      "Mantén la publicación 1 día",
      "Exclusividad por 15 días",
      "Métricas a las 24 horas y 7 días",
    ])
  })
})

describe("¿se puede aceptar ahora?", () => {
  it("disponible con las cuentas que tienen cupo y pago", () => {
    const resultado = disponibilidadAceptar(
      detalle({
        cuentas: [
          cotizada("a", 180_000),
          cotizada("b", 90_000, 0),
          cotizada("c", null),
        ],
      }),
      AHORA
    )
    expect(resultado.tipo).toBe("disponible")
    if (resultado.tipo !== "disponible") return
    expect(resultado.cuentas.map((c) => c.cuentaSocialId)).toEqual(["a"])
  })

  it("ya aceptada (un cupo por medio): lleva a la asignación", () => {
    expect(
      disponibilidadAceptar(detalle({ asignaciones: [ASIGNACION] }), AHORA)
    ).toEqual({ tipo: "aceptada", asignacion: ASIGNACION })
  })

  it("con varios cupos por medio puede aceptar otra vez", () => {
    const resultado = disponibilidadAceptar(
      detalle({ permiteMultiplesCupos: true, asignaciones: [ASIGNACION] }),
      AHORA
    )
    expect(resultado).toMatchObject({
      tipo: "disponible",
      previas: [ASIGNACION],
    })
  })

  it("explica por qué no: estado, fecha límite, cuentas, cupo y tarifa", () => {
    expect(
      disponibilidadAceptar(detalle({ estado: "CANCELADA" }), AHORA)
    ).toMatchObject({
      tipo: "no_disponible",
      motivo: "El anunciante la canceló.",
    })
    expect(
      disponibilidadAceptar(
        detalle({ fechaLimiteAceptacion: "2026-10-23T14:00:00.000Z" }),
        AHORA
      )
    ).toMatchObject({ tipo: "no_disponible", titulo: "Cerró la aceptación" })
    expect(
      disponibilidadAceptar(detalle({ cuentas: [] }), AHORA)
    ).toMatchObject({
      tipo: "no_disponible",
      titulo: "No puedes aceptar esta oferta",
    })
    expect(
      disponibilidadAceptar(
        detalle({ cuentas: [cotizada("a", 180_000, 0)] }),
        AHORA
      )
    ).toMatchObject({
      tipo: "no_disponible",
      titulo: "No quedan cupos en tu franja",
    })
    expect(
      disponibilidadAceptar(detalle({ cuentas: [cotizada("a", null)] }), AHORA)
    ).toMatchObject({
      tipo: "no_disponible",
      titulo: "Aún no podemos calcular tu pago",
      motivo: "Falta la tarifa de tu franja.",
    })
  })

  it("con exclusividad no se puede aceptar con ninguna cuenta: lo dice como el error de la reserva", () => {
    const error = interpretarErrorAceptar({
      code: "P0001",
      message: "AMO_EXCLUSIVIDAD",
    })
    expect(
      disponibilidadAceptar(
        detalle({
          chocaExclusividad: true,
          cuentas: [cotizada("a", 180_000), cotizada("b", 90_000)],
        }),
        AHORA
      )
    ).toEqual({
      tipo: "no_disponible",
      titulo: "Choca con otra campaña del mismo sector",
      motivo: error.error,
      enlace: { texto: "Ir a Mis campañas", href: "/mis-campanas" },
    })
    expect(error.titulo).toBe("Choca con otra campaña del mismo sector")
    expect(error.enlace).toEqual({
      texto: "Ir a Mis campañas",
      href: "/mis-campanas",
    })
    // Antes que la tarifa (aunque la configuren, no podría aceptarla); la
    // aceptación hecha y la falta de cupo se dicen primero.
    expect(
      disponibilidadAceptar(
        detalle({ chocaExclusividad: true, cuentas: [cotizada("a", null)] }),
        AHORA
      )
    ).toMatchObject({ titulo: "Choca con otra campaña del mismo sector" })
    expect(
      disponibilidadAceptar(
        detalle({
          chocaExclusividad: true,
          cuentas: [cotizada("a", 180_000, 0)],
        }),
        AHORA
      )
    ).toMatchObject({ titulo: "No quedan cupos en tu franja" })
    expect(
      disponibilidadAceptar(
        detalle({ chocaExclusividad: true, asignaciones: [ASIGNACION] }),
        AHORA
      ).tipo
    ).toBe("aceptada")
  })

  it("los demás motivos no llevan enlace", () => {
    expect(
      disponibilidadAceptar(detalle({ estado: "CANCELADA" }), AHORA)
    ).toMatchObject({ tipo: "no_disponible", enlace: null })
  })

  it("la cuenta por defecto es la que más paga, o la que ya eligió", () => {
    const cuentas = [cotizada("a", 120_000), cotizada("b", 200_000)]
    expect(cuentaPorDefecto(cuentas)?.cuentaSocialId).toBe("b")
    expect(cuentaPorDefecto(cuentas, "a")?.cuentaSocialId).toBe("a")
    expect(cuentaPorDefecto(cuentas, "otra")?.cuentaSocialId).toBe("b")
    expect(cuentaPorDefecto([])).toBeNull()
  })
})

describe("tope anual del nivel (MED-007)", () => {
  const consumo = {
    consumido: 7_000_000,
    tope: 10_000_000,
    alerta: 0.8,
    bloqueo: 0.95,
  }

  it("sin tope o sin pago no avisa", () => {
    expect(avisoTope(null, 100)).toBeNull()
    expect(avisoTope({ ...consumo, tope: null }, 100)).toBeNull()
    expect(avisoTope(consumo, null)).toBeNull()
    expect(avisoTope(consumo, 500_000)).toBeNull()
  })

  it("«Cerca del tope» desde el umbral de alerta", () => {
    expect(avisoTope(consumo, 1_000_000)).toMatchObject({
      tipo: "alerta",
      titulo: "Cerca del tope",
      fraccion: 0.8,
    })
  })

  it("bloquea si superaría el umbral de bloqueo, como la reserva", () => {
    expect(avisoTope(consumo, 2_500_000)?.tipo).toBe("alerta")
    expect(avisoTope(consumo, 2_500_001)).toMatchObject({
      tipo: "bloqueo",
      titulo: "Superarías el tope anual de tu nivel",
    })
  })

  it("un pago que la BD ya rechazó por el tope (y los mayores) bloquea, aunque el consumo leído no lo diga", () => {
    expect(avisoTope(consumo, 1_000_000, 900_000)).toMatchObject({
      tipo: "bloqueo",
      titulo: "Superarías el tope anual de tu nivel",
      fraccion: 0.8,
    })
    expect(avisoTope(null, 900_000, 900_000)).toMatchObject({
      tipo: "bloqueo",
      fraccion: null,
    })
    expect(avisoTope(null, 899_999, 900_000)).toBeNull()
    expect(avisoTope(consumo, 1_000_000, 2_000_000)?.tipo).toBe("alerta")
  })

  it("por cuenta: cuál cabe, la elegida por defecto y la sugerencia", () => {
    const cara = cotizada("cara", 2_600_000)
    const media = cotizada("media", 2_000_000)
    const barata = cotizada("barata", 1_000_000)
    const cuentas = [barata, cara, media]
    const cabe = (cuenta: CuentaCotizada) => cabeEnTope(cuenta, consumo)

    expect(cabe(cara)).toBe(false)
    expect(cabe(media)).toBe(true)
    // Sin elegir, la que más paga entre las que caben (no la que lo supera).
    expect(cuentaPorDefecto(cuentas, null, cabe)?.cuentaSocialId).toBe("media")
    // Si la eligió, se respeta, y se sugiere la que más paga de las que caben.
    expect(cuentaPorDefecto(cuentas, "cara", cabe)?.cuentaSocialId).toBe("cara")
    expect(otraCuentaEnTope(cuentas, cara, cabe)?.cuentaSocialId).toBe("media")
    // La BD rechazó 2.000.000: solo cabe la barata.
    const trasRechazo = (cuenta: CuentaCotizada) =>
      cabeEnTope(cuenta, consumo, 2_000_000)
    expect(otraCuentaEnTope(cuentas, media, trasRechazo)?.cuentaSocialId).toBe(
      "barata"
    )
    // Si ninguna cabe, la que más paga (el aviso explica por qué no puede).
    expect(cuentaPorDefecto([cara], null, () => false)?.cuentaSocialId).toBe(
      "cara"
    )
    expect(otraCuentaEnTope([cara], cara, cabe)).toBeNull()
  })
})

describe("participación máxima del medio en la campaña (AMO_TOPE_MEDIO)", () => {
  const consumo = {
    consumido: 7_000_000,
    tope: 10_000_000,
    alerta: 0.8,
    bloqueo: 0.95,
  }
  const enCampana = (cuenta: CuentaCotizada): CuentaCotizada => ({
    ...cuenta,
    superaTopeCampana: true,
  })

  it("con la cuenta que la supera, bloquea con su motivo aunque no se sepa el consumo anual", () => {
    const aviso = avisoCuenta(enCampana(cotizada("a", 100_000)), null)
    expect(aviso).toEqual({
      tipo: "bloqueo",
      tope: "campana",
      titulo: "Superarías la participación máxima de un medio en esta campaña",
      mensaje: expect.stringContaining(
        "Cada medio puede llevarse solo una parte del presupuesto de una campaña"
      ),
      fraccion: null,
    })
    // Va antes que el tope anual, como en la reserva.
    expect(
      avisoCuenta(enCampana(cotizada("a", 2_600_000)), consumo)?.tope
    ).toBe("campana")
    expect(avisoCuenta(cotizada("a", 2_600_000), consumo)).toMatchObject({
      tipo: "bloqueo",
      tope: "nivel",
    })
    expect(avisoCuenta(cotizada("a", 1_000_000), consumo)).toMatchObject({
      tipo: "alerta",
      tope: "nivel",
    })
    expect(avisoCuenta(null, consumo)).toBeNull()
  })

  it("por cuenta: cuál tope supera, la elegida por defecto la evita y se sugiere otra que cabe en los dos", () => {
    const cara = enCampana(cotizada("cara", 2_000_000))
    const anual = cotizada("anual", 2_600_000)
    const barata = cotizada("barata", 1_000_000)
    const cuentas = [cara, anual, barata]
    const cabe = (cuenta: CuentaCotizada) => cabeEnTope(cuenta, consumo)

    expect(topeSuperado(cara, consumo)).toBe("campana")
    expect(topeSuperado(anual, consumo)).toBe("nivel")
    expect(topeSuperado(barata, consumo)).toBeNull()
    expect(cabeEnTope(cara, null)).toBe(false)
    expect(cuentaPorDefecto(cuentas, null, cabe)?.cuentaSocialId).toBe("barata")
    expect(otraCuentaEnTope(cuentas, cara, cabe)?.cuentaSocialId).toBe("barata")
    expect(otraCuentaEnTope([cara, anual], cara, cabe)).toBeNull()
  })
})

describe("aviso al aceptar (MED-010)", () => {
  const ventanaFin = "2026-11-05T05:00:00.000Z"

  it("mismo pago: el plazo para publicar", () => {
    expect(
      avisoAceptada({ mostrado: 112_000, congelado: 112_000, ventanaFin })
    ).toEqual({
      titulo: "¡Aceptaste la oferta!",
      descripcion: expect.stringMatching(
        /^Descarga el contenido y publícalo antes del /
      ),
      cambioElPago: false,
    })
    // Sin el monto congelado no hay con qué comparar.
    expect(
      avisoAceptada({ mostrado: 112_000, congelado: null, ventanaFin })
        .cambioElPago
    ).toBe(false)
    // Centavos que no se ven no cuentan como cambio.
    expect(
      avisoAceptada({ mostrado: 112_000, congelado: 112_000.2, ventanaFin })
        .cambioElPago
    ).toBe(false)
  })

  it("si el pago cambió mientras decidía, lo dice con el monto real", () => {
    const aviso = avisoAceptada({
      mostrado: 112_000,
      congelado: 100_000,
      ventanaFin,
    })
    expect(aviso.cambioElPago).toBe(true)
    expect(aviso.titulo).toBe("¡Aceptaste la oferta!")
    expect(aviso.descripcion).toContain(
      `Tu pago quedó congelado en ${formatearCOP(100_000)}, no en ${formatearCOP(112_000)}`
    )
    expect(aviso.descripcion).toContain("puedes desistir")
  })
})
