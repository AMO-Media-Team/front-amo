import { describe, expect, it } from "vitest"

import {
  CAMPANA,
  CATALOGO,
  CONFIGURACION,
  IDS,
  valoresCompletos,
} from "./fixtures"
import {
  type ContextoValidacion,
  esquemaBorradorOferta,
  esquemaBuscarMedios,
  esquemaEstimacion,
  esquemaOferta,
  esquemaReferenciasOfertas,
} from "./schemas"

const AHORA = new Date("2026-10-22T15:00:00Z")

const CONTEXTO: ContextoValidacion = {
  campana: { fechaInicio: CAMPANA.fechaInicio, fechaFin: CAMPANA.fechaFin },
  disponible: CAMPANA.disponible,
  anticipacionHoras: CONFIGURACION.anticipacionHoras,
  minimoCupos: CONFIGURACION.minimoMedios,
  formatos: CATALOGO.formatos,
  ahora: () => AHORA,
}

const completo = esquemaOferta(CONTEXTO)

function errores(resultado: ReturnType<typeof completo.safeParse>) {
  return resultado.success
    ? {}
    : Object.fromEntries(
        resultado.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ])
      )
}

describe("esquema completo de la oferta", () => {
  it("acepta una oferta válida y entrega lo que se guarda", () => {
    const resultado = completo.safeParse(valoresCompletos())
    expect(resultado.success).toBe(true)
    if (!resultado.success) return
    const datos = resultado.data
    expect(datos.que.publicacionesPorMedio).toBe(1)
    expect(datos.cuanto.formatos[0].presupuestoMaximo).toBe(5_000_000)
    expect(datos.cuanto.formatos[0].cupos.map((c) => c.cantidad)).toEqual([
      5, 0, 0,
    ])
    // El tope se guarda como fracción.
    expect(datos.cuanto.topePorcentaje).toBe(0.15)
    expect(datos.quien.seguidoresMinimos).toBeNull()
    expect(datos.cuando.exclusividadDias).toBeNull()
    expect(datos.envio.instrucciones).toBeNull()
  })

  it("exige al menos un formato, un título y publicaciones de 1 a 10", () => {
    const resultado = completo.safeParse(
      valoresCompletos({
        que: { formatoIds: [], titulo: "ab", publicacionesPorMedio: "11" },
        cuanto: { formatos: [] },
      })
    )
    expect(errores(resultado)).toMatchObject({
      "que.formatoIds": "Elige al menos un formato.",
      "que.titulo": "Usa al menos 3 caracteres.",
      "que.publicacionesPorMedio": "Como máximo 10 publicaciones por medio.",
    })
  })

  it("rechaza un formato que ya no está activo", () => {
    const otro = "01a16525-06d7-7000-8000-000000000999"
    const resultado = completo.safeParse(
      valoresCompletos({
        que: { formatoIds: [otro] },
        cuanto: {
          formatos: [
            { ...valoresCompletos().cuanto.formatos[0], formatoId: otro },
          ],
        },
      })
    )
    expect(errores(resultado)["que.formatoIds"]).toMatch(
      /ya no está disponible/
    )
    // Si su oferta ya se envió, no se toca: no bloquea a las demás.
    const conEnviado = esquemaOferta({ ...CONTEXTO, enviados: [otro] })
    expect(
      errores(
        conEnviado.safeParse(
          valoresCompletos({
            que: { formatoIds: [otro] },
            cuanto: {
              formatos: [
                { ...valoresCompletos().cuanto.formatos[0], formatoId: otro },
              ],
            },
          })
        )
      )["que.formatoIds"]
    ).toBeUndefined()
  })

  it("la ventana va en orden y dentro de la campaña", () => {
    expect(
      errores(
        completo.safeParse(
          valoresCompletos({
            cuando: {
              ventanaInicio: "2026-10-30T13:00:00.000Z",
              ventanaFin: "2026-12-02T13:00:00.000Z",
              fechaLimite: "2026-11-04T23:00:00.000Z",
            },
          })
        )
      )
    ).toMatchObject({
      "cuando.ventanaInicio":
        "La ventana debe empezar dentro de la campaña, desde el 1 de noviembre de 2026.",
      "cuando.ventanaFin":
        "La ventana debe terminar dentro de la campaña, a más tardar el 30 de noviembre de 2026.",
    })
    expect(
      errores(
        completo.safeParse(
          valoresCompletos({
            cuando: {
              ventanaInicio: "2026-11-10T13:00:00.000Z",
              ventanaFin: "2026-11-09T13:00:00.000Z",
              fechaLimite: "2026-11-04T23:00:00.000Z",
            },
          })
        )
      )["cuando.ventanaFin"]
    ).toBe("El fin de la ventana debe quedar después del inicio.")
  })

  it("la fecha límite respeta la anticipación y no pasa del fin de la ventana", () => {
    expect(
      errores(
        completo.safeParse(
          valoresCompletos({
            cuando: { fechaLimite: "2026-10-23T05:00:00.000Z" },
          })
        )
      )["cuando.fechaLimite"]
    ).toBe(
      "La fecha límite de aceptación debe quedar al menos 24 horas después del envío."
    )
    expect(
      errores(
        completo.safeParse(
          valoresCompletos({
            cuando: { fechaLimite: "2026-11-25T23:00:00.000Z" },
          })
        )
      )["cuando.fechaLimite"]
    ).toBe(
      "La fecha límite de aceptación no puede pasar del fin de la ventana."
    )
  })

  it("sin anticipación configurada solo exige que la fecha no haya pasado", () => {
    const sinAnticipacion = esquemaOferta({ ...CONTEXTO, anticipacionHoras: 0 })
    const resultado = sinAnticipacion.safeParse(
      valoresCompletos({ cuando: { fechaLimite: "2026-10-22T14:00:00.000Z" } })
    )
    expect(errores(resultado)["cuando.fechaLimite"]).toBe(
      "La fecha límite de aceptación ya pasó."
    )
  })

  it("exige días de exclusividad entre 1 y 90 (cero no es exclusividad)", () => {
    expect(
      errores(
        completo.safeParse(
          valoresCompletos({
            cuando: { exclusividad: true, exclusividadDias: "" },
          })
        )
      )["cuando.exclusividadDias"]
    ).toBe("Indica cuántos días de exclusividad (de 1 a 90).")
    expect(
      errores(
        completo.safeParse(
          valoresCompletos({
            cuando: { exclusividad: true, exclusividadDias: "0" },
          })
        )
      )["cuando.exclusividadDias"]
    ).toBe("La exclusividad es de al menos 1 día.")
    const quince = completo.safeParse(
      valoresCompletos({
        cuando: { exclusividad: true, exclusividadDias: "15" },
      })
    )
    expect(quince.success && quince.data.cuando.exclusividadDias).toBe(15)
    // Apagada, los días escritos no se guardan.
    const apagada = completo.safeParse(
      valoresCompletos({
        cuando: { exclusividad: false, exclusividadDias: "15" },
      })
    )
    expect(apagada.success && apagada.data.cuando.exclusividadDias).toBeNull()
  })

  it("los días de exclusividad que quedaron escritos al apagarla no bloquean (ni el borrador)", () => {
    expect(
      errores(
        completo.safeParse(
          valoresCompletos({
            cuando: { exclusividad: true, exclusividadDias: "120" },
          })
        )
      )["cuando.exclusividadDias"]
    ).toBe("Como máximo 90 días.")
    for (const dias of ["120", "dos", "2,5"]) {
      const valores = valoresCompletos({
        cuando: { exclusividad: false, exclusividadDias: dias },
      })
      const resultado = completo.safeParse(valores)
      expect(resultado.success).toBe(true)
      expect(resultado.success && resultado.data.cuando.exclusividadDias).toBe(
        null
      )
      expect(esquemaBorradorOferta.safeParse(valores).success).toBe(true)
    }
  })

  it("exige al menos un corte y los ordena (quitar el de 72 h deja 24 h y 7 días)", () => {
    expect(
      errores(completo.safeParse(valoresCompletos({ cuando: { cortes: [] } })))[
        "cuando.cortes"
      ]
    ).toBe("Exige al menos un corte de métricas.")
    const sinSetentaYDos = completo.safeParse(
      valoresCompletos({ cuando: { cortes: ["D7", "H24"] } })
    )
    expect(sinSetentaYDos.success && sinSetentaYDos.data.cuando.cortes).toEqual(
      ["H24", "D7"]
    )
  })

  it("el presupuesto no supera lo disponible, ni sumando las ofertas", () => {
    const base = valoresCompletos().cuanto.formatos[0]
    expect(
      errores(
        completo.safeParse(
          valoresCompletos({
            cuanto: {
              formatos: [{ ...base, presupuestoMaximo: "25.000.000" }],
            },
          })
        )
      )["cuanto.formatos.0.presupuestoMaximo"]
    ).toMatch(/^Supera lo disponible en la campaña/)
    const dos = completo.safeParse(
      valoresCompletos({
        que: { formatoIds: [IDS.igReel, IDS.ttVideo] },
        cuanto: {
          formatos: [
            { ...base, presupuestoMaximo: "12.000.000" },
            {
              ...base,
              formatoId: IDS.ttVideo,
              presupuestoMaximo: "12.000.000",
            },
          ],
        },
      })
    )
    expect(errores(dos)["cuanto.formatos.0.presupuestoMaximo"]).toMatch(
      /^Entre las ofertas suman \$\s?24\.000\.000 y la campaña tiene disponibles \$\s?20\.000\.000\.$/
    )
  })

  it("lo ya enviado no vuelve a sumar contra el disponible", () => {
    const base = valoresCompletos().cuanto.formatos[0]
    const valores = valoresCompletos({
      que: { formatoIds: [IDS.igReel, IDS.ttVideo] },
      cuanto: {
        formatos: [
          { ...base, presupuestoMaximo: "12.000.000" },
          { ...base, formatoId: IDS.ttVideo, presupuestoMaximo: "12.000.000" },
        ],
      },
    })
    const conEnviado = esquemaOferta({ ...CONTEXTO, enviados: [IDS.igReel] })
    expect(conEnviado.safeParse(valores).success).toBe(true)
  })

  it("exige cupos en alguna franja y no más de 500 por franja", () => {
    const base = valoresCompletos().cuanto.formatos[0]
    expect(
      errores(
        completo.safeParse(
          valoresCompletos({
            cuanto: {
              formatos: [
                {
                  ...base,
                  cupos: base.cupos.map((c) => ({ ...c, cantidad: "" })),
                },
              ],
            },
          })
        )
      )["cuanto.formatos.0.cupos.0.cantidad"]
    ).toBe("Define al menos 1 cupo en alguna franja.")
    expect(
      errores(
        completo.safeParse(
          valoresCompletos({
            cuanto: {
              formatos: [
                { ...base, cupos: [{ franjaId: IDS.f1, cantidad: "501" }] },
              ],
            },
          })
        )
      )["cuanto.formatos.0.cupos.0.cantidad"]
    ).toBe("Como máximo 500 cupos por franja.")
  })

  it("el tope por medio va de 1 % a 100 % con dos decimales", () => {
    const con = (tope: string) =>
      completo.safeParse(valoresCompletos({ cuanto: { topePorcentaje: tope } }))
    expect(errores(con("0"))["cuanto.topePorcentaje"]).toBe(
      "El tope por medio es de al menos 1 %."
    )
    expect(errores(con("12,345"))["cuanto.topePorcentaje"]).toBe(
      "Usa como máximo dos decimales."
    )
    const decimal = con("12,5")
    expect(decimal.success && decimal.data.cuanto.topePorcentaje).toBe(0.125)
  })

  it("cada formato elegido tiene su presupuesto", () => {
    expect(
      errores(
        completo.safeParse(
          valoresCompletos({ que: { formatoIds: [IDS.igReel, IDS.ttVideo] } })
        )
      )["cuanto.formatos"]
    ).toMatch(/no coinciden con los formatos elegidos/)
  })

  it("las reglas de un paso se comprueban aunque otro tenga errores", () => {
    const resultado = completo.safeParse(
      valoresCompletos({
        cuando: {
          ventanaInicio: "2026-11-10T13:00:00.000Z",
          ventanaFin: "2026-11-09T13:00:00.000Z",
        },
        cuanto: { topePorcentaje: "" },
      })
    )
    expect(errores(resultado)).toMatchObject({
      "cuando.ventanaFin":
        "El fin de la ventana debe quedar después del inicio.",
      "cuanto.topePorcentaje": "Indica el tope por medio.",
    })
  })
})

