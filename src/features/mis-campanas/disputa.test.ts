import { describe, expect, it } from "vitest"

import type { DisputaDetalle } from "@/features/disputas/tipos"

import {
  autorAperturaParte,
  avisoPaginaAnunciante,
  bloqueoParte,
  contextoEstadoDisputa,
  DESCRIPCION_RECLAMO,
  descripcionAlCambiar,
  efectoApertura,
  enlaceDisputa,
  esReclamo,
  mensajePruebas,
  motivoInicial,
  opcionesMotivo,
  SIN_PERMISO_DISPUTA,
  siguienteTrasDisputa,
  textoPlazoReclamo,
  tituloDisputa,
  tituloSinPermiso,
  validarEnlacePublicacion,
  type VistaDisputa,
  vistaDisputa,
} from "./disputa"

const AHORA = new Date("2026-10-23T15:00:00.000Z")
const ASIGNACION = "0199f3a0-0000-7000-8000-00000000a501"

function disputa(cambios: Partial<DisputaDetalle> = {}): DisputaDetalle {
  return {
    id: "0199f3a0-0000-7000-8000-0000000000d1",
    asignacionId: ASIGNACION,
    estado: "ABIERTA",
    motivo: "METRICAS",
    parte: "MEDIO",
    descripcion: "Me rechazaron las métricas de 72 horas sin motivo.",
    estadoOrigen: "EVIDENCIA_VALIDADA",
    resolucion: null,
    estadoResultante: null,
    creadaAt: "2026-10-22T15:00:00.000Z",
    actualizadaAt: "2026-10-22T15:00:00.000Z",
    resueltaAt: null,
    ...cambios,
  }
}

const RESUELTA = {
  estado: "RESUELTA",
  resolucion: "Revisamos la captura y las cifras coinciden.",
  resueltaAt: "2026-10-23T10:00:00.000Z",
} as const

