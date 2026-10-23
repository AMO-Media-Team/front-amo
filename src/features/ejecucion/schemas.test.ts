import { describe, expect, it } from "vitest"

import {
  type ReglasEvidencia,
  type ReglasMetricas,
  conReglasEvidencia,
  conReglasMetricas,
  datosMetricas,
  esquemaEvidencia,
  esquemaGuardarMetricas,
  esquemaMetricas,
  esquemaPrepararCaptura,
  esquemaRegistrarEvidencia,
  fechaPublicacionDe,
  leerCifras,
  type ValoresEvidencia,
  type ValoresFormularioMetricas,
} from "./schemas"

const ASIGNACION = "01a16692-e9e2-7fb6-9d68-1041425b1b76"
const AHORA = new Date("2026-10-23T20:00:00.000Z") // 3:00 p. m. en Bogotá

function errores(resultado: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}): Record<string, string> {
  return Object.fromEntries(
    (resultado.error?.issues ?? []).map((issue) => [
      issue.path.join("."),
      issue.message,
    ])
  )
}

// ── Evidencia ────────────────────────────────────────────────────────────────

const REGLAS_EVIDENCIA: ReglasEvidencia = {
  plataforma: "INSTAGRAM",
  formato: "REEL",
  cuenta: "noticias.pasto",
  ventanaInicio: "2026-10-20T05:00:00.000Z",
  ventanaFin: "2026-10-30T04:59:00.000Z",
  contenidoDescargadoAt: null,
  ahora: AHORA,
}

const EVIDENCIA: ValoresEvidencia = {
  asignacionId: ASIGNACION,
  numero: 1,
  url: "https://www.instagram.com/reel/C9AbCdEfGhI/?igsh=abc",
  dia: "2026-10-22",
  hora: "19:30",
  etiquetaConfirmada: true,
}

function validarEvidencia(cambios: Partial<ValoresEvidencia>) {
  return conReglasEvidencia(esquemaEvidencia, REGLAS_EVIDENCIA).safeParse({
    ...EVIDENCIA,
    ...cambios,
  })
}

describe("evidencia de publicación (MED-013)", () => {
  it("acepta una evidencia completa dentro de la ventana", () => {
    expect(validarEvidencia({}).success).toBe(true)
    expect(fechaPublicacionDe(EVIDENCIA)).toBe("2026-10-23T00:30:00.000Z")
  })

  it("rechaza un enlace de Instagram que no es un post, reel o historia, con el formato esperado", () => {
    const resultado = validarEvidencia({
      url: "https://www.instagram.com/explore/tags/pasto/",
    })
    expect(errores(resultado).url).toBe(
      "Ese enlace de Instagram no lleva a una publicación, un reel o una historia. Para esta oferta, copia el enlace del reel."
    )
  })

  it("INT-002: un enlace de Facebook en una oferta de TikTok se rechaza", () => {
    const resultado = conReglasEvidencia(esquemaEvidencia, {
      ...REGLAS_EVIDENCIA,
      plataforma: "TIKTOK",
      formato: "VIDEO",
    }).safeParse({
      ...EVIDENCIA,
      url: "https://www.facebook.com/reel/1234567890123456",
    })
    expect(errores(resultado).url).toMatch(/es de Facebook.*TikTok/)
  })

  it("sin confirmar la etiqueta de publicidad no se envía", () => {
    expect(errores(validarEvidencia({ etiquetaConfirmada: false }))).toEqual({
      etiquetaConfirmada:
        "Confirma que tu publicación lleva la etiqueta de publicidad.",
    })
  })

  it("la fecha debe caer en la ventana y no en el futuro", () => {
    expect(errores(validarEvidencia({ dia: "2026-10-19" })).dia).toMatch(
      /^La oferta permite publicar desde el /
    )
    expect(
      errores(validarEvidencia({ dia: "2026-10-23", hora: "16:00" })).hora
    ).toBe("La hora de publicación no puede estar en el futuro.")
    // El desfase de reloj que admite la BD (15 min) no se marca.
    expect(validarEvidencia({ dia: "2026-10-23", hora: "15:10" }).success).toBe(
      true
    )
  })

  it("no antes de descargar el contenido: al minuto, y en la hora si es el mismo día", () => {
    // 2:40:30 p. m. del 21 en Bogotá.
    const reglas = {
      ...REGLAS_EVIDENCIA,
      contenidoDescargadoAt: "2026-10-21T19:40:30.000Z",
    }
    const validar = (dia: string, hora: string) =>
      conReglasEvidencia(esquemaEvidencia, reglas).safeParse({
        ...EVIDENCIA,
        dia,
        hora,
      })
    expect(errores(validar("2026-10-21", "14:39"))).toEqual({
      hora: "La publicación no puede ser anterior a la descarga del contenido (21 de oct de 2026, 2:40 p. m.).",
    })
    expect(errores(validar("2026-10-20", "18:00")).dia).toMatch(
      /^La publicación no puede ser anterior a la descarga del contenido/
    )
    expect(validar("2026-10-21", "14:40").success).toBe(true)
    // Una descarga antes de abrir la ventana no adelanta el mínimo.
    expect(
      errores(
        conReglasEvidencia(esquemaEvidencia, {
          ...REGLAS_EVIDENCIA,
          contenidoDescargadoAt: "2026-10-18T15:00:00.000Z",
        }).safeParse({ ...EVIDENCIA, dia: "2026-10-19" })
      ).dia
    ).toMatch(/^La oferta permite publicar desde el /)
  })

  it("el enlace no puede nombrar otra cuenta (historia de Instagram)", () => {
    expect(
      errores(
        validarEvidencia({
          url: "https://www.instagram.com/stories/otro.medio/3456789012345678901",
        })
      ).url
    ).toBe(
      "El enlace es de @otro.medio y esta campaña es con @noticias.pasto. Pega el enlace de la publicación en tu cuenta."
    )
    expect(
      validarEvidencia({
        url: "https://www.instagram.com/stories/Noticias.Pasto/3456789012345678901",
      }).success
    ).toBe(true)
  })

  it("pide el día y la hora", () => {
    expect(errores(validarEvidencia({ dia: "" })).dia).toBe(
      "Elige el día en que publicaste."
    )
    expect(errores(validarEvidencia({ hora: "7 pm" })).hora).toBe(
      "Escribe la hora en que publicaste, como 15:30."
    )
  })

  it("el servidor recibe además la captura (o null para conservar la anterior)", () => {
    expect(
      esquemaRegistrarEvidencia.safeParse({ ...EVIDENCIA, captura: null })
        .success
    ).toBe(true)
  })
})

