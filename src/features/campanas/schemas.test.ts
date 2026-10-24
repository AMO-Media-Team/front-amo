import { describe, expect, it } from "vitest"

import { valoresNuevaCampanaAsistida } from "./formularios"
import {
  CAMPOS_CAMPANA_ASISTIDA,
  esquemaCancelarCampana,
  esquemaEditarCampana,
  esquemaNuevaCampana,
  esquemaNuevaCampanaAsistida,
  mensajePresupuestoMinimo,
  type ReglasCampana,
} from "./schemas"

const HOY = "2026-10-22"
const REGLAS_NUEVA: ReglasCampana = { hoy: HOY, presupuestoMinimo: 0 }

const VALIDA = {
  nombre: "  Temporada navideña 2026 ",
  marca: "Café Sierra Alta",
  objetivo: "   ",
  fechaInicio: "2026-11-01",
  fechaFin: "2026-12-31",
  presupuesto: "25.000.000",
}

/** Mensajes de error por campo («fechaFin» → [mensajes]). */
function errores(
  resultado: ReturnType<ReturnType<typeof esquemaNuevaCampana>["safeParse"]>
): Record<string, string[]> {
  if (resultado.success) return {}
  const porCampo: Record<string, string[]> = {}
  for (const issue of resultado.error.issues) {
    const campo = issue.path.join(".")
    porCampo[campo] = [...(porCampo[campo] ?? []), issue.message]
  }
  return porCampo
}

describe("esquemaNuevaCampana", () => {
  it("limpia los textos, lee la cifra en es-CO y deja el objetivo vacío en null", () => {
    const resultado = esquemaNuevaCampana(REGLAS_NUEVA).safeParse(VALIDA)
    expect(resultado.success).toBe(true)
    expect(resultado.data).toEqual({
      nombre: "Temporada navideña 2026",
      marca: "Café Sierra Alta",
      objetivo: null,
      fechaInicio: "2026-11-01",
      fechaFin: "2026-12-31",
      presupuesto: 25_000_000,
    })
  })

  it("pide cada dato obligatorio con un mensaje claro", () => {
    const resultado = esquemaNuevaCampana(REGLAS_NUEVA).safeParse({
      nombre: "",
      marca: "",
      objetivo: "",
      fechaInicio: "",
      fechaFin: "",
      presupuesto: "",
    })
    expect(errores(resultado)).toEqual({
      nombre: ["Escribe el nombre de la campaña."],
      marca: ["Escribe la marca o el producto que promociona la campaña."],
      fechaInicio: ["Elige la fecha de inicio."],
      fechaFin: ["Elige la fecha de fin."],
      presupuesto: ["Escribe el presupuesto total de la campaña."],
    })
  })

  it("valida longitudes, cifras y fechas reales", () => {
    const esquema = esquemaNuevaCampana(REGLAS_NUEVA)
    expect(
      errores(esquema.safeParse({ ...VALIDA, nombre: "Ab" })).nombre
    ).toEqual(["El nombre debe tener al menos 3 caracteres."])
    expect(
      errores(esquema.safeParse({ ...VALIDA, objetivo: "x".repeat(501) }))
        .objetivo
    ).toEqual(["Máximo 500 caracteres."])
    expect(
      errores(esquema.safeParse({ ...VALIDA, presupuesto: "mucho" }))
        .presupuesto
    ).toEqual(["Escribe el valor en pesos, por ejemplo 25.000.000."])
    expect(
      errores(esquema.safeParse({ ...VALIDA, presupuesto: "1.500,50" }))
        .presupuesto
    ).toEqual(["Escribe el valor en pesos, sin centavos."])
    expect(
      errores(esquema.safeParse({ ...VALIDA, presupuesto: "0" })).presupuesto
    ).toEqual(["El presupuesto debe ser mayor que cero."])
    expect(
      errores(esquema.safeParse({ ...VALIDA, fechaFin: "2026-02-30" })).fechaFin
    ).toEqual(["Elige una fecha válida."])
  })

  it("no empieza antes de hoy ni termina antes de empezar", () => {
    const esquema = esquemaNuevaCampana(REGLAS_NUEVA)
    expect(
      errores(esquema.safeParse({ ...VALIDA, fechaInicio: "2026-10-21" }))
        .fechaInicio
    ).toEqual(["La campaña no puede empezar antes de hoy."])
    expect(
      errores(
        esquema.safeParse({
          ...VALIDA,
          fechaInicio: "2026-11-10",
          fechaFin: "2026-11-09",
        })
      ).fechaFin
    ).toEqual(["La fecha de fin no puede ser anterior a la de inicio."])
    // Empezar y terminar hoy es válido.
    expect(
      esquema.safeParse({ ...VALIDA, fechaInicio: HOY, fechaFin: HOY }).success
    ).toBe(true)
  })
})