describe("vistaDisputa", () => {
  it("con una abierta, su hilo (y las anteriores debajo)", () => {
    const abierta = disputa({ estado: "EN_REVISION" })
    const anterior = disputa({
      id: "0199f3a0-0000-7000-8000-0000000000d0",
      ...RESUELTA,
      estadoResultante: "EVIDENCIA_VALIDADA",
    })
    expect(
      vistaDisputa({
        perspectiva: "anunciante",
        estadoAsignacion: "EN_DISPUTA",
        disputas: [abierta, anterior],
        ahora: AHORA,
      })
    ).toEqual({ tipo: "abierta", disputa: abierta, anteriores: [anterior] })
  })

  it("una vencida dentro de su plazo se reclama con «Otro» o «Incumplimiento»", () => {
    expect(
      vistaDisputa({
        perspectiva: "medio",
        estadoAsignacion: "VENCIDA_SIN_PUBLICAR",
        disputas: [],
        reclamoHasta: "2026-10-25T15:00:00.000Z",
        ahora: AHORA,
      })
    ).toEqual({
      tipo: "abrir",
      modo: "reclamo",
      motivos: ["OTRO", "INCUMPLIMIENTO"],
      anteriores: [],
    })
  })

  it("una vencida se reclama una sola vez", () => {
    const reclamo = disputa({
      motivo: "OTRO",
      estadoOrigen: "VENCIDA_SIN_PUBLICAR",
      ...RESUELTA,
      estadoResultante: "VENCIDA_SIN_PUBLICAR",
    })
    const vista = vistaDisputa({
      perspectiva: "medio",
      estadoAsignacion: "VENCIDA_SIN_PUBLICAR",
      disputas: [reclamo],
      reclamoHasta: "2026-10-25T15:00:00.000Z",
      ahora: AHORA,
    })
    expect(vista).toMatchObject({ tipo: "cerrada", disputa: reclamo })
    expect(vista.tipo === "cerrada" && vista.bloqueo).toMatch(
      /no admite otro reclamo/
    )
  })

  it("pasado el plazo para reclamar, lo dice", () => {
    const vista = vistaDisputa({
      perspectiva: "medio",
      estadoAsignacion: "VENCIDA_SIN_PUBLICAR",
      disputas: [],
      reclamoHasta: "2026-10-22T15:00:00.000Z",
      ahora: AHORA,
    })
    expect(vista.tipo).toBe("sin_disputa")
    expect(vista.tipo === "sin_disputa" && vista.bloqueo).toMatch(
      /El plazo para reclamar terminó el/
    )
  })

  it("en un estado disputable se reporta un problema con los motivos de la parte", () => {
    expect(
      vistaDisputa({
        perspectiva: "medio",
        estadoAsignacion: "PUBLICADA",
        disputas: [],
        ahora: AHORA,
      })
    ).toMatchObject({
      tipo: "abrir",
      modo: "problema",
      motivos: ["METRICAS", "CONTENIDO", "PAGO", "OTRO"],
    })
    // Cerrada la anterior, se puede abrir otra; la cerrada queda debajo.
    const anterior = disputa({ ...RESUELTA, estadoResultante: "VERIFICADA" })
    expect(
      vistaDisputa({
        perspectiva: "anunciante",
        estadoAsignacion: "VERIFICADA",
        disputas: [anterior],
        ahora: AHORA,
      })
    ).toEqual({
      tipo: "abrir",
      modo: "problema",
      motivos: [
        "INCUMPLIMIENTO",
        "METRICAS",
        "CONTENIDO",
        "PERMANENCIA",
        "OTRO",
      ],
      anteriores: [anterior],
    })
  })

  it("sin poder abrir otra, el resultado de la última y por qué", () => {
    const cancelada = disputa({
      parte: "ANUNCIANTE",
      motivo: "INCUMPLIMIENTO",
      ...RESUELTA,
      estadoResultante: "CANCELADA",
    })
    const vista = vistaDisputa({
      perspectiva: "medio",
      estadoAsignacion: "CANCELADA",
      disputas: [cancelada],
      ahora: AHORA,
    })
    expect(vista).toMatchObject({ tipo: "cerrada", disputa: cancelada })
    expect(vista.tipo === "cerrada" && vista.bloqueo).toBe(
      "Tu participación en esta campaña se canceló: ya no admite disputas."
    )
  })

  it("nunca hubo disputa y no se puede abrir: por qué, en la voz de cada parte", () => {
    expect(
      vistaDisputa({
        perspectiva: "medio",
        estadoAsignacion: "CONTENIDO_ENTREGADO",
        disputas: [],
        ahora: AHORA,
      })
    ).toEqual({
      tipo: "sin_disputa",
      bloqueo:
        "Podrás reportar un problema cuando cargues la evidencia de tu publicación.",
    })
    expect(
      vistaDisputa({
        perspectiva: "anunciante",
        estadoAsignacion: "VENCIDA_SIN_PUBLICAR",
        disputas: [],
        reclamoHasta: "2026-10-25T15:00:00.000Z",
        ahora: AHORA,
      })
    ).toEqual({
      tipo: "sin_disputa",
      bloqueo: expect.stringMatching(/Solo el medio puede reclamarla/),
    })
  })
})

describe("bloqueoParte", () => {
  it("cada estado cerrado explica por qué no admite disputas", () => {
    expect(bloqueoParte("anunciante", "ACEPTADA", "x")).toMatch(
      /El medio aún no publica/
    )
    expect(bloqueoParte("medio", "RECHAZADA", "x")).toMatch(/Desististe/)
    expect(bloqueoParte("anunciante", "CANCELADA", "x")).toMatch(
      /no se te cobra/
    )
    expect(bloqueoParte("medio", "PAGADA", "x")).toBe(
      "Esta publicación ya se liquidó: no admite disputas."
    )
    // Lo demás usa la explicación de la regla.
    expect(bloqueoParte("medio", "VENCIDA_SIN_PUBLICAR", "respaldo")).toBe(
      "respaldo"
    )
  })
})

