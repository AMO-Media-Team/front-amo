// @vitest-environment node
import { describe, expect, it } from "vitest"

import { fechasCampana, limitesCampana } from "./negocio-e2e"
import {
  type AsignacionALimpiar,
  calendarioPauta,
  type CampanaALimpiar,
  consumeCupo,
  CORTES_FIJOS,
  describirLimpieza,
  diasAtrasParaCorte,
  diasAtrasParaCortes,
  ETAPAS_PAUTA,
  fechaCorteE2E,
  fechaPublicacionE2E,
  horasParaCortes,
  identificadorPost,
  interaccionesDe,
  leerContenidoEntregado,
  llegaA,
  periodoPersonalizadoE2E,
  planCampanasPauta,
  planLimpiezaPauta,
  PREFIJO_PAUTA,
  PREFIJO_PAUTA_ANUNCIANTE,
  urlPostE2E,
  valoresMetricaE2E,
  viaLiberacion,
} from "./pauta-e2e"

const HORA = 3_600_000
const DIA = 24 * HORA

/** 10:20 del 22 de octubre de 2026 en Bogotá (UTC−5). */
const AHORA = new Date("2026-10-22T15:20:00Z")

describe("cortes", () => {
  it("piden abrir la ventana con un día de margen", () => {
    expect(CORTES_FIJOS.map(diasAtrasParaCorte)).toEqual([2, 4, 8])
    expect(diasAtrasParaCortes(["H24", "H72"])).toBe(4)
    expect(diasAtrasParaCortes(["PERSONALIZADO"])).toBe(0)
    expect(diasAtrasParaCortes([])).toBe(0)
  })

  it("piden publicar con una hora de margen sobre el corte más largo", () => {
    expect(horasParaCortes(["H24"])).toBe(25)
    expect(horasParaCortes(["H24", "D7"])).toBe(169)
    expect(horasParaCortes(["PERSONALIZADO"])).toBe(0)
  })
})

describe("etapas", () => {
  it("siguen el orden del flujo", () => {
    expect(ETAPAS_PAUTA[0]).toBe("ACEPTADA")
    expect(llegaA("PUBLICADA", "CONTENIDO_ENTREGADO")).toBe(true)
    expect(llegaA("PUBLICADA", "PUBLICADA")).toBe(true)
    expect(llegaA("PUBLICADA", "EVIDENCIA_VALIDADA")).toBe(false)
    expect(llegaA("VERIFICADA", "METRICAS_CARGADAS")).toBe(true)
  })
})

