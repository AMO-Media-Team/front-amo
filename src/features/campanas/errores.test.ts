import { describe, expect, it } from "vitest"

import { MENSAJE_INESPERADO, MENSAJE_SIN_PERMISO } from "@/lib/errores-bd"

import {
  CAMPANA_DESACTUALIZADA,
  interpretarErrorCampana,
  mensajePresupuestoCampana,
} from "./errores"

/** Lo que lanza `private.validar_campana_guardar` al bajar el total. */
const PRESUPUESTO_BD = {
  code: "P0001",
  message: "AMO_PRESUPUESTO_CAMPANA",
  details:
    "El presupuesto no puede quedar por debajo de lo que reservan las ofertas en revisión o publicadas.",
}

describe("interpretarErrorCampana", () => {
  it("lo comprometido de la campaña se muestra en el presupuesto con el detalle de la BD", () => {
    expect(interpretarErrorCampana(PRESUPUESTO_BD)).toEqual({
      codigo: "AMO_PRESUPUESTO_CAMPANA",
      esperado: true,
      mensaje: PRESUPUESTO_BD.details,
      campo: "presupuesto",
    })
  })

  it("con el piso vigente, el presupuesto rechazado por la BD dice la cifra como el formulario", () => {
    expect(mensajePresupuestoCampana(PRESUPUESTO_BD, 5_000_000)).toMatch(
      /^El presupuesto no puede quedar por debajo de \$\s5\.000\.000: es lo que ya tienen comprometido sus ofertas/
    )
    // Sin el piso (no se pudo leer), el detalle de la BD.
    expect(mensajePresupuestoCampana(PRESUPUESTO_BD, null)).toBe(
      PRESUPUESTO_BD.details
    )
    expect(mensajePresupuestoCampana(PRESUPUESTO_BD, 0)).toBe(
      PRESUPUESTO_BD.details
    )
  })

  it("las reglas de transición van al mensaje general con su detalle", () => {
    expect(
      interpretarErrorCampana({
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details:
          "La empresa debe estar verificada por AMO para activar campañas.",
      })
    ).toEqual({
      codigo: "AMO_TRANSICION_INVALIDA",
      esperado: true,
      mensaje:
        "La empresa debe estar verificada por AMO para activar campañas.",
    })
  })

  it("reconoce las restricciones de la tabla y las lleva a su campo", () => {
    expect(
      interpretarErrorCampana({
        code: "23514",
        message:
          'new row for relation "campanas" violates check constraint "campanas_fechas_chk"',
      })
    ).toMatchObject({ campo: "fechaFin", esperado: true })
    expect(
      interpretarErrorCampana({
        code: "23514",
        message:
          'new row for relation "campanas" violates check constraint "campanas_nombre_chk"',
      })
    ).toMatchObject({ campo: "nombre" })
  })

  it("la RLS y lo desconocido no filtran detalles técnicos", () => {
    expect(
      interpretarErrorCampana({
        code: "42501",
        message:
          'new row violates row-level security policy for table "campanas"',
      }).mensaje
    ).toBe(MENSAJE_SIN_PERMISO)
    expect(interpretarErrorCampana({ code: "XX000", message: "boom" })).toEqual(
      { codigo: null, esperado: false, mensaje: MENSAJE_INESPERADO }
    )
  })
})

describe("CAMPANA_DESACTUALIZADA", () => {
  it("no supone que el cambio vino del equipo del anunciante (gestión asistida)", () => {
    expect(CAMPANA_DESACTUALIZADA).toMatch(/^Otra persona cambió esta campaña/)
    expect(CAMPANA_DESACTUALIZADA).not.toMatch(/tu equipo/)
  })
})