describe("títulos", () => {
  it("el reclamo, el reporte y la disputa en la voz de cada parte", () => {
    const reclamo = disputa({ estadoOrigen: "VENCIDA_SIN_PUBLICAR" })
    expect(esReclamo(reclamo)).toBe(true)
    expect(
      tituloDisputa(
        { tipo: "abrir", modo: "reclamo", motivos: ["OTRO"], anteriores: [] },
        "medio"
      )
    ).toBe("Reclamar: sí publiqué")
    expect(
      tituloDisputa(
        {
          tipo: "abrir",
          modo: "problema",
          motivos: ["OTRO"],
          anteriores: [],
        },
        "anunciante"
      )
    ).toBe("Reportar un problema")
    expect(
      tituloDisputa(
        { tipo: "abierta", disputa: reclamo, anteriores: [] },
        "medio"
      )
    ).toBe("Tu reclamo")
    expect(
      tituloDisputa(
        { tipo: "abierta", disputa: reclamo, anteriores: [] },
        "anunciante"
      )
    ).toBe("Reclamo del medio")
    expect(
      tituloDisputa(
        { tipo: "cerrada", disputa: disputa(), anteriores: [], bloqueo: null },
        "medio"
      )
    ).toBe("Disputa")
  })

  it("sin `disputas.abrir`, la vista para abrir se titula como lo que consulta", () => {
    expect(
      tituloDisputa(
        { tipo: "abrir", modo: "reclamo", motivos: ["OTRO"], anteriores: [] },
        "medio",
        false
      )
    ).toBe("Reclamo")
    expect(
      tituloDisputa(
        { tipo: "abrir", modo: "problema", motivos: ["OTRO"], anteriores: [] },
        "anunciante",
        false
      )
    ).toBe("Disputa")
    // Las demás vistas no cambian.
    expect(
      tituloDisputa(
        {
          tipo: "abierta",
          disputa: disputa({ estadoOrigen: "VENCIDA_SIN_PUBLICAR" }),
          anteriores: [],
        },
        "medio",
        false
      )
    ).toBe("Tu reclamo")
  })

  it("sin `disputas.abrir`: por qué no puede escribir y a quién pedirlo", () => {
    expect(tituloSinPermiso("reclamo")).toBe(
      "Tu rol no permite reclamar esta publicación"
    )
    expect(tituloSinPermiso("problema")).toBe(
      "Tu rol no permite reportar problemas"
    )
    for (const texto of Object.values(SIN_PERMISO_DISPUTA)) {
      expect(texto).toMatch(/pídeselo a un administrador\.$/)
    }
  })
})

describe("motivos del formulario", () => {
  it("el reclamo precarga «Sí publiqué y no se registró» con «Otro»", () => {
    const opciones = opcionesMotivo("medio", "reclamo", [
      "OTRO",
      "INCUMPLIMIENTO",
    ])
    expect(opciones.map((opcion) => opcion.etiqueta)).toEqual([
      DESCRIPCION_RECLAMO,
      "No pude publicar por el anunciante",
    ])
    expect(opciones[0]?.sugerencia).toBe("Sí publiqué y no se registró")
    expect(motivoInicial("reclamo", ["OTRO", "INCUMPLIMIENTO"])).toBe("OTRO")
    // Reportar un problema no elige por la persona.
    expect(motivoInicial("problema", ["METRICAS", "OTRO"])).toBeNull()
  })

  it("un problema usa los textos de cada parte, con un ejemplo", () => {
    const [metricas] = opcionesMotivo("anunciante", "problema", ["METRICAS"])
    expect(metricas).toMatchObject({
      motivo: "METRICAS",
      etiqueta: "Métricas",
      sugerencia: "",
    })
    expect(metricas?.ayuda).toMatch(/no coinciden con la publicación/)
    expect(metricas?.ejemplo).toMatch(/^Ej\.: /)
  })

  it("al cambiar de motivo respeta lo que la persona escribió", () => {
    const [otro, incumplimiento] = opcionesMotivo("medio", "reclamo", [
      "OTRO",
      "INCUMPLIMIENTO",
    ])
    if (!otro || !incumplimiento) throw new Error("faltan opciones")
    // Intacta (la sugerencia del anterior): toma la del nuevo.
    expect(
      descripcionAlCambiar(DESCRIPCION_RECLAMO, otro, incumplimiento)
    ).toBe("")
    expect(descripcionAlCambiar("", incumplimiento, otro)).toBe(
      DESCRIPCION_RECLAMO
    )
    // Escrita: se respeta.
    expect(
      descripcionAlCambiar("Publiqué el 22 a las 7 p. m.", otro, incumplimiento)
    ).toBe("Publiqué el 22 a las 7 p. m.")
  })
})