describe("calendarioPauta", () => {
  it("abre la ventana hoy a las 00:00 (Bogotá) con la límite tras la anticipación", () => {
    const campana = limitesCampana(fechasCampana(AHORA))
    const calendario = calendarioPauta({
      ahora: AHORA,
      anticipacionHoras: 24,
      diasAtras: 0,
      campana,
    })
    expect(calendario.ventanaInicio).toEqual(new Date("2026-10-22T05:00:00Z"))
    // 10:20 + 72 h = 25 oct 10:20 → 11:00 (Bogotá).
    expect(calendario.fechaLimite).toEqual(new Date("2026-10-25T16:00:00Z"))
    // Una semana desde el día siguiente a la límite.
    expect(calendario.ventanaFin).toEqual(new Date("2026-11-02T05:00:00Z"))
  })

  it("abre la ventana días atrás si la campaña empezó antes", () => {
    const campana = limitesCampana(fechasCampana(AHORA, 30, 8))
    const calendario = calendarioPauta({
      ahora: AHORA,
      anticipacionHoras: 24,
      diasAtras: 8,
      campana,
    })
    expect(calendario.ventanaInicio).toEqual(new Date("2026-10-14T05:00:00Z"))
    expect(calendario.ventanaInicio).toEqual(campana.inicio)
    expect(calendario.fechaLimite.getTime()).toBeLessThanOrEqual(
      calendario.ventanaFin.getTime()
    )
  })

  it("rechaza una ventana que empieza antes que la campaña", () => {
    const campana = limitesCampana(fechasCampana(AHORA))
    expect(() =>
      calendarioPauta({
        ahora: AHORA,
        anticipacionHoras: 24,
        diasAtras: 2,
        campana,
      })
    ).toThrow(/diasAtras ≥ 2/)
    expect(() =>
      calendarioPauta({
        ahora: AHORA,
        anticipacionHoras: 24,
        diasAtras: -1,
        campana,
      })
    ).toThrow(RangeError)
  })

  it("recorta la ventana al final de la campaña y avisa si no cabe", () => {
    const corta = limitesCampana(fechasCampana(AHORA, 4))
    const calendario = calendarioPauta({
      ahora: AHORA,
      anticipacionHoras: 24,
      diasAtras: 0,
      campana: corta,
    })
    expect(calendario.ventanaFin).toEqual(corta.fin)
    expect(() =>
      calendarioPauta({
        ahora: AHORA,
        anticipacionHoras: 24,
        diasAtras: 0,
        campana: limitesCampana(fechasCampana(AHORA, 1)),
      })
    ).toThrow(/campaña más larga/)
  })

  it("respeta una fecha límite dada (también una vencida)", () => {
    const campana = limitesCampana(fechasCampana(AHORA))
    const limite = new Date(AHORA.getTime() - HORA)
    const calendario = calendarioPauta({
      ahora: AHORA,
      anticipacionHoras: 24,
      diasAtras: 0,
      fechaLimite: limite,
      campana,
    })
    expect(calendario.fechaLimite).toEqual(limite)
    expect(calendario.ventanaFin.getTime()).toBeGreaterThan(AHORA.getTime())
  })
})

describe("fechas de publicación y de corte", () => {
  const ventana = {
    inicio: new Date("2026-10-20T05:00:00Z"),
    fin: new Date("2026-11-02T05:00:00Z"),
  }

  it("publica hace las horas pedidas (y un minuto) dentro de la ventana", () => {
    expect(fechaPublicacionE2E({ ahora: AHORA, ventana })).toEqual(
      new Date(AHORA.getTime() - 60_000)
    )
    expect(
      fechaPublicacionE2E({ ahora: AHORA, haceHoras: 25, ventana })
    ).toEqual(new Date(AHORA.getTime() - 25 * HORA - 60_000))
  })

  it("explica cómo abrir la ventana si la publicación cae antes", () => {
    expect(() =>
      fechaPublicacionE2E({ ahora: AHORA, haceHoras: 169, ventana })
    ).toThrow(/ventanaDesdeHoy/)
    expect(() =>
      fechaPublicacionE2E({ ahora: AHORA, haceHoras: -1, ventana })
    ).toThrow(RangeError)
    expect(() =>
      fechaPublicacionE2E({
        ahora: AHORA,
        ventana: {
          inicio: ventana.inicio,
          fin: new Date(AHORA.getTime() - DIA),
        },
      })
    ).toThrow(/terminó/)
  })

  it("carga un corte fijo cuando se cumplió (ahora, o la hora exacta con la tolerancia)", () => {
    const publicada = new Date(AHORA.getTime() - 25 * HORA)
    expect(
      fechaCorteE2E({ ahora: AHORA, fechaPublicacion: publicada, corte: "H24" })
    ).toEqual(AHORA)
    const casi = new Date(AHORA.getTime() - 24 * HORA + 5 * 60_000)
    expect(
      fechaCorteE2E({ ahora: AHORA, fechaPublicacion: casi, corte: "H24" })
    ).toEqual(new Date(casi.getTime() + 24 * HORA))
  })

  it("no carga un corte que no se ha cumplido ni una fecha futura", () => {
    const reciente = new Date(AHORA.getTime() - HORA)
    expect(() =>
      fechaCorteE2E({ ahora: AHORA, fechaPublicacion: reciente, corte: "H24" })
    ).toThrow(/haceHoras ≥ 25/)
    expect(() =>
      fechaCorteE2E({
        ahora: AHORA,
        fechaPublicacion: new Date(AHORA.getTime() - 30 * HORA),
        corte: "H72",
        fechaCorte: AHORA,
      })
    ).toThrow(/H72/)
    expect(() =>
      fechaCorteE2E({
        ahora: AHORA,
        fechaPublicacion: reciente,
        corte: "PERSONALIZADO",
        fechaCorte: new Date(AHORA.getTime() + HORA),
      })
    ).toThrow(/futuro/)
  })

  it("el personalizado va del día de la publicación a la fecha del corte", () => {
    const publicada = new Date(AHORA.getTime() - HORA)
    const corte = fechaCorteE2E({
      ahora: AHORA,
      fechaPublicacion: publicada,
      corte: "PERSONALIZADO",
    })
    expect(corte).toEqual(AHORA)
    expect(periodoPersonalizadoE2E(publicada, corte)).toEqual({
      desde: new Date("2026-10-22T05:00:00Z"),
      hasta: AHORA,
    })
    expect(() =>
      fechaCorteE2E({
        ahora: AHORA,
        fechaPublicacion: publicada,
        corte: "PERSONALIZADO",
        fechaCorte: publicada,
      })
    ).toThrow(/posterior/)
  })
})