describe("esquemaEditarCampana", () => {
  const CAMPANA = "0199f3a0-0000-7000-8000-00000000ca01"
  const REGLAS: ReglasCampana = {
    hoy: HOY,
    presupuestoMinimo: 4_000_000,
    fechaInicioActual: "2026-10-01",
    fechaFinActual: "2026-12-31",
    inicioMaximo: "2026-11-05",
    finMinimo: "2026-12-20",
  }
  const EDICION = {
    ...VALIDA,
    campanaId: CAMPANA,
    actualizadoAt: "2026-10-21T15:00:00.123456+00:00",
    fechaInicio: "2026-10-01",
  }

  it("conserva un inicio pasado si no cambia y exige la versión del registro", () => {
    const esquema = esquemaEditarCampana(REGLAS)
    expect(esquema.safeParse(EDICION).success).toBe(true)
    expect(
      errores(esquema.safeParse({ ...EDICION, actualizadoAt: "" }))
        .actualizadoAt
    ).toEqual(["Falta la versión del registro."])
    expect(
      errores(esquema.safeParse({ ...EDICION, campanaId: "x" })).campanaId
    ).toEqual(["Identificador inválido."])
  })

  it("el presupuesto no baja de lo comprometido", () => {
    const resultado = esquemaEditarCampana(REGLAS).safeParse({
      ...EDICION,
      presupuesto: "3.999.999",
    })
    expect(errores(resultado).presupuesto).toEqual([
      mensajePresupuestoMinimo(4_000_000),
    ])
    expect(mensajePresupuestoMinimo(4_000_000)).toMatch(
      /^El presupuesto no puede quedar por debajo de \$\s4\.000\.000:/
    )
  })

  it("las fechas respetan las ventanas de las ofertas vivas", () => {
    const esquema = esquemaEditarCampana(REGLAS)
    expect(
      errores(esquema.safeParse({ ...EDICION, fechaInicio: "2026-11-06" }))
        .fechaInicio
    ).toEqual([
      "Tienes ofertas que se publican desde el 5 de noviembre de 2026: la campaña debe empezar ese día o antes.",
    ])
    expect(
      errores(esquema.safeParse({ ...EDICION, fechaFin: "2026-12-19" }))
        .fechaFin
    ).toEqual([
      "Tienes ofertas que se publican hasta el 20 de diciembre de 2026: la campaña debe terminar ese día o después.",
    ])
  })

  it("un inicio pasado distinto del guardado no se admite", () => {
    expect(
      errores(
        esquemaEditarCampana(REGLAS).safeParse({
          ...EDICION,
          fechaInicio: "2026-10-02",
        })
      ).fechaInicio
    ).toEqual(["La campaña no puede empezar antes de hoy."])
  })
})

describe("esquemaCancelarCampana", () => {
  it("exige un motivo de al menos 5 caracteres", () => {
    const campanaId = "0199f3a0-0000-7000-8000-00000000ca01"
    expect(
      esquemaCancelarCampana.safeParse({ campanaId, motivo: " ok " }).success
    ).toBe(false)
    expect(
      esquemaCancelarCampana.safeParse({
        campanaId,
        motivo: "  Cambió la estrategia de la marca.  ",
      }).data?.motivo
    ).toBe("Cambió la estrategia de la marca.")
  })
})

describe("esquemaNuevaCampanaAsistida (ADM-014)", () => {
  const ANUNCIANTE = "e2e00000-0000-4000-8000-00000000a001"

  it("exige elegir el anunciante, con las mismas reglas de la campaña", () => {
    const sinElegir = esquemaNuevaCampanaAsistida(REGLAS_NUEVA).safeParse({
      ...VALIDA,
      anuncianteId: "",
    })
    expect(errores(sinElegir)).toEqual({
      anuncianteId: ["Elige el anunciante."],
    })
    const raro = esquemaNuevaCampanaAsistida(REGLAS_NUEVA).safeParse({
      ...VALIDA,
      anuncianteId: "no-es-un-id",
    })
    expect(errores(raro)).toEqual({
      anuncianteId: ["Elige el anunciante de la lista."],
    })
    const pasado = esquemaNuevaCampanaAsistida(REGLAS_NUEVA).safeParse({
      ...VALIDA,
      fechaInicio: "2026-10-01",
      anuncianteId: ANUNCIANTE,
    })
    expect(errores(pasado).fechaInicio).toEqual([
      "La campaña no puede empezar antes de hoy.",
    ])
  })

  it("con el anunciante elegido, entrega los mismos datos más su id", () => {
    const resultado = esquemaNuevaCampanaAsistida(REGLAS_NUEVA).safeParse({
      ...VALIDA,
      anuncianteId: ANUNCIANTE,
    })
    expect(resultado.success).toBe(true)
    expect(resultado.data?.anuncianteId).toBe(ANUNCIANTE)
    expect(resultado.data?.presupuesto).toBe(25_000_000)
  })

  it("el anuncianteId es un campo que puede recibir el error del servidor", () => {
    expect(CAMPOS_CAMPANA_ASISTIDA).toContain("anuncianteId")
    expect(valoresNuevaCampanaAsistida(ANUNCIANTE).anuncianteId).toBe(
      ANUNCIANTE
    )
    expect(valoresNuevaCampanaAsistida(null).anuncianteId).toBe("")
  })

  it("el esquema del anunciante ignora un anuncianteId en la entrada", () => {
    const resultado = esquemaNuevaCampana(REGLAS_NUEVA).safeParse({
      ...VALIDA,
      anuncianteId: ANUNCIANTE,
    })
    expect(resultado.success).toBe(true)
    expect(resultado.data).not.toHaveProperty("anuncianteId")
  })
})