describe("capturas", () => {
  it("solo imágenes del tamaño del bucket de evidencias", () => {
    const descripcion = {
      nombre: "panel.pdf",
      tipo: "application/pdf",
      tamano: 100,
      sha256: null,
      dimensiones: null,
      duracionSeg: null,
      conMiniatura: false,
    }
    const resultado = esquemaPrepararCaptura.safeParse({
      asignacionId: ASIGNACION,
      tipo: "publicacion",
      descripcion,
    })
    expect(resultado.success).toBe(false)
    expect(
      esquemaPrepararCaptura.safeParse({
        asignacionId: ASIGNACION,
        tipo: "metrica",
        descripcion: { ...descripcion, nombre: "a.webp", tipo: "image/webp" },
      }).success
    ).toBe(true)
  })
})

// ── Métricas ─────────────────────────────────────────────────────────────────

const PUBLICADA = "2026-10-21T19:00:00.000Z" // 2:00 p. m. del 21 en Bogotá

const METRICAS: ValoresFormularioMetricas = {
  asignacionId: ASIGNACION,
  numero: 1,
  corte: "H24",
  metricaId: null,
  dia: "2026-10-23",
  hora: "14:30",
  periodoDesde: "",
  periodoHasta: "",
  alcance: "1.200",
  impresiones: "2.500",
  reproducciones: "3.100",
  espectadoresUnicos: "",
  meGusta: "150",
  comentarios: "12",
  compartidos: "8",
  guardados: "20",
  clicsEnlace: "",
  visitasPerfil: "",
  tiempoPromedioS: "",
  porcentajeCompleto: "",
}

const REGLAS_METRICAS: ReglasMetricas = {
  plataforma: "INSTAGRAM",
  formato: "REEL",
  corte: "H24",
  fechaPublicacion: PUBLICADA,
  otros: [],
  tolerancia: 0.02,
  ahora: AHORA,
}

function validarMetricas(
  cambios: Partial<ValoresFormularioMetricas>,
  reglas: Partial<ReglasMetricas> = {}
) {
  return conReglasMetricas(esquemaMetricas, {
    ...REGLAS_METRICAS,
    ...reglas,
  }).safeParse({ ...METRICAS, ...cambios })
}