describe("valoresMetricaE2E", () => {
  it("Instagram y Facebook: alcance e impresiones, sin espectadores", () => {
    for (const plataforma of ["INSTAGRAM", "FACEBOOK"] as const) {
      const valores = valoresMetricaE2E(plataforma, "H24")
      expect(valores.alcance).not.toBeNull()
      expect(valores.impresiones).toBeGreaterThanOrEqual(valores.alcance ?? 0)
      expect(valores.espectadores_unicos).toBeNull()
      expect(valores.reproducciones).toBeNull()
      expect(interaccionesDe(valores)).toBeLessThanOrEqual(
        valores.impresiones ?? 0
      )
    }
  })

  it("TikTok: reproducciones y espectadores únicos, sin alcance ni impresiones", () => {
    const valores = valoresMetricaE2E("TIKTOK", "H72")
    expect(valores.alcance).toBeNull()
    expect(valores.impresiones).toBeNull()
    expect(valores.reproducciones).toBeGreaterThanOrEqual(
      valores.espectadores_unicos ?? 0
    )
    expect(interaccionesDe(valores)).toBeLessThanOrEqual(
      valores.reproducciones ?? 0
    )
    expect(valores.porcentaje_reproduccion_completa).toBeLessThanOrEqual(100)
  })

  it("cada corte acumula más que el anterior (la BD rechaza caídas)", () => {
    const [h24, h72, d7] = CORTES_FIJOS.map((corte) =>
      valoresMetricaE2E("INSTAGRAM", corte)
    )
    expect(h72.alcance).toBeGreaterThan(h24.alcance ?? 0)
    expect(d7.impresiones).toBeGreaterThan(h72.impresiones ?? 0)
    expect(interaccionesDe(d7)).toBeGreaterThan(interaccionesDe(h72))
  })

  it("los ajustes reemplazan los valores que se quieren probar", () => {
    const valores = valoresMetricaE2E("INSTAGRAM", "H24", {
      alcance: 20_000,
      impresiones: 10_000,
    })
    expect(valores).toMatchObject({ alcance: 20_000, impresiones: 10_000 })
    expect(valores.me_gusta).toBe(600)
  })
})

