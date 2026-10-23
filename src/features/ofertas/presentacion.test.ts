import { describe, expect, it } from "vitest"

import {
  type DatosSituacion,
  fechaLimiteVencida,
  formatearTopePorMedio,
  formatoYPlataforma,
  HORAS_AVISO_FECHA_LIMITE,
  pasoCorregible,
  situacionOferta,
  tituloFaltaPaso,
  urgenciaFechaLimite,
  urgenciaSegunEstado,
} from "./presentacion"
import type { FechasOferta } from "./tipos"

const AHORA = new Date("2026-10-22T15:00:00.000Z")
const HORA = 3_600_000

function enHoras(horas: number): string {
  return new Date(AHORA.getTime() + horas * HORA).toISOString()
}

const FECHAS: FechasOferta = {
  creadaAt: "2026-10-20T15:00:00.000Z",
  enviadaAt: null,
  devueltaAt: null,
  publicadaAt: null,
  cuposCompletosAt: null,
  enEjecucionAt: null,
  vencidaAt: null,
  cerradaAt: null,
  canceladaAt: null,
}

function datos(cambios: Partial<DatosSituacion> = {}): DatosSituacion {
  return {
    estado: "BORRADOR",
    fechas: FECHAS,
    fechaLimiteAceptacion: "2026-10-30T22:00:00.000Z",
    ventanaInicio: "2026-11-01T05:00:00.000Z",
    ventanaFin: "2026-11-15T05:00:00.000Z",
    comentarioModeracion: null,
    ultimoCambio: null,
    ...cambios,
  }
}

describe("envío rechazado", () => {
  it("el paso «envío» no se corrige en el asistente", () => {
    expect(pasoCorregible("creativo")).toBe(true)
    expect(pasoCorregible("envio")).toBe(false)
    expect(pasoCorregible(null)).toBe(false)
  })

  it("titula el aviso con el paso que falta", () => {
    expect(tituloFaltaPaso("creativo")).toBe(
      "Falta completar: Paquete creativo"
    )
    expect(tituloFaltaPaso("cuanto")).toBe("Falta completar: Cuánto")
    expect(tituloFaltaPaso("envio")).toBe("No se pudo enviar a revisión")
    expect(tituloFaltaPaso(null)).toBe("No se pudo enviar a revisión")
  })
})

describe("urgencia de la fecha límite", () => {
  it("vencida desde el instante límite", () => {
    expect(urgenciaFechaLimite(AHORA.toISOString(), AHORA)).toMatchObject({
      nivel: "vencida",
      tono: "peligro",
    })
    expect(urgenciaFechaLimite(enHoras(-2), AHORA)).toEqual({
      nivel: "vencida",
      tono: "peligro",
      texto: "Venció hace 2 horas",
    })
  })

  it(`próxima dentro de ${HORAS_AVISO_FECHA_LIMITE} horas`, () => {
    expect(urgenciaFechaLimite(enHoras(20), AHORA)).toEqual({
      nivel: "proxima",
      tono: "aviso",
      texto: "Vence dentro de 20 horas",
    })
    expect(
      urgenciaFechaLimite(enHoras(HORAS_AVISO_FECHA_LIMITE), AHORA).nivel
    ).toBe("proxima")
  })

  it("holgada más allá del aviso, con la fecha", () => {
    const urgencia = urgenciaFechaLimite(
      enHoras(HORAS_AVISO_FECHA_LIMITE + 1),
      AHORA
    )
    expect(urgencia.nivel).toBe("holgada")
    expect(urgencia.tono).toBe("neutro")
    expect(urgencia.texto).toMatch(/^Vence el 24 de oct/)
  })

  it("solo importa mientras la aceptación sigue abierta", () => {
    expect(urgenciaSegunEstado("EN_REVISION", enHoras(-1), AHORA)?.nivel).toBe(
      "vencida"
    )
    expect(urgenciaSegunEstado("PUBLICADA", enHoras(5), AHORA)?.nivel).toBe(
      "proxima"
    )
    expect(urgenciaSegunEstado("CERRADA", enHoras(-1), AHORA)).toBeNull()
    expect(urgenciaSegunEstado("CANCELADA", enHoras(1), AHORA)).toBeNull()
  })

  it("fechaLimiteVencida incluye el instante exacto", () => {
    expect(fechaLimiteVencida(AHORA.toISOString(), AHORA)).toBe(true)
    expect(fechaLimiteVencida(enHoras(1), AHORA)).toBe(false)
  })
})