describe("efectoApertura", () => {
  it("el reclamo: el cupo no vuelve y, con la razón, el plazo nuevo", () => {
    expect(
      efectoApertura({
        perspectiva: "medio",
        modo: "reclamo",
        estadoAsignacion: "VENCIDA_SIN_PUBLICAR",
        plazoRecargaHoras: 24,
      })
    ).toBe(
      "Mientras lo revisamos, el cupo no vuelve a tu cuenta. Si te damos la razón, tendrás 24 horas para cargar la evidencia."
    )
  })

  it("al anunciante: no se verifica ni se liquida y quién lo verá", () => {
    expect(
      efectoApertura({
        perspectiva: "anunciante",
        modo: "problema",
        estadoAsignacion: "METRICAS_CARGADAS",
      })
    ).toBe(
      "Mientras dure la disputa, esta publicación no se verifica ni se liquida. Lo que escribas lo verán el medio y el equipo AMO."
    )
  })

  it("al medio: con cortes pendientes, que siga cargándolos (D72)", () => {
    expect(
      efectoApertura({
        perspectiva: "medio",
        modo: "problema",
        estadoAsignacion: "EVIDENCIA_VALIDADA",
      })
    ).toMatch(/sigue cargándolos\.$/)
    // Verificada: ya no se verifica de nuevo, solo no se liquida.
    expect(
      efectoApertura({
        perspectiva: "medio",
        modo: "problema",
        estadoAsignacion: "VERIFICADA",
      })
    ).toBe("Mientras dure la disputa, esta publicación no se liquida.")
  })
})

