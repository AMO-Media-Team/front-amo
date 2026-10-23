import { describe, expect, it } from "vitest"

import {
  CAMPANA,
  CATALOGO,
  CONFIGURACION,
  IDS,
  valoresCompletos,
} from "./fixtures"
import {
  cambiosDeEstado,
  cuposConCantidad,
  cuposVacios,
  diferenciaCupos,
  filaOferta,
  sincronizarFormatos,
  sinCambiosCupos,
  valoresDesdeOfertas,
  valoresNuevos,
} from "./persistencia"
import { esquemaBorradorOferta } from "./schemas"
import type { OfertaEnCurso, OfertaGuardadaBd } from "./tipos"

describe("sincronizarFormatos", () => {
  it("conserva lo escrito, agrega los nuevos vacíos y quita los desmarcados", () => {
    const actuales = [
      { formatoId: "a", presupuestoMaximo: "1.000", cupos: [] },
      { formatoId: "b", presupuestoMaximo: "2.000", cupos: [] },
    ]
    const resultado = sincronizarFormatos(
      actuales,
      ["b", "c"],
      CATALOGO.franjas
    )
    expect(resultado[0]).toBe(actuales[1])
    expect(resultado[1]).toEqual({
      formatoId: "c",
      presupuestoMaximo: "",
      cupos: cuposVacios(CATALOGO.franjas),
    })
    expect(resultado).toHaveLength(2)
  })
})

describe("valoresNuevos", () => {
  it("parte de la configuración: cortes, tope, permanencia y fechas de la campaña", () => {
    const valores = valoresNuevos({
      campana: CAMPANA,
      configuracion: { ...CONFIGURACION, cortesPorDefecto: ["H24"] },
      ahora: new Date("2026-10-22T15:00:00Z"),
    })
    expect(valores.cuando.cortes).toEqual(["H24"])
    expect(valores.cuanto.topePorcentaje).toBe("15")
    expect(valores.cuando.permanenciaDias).toBe("7")
    expect(valores.que.publicacionesPorMedio).toBe("1")
    expect(valores.cuando.ventanaInicio).toBe("2026-11-01T05:00:00.000Z")
    expect(valores.cuando.ventanaFin).toBe("2026-12-01T04:59:00.000Z")
    expect(valores.que.formatoIds).toEqual([])
  })
})

function guardada(parcial: Partial<OfertaGuardadaBd> = {}): OfertaGuardadaBd {
  return {
    ofertaId: IDS.ofertaA,
    formatoId: IDS.igReel,
    estado: "BORRADOR",
    actualizadaAt: "2026-10-22T15:00:00.123456+00:00",
    titulo: "Lanzamiento",
    publicacionesPorMedio: 2,
    presupuestoMaximo: 5_000_000,
    topePorcentaje: 0.125,
    departamentos: ["05"],
    municipios: ["76001"],
    categorias: [IDS.categoria],
    seguidoresMinimos: 40_000,
    mediosExcluidos: [IDS.medio, "01a16525-0000-7000-8000-00000000dead"],
    ventanaInicio: "2026-11-05T13:00:00+00:00",
    ventanaFin: "2026-11-20T04:59:00+00:00",
    fechaLimite: "2026-11-04T23:00:00+00:00",
    permanenciaDias: 10,
    exclusividadDias: 15,
    cortes: ["H24", "D7"],
    instrucciones: "Menciona la promo",
    restricciones: null,
    comentarioModeracion: null,
    devueltaAt: null,
    cupos: [{ franjaId: IDS.f2, cantidad: 3 }],
    ...parcial,
  }
}

describe("valoresDesdeOfertas", () => {
  it("sin ofertas no hay valores (se usa una oferta nueva)", () => {
    expect(
      valoresDesdeOfertas({ ofertas: [], catalogo: CATALOGO, excluidos: [] })
    ).toBeNull()
  })

  it("lo común sale de la primera; presupuesto y cupos, de cada oferta", () => {
    const valores = valoresDesdeOfertas({
      ofertas: [
        guardada(),
        guardada({
          ofertaId: IDS.ofertaB,
          formatoId: IDS.ttVideo,
          presupuestoMaximo: 1_500_000,
          cupos: [{ franjaId: IDS.f1, cantidad: 4 }],
        }),
      ],
      catalogo: CATALOGO,
      excluidos: [
        { id: IDS.medio, nombre: "Radio Bogotá", municipio: "Bogotá, D.C." },
      ],
    })!
    expect(valores.que).toEqual({
      formatoIds: [IDS.igReel, IDS.ttVideo],
      titulo: "Lanzamiento",
      publicacionesPorMedio: "2",
    })
    expect(valores.quien.seguidoresMinimos).toBe("40.000")
    // Un medio que ya no existe se omite.
    expect(valores.quien.mediosExcluidos.map((m) => m.nombre)).toEqual([
      "Radio Bogotá",
    ])
    expect(valores.cuando.exclusividad).toBe(true)
    expect(valores.cuando.exclusividadDias).toBe("15")
    expect(valores.cuanto.topePorcentaje).toBe("12,5")
    expect(valores.cuanto.formatos[0].presupuestoMaximo).toBe("5.000.000")
    expect(valores.cuanto.formatos[0].cupos).toEqual([
      { franjaId: IDS.f1, cantidad: "" },
      { franjaId: IDS.f2, cantidad: "3" },
      { franjaId: IDS.f3, cantidad: "" },
    ])
    expect(valores.cuanto.formatos[1].presupuestoMaximo).toBe("1.500.000")
    expect(valores.envio).toEqual({
      instrucciones: "Menciona la promo",
      restricciones: "",
    })
    // Lo que vuelve de la BD vuelve a pasar el esquema.
    expect(esquemaBorradorOferta.safeParse(valores).success).toBe(true)
  })
})

