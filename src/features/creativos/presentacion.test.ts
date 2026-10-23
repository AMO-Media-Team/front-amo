import { describe, expect, it } from "vitest"

import { interpretarErrorCreativo, mensajeValidacion } from "./errores"
import { archivoPrueba, versionPrueba } from "./fixtures"
import {
  describirArchivo,
  estadoVersion,
  fechaVersion,
  huellaCorta,
  nombreArchivo,
  tituloVersion,
} from "./presentacion"

const ESPACIO = " "

describe("archivos", () => {
  it("describe formato, medidas, duración y peso", () => {
    expect(describirArchivo(archivoPrueba())).toBe(
      `MP4 · 1080 × 1920 px · 45${ESPACIO}s · 12${ESPACIO}MB`
    )
    expect(
      describirArchivo(
        archivoPrueba({
          mime: "image/png",
          ancho: null,
          alto: null,
          duracionSegundos: null,
          tamanoBytes: 2048,
        })
      )
    ).toBe(`PNG · 2${ESPACIO}KB`)
  })

  it("nombra cada archivo dentro de su versión", () => {
    expect(nombreArchivo({ mime: "video/mp4" }, 0, 1)).toBe("Video")
    expect(nombreArchivo({ mime: "image/jpeg" }, 1, 5)).toBe("Imagen 2 de 5")
  })

  it("abrevia la huella", () => {
    expect(huellaCorta("0123456789abcdef".repeat(4))).toBe("01234567…89abcdef")
    expect(huellaCorta("abc")).toBe("abc")
  })
})

describe("versiones", () => {
  it("vigente, en preparación o reemplazada", () => {
    expect(estadoVersion(versionPrueba()).etiqueta).toBe("Vigente")
    expect(
      estadoVersion(versionPrueba({ vigente: false, pendiente: true }))
    ).toMatchObject({ etiqueta: "En preparación", tono: "aviso" })
    expect(
      estadoVersion(versionPrueba({ vigente: false, pendiente: false }))
        .etiqueta
    ).toBe("Reemplazada")
  })

  it("título y fecha en hora de Bogotá", () => {
    expect(tituloVersion({ version: 3 })).toBe("Versión 3")
    expect(fechaVersion(versionPrueba())).toMatch(/^Activada el 20 de oct/)
    expect(fechaVersion(versionPrueba({ activadoAt: null }))).toMatch(
      /^Creada el 20 de oct.*9:00/
    )
  })
})

describe("errores", () => {
  it("usa el detalle de la BD y las restricciones propias", () => {
    expect(
      interpretarErrorCreativo({
        message: "AMO_CONFIG_INVALIDA",
        details: "La relación de aspecto debe ser 9:16.",
      })
    ).toMatchObject({
      mensaje: "La relación de aspecto debe ser 9:16.",
      esperado: true,
    })
    expect(
      interpretarErrorCreativo({
        code: "23514",
        message:
          'new row for relation "creativos" violates check constraint "creativos_enlace_chk"',
      })
    ).toMatchObject({ campo: "enlaceDestino", esperado: true })
    expect(
      interpretarErrorCreativo({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "creativos_pendiente_key"',
      }).mensaje
    ).toMatch(/versión nueva en preparación/)
  })

  it("muestra el primer motivo de una validación", () => {
    expect(
      mensajeValidacion({
        issues: [{ message: "Falta la huella" }],
      } as Parameters<typeof mensajeValidacion>[0])
    ).toBe("Falta la huella")
  })
})