describe("pruebas del primer mensaje", () => {
  it("el enlace es opcional y debe ser de la publicación de su cuenta", () => {
    expect(validarEnlacePublicacion("INSTAGRAM", "  ", "medioe2e")).toEqual({
      ok: true,
      url: null,
    })
    const valido = validarEnlacePublicacion(
      "INSTAGRAM",
      "https://www.instagram.com/p/C8xYz12AbCd/",
      "medioe2e"
    )
    expect(valido.ok).toBe(true)
    const perfil = validarEnlacePublicacion(
      "INSTAGRAM",
      "https://www.instagram.com/medioe2e/",
      "medioe2e"
    )
    expect(perfil.ok).toBe(false)
    // El error dice cómo se ve un enlace válido.
    expect(!perfil.ok && perfil.mensaje).toMatch(/Por ejemplo: https:\/\//)
    const largo = validarEnlacePublicacion(
      "TIKTOK",
      `https://www.tiktok.com/@medioe2e/video/${"1".repeat(600)}`,
      "medioe2e"
    )
    expect(!largo.ok && largo.mensaje).toBe(
      "El enlace admite hasta 500 caracteres."
    )
  })

  it("arma el primer mensaje con lo que haya", () => {
    expect(
      mensajePruebas({ modo: "reclamo", enlace: null, conAdjunto: false })
    ).toBeNull()
    expect(
      mensajePruebas({
        modo: "reclamo",
        enlace: "https://www.instagram.com/p/C8xYz12AbCd/",
        conAdjunto: true,
      })
    ).toBe(
      "Este es el enlace de mi publicación: https://www.instagram.com/p/C8xYz12AbCd/\nAdjunto la captura de mi publicación."
    )
    expect(
      mensajePruebas({ modo: "problema", enlace: null, conAdjunto: true })
    ).toBe("Adjunto una prueba.")
  })
})

describe("enlaceDisputa", () => {
  it("«Ver la disputa» mientras haya una abierta", () => {
    expect(
      enlaceDisputa({
        perspectiva: "medio",
        estado: "EN_DISPUTA",
        ahora: AHORA,
      })
    ).toEqual({ tipo: "ver", texto: "Ver la disputa" })
    expect(
      enlaceDisputa({
        perspectiva: "medio",
        estado: "EN_DISPUTA",
        disputa: { estado: "ABIERTA", estadoOrigen: "VENCIDA_SIN_PUBLICAR" },
        ahora: AHORA,
      })
    ).toEqual({ tipo: "ver", texto: "Ver tu reclamo" })
  })

  it("«Reportar un problema» en los estados disputables", () => {
    for (const estado of [
      "PUBLICADA",
      "EVIDENCIA_VALIDADA",
      "METRICAS_CARGADAS",
      "VERIFICADA",
    ] as const) {
      expect(
        enlaceDisputa({ perspectiva: "anunciante", estado, ahora: AHORA })
      ).toEqual({ tipo: "abrir", texto: "Reportar un problema" })
    }
  })

  it("una vencida: reclamar dentro del plazo (solo el medio); después, nada", () => {
    expect(
      enlaceDisputa({
        perspectiva: "medio",
        estado: "VENCIDA_SIN_PUBLICAR",
        disputa: null,
        reclamoHasta: "2026-10-25T15:00:00.000Z",
        ahora: AHORA,
      })
    ).toEqual({ tipo: "abrir", texto: "Reclamar: sí publiqué" })
    expect(
      enlaceDisputa({
        perspectiva: "anunciante",
        estado: "VENCIDA_SIN_PUBLICAR",
        reclamoHasta: "2026-10-25T15:00:00.000Z",
        ahora: AHORA,
      })
    ).toBeNull()
    expect(
      enlaceDisputa({
        perspectiva: "medio",
        estado: "VENCIDA_SIN_PUBLICAR",
        disputa: null,
        reclamoHasta: "2026-10-22T15:00:00.000Z",
        ahora: AHORA,
      })
    ).toBeNull()
  })

  it("sin `disputas.abrir` solo ofrece ver la que haya, nunca abrir otra", () => {
    const sinPermiso = { ahora: AHORA, puedeAbrir: false } as const
    expect(
      enlaceDisputa({
        ...sinPermiso,
        perspectiva: "anunciante",
        estado: "PUBLICADA",
      })
    ).toBeNull()
    expect(
      enlaceDisputa({
        ...sinPermiso,
        perspectiva: "medio",
        estado: "VENCIDA_SIN_PUBLICAR",
        disputa: null,
        reclamoHasta: "2026-10-25T15:00:00.000Z",
      })
    ).toBeNull()
    // Una disputable con la anterior ya cerrada: su resultado, no otro reporte.
    expect(
      enlaceDisputa({
        ...sinPermiso,
        perspectiva: "anunciante",
        estado: "METRICAS_CARGADAS",
        disputa: { estado: "DESCARTADA", estadoOrigen: "METRICAS_CARGADAS" },
      })
    ).toEqual({ tipo: "ver", texto: "Ver la disputa" })
    expect(
      enlaceDisputa({
        ...sinPermiso,
        perspectiva: "medio",
        estado: "EN_DISPUTA",
        disputa: { estado: "ABIERTA", estadoOrigen: "VENCIDA_SIN_PUBLICAR" },
      })
    ).toEqual({ tipo: "ver", texto: "Ver tu reclamo" })
    expect(
      enlaceDisputa({
        ...sinPermiso,
        perspectiva: "medio",
        estado: "VENCIDA_SIN_PUBLICAR",
        disputa: { estado: "RESUELTA", estadoOrigen: "VENCIDA_SIN_PUBLICAR" },
        reclamoHasta: "2026-10-20T15:00:00.000Z",
      })
    ).toEqual({ tipo: "ver", texto: "Ver tu reclamo" })
  })

  it("cerrada y sin otra posible, enlaza su resultado", () => {
    expect(
      enlaceDisputa({
        perspectiva: "anunciante",
        estado: "CANCELADA",
        disputa: { estado: "RESUELTA", estadoOrigen: "PUBLICADA" },
        ahora: AHORA,
      })
    ).toEqual({ tipo: "ver", texto: "Ver la disputa" })
    expect(
      enlaceDisputa({
        perspectiva: "medio",
        estado: "VENCIDA_SIN_PUBLICAR",
        disputa: { estado: "RESUELTA", estadoOrigen: "VENCIDA_SIN_PUBLICAR" },
        reclamoHasta: "2026-10-25T15:00:00.000Z",
        ahora: AHORA,
      })
    ).toEqual({ tipo: "ver", texto: "Ver tu reclamo" })
    expect(
      enlaceDisputa({ perspectiva: "medio", estado: "PAGADA", ahora: AHORA })
    ).toBeNull()
  })

  it("el plazo del reclamo en palabras", () => {
    expect(textoPlazoReclamo("2026-10-25T15:00:00.000Z")).toMatch(
      /^Tienes hasta el .+ para reclamar\.$/
    )
  })
})

describe("lo que acompaña a la disputa", () => {
  it("quién la abrió: la otra parte por su nombre; uno mismo y el equipo, no", () => {
    expect(
      autorAperturaParte({
        perspectiva: "medio",
        parte: "ANUNCIANTE",
        empresa: "Café La Montaña",
      })
    ).toBe("Café La Montaña")
    expect(
      autorAperturaParte({
        perspectiva: "anunciante",
        parte: "MEDIO",
        medio: "  Noticias del Sur ",
      })
    ).toBe("Noticias del Sur")
    expect(
      autorAperturaParte({ perspectiva: "medio", parte: "MEDIO", medio: "X" })
    ).toBeUndefined()
    expect(
      autorAperturaParte({ perspectiva: "anunciante", parte: "ADMIN" })
    ).toBeUndefined()
    expect(
      autorAperturaParte({
        perspectiva: "anunciante",
        parte: "MEDIO",
        medio: null,
      })
    ).toBeUndefined()
  })

  it("el contexto del resultado: el plazo nuevo solo al reabrir y la causa solo al cancelar", () => {
    const asignacion = {
      fechaLimitePublicacion: "2026-10-24T15:00:00.000Z",
      causaCancelacion: "FRAUDE" as const,
    }
    expect(
      contextoEstadoDisputa(
        disputa({
          ...RESUELTA,
          estadoOrigen: "VENCIDA_SIN_PUBLICAR",
          estadoResultante: "CONTENIDO_ENTREGADO",
        }),
        asignacion,
        24
      )
    ).toEqual({
      plazoRecargaHoras: 24,
      fechaLimitePublicacion: "2026-10-24T15:00:00.000Z",
      causaCancelacion: null,
    })
    expect(
      contextoEstadoDisputa(
        disputa({ ...RESUELTA, estadoResultante: "CANCELADA" }),
        asignacion,
        24
      )
    ).toEqual({
      plazoRecargaHoras: 24,
      fechaLimitePublicacion: null,
      causaCancelacion: "FRAUDE",
    })
    expect(contextoEstadoDisputa(disputa(), asignacion, 12)).toEqual({
      plazoRecargaHoras: 12,
      fechaLimitePublicacion: null,
      causaCancelacion: null,
    })
  })

  it("lo que sigue para el medio: la evidencia tras reabrir, sus cortes con una abierta", () => {
    const reabierta = disputa({
      ...RESUELTA,
      estadoOrigen: "VENCIDA_SIN_PUBLICAR",
      estadoResultante: "CONTENIDO_ENTREGADO",
    })
    expect(siguienteTrasDisputa(reabierta, "CONTENIDO_ENTREGADO")).toEqual({
      destino: "evidencia",
      texto: "Cargar la evidencia",
    })
    // Ya la cargó: no hay nada que hacer desde aquí.
    expect(siguienteTrasDisputa(reabierta, "PUBLICADA")).toBeNull()
    expect(
      siguienteTrasDisputa(disputa({ estadoOrigen: "PUBLICADA" }), "EN_DISPUTA")
    ).toEqual({ destino: "campana", texto: "Ver mis cortes de métricas" })
    expect(
      siguienteTrasDisputa(
        disputa({ estadoOrigen: "VENCIDA_SIN_PUBLICAR", motivo: "OTRO" }),
        "EN_DISPUTA"
      )
    ).toBeNull()
    expect(
      siguienteTrasDisputa(
        disputa({ estadoOrigen: "VERIFICADA" }),
        "EN_DISPUTA"
      )
    ).toBeNull()
  })
})

describe("avisoPaginaAnunciante", () => {
  it("con una disputa abierta: no se verifica ni se liquida y quién lo verá", () => {
    expect(
      avisoPaginaAnunciante({
        tipo: "abierta",
        disputa: disputa({ parte: "ANUNCIANTE", estadoOrigen: "PUBLICADA" }),
        anteriores: [],
      })
    ).toBe(
      "Mientras dure la disputa, esta publicación no se verifica ni se liquida. Lo que escribas lo verán el medio y el equipo AMO."
    )
  })

  it("sin permiso para escribir, solo lo que queda en pausa", () => {
    const abierta = (
      estadoOrigen: DisputaDetalle["estadoOrigen"]
    ): VistaDisputa => ({
      tipo: "abierta",
      disputa: disputa({ parte: "MEDIO", estadoOrigen }),
      anteriores: [],
    })
    expect(avisoPaginaAnunciante(abierta("PUBLICADA"), false)).toBe(
      "Mientras dure la disputa, esta publicación no se verifica ni se liquida."
    )
    expect(avisoPaginaAnunciante(abierta("VERIFICADA"), false)).toBe(
      "Mientras dure la disputa, esta publicación no se liquida."
    )
  })

  it("sin una abierta, o con el reclamo de una vencida, no hay aviso", () => {
    expect(
      avisoPaginaAnunciante({
        tipo: "abierta",
        disputa: disputa({ estadoOrigen: "VENCIDA_SIN_PUBLICAR" }),
        anteriores: [],
      })
    ).toBeNull()
    expect(
      avisoPaginaAnunciante({ tipo: "sin_disputa", bloqueo: "No." })
    ).toBeNull()
  })
})
