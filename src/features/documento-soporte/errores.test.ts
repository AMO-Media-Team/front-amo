import { describe, expect, it } from "vitest"

import { interpretarErrorDocumento, MENSAJES_DOCUMENTO } from "./errores"

function errorBd(
  message: string,
  details: string | null = null,
  hint: string | null = null
) {
  return { code: "P0001", message, details, hint }
}

describe("interpretarErrorDocumento", () => {
  it("la numeración del otro sistema explica qué hacer", () => {
    expect(
      interpretarErrorDocumento(
        errorBd(
          "AMO_TRANSICION_INVALIDA",
          "El proveedor tecnológico numera…",
          "numeracion_proveedor"
        ),
        "emitir"
      )
    ).toMatchObject({
      mensaje: MENSAJES_DOCUMENTO.numeracionProveedor,
      esperado: true,
    })
    expect(
      interpretarErrorDocumento(
        errorBd("AMO_TRANSICION_INVALIDA", "…", "numeracion_plataforma"),
        "expedido"
      ).mensaje
    ).toBe(MENSAJES_DOCUMENTO.numeracionPlataforma)
  })

  it("el formato del CUDS y un CUDS distinto van al campo", () => {
    const formato = interpretarErrorDocumento(
      errorBd(
        "AMO_CONFIG_INVALIDA",
        "El CUDS son 96 caracteres hexadecimales, como lo entrega el proveedor tecnológico.",
        "cuds_formato"
      ),
      "cuds"
    )
    expect(formato).toMatchObject({
      campo: "cuds",
      mensaje:
        "El CUDS son 96 caracteres hexadecimales, como lo entrega el proveedor tecnológico.",
    })
    expect(
      interpretarErrorDocumento(
        errorBd("AMO_TRANSICION_INVALIDA", "…", "cuds_registrado"),
        "cuds"
      )
    ).toMatchObject({
      campo: "cuds",
      mensaje: MENSAJES_DOCUMENTO.cudsRegistrado,
    })
    expect(
      interpretarErrorDocumento(
        errorBd(
          "AMO_CONFIG_INVALIDA",
          "Ese CUDS ya está registrado en otro documento soporte."
        ),
        "cuds"
      )
    ).toMatchObject({ campo: "cuds" })
  })

  it("el PDF sin cargar va junto al archivo, salvo al generar los archivos", () => {
    const error = errorBd(
      "AMO_CONFIG_INVALIDA",
      "Carga el PDF…",
      "archivo_no_cargado"
    )
    expect(interpretarErrorDocumento(error, "expedido")).toMatchObject({
      campo: "archivo",
      mensaje: MENSAJES_DOCUMENTO.archivoNoCargado,
    })
    expect(interpretarErrorDocumento(error, "generar").campo).toBeUndefined()
  })

  it("resolución agotada con su rótulo; en el registro externo, junto al número", () => {
    const error = errorBd(
      "AMO_RESOLUCION_AGOTADA",
      "El número no pertenece a una resolución de documento soporte vigente en la fecha de emisión."
    )
    expect(interpretarErrorDocumento(error, "expedido")).toMatchObject({
      campo: "consecutivo",
      mensaje:
        "Resolución agotada: el número no pertenece a una resolución de documento soporte vigente en la fecha de emisión.",
    })
    const alEmitir = interpretarErrorDocumento(
      errorBd("AMO_RESOLUCION_AGOTADA", null),
      "emitir"
    )
    expect(alEmitir.campo).toBeUndefined()
    expect(alEmitir.mensaje).toMatch(/^Resolución agotada: /)
  })

  it("detalles sin hint según la operación", () => {
    expect(
      interpretarErrorDocumento(
        errorBd(
          "AMO_CONFIG_INVALIDA",
          "Indica el número y una fecha de emisión entre la generación de la liquidación y hoy."
        ),
        "expedido"
      ).campo
    ).toBe("fechaEmision")
    expect(
      interpretarErrorDocumento(
        errorBd(
          "AMO_CONFIG_INVALIDA",
          "Indica el número de la nota de ajuste."
        ),
        "nota_ajuste"
      ).campo
    ).toBe("numero")
    expect(
      interpretarErrorDocumento(
        errorBd("AMO_CONFIG_INVALIDA", "El CUDE es demasiado largo."),
        "nota_ajuste"
      ).campo
    ).toBe("cude")
    // «Ese número o ese CUDS…» no dice cuál: mensaje general.
    expect(
      interpretarErrorDocumento(
        errorBd(
          "AMO_CONFIG_INVALIDA",
          "Ese número o ese CUDS ya están registrados en otro documento soporte."
        ),
        "expedido"
      ).campo
    ).toBeUndefined()
  })

  it("anular un documento transmitido pide la nota de ajuste", () => {
    expect(
      interpretarErrorDocumento(
        errorBd("AMO_TRANSICION_INVALIDA", "…", "requiere_nota_ajuste"),
        "anular"
      ).mensaje
    ).toBe(MENSAJES_DOCUMENTO.requiereNotaAjuste)
  })

  it("lo inesperado no se presenta como esperado ni muestra el texto técnico", () => {
    const resultado = interpretarErrorDocumento(
      { code: "XX000", message: "relation x does not exist" },
      "emitir"
    )
    expect(resultado.esperado).toBe(false)
    expect(resultado.mensaje).not.toContain("relation")
  })
})
