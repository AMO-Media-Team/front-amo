import { describe, expect, it } from "vitest"

import {
  admiteEnvio,
  elegirNumero,
  fechaPorDefecto,
  limitesFechaPublicacion,
  situacionEvidencia,
  versionPendiente,
} from "./evidencia"
import type { EstadoAsignacion, EstadoValidacion } from "./tipos"

const AHORA = new Date("2026-10-23T15:00:00.000Z")
const LIMITE = "2026-10-25T04:59:00.000Z"

function asignacion(estado: EstadoAsignacion, fechaLimitePublicacion = LIMITE) {
  return { estado, fechaLimitePublicacion, reclamoHasta: null }
}

function publicacion(
  estado: EstadoValidacion,
  observaciones: string | null = null
) {
  return { estado, observaciones }
}

describe("situacionEvidencia", () => {
  it("sin descargar el contenido, primero la descarga", () => {
    expect(situacionEvidencia(asignacion("ACEPTADA"), null, AHORA)).toEqual({
      tipo: "descargar-primero",
    })
  })

  it("con el contenido descargado y a tiempo, se carga", () => {
    expect(
      situacionEvidencia(asignacion("CONTENIDO_ENTREGADO"), null, AHORA)
    ).toEqual({ tipo: "cargar" })
  })

  it("una rechazada se corrige con sus observaciones", () => {
    expect(
      situacionEvidencia(
        asignacion("CONTENIDO_ENTREGADO"),
        publicacion("RECHAZADA", "El enlace no abre."),
        AHORA
      )
    ).toEqual({ tipo: "corregir", observaciones: "El enlace no abre." })
  })

  it("una en revisión se puede corregir mientras siga abierta", () => {
    expect(
      situacionEvidencia(
        asignacion("PUBLICADA"),
        publicacion("PENDIENTE"),
        AHORA
      )
    ).toEqual({ tipo: "en-revision", editable: true })
    expect(
      situacionEvidencia(
        asignacion("PUBLICADA", "2026-10-22T00:00:00.000Z"),
        publicacion("PENDIENTE"),
        AHORA
      )
    ).toEqual({ tipo: "en-revision", editable: false })
    expect(
      situacionEvidencia(
        asignacion("EN_DISPUTA"),
        publicacion("PENDIENTE"),
        AHORA
      )
    ).toEqual({ tipo: "en-revision", editable: false })
  })

  it("aprobada no se toca", () => {
    expect(
      situacionEvidencia(
        asignacion("EVIDENCIA_VALIDADA"),
        publicacion("APROBADA"),
        AHORA
      )
    ).toEqual({ tipo: "aprobada" })
  })

  it("pasada la fecha límite sin evidencia válida, vencida (aunque el cron no haya corrido)", () => {
    const vencida = { tipo: "vencida", reclamoHasta: null }
    const ayer = "2026-10-22T00:00:00.000Z"
    expect(
      situacionEvidencia(asignacion("CONTENIDO_ENTREGADO", ayer), null, AHORA)
    ).toEqual(vencida)
    expect(
      situacionEvidencia(asignacion("ACEPTADA", ayer), null, AHORA)
    ).toEqual(vencida)
    expect(
      situacionEvidencia(
        { ...asignacion("VENCIDA_SIN_PUBLICAR", ayer), reclamoHasta: LIMITE },
        null,
        AHORA
      )
    ).toEqual({ tipo: "vencida", reclamoHasta: LIMITE })
  })

  it("una asignación cancelada no admite evidencias", () => {
    expect(situacionEvidencia(asignacion("CANCELADA"), null, AHORA)).toEqual({
      tipo: "cerrada",
    })
  })

  it("admiteEnvio solo en cargar, corregir y la revisión abierta", () => {
    expect(admiteEnvio({ tipo: "cargar" })).toBe(true)
    expect(admiteEnvio({ tipo: "corregir", observaciones: null })).toBe(true)
    expect(admiteEnvio({ tipo: "en-revision", editable: true })).toBe(true)
    expect(admiteEnvio({ tipo: "en-revision", editable: false })).toBe(false)
    expect(admiteEnvio({ tipo: "aprobada" })).toBe(false)
  })
})