describe("esquema de borrador (lo que exige la BD para guardar)", () => {
  it("no aplica las reglas del envío: fechas fuera de la campaña, sin cupos ni anticipación", () => {
    const base = valoresCompletos().cuanto.formatos[0]
    const resultado = esquemaBorradorOferta.safeParse(
      valoresCompletos({
        cuando: {
          ventanaInicio: "2026-10-01T13:00:00.000Z",
          ventanaFin: "2026-12-30T13:00:00.000Z",
          fechaLimite: "2026-10-22T16:00:00.000Z",
        },
        cuanto: {
          formatos: [
            {
              ...base,
              presupuestoMaximo: "90.000.000",
              cupos: base.cupos.map((c) => ({ ...c, cantidad: "" })),
            },
          ],
        },
      })
    )
    expect(resultado.success).toBe(true)
  })

  it("pide lo indispensable: presupuesto y fechas en orden", () => {
    const base = valoresCompletos().cuanto.formatos[0]
    const resultado = esquemaBorradorOferta.safeParse(
      valoresCompletos({
        cuando: { fechaLimite: "" },
        cuanto: { formatos: [{ ...base, presupuestoMaximo: "" }] },
      })
    )
    expect(errores(resultado)).toMatchObject({
      "cuando.fechaLimite": "Elige el día y la hora límite para aceptar.",
      "cuanto.formatos.0.presupuestoMaximo":
        "Escribe el presupuesto máximo de esta oferta.",
    })
  })

  it("normaliza la segmentación y quita repetidos", () => {
    const medio = {
      id: IDS.medio,
      nombre: "Radio Bogotá",
      municipio: "Bogotá, D.C.",
    }
    const resultado = esquemaBorradorOferta.safeParse(
      valoresCompletos({
        quien: {
          segmentacion: {
            departamentos: ["05"],
            municipios: ["05001", "76001"],
          },
          categorias: [IDS.categoria, IDS.categoria],
          seguidoresMinimos: "20.000",
          mediosExcluidos: [medio, medio],
        },
      })
    )
    expect(resultado.success).toBe(true)
    if (!resultado.success) return
    expect(resultado.data.quien.segmentacion).toEqual({
      departamentos: ["05"],
      municipios: ["76001"],
    })
    expect(resultado.data.quien.categorias).toEqual([IDS.categoria])
    expect(resultado.data.quien.mediosExcluidos).toHaveLength(1)
    expect(resultado.data.quien.seguidoresMinimos).toBe(20_000)
  })
})