describe("filaOferta", () => {
  it("lleva lo común y el presupuesto del formato, en columnas de la BD", () => {
    const datos = esquemaBorradorOferta.parse(
      valoresCompletos({
        quien: {
          mediosExcluidos: [
            { id: IDS.medio, nombre: "Radio", municipio: null },
          ],
        },
        cuando: { exclusividad: true, exclusividadDias: "15" },
        envio: { instrucciones: "  Etiqueta la marca  " },
      })
    )
    expect(filaOferta(datos, datos.cuanto.formatos[0])).toEqual({
      titulo: "Lanzamiento de la nueva línea",
      publicaciones_por_medio: 1,
      presupuesto_maximo: 5_000_000,
      tope_porcentaje_por_medio: 0.15,
      departamentos_objetivo: ["05"],
      municipios_objetivo: [],
      categorias_objetivo: [],
      seguidores_minimos: null,
      medios_excluidos: [IDS.medio],
      ventana_inicio: "2026-11-05T13:00:00.000Z",
      ventana_fin: "2026-11-20T04:59:00.000Z",
      fecha_limite_aceptacion: "2026-11-04T23:00:00.000Z",
      permanencia_minima_dias: 7,
      exclusividad_dias: 15,
      cortes_requeridos: ["H24", "H72", "D7"],
      instrucciones: "Etiqueta la marca",
      restricciones: null,
    })
  })
})

describe("diferenciaCupos", () => {
  it("inserta, actualiza y borra solo lo que cambió", () => {
    const diferencia = diferenciaCupos(
      [
        { franjaId: "f1", cantidad: 5 },
        { franjaId: "f2", cantidad: 2 },
        { franjaId: "f3", cantidad: 1 },
      ],
      [
        { franjaId: "f1", cantidad: 5 },
        { franjaId: "f2", cantidad: 4 },
        { franjaId: "f3", cantidad: 0 },
        { franjaId: "f4", cantidad: 1 },
      ]
    )
    expect(diferencia).toEqual({
      insertar: [{ franjaId: "f4", cantidad: 1 }],
      actualizar: [{ franjaId: "f2", cantidad: 4 }],
      borrar: ["f3"],
    })
    expect(sinCambiosCupos(diferencia)).toBe(false)
  })

  it("sin cambios no escribe nada", () => {
    const iguales = [{ franjaId: "f1", cantidad: 5 }]
    expect(sinCambiosCupos(diferenciaCupos(iguales, iguales))).toBe(true)
    expect(cuposConCantidad([{ franjaId: "f", cantidad: 0 }])).toEqual([])
  })
})

describe("cambiosDeEstado", () => {
  const VERSION = "2026-10-22T15:00:00.123456+00:00"
  const oferta = (
    ofertaId: string,
    estado: OfertaEnCurso["estado"]
  ): OfertaEnCurso => ({
    ofertaId,
    formatoId: ofertaId === IDS.ofertaA ? IDS.igReel : IDS.ttVideo,
    estado,
    actualizadaAt: VERSION,
  })

  it("una editable que vuelve en otro estado sin enviarla la cambió otra persona", () => {
    expect(
      cambiosDeEstado(
        [oferta(IDS.ofertaA, "DEVUELTA")],
        [oferta(IDS.ofertaA, "EN_REVISION")]
      )
    ).toEqual({ enviadas: [], cambiadas: [oferta(IDS.ofertaA, "EN_REVISION")] })
  })

  it("lo que envió este intento, o lo ya enviado antes, no cuenta como cambio", () => {
    expect(
      cambiosDeEstado(
        [oferta(IDS.ofertaA, "BORRADOR"), oferta(IDS.ofertaB, "EN_REVISION")],
        [oferta(IDS.ofertaA, "EN_REVISION"), oferta(IDS.ofertaB, "PUBLICADA")],
        [IDS.ofertaA]
      )
    ).toEqual({ enviadas: [IDS.ofertaA], cambiadas: [] })
  })

  it("una que el asistente no conocía y ya está en revisión la envió un intento sin respuesta", () => {
    expect(cambiosDeEstado([], [oferta(IDS.ofertaA, "EN_REVISION")])).toEqual({
      enviadas: [IDS.ofertaA],
      cambiadas: [],
    })
    expect(cambiosDeEstado([], [oferta(IDS.ofertaA, "BORRADOR")])).toEqual({
      enviadas: [],
      cambiadas: [],
    })
  })
})