describe("elegirNumero", () => {
  const registradas = [
    { numero: 1, estado: "PENDIENTE" as const },
    { numero: 2, estado: "RECHAZADA" as const },
  ]

  it("respeta el número pedido si existe en la oferta", () => {
    expect(elegirNumero("3", 3, registradas)).toBe(3)
    expect(elegirNumero(["1"], 3, registradas)).toBe(1)
  })

  it("sin número (o inválido) va a la primera que falta o está rechazada", () => {
    expect(elegirNumero(undefined, 3, registradas)).toBe(2)
    expect(elegirNumero("9", 3, registradas)).toBe(2)
    expect(elegirNumero("x", 3, [{ numero: 1, estado: "APROBADA" }])).toBe(2)
    expect(
      elegirNumero(undefined, 1, [{ numero: 1, estado: "APROBADA" }])
    ).toBe(1)
  })
})

describe("fechas de publicación", () => {
  const ventana = {
    ventanaInicio: "2026-10-20T05:00:00.000Z",
    ventanaFin: "2026-10-30T04:59:00.000Z",
    contenidoDescargadoAt: null,
  }

  it("van del inicio de la ventana hasta ahora (más el margen pedido)", () => {
    const limites = limitesFechaPublicacion(ventana, AHORA, 15 * 60_000)
    expect(limites.minimo.toISOString()).toBe("2026-10-20T05:00:00.000Z")
    expect(limites.maximo.toISOString()).toBe("2026-10-23T15:15:00.000Z")
    expect(limites.desdeDescarga).toBe(false)
  })

  it("empiezan en la descarga del contenido (al minuto) si fue después de abrir la ventana", () => {
    const limites = limitesFechaPublicacion(
      { ...ventana, contenidoDescargadoAt: "2026-10-22T13:07:45.120Z" },
      AHORA
    )
    expect(limites.minimo.toISOString()).toBe("2026-10-22T13:07:00.000Z")
    expect(limites.desdeDescarga).toBe(true)
    const antes = limitesFechaPublicacion(
      { ...ventana, contenidoDescargadoAt: "2026-10-19T13:07:00.000Z" },
      AHORA
    )
    expect(antes.minimo.toISOString()).toBe(ventana.ventanaInicio)
    expect(antes.desdeDescarga).toBe(false)
  })

  it("el formulario no abre antes de la descarga", () => {
    const limites = limitesFechaPublicacion(
      { ...ventana, contenidoDescargadoAt: "2026-10-23T14:59:30.000Z" },
      AHORA
    )
    expect(
      fechaPorDefecto(limites, new Date("2026-10-23T14:00:00.000Z"))
    ).toEqual({ dia: "2026-10-23", hora: "09:59" })
  })

  it("no pasan del fin de la ventana", () => {
    const despues = new Date("2026-11-02T00:00:00.000Z")
    expect(limitesFechaPublicacion(ventana, despues).maximo.toISOString()).toBe(
      ventana.ventanaFin
    )
  })

  it("el formulario abre con la hora actual de Bogotá dentro de la ventana", () => {
    const limites = limitesFechaPublicacion(ventana, AHORA)
    expect(fechaPorDefecto(limites, AHORA)).toEqual({
      dia: "2026-10-23",
      hora: "10:00",
    })
    const antes = new Date("2026-10-19T12:00:00.000Z")
    expect(
      fechaPorDefecto(limitesFechaPublicacion(ventana, AHORA), antes)
    ).toEqual({ dia: "2026-10-20", hora: "00:00" })
  })
})

describe("versionPendiente (NOT-006)", () => {
  const vigente = { version: 2, activadoAt: "2026-10-21T12:00:00.000Z" }

  it("avisa si hay una versión más nueva que la descargada", () => {
    expect(versionPendiente({ vigente, versionDescargada: 1 })).toBe(true)
    expect(versionPendiente({ vigente, versionDescargada: 2 })).toBe(false)
    expect(versionPendiente({ vigente: null, versionDescargada: null })).toBe(
      false
    )
  })

  it("con la fecha de publicación, solo cuenta si la nueva ya estaba vigente", () => {
    const contenido = { vigente, versionDescargada: 1 }
    expect(versionPendiente(contenido, "2026-10-22T00:00:00.000Z")).toBe(true)
    expect(versionPendiente(contenido, "2026-10-21T00:00:00.000Z")).toBe(false)
  })

  it("una versión activada en el mismo minuto de la publicación ya cuenta, como en la BD", () => {
    const contenido = {
      vigente: { version: 2, activadoAt: "2026-10-21T12:00:40.000Z" },
      versionDescargada: 1,
    }
    expect(versionPendiente(contenido, "2026-10-21T12:00:00.000Z")).toBe(true)
    expect(versionPendiente(contenido, "2026-10-21T11:59:00.000Z")).toBe(false)
  })
})