describe("esquemas de las acciones", () => {
  it("referencias: campaña y ofertas ya creadas por formato, con su versión", () => {
    const existente = {
      formatoId: IDS.igReel,
      ofertaId: IDS.ofertaA,
      actualizadaAt: "2026-10-22T15:00:00.123456+00:00",
    }
    expect(
      esquemaReferenciasOfertas.safeParse({
        campanaId: IDS.campana,
        existentes: [existente],
      }).success
    ).toBe(true)
    expect(
      esquemaReferenciasOfertas.safeParse({ campanaId: "x", existentes: [] })
        .success
    ).toBe(false)
    // Sin versión no se puede comprobar que nadie la cambió.
    expect(
      esquemaReferenciasOfertas.safeParse({
        campanaId: IDS.campana,
        existentes: [{ ...existente, actualizadaAt: "ayer" }],
      }).success
    ).toBe(false)
  })

  it("referencias: la espera desde un intento sin respuesta se acota a un día", () => {
    const leer = (segundosDesdeFallo: number) =>
      esquemaReferenciasOfertas.safeParse({
        campanaId: IDS.campana,
        existentes: [],
        segundosDesdeFallo,
      })
    expect(leer(42).data?.segundosDesdeFallo).toBe(42)
    expect(leer(200_000).data?.segundosDesdeFallo).toBe(86_400)
    expect(leer(-1).success).toBe(false)
  })

  it("búsqueda de medios: al menos tres letras", () => {
    expect(esquemaBuscarMedios.safeParse({ texto: " ra " }).success).toBe(false)
    expect(esquemaBuscarMedios.safeParse({ texto: "radio" }).success).toBe(true)
  })

  it("estimador: cupos por franja con claves de franja", () => {
    const parametros = {
      formatoId: IDS.igReel,
      departamentos: [],
      municipios: [],
      categorias: [],
      seguidoresMinimos: null,
      cupos: { [IDS.f1]: 1 },
      exclusividadDias: null,
      mediosExcluidos: [],
      publicaciones: 1,
    }
    expect(esquemaEstimacion.safeParse(parametros).success).toBe(true)
    expect(
      esquemaEstimacion.safeParse({ ...parametros, cupos: { franja: 1 } })
        .success
    ).toBe(false)
    expect(
      esquemaEstimacion.safeParse({ ...parametros, exclusividadDias: 0 })
        .success
    ).toBe(false)
  })
})