describe("métricas por corte (MED-014, INT-005)", () => {
  it("acepta un corte completo y coherente", () => {
    expect(errores(validarMetricas({}))).toEqual({})
  })

  it("pide las cifras obligatorias de la plataforma", () => {
    const resultado = errores(validarMetricas({ alcance: "", guardados: "" }))
    expect(resultado.alcance).toBe("Escribe la cifra que muestra el panel.")
    expect(resultado.guardados).toBe(
      "Escribe la cifra del panel. Si no tuvo ninguno, escribe 0."
    )
  })

  it("rechaza abreviaturas, decimales y negativos en los conteos", () => {
    const resultado = errores(
      validarMetricas({ alcance: "1,2 mil", meGusta: "1,5", comentarios: "-3" })
    )
    expect(resultado.alcance).toMatch(/sin letras/)
    expect(resultado.meGusta).toMatch(/sin decimales/)
    expect(resultado.comentarios).toBe("La cifra no puede ser negativa.")
  })

  it("INT-005: impresiones bajo el alcance e interacciones sobre las impresiones", () => {
    const resultado = errores(
      validarMetricas({ impresiones: "1.000", meGusta: "990" })
    )
    expect(resultado.impresiones).toMatch(/no pueden ser menos que el alcance/)
    expect(resultado.interacciones).toMatch(/no pueden superar las impresiones/)
  })

  it("INT-005: un corte de 7 días con menos alcance que el de 72 h no se registra", () => {
    const resultado = errores(
      validarMetricas(
        { corte: "D7", dia: "2026-10-28", hora: "15:00" },
        {
          corte: "D7",
          ahora: new Date("2026-10-28T21:00:00.000Z"),
          otros: [
            {
              id: "h72",
              corte: "H72",
              estado: "PENDIENTE",
              alcance: 1500,
              impresiones: 2400,
              interacciones: 180,
            },
          ],
        }
      )
    )
    expect(resultado.alcance).toMatch(
      /^En el corte de 72 horas, el alcance fue 1\.500/
    )
  })

  it("la captura es del corte cumplido y no del futuro", () => {
    expect(
      errores(validarMetricas({ dia: "2026-10-22", hora: "13:59" })).hora
    ).toMatch(/^Este corte se cumple el /)
    expect(validarMetricas({ dia: "2026-10-22", hora: "14:00" }).success).toBe(
      true
    )
    expect(errores(validarMetricas({ hora: "15:30" })).hora).toBe(
      "La fecha de la captura no puede estar en el futuro."
    )
  })

  it("en TikTok pide tiempo y reproducción completa con sus límites", () => {
    const resultado = errores(
      validarMetricas(
        {
          alcance: "",
          impresiones: "",
          reproducciones: "5.000",
          espectadoresUnicos: "4.000",
          guardados: "",
          tiempoPromedioS: "12,555",
          porcentajeCompleto: "120",
        },
        { plataforma: "TIKTOK", formato: "VIDEO" }
      )
    )
    expect(resultado).toEqual({
      tiempoPromedioS: "Usa máximo dos decimales.",
      porcentajeCompleto: "El porcentaje va de 0 a 100.",
    })
  })

  describe("corte personalizado", () => {
    const personalizado = {
      corte: "PERSONALIZADO" as const,
      periodoDesde: "2026-10-21",
      periodoHasta: "2026-10-22",
    }
    const reglas = { corte: "PERSONALIZADO" as const }

    it("guarda el periodo del primer día al fin del último", () => {
      const resultado = conReglasMetricas(esquemaMetricas, {
        ...REGLAS_METRICAS,
        ...reglas,
      }).safeParse({ ...METRICAS, ...personalizado })
      expect(resultado.success).toBe(true)
      if (!resultado.success) return
      expect(datosMetricas(resultado.data, REGLAS_METRICAS)).toMatchObject({
        fechaCorte: "2026-10-23T19:30:00.000Z",
        periodoDesde: "2026-10-21T05:00:00.000Z",
        periodoHasta: "2026-10-23T05:00:00.000Z",
        valores: { alcance: 1200, impresiones: 2500, meGusta: 150 },
      })
    })

    it("pide los días y los ubica entre la publicación y la captura", () => {
      expect(
        errores(validarMetricas({ ...personalizado, periodoDesde: "" }, reglas))
          .periodoDesde
      ).toBe("Elige el primer día del periodo.")
      expect(
        errores(
          validarMetricas(
            { ...personalizado, periodoDesde: "2026-10-20" },
            reglas
          )
        ).periodoDesde
      ).toMatch(/como pronto, el día de la publicación/)
      expect(
        errores(
          validarMetricas(
            {
              ...personalizado,
              periodoDesde: "2026-10-22",
              periodoHasta: "2026-10-21",
            },
            reglas
          )
        ).periodoHasta
      ).toBe("El último día no puede ser anterior al primero.")
      expect(
        errores(
          validarMetricas(
            { ...personalizado, periodoHasta: "2026-10-24" },
            reglas
          )
        ).periodoHasta
      ).toBe("El periodo no puede terminar después del día de la captura.")
    })

    it("no espera al corte ni se compara con los cortes fijos", () => {
      expect(
        validarMetricas(
          {
            ...personalizado,
            dia: "2026-10-21",
            hora: "20:00",
            periodoHasta: "2026-10-21",
          },
          {
            ...reglas,
            otros: [
              {
                id: "x",
                corte: "H24",
                estado: "PENDIENTE",
                alcance: 99_999,
                impresiones: 99_999,
                interacciones: 0,
              },
            ],
          }
        ).success
      ).toBe(true)
    })
  })

  it("el servidor recibe además la captura", () => {
    expect(
      esquemaGuardarMetricas.safeParse({ ...METRICAS, captura: null }).success
    ).toBe(true)
  })
})

describe("leerCifras", () => {
  it("ignora lo que la plataforma no pide", () => {
    const { valores, problemas } = leerCifras(
      { ...METRICAS, espectadoresUnicos: "77" },
      "FACEBOOK",
      "POST_FEED"
    )
    expect(problemas).toEqual([])
    expect(valores.espectadoresUnicos).toBeNull()
    expect(valores.alcance).toBe(1200)
    // Facebook no pide guardados: no cuentan en las interacciones.
    expect(valores.guardados).toBeNull()
  })
})
