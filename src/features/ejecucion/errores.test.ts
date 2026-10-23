import { describe, expect, it } from "vitest"

import { MENSAJE_SIN_PERMISO } from "@/lib/errores-bd"

import { interpretarErrorEjecucion, MENSAJES_EJECUCION } from "./errores"

function negocio(codigo: string, detalle?: string) {
  return { code: "P0001", message: codigo, details: detalle ?? null }
}

describe("interpretarErrorEjecucion", () => {
  it("una URL ya registrada va al campo del enlace (INT-002)", () => {
    expect(
      interpretarErrorEjecucion({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "publicaciones_url_post_key"',
      })
    ).toMatchObject({
      campo: "url",
      mensaje: MENSAJES_EJECUCION.urlRepetida,
      esperado: true,
    })
  })

  it("el enlace de otra cuenta va al campo del enlace con el detalle de la BD", () => {
    const detalle =
      "El enlace es de @medio_b y esta campaña es con @noticias.cucuta. Pega el enlace de la publicación en tu cuenta."
    expect(
      interpretarErrorEjecucion(negocio("AMO_URL_OTRA_CUENTA", detalle))
    ).toMatchObject({ campo: "url", mensaje: detalle, esperado: true })
  })

  it("la etiqueta sin confirmar va a su casilla (MED-013)", () => {
    expect(
      interpretarErrorEjecucion(
        negocio(
          "AMO_ETIQUETA_REQUERIDA",
          "Confirma que la publicación lleva la etiqueta de publicidad."
        )
      )
    ).toMatchObject({
      campo: "etiquetaConfirmada",
      mensaje: "Confirma que la publicación lleva la etiqueta de publicidad.",
    })
  })

  it("la fecha fuera de la ventana va al día de publicación", () => {
    expect(
      interpretarErrorEjecucion(
        negocio(
          "AMO_FUERA_DE_VENTANA",
          "La fecha de publicación está fuera de la ventana de la oferta."
        )
      )
    ).toMatchObject({ campo: "dia", codigo: "AMO_FUERA_DE_VENTANA" })
  })

  it("el creativo desactualizado se explica sin campo (NOT-006)", () => {
    const resultado = interpretarErrorEjecucion(
      negocio(
        "AMO_CREATIVO_DESACTUALIZADO",
        "Descarga la versión vigente del creativo antes de publicar."
      )
    )
    expect(resultado.campo).toBeUndefined()
    expect(resultado.mensaje).toMatch(/Descarga la versión vigente/)
  })

  it("sin captura, al campo de la captura aunque no traiga detalle (INT-001)", () => {
    expect(
      interpretarErrorEjecucion(negocio("AMO_CAPTURA_REQUERIDA"))
    ).toMatchObject({ campo: "captura" })
  })

  it("la incoherencia entre cortes conserva el detalle de la BD", () => {
    const detalle =
      "Los valores no cuadran con el corte H72: un corte posterior no puede tener menos alcance, impresiones o interacciones."
    expect(
      interpretarErrorEjecucion(negocio("AMO_METRICA_INCOHERENTE", detalle))
    ).toMatchObject({ mensaje: detalle, esperado: true })
    expect(
      interpretarErrorEjecucion(
        negocio(
          "AMO_METRICA_INCOHERENTE",
          "Aún no se cumple el tiempo del corte desde la publicación."
        )
      )
    ).toMatchObject({ campo: "hora" })
  })

  it("las restricciones de métricas van a su campo", () => {
    expect(
      interpretarErrorEjecucion({
        code: "23514",
        message:
          'new row for relation "metricas" violates check constraint "metricas_interacciones_chk"',
      })
    ).toMatchObject({ campo: "interacciones" })
    expect(
      interpretarErrorEjecucion({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "metricas_personalizado_key"',
      })
    ).toMatchObject({
      campo: "periodoDesde",
      mensaje: MENSAJES_EJECUCION.intervaloRepetido,
    })
  })

  it("la evidencia fuera de plazo remite al reclamo, no a escribirle a nadie (D74)", () => {
    const resultado = interpretarErrorEjecucion(
      negocio(
        "AMO_FUERA_DE_VENTANA",
        "Venció el plazo para cargar la evidencia."
      )
    )
    expect(resultado.mensaje).toBe(
      "Venció el plazo para cargar la evidencia. Si publicaste a tiempo, podrás reclamar desde la campaña cuando aparezca como vencida."
    )
    expect(resultado.campo).toBeUndefined()
  })

  it("sin medio vinculado dice qué falta sin pedir que escriba sin un canal (D74)", () => {
    expect(MENSAJES_EJECUCION.sinMedio).toBe(
      "Tu usuario no está vinculado a un medio: el equipo AMO debe asociarlo antes de que cargues evidencias o métricas."
    )
    for (const mensaje of Object.values(MENSAJES_EJECUCION)) {
      expect(mensaje).not.toMatch(/escr[ií]bel|escr[ií]benos|ayudarte/i)
    }
  })

  it("un error desconocido no es esperado y no muestra el texto técnico", () => {
    const resultado = interpretarErrorEjecucion({
      code: "42501",
      message:
        'new row violates row-level security policy for table "metricas"',
    })
    expect(resultado.esperado).toBe(false)
    expect(resultado.mensaje).toBe(MENSAJE_SIN_PERMISO)
  })
})