describe("situación de la oferta", () => {
  it("borrador: qué hacer, o que se retiró de revisión", () => {
    expect(situacionOferta(datos(), "anunciante")).toMatchObject({
      tono: "neutro",
      titulo: "Borrador",
      comentario: null,
    })
    const retirada = situacionOferta(
      datos({
        ultimoCambio: {
          desde: "EN_REVISION",
          hacia: "BORRADOR",
          actorTipo: "ANUNCIANTE",
          comentario: null,
        },
      }),
      "anunciante"
    )
    expect(retirada.titulo).toBe("Retirada de revisión")
    expect(retirada.descripcion).toMatch(/Envíala de nuevo/)
  })

  it("en revisión: el anunciante espera; la moderación ve si es un reenvío", () => {
    const enviada = datos({
      estado: "EN_REVISION",
      fechas: { ...FECHAS, enviadaAt: "2026-10-22T14:00:00.000Z" },
    })
    const anunciante = situacionOferta(enviada, "anunciante")
    expect(anunciante.titulo).toBe("En revisión")
    expect(anunciante.descripcion).toMatch(/^La enviaste el 22 de oct/)
    expect(anunciante.descripcion).toMatch(/retírala de revisión/)

    const interno = situacionOferta(
      {
        ...enviada,
        fechas: { ...enviada.fechas, devueltaAt: FECHAS.creadaAt },
      },
      "interno"
    )
    expect(interno.titulo).toBe("Espera moderación")
    expect(interno.tono).toBe("aviso")
    expect(interno.descripcion).toMatch(/reenvío tras una devolución/)
  })

  it("devuelta: destaca el comentario de la moderación", () => {
    const devuelta = datos({
      estado: "DEVUELTA",
      comentarioModeracion: "El enlace no abre.",
      ultimoCambio: {
        desde: "EN_REVISION",
        hacia: "DEVUELTA",
        actorTipo: "ADMIN",
        comentario: "El enlace no abre.",
      },
    })
    expect(situacionOferta(devuelta, "anunciante")).toMatchObject({
      tono: "aviso",
      titulo: "Devuelta con comentarios",
      comentario: {
        etiqueta: "Comentario del equipo AMO",
        texto: "El enlace no abre.",
      },
    })
    expect(situacionOferta(devuelta, "interno").comentario?.etiqueta).toBe(
      "Comentario enviado al anunciante"
    )
  })

  it("devuelta por el sistema: venció la fecha límite en revisión", () => {
    const situacion = situacionOferta(
      datos({
        estado: "DEVUELTA",
        comentarioModeracion: "Un comentario viejo",
        ultimoCambio: {
          desde: "EN_REVISION",
          hacia: "DEVUELTA",
          actorTipo: "SISTEMA",
          comentario: "La fecha límite pasó.",
        },
      }),
      "anunciante"
    )
    expect(situacion.titulo).toBe("Devuelta: venció la fecha límite")
    expect(situacion.comentario).toBeNull()
  })

  it("rechazada en moderación: muestra el motivo", () => {
    const situacion = situacionOferta(
      datos({
        estado: "CANCELADA",
        comentarioModeracion: "Producto no permitido.",
        ultimoCambio: {
          desde: "EN_REVISION",
          hacia: "CANCELADA",
          actorTipo: "ADMIN",
          comentario: "Producto no permitido.",
        },
      }),
      "anunciante"
    )
    expect(situacion).toMatchObject({
      tono: "peligro",
      titulo: "Rechazada en moderación",
      rechazada: true,
      comentario: { etiqueta: "Motivo", texto: "Producto no permitido." },
    })
  })

  it("cancelada por el anunciante: fecha y motivo", () => {
    const situacion = situacionOferta(
      datos({
        estado: "CANCELADA",
        fechas: { ...FECHAS, canceladaAt: "2026-10-21T15:00:00.000Z" },
        ultimoCambio: {
          desde: "PUBLICADA",
          hacia: "CANCELADA",
          actorTipo: "ANUNCIANTE",
          comentario: "La campaña cambió.",
        },
      }),
      "anunciante"
    )
    expect(situacion.titulo).toBe("Cancelada el 21 de oct de 2026")
    expect(situacion.rechazada).toBeUndefined()
    expect(situacion.comentario).toEqual({
      etiqueta: "Motivo",
      texto: "La campaña cambió.",
    })
  })

  it("un cambio viejo no explica el estado actual", () => {
    const situacion = situacionOferta(
      datos({
        estado: "CANCELADA",
        ultimoCambio: {
          desde: "BORRADOR",
          hacia: "EN_REVISION",
          actorTipo: "ANUNCIANTE",
          comentario: "nada",
        },
      }),
      "interno"
    )
    expect(situacion.titulo).toBe("Cancelada")
    expect(situacion.comentario).toBeNull()
  })

  it("publicada: hasta cuándo pueden aceptar los medios", () => {
    expect(
      situacionOferta(datos({ estado: "PUBLICADA" }), "anunciante").descripcion
    ).toMatch(/pueden aceptar cupos hasta el 30 de oct de 2026/)
  })

  it("vencida: ningún medio tomó cupo (con cupos tomados pasa a ejecución)", () => {
    const { descripcion } = situacionOferta(
      datos({ estado: "VENCIDA" }),
      "anunciante"
    )
    expect(descripcion).toBe(
      "Pasó la fecha límite de aceptación sin que ningún medio tomara un cupo."
    )
    expect(descripcion).not.toMatch(/medios que aceptaron|publicación/)
  })

  it("cada estado tiene título", () => {
    for (const estado of [
      "CUPOS_COMPLETOS",
      "EN_EJECUCION",
      "VENCIDA",
      "CERRADA",
    ] as const) {
      expect(situacionOferta(datos({ estado }), "anunciante").titulo).not.toBe(
        ""
      )
    }
  })
})

it("formatoYPlataforma nombra el formato con su red", () => {
  expect(formatoYPlataforma({ formato: "Reel", plataforma: "INSTAGRAM" })).toBe(
    "Reel de Instagram"
  )
  expect(formatoYPlataforma({ formato: "Video", plataforma: "TIKTOK" })).toBe(
    "Video de TikTok"
  )
})

it("el tope por medio conserva sus decimales sin rellenar con ceros", () => {
  // Según la versión de ICU, Intl separa (o no) el signo con un espacio.
  const sinEspacio = (texto: string) => texto.replace(/\s/g, "")
  expect(sinEspacio(formatearTopePorMedio(0.15))).toBe("15%")
  expect(sinEspacio(formatearTopePorMedio(0.125))).toBe("12,5%")
  expect(sinEspacio(formatearTopePorMedio(0.1225))).toBe("12,25%")
  expect(sinEspacio(formatearTopePorMedio(0.07))).toBe("7%")
  // Una fracción con más precisión se redondea a dos decimales.
  expect(sinEspacio(formatearTopePorMedio(0.12345))).toBe("12,35%")
})