/** Mismo patrón que `publicaciones_url_chk` (migración e2_integridad_ejecucion). */
const URL_CHK = {
  FACEBOOK:
    /^https:\/\/(www\.facebook\.com\/([^/?#]+\/(posts|videos|photos)\/([^/?#]+\/)?[^/?#]+|reel\/[^/?#]+|share\/([prv]\/)?[^/?#]+|groups\/[^/?#]+\/(posts|permalink)\/[^/?#]+|stories\/[^/?#]+(\/[^/?#]+)?|(watch|video\.php)\?(.*&)?v=[^&#]+|(photo|photo\.php)\?(.*&)?fbid=[^&#]+|(permalink|story)\.php\?(.*&)?story_fbid=[^&#]+|groups\/[^/?#]+\?(.*&)?multi_permalinks=[^&#]+)|fb\.watch\/[A-Za-z0-9_-]+)\/?([?&][^#]*)?$/i,
  INSTAGRAM:
    /^https:\/\/www\.instagram\.com\/((p|reel)\/[A-Za-z0-9_-]+|stories\/[A-Za-z0-9._]+\/[0-9]+)\/?$/i,
  TIKTOK:
    /^https:\/\/(www\.tiktok\.com\/(@[A-Za-z0-9._-]+\/(video|photo)\/[0-9]+|t\/[A-Za-z0-9]+)|vm\.tiktok\.com\/[A-Za-z0-9]+)\/?$/i,
} as const

describe("urlPostE2E", () => {
  const id = identificadorPost(1_790_000_000_000, () => 0.123_456)

  it("arma un identificador distinto por llamada", () => {
    expect(id).toEqual({
      codigo: `E2E${(1_790_000_000_000).toString(36)}${(123_456).toString(36)}`,
      digitos: "1790000000000123456",
    })
    expect(identificadorPost()).not.toEqual(identificadorPost())
  })

  it.each([
    ["INSTAGRAM", "POST_FEED", "https://www.instagram.com/p/"],
    ["INSTAGRAM", "CARRUSEL", "https://www.instagram.com/p/"],
    ["INSTAGRAM", "REEL", "https://www.instagram.com/reel/"],
    [
      "INSTAGRAM",
      "HISTORIA",
      "https://www.instagram.com/stories/medio.e2e.amo/",
    ],
    ["FACEBOOK", "POST_FEED", "https://www.facebook.com/medio.e2e.amo/posts/"],
    ["FACEBOOK", "VIDEO", "https://www.facebook.com/medio.e2e.amo/videos/"],
    ["FACEBOOK", "REEL", "https://www.facebook.com/reel/"],
    ["FACEBOOK", "HISTORIA", "https://www.facebook.com/stories/"],
    ["TIKTOK", "VIDEO", "https://www.tiktok.com/@medio.e2e.amo/video/"],
  ] as const)(
    "%s %s: forma de publicación que acepta la BD",
    (plataforma, formato, prefijo) => {
      const url = urlPostE2E({
        plataforma,
        formato,
        handle: "@medio.e2e.amo",
        id,
      })
      expect(url.startsWith(prefijo)).toBe(true)
      expect(url).toMatch(URL_CHK[plataforma])
    }
  )
})

describe("leerContenidoEntregado", () => {
  it("lee el creativo vigente que devuelve la descarga", () => {
    expect(
      leerContenidoEntregado({
        asignacion_id: "a",
        creativo_id: "c",
        version: 2,
        tipo: "IMAGEN",
        copy_sugerido: "Hola",
        hashtags: ["#AMOe2e", 3],
        menciones: null,
        enlace_destino: null,
        archivos: [
          {
            id: "f",
            archivo_path: "oferta/o/c/x.png",
            mime: "image/png",
            tamano_bytes: 10,
            orden: 0,
          },
          "basura",
        ],
      })
    ).toEqual({
      creativoId: "c",
      version: 2,
      tipo: "IMAGEN",
      copySugerido: "Hola",
      hashtags: ["#AMOe2e"],
      menciones: [],
      enlaceDestino: null,
      archivos: [
        {
          id: "f",
          archivoPath: "oferta/o/c/x.png",
          mime: "image/png",
          tamanoBytes: 10,
          orden: 0,
        },
      ],
    })
  })

  it("falla si no tiene la forma esperada", () => {
    expect(() => leerContenidoEntregado(null)).toThrow(TypeError)
    expect(() => leerContenidoEntregado({ creativo_id: "c" })).toThrow(
      /version/
    )
  })
})

describe("consumeCupo", () => {
  it("replica private.consume_cupo", () => {
    expect(consumeCupo("ACEPTADA", null)).toBe(true)
    expect(consumeCupo("VERIFICADA", null)).toBe(true)
    expect(consumeCupo("RECHAZADA", null)).toBe(false)
    expect(consumeCupo("CANCELADA", null)).toBe(false)
    expect(consumeCupo("EN_DISPUTA", "PUBLICADA")).toBe(true)
    expect(consumeCupo("EN_DISPUTA", "VENCIDA_SIN_PUBLICAR")).toBe(false)
  })
})

const E2E = "e2e00000-0000-4000-8000-00000000a001"
const DEMO = "01a16692-0000-7000-8000-000000000001"
const MANANA = new Date(AHORA.getTime() + DIA).toISOString()
const AYER = new Date(AHORA.getTime() - DIA).toISOString()

function asignacion(
  id: string,
  cambios: Partial<AsignacionALimpiar> = {}
): AsignacionALimpiar {
  return {
    id,
    estado: "ACEPTADA",
    estadoPrevioDisputa: null,
    contenidoDescargadoAt: null,
    conDescarga: false,
    campanaId: "campana-demo",
    campanaNombre: "Campaña demo",
    anuncianteId: DEMO,
    fechaLimiteAceptacion: MANANA,
    ...cambios,
  }
}

describe("viaLiberacion", () => {
  it("desiste solo si el medio aún puede; si no, cancela el equipo AMO", () => {
    expect(viaLiberacion(asignacion("a"), AHORA)).toBe("DESISTIR")
    expect(
      viaLiberacion(asignacion("a", { fechaLimiteAceptacion: AYER }), AHORA)
    ).toBe("CANCELAR")
    expect(
      viaLiberacion(asignacion("a", { contenidoDescargadoAt: AYER }), AHORA)
    ).toBe("CANCELAR")
    expect(viaLiberacion(asignacion("a", { estado: "PUBLICADA" }), AHORA)).toBe(
      "CANCELAR"
    )
  })
})

describe("planLimpiezaPauta", () => {
  const opciones = { anunciantesE2E: [E2E], ahora: AHORA }

  it("las campañas de la pauta se limpian enteras (una vez cada una)", () => {
    const plan = planLimpiezaPauta(
      [
        asignacion("a", {
          anuncianteId: E2E,
          campanaId: "p1",
          campanaNombre: `${PREFIJO_PAUTA} x1`,
        }),
        asignacion("b", {
          anuncianteId: E2E,
          campanaId: "p1",
          campanaNombre: `${PREFIJO_PAUTA} x1`,
          estado: "PUBLICADA",
        }),
        asignacion("c", {
          anuncianteId: E2E,
          campanaId: "p2",
          campanaNombre: `${PREFIJO_PAUTA} x2`,
        }),
      ],
      opciones
    )
    expect(plan).toEqual({
      campanas: ["p1", "p2"],
      liberar: [],
      borrar: [],
      conservar: [],
    })
  })

  it("no toca las campañas E2E de otro spec", () => {
    const plan = planLimpiezaPauta(
      [
        asignacion("a", {
          anuncianteId: E2E,
          campanaNombre: `${PREFIJO_PAUTA_ANUNCIANTE} x`,
        }),
      ],
      opciones
    )
    expect(plan.conservar).toEqual([
      {
        id: "a",
        motivo: `campaña «${PREFIJO_PAUTA_ANUNCIANTE} x» de otro spec`,
      },
    ])
    expect(plan.borrar).toEqual([])
  })

  it("en campañas ajenas libera el cupo antes de borrar", () => {
    const plan = planLimpiezaPauta(
      [
        asignacion("desiste"),
        asignacion("cancela", {
          estado: "CONTENIDO_ENTREGADO",
          contenidoDescargadoAt: AYER,
          conDescarga: true,
        }),
        asignacion("tarde", { fechaLimiteAceptacion: AYER }),
        asignacion("rechazo", { estado: "RECHAZADA" }),
      ],
      opciones
    )
    expect(plan.liberar).toEqual([
      { id: "desiste", via: "DESISTIR" },
      { id: "cancela", via: "CANCELAR" },
      { id: "tarde", via: "CANCELAR" },
    ])
    expect(plan.borrar).toEqual(["desiste", "tarde", "rechazo"])
    expect(plan.conservar).toEqual([
      {
        id: "cancela",
        motivo: "tiene descargas: queda cancelada (la BD no deja borrarla)",
      },
    ])
  })

  it("nada liquidado, pagado o en disputa se toca; lo cancelado con descargas se conserva", () => {
    const plan = planLimpiezaPauta(
      [
        asignacion("l", { estado: "LIQUIDADA" }),
        asignacion("d", {
          estado: "EN_DISPUTA",
          estadoPrevioDisputa: "PUBLICADA",
        }),
        asignacion("x", { estado: "CANCELADA", conDescarga: true }),
      ],
      opciones
    )
    expect(plan.liberar).toEqual([])
    expect(plan.borrar).toEqual([])
    expect(plan.conservar.map((c) => c.id)).toEqual(["l", "d", "x"])
  })
})

describe("planCampanasPauta", () => {
  const campana = (
    id: string,
    asignaciones: CampanaALimpiar["asignaciones"],
    estado: CampanaALimpiar["estado"] = "ACTIVA"
  ): CampanaALimpiar => ({ id, estado, asignaciones })
  const fila = (
    id: string,
    estado: AsignacionALimpiar["estado"],
    conDescarga = false
  ) => ({ id, estado, estadoPrevioDisputa: null, conDescarga })

  it("sin descargas se borran enteras", () => {
    const plan = planCampanasPauta([
      campana("c1", [fila("a", "ACEPTADA"), fila("b", "RECHAZADA")]),
      campana("c2", []),
    ])
    expect(plan.borrar).toEqual(["c1", "c2"])
    expect(plan.retener).toEqual([])
    expect(plan.cancelar).toEqual([])
  })

  it("con descargas: cancela lo que ocupa cupo, borra lo demás y retiene la campaña", () => {
    const plan = planCampanasPauta([
      campana("c1", [
        fila("descargada", "PUBLICADA", true),
        fila("aceptada", "ACEPTADA"),
        fila("rechazo", "RECHAZADA"),
        fila("pagada", "PAGADA", true),
      ]),
      campana("c2", [fila("cancelada", "CANCELADA", true)], "CANCELADA"),
    ])
    expect(plan.borrar).toEqual([])
    expect(plan.retener).toEqual(["c1", "c2"])
    expect(plan.cancelarCampanas).toEqual(["c1"])
    expect(plan.cancelar).toEqual(["descargada", "aceptada"])
    expect(plan.borrarAsignaciones).toEqual(["aceptada", "rechazo"])
    expect(plan.conservar.map((c) => c.id)).toEqual(["pagada"])
  })
})

describe("describirLimpieza", () => {
  it("resume lo hecho o dice que no había nada", () => {
    const vacio = { campanas: [], liberar: [], borrar: [], conservar: [] }
    expect(
      describirLimpieza({
        plan: vacio,
        campanasBorradas: 0,
        campanasArchivadas: 0,
      })
    ).toBe("sin pauta de pruebas anteriores")
    expect(
      describirLimpieza({
        plan: {
          ...vacio,
          liberar: [{ id: "a", via: "DESISTIR" }],
          borrar: ["a"],
        },
        campanasBorradas: 2,
        campanasArchivadas: 1,
      })
    ).toBe(
      "2 campaña(s) de la pauta borradas; 1 campaña(s) con descargas canceladas y archivadas; 1 asignación(es) de otras campañas liberadas; 1 asignación(es) de otras campañas borradas"
    )
  })
})
