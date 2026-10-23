import { describe, expect, it } from "vitest"

import {
  anunciantesDeOfertas,
  asignacionDeFila,
  baseDeFicha,
  conAnuncianteElegido,
  conSectorElegido,
  cortesDe,
  cotizacionDeFila,
  cuentasConImpedimentos,
  cuentasDeFicha,
  cuentasDeMarketplace,
  elegibilidadDeFila,
  facetasDeFilas,
  type FilaAsignacionMedio,
  type FilaCotizacion,
  type FilaMarketplace,
  type FilaOfertaParaMedio,
  impedimentosDeFilas,
  ofertaDeFila,
} from "./mapeo"

const FILA: FilaMarketplace = {
  id: "01a16693-72fe-713c-a45a-70d759c08120",
  titulo: "Reel de lanzamiento",
  formato_id: "f1",
  formato_nombre: "Reel",
  plataforma: "INSTAGRAM",
  publicaciones_por_medio: 2,
  permite_multiples_cupos: false,
  ventana_inicio: "2026-10-25T05:00:00+00:00",
  ventana_fin: "2026-11-05T05:00:00+00:00",
  fecha_limite_aceptacion: "2026-10-24T22:00:00+00:00",
  permanencia_minima_dias: 7,
  exclusividad_dias: null,
  cortes_requeridos: ["H72", "H24"],
  marca: "Café del Sur",
  anunciante_id: "an1",
  anunciante_nombre: "Tostadores SAS",
  sector_id: null,
  categorias_objetivo: [],
  rechazada_por_mi: false,
  vista: true,
  pago_maximo: 180_000,
  cuentas: [
    {
      cuenta_social_id: "c1",
      handle: "medio.e2e.amo",
      franja_clave: "F1",
      cupos_restantes: 3,
      monto_medio: 180_000,
    },
  ],
  total: 1,
}

describe("filas del marketplace", () => {
  it("una tarjeta con su pago, cuentas y cortes ordenados", () => {
    expect(ofertaDeFila(FILA)).toEqual({
      id: FILA.id,
      titulo: "Reel de lanzamiento",
      formato: "Reel",
      plataforma: "INSTAGRAM",
      publicacionesPorMedio: 2,
      permiteMultiplesCupos: false,
      ventanaInicio: FILA.ventana_inicio,
      ventanaFin: FILA.ventana_fin,
      fechaLimiteAceptacion: FILA.fecha_limite_aceptacion,
      permanenciaDias: 7,
      exclusividadDias: null,
      cortes: ["H24", "H72"],
      marca: "Café del Sur",
      anunciante: "Tostadores SAS",
      anuncianteId: "an1",
      rechazada: false,
      vista: true,
      pagoMaximo: 180_000,
      cuentas: [
        {
          cuentaSocialId: "c1",
          handle: "medio.e2e.amo",
          franjaClave: "F1",
          cuposRestantes: 3,
          montoMedio: 180_000,
        },
      ],
    })
  })

  it("sin marca usa el título y sin pago queda por confirmar", () => {
    const oferta = ofertaDeFila({
      ...FILA,
      marca: "  ",
      pago_maximo: null,
      exclusividad_dias: 10,
    })
    expect(oferta.marca).toBe("Reel de lanzamiento")
    expect(oferta.pagoMaximo).toBeNull()
    expect(oferta.exclusividadDias).toBe(10)
  })

  it("el jsonb de cuentas se valida: nulos y textos numéricos", () => {
    expect(
      cuentasDeMarketplace([
        {
          cuenta_social_id: "c1",
          handle: "a",
          franja_clave: "F2",
          cupos_restantes: "2",
          monto_medio: null,
        },
      ])
    ).toEqual([
      {
        cuentaSocialId: "c1",
        handle: "a",
        franjaClave: "F2",
        cuposRestantes: 2,
        montoMedio: null,
      },
    ])
    expect(cuentasDeMarketplace(null)).toEqual([])
    expect(cuentasDeMarketplace("roto")).toEqual([])
    expect(
      cuentasDeFicha([
        {
          cuenta_social_id: "c1",
          handle: "a",
          franja_id: "x",
          franja_clave: "F1",
          cupos_restantes: -1,
        },
      ])
    ).toEqual([
      {
        cuentaSocialId: "c1",
        handle: "a",
        franjaClave: "F1",
        cuposRestantes: 0,
      },
    ])
  })

  it("ignora cortes desconocidos y repetidos", () => {
    expect(cortesDe(["D7", "X", "H24", "D7"])).toEqual(["H24", "D7"])
    expect(cortesDe(null)).toEqual([])
  })
})

describe("opciones de los filtros (marketplace_facetas)", () => {
  const FACETAS = facetasDeFilas([
    { tipo: "SECTOR", id: "s2", nombre: "Salud y farmacia", ofertas: 1 },
    { tipo: "ANUNCIANTE", id: "an2", nombre: " Droguería Sur ", ofertas: 1 },
    { tipo: "SECTOR", id: "s1", nombre: "Alimentos y bebidas", ofertas: 3 },
    { tipo: "ANUNCIANTE", id: "an1", nombre: "Tostadores SAS", ofertas: 3 },
    { tipo: "OTRO", id: "x", nombre: "Desconocido", ofertas: 1 },
    { tipo: "SECTOR", id: "s3", nombre: "  ", ofertas: 1 },
  ])

  it("separa sectores y anunciantes, por nombre; ignora tipos y nombres vacíos", () => {
    expect(FACETAS).toEqual({
      sectores: [
        { id: "s1", nombre: "Alimentos y bebidas" },
        { id: "s2", nombre: "Salud y farmacia" },
      ],
      anunciantes: [
        { id: "an2", nombre: "Droguería Sur" },
        { id: "an1", nombre: "Tostadores SAS" },
      ],
    })
  })

  it("el sector de la URL siempre está, con su nombre del catálogo", () => {
    expect(
      conSectorElegido(FACETAS, { id: "s9", nombre: "Educación" }).sectores
    ).toEqual([
      { id: "s1", nombre: "Alimentos y bebidas" },
      { id: "s9", nombre: "Educación" },
      { id: "s2", nombre: "Salud y farmacia" },
    ])
    expect(
      conSectorElegido(FACETAS, { id: "s1", nombre: "Alimentos y bebidas" })
    ).toEqual(FACETAS)
    expect(conSectorElegido(FACETAS, null)).toBe(FACETAS)
  })

  it("el anunciante de la URL se agrega con un nombre conocido (otras plataformas o sus ofertas)", () => {
    const ofertas = anunciantesDeOfertas([
      { anuncianteId: "an7", anunciante: "Banco Andino" },
    ])
    expect(ofertas).toEqual([{ id: "an7", nombre: "Banco Andino" }])
    expect(
      conAnuncianteElegido(FACETAS, "an7", ofertas).anunciantes.map(
        ({ id }) => id
      )
    ).toEqual(["an7", "an2", "an1"])
    expect(conAnuncianteElegido(FACETAS, "an1", ofertas)).toEqual(FACETAS)
    // Sin ofertas en la página no hay nombre que mostrar: queda como estaba.
    expect(conAnuncianteElegido(FACETAS, "an8", ofertas)).toBe(FACETAS)
    expect(conAnuncianteElegido(FACETAS, null, ofertas)).toBe(FACETAS)
  })
})

describe("ficha de la oferta", () => {
  it("datos comunes con el nombre del formato", () => {
    const fila: FilaOfertaParaMedio = {
      id: FILA.id,
      titulo: FILA.titulo,
      formato_id: "f1",
      plataforma: "TIKTOK",
      publicaciones_por_medio: 1,
      permite_multiples_cupos: true,
      ventana_inicio: FILA.ventana_inicio,
      ventana_fin: FILA.ventana_fin,
      fecha_limite_aceptacion: FILA.fecha_limite_aceptacion,
      permanencia_minima_dias: 3,
      exclusividad_dias: null,
      cortes_requeridos: null,
      instrucciones: null,
      restricciones: null,
      estado: "PUBLICADA",
      marca: null,
      anunciante_id: "an1",
      anunciante_nombre: "Tostadores SAS",
      sector_id: null,
      cupos_restantes_mi_franja: [],
    }
    expect(baseDeFicha(fila, "Video")).toMatchObject({
      formato: "Video",
      plataforma: "TIKTOK",
      permiteMultiplesCupos: true,
      cortes: [],
      marca: FILA.titulo,
    })
  })

  it("cotización con el desglose solo si la comisión es visible", () => {
    const fila: FilaCotizacion = {
      franja_id: "fr1",
      franja_clave: "F1",
      seguidores: 40_000,
      tarifa_id: "t1",
      tarifa_base: 200_000,
      publicaciones: 1,
      multiplicador_calidad: 1.1,
      multiplicador_geografico: 1,
      multiplicador_exclusividad: 1,
      monto_bruto: 220_000,
      porcentaje_comision: 0.2,
      comision_origen: "GLOBAL",
      comision_excepcion_id: null,
      monto_comision: 44_000,
      monto_medio: 176_000,
    }
    expect(cotizacionDeFila(fila)).toEqual({
      franjaClave: "F1",
      seguidores: 40_000,
      publicaciones: 1,
      multiplicadorCalidad: 1.1,
      multiplicadorGeografico: 1,
      multiplicadorExclusividad: 1,
      montoMedio: 176_000,
      desglose: {
        tarifaBase: 200_000,
        montoBruto: 220_000,
        porcentajeComision: 0.2,
        montoComision: 44_000,
      },
    })
    expect(
      cotizacionDeFila({
        ...fila,
        tarifa_base: null,
        monto_bruto: null,
        porcentaje_comision: null,
        monto_comision: null,
      }).desglose
    ).toBeNull()
  })

  it("asignación del medio en la oferta", () => {
    const fila = {
      id: "a1",
      estado: "CONTENIDO_ENTREGADO",
      handle: null,
      aceptada_at: "2026-10-22T15:00:00+00:00",
      monto_medio: 176_000,
    } as unknown as FilaAsignacionMedio
    expect(asignacionDeFila(fila)).toEqual({
      id: "a1",
      estado: "CONTENIDO_ENTREGADO",
      handle: null,
      aceptadaAt: "2026-10-22T15:00:00+00:00",
      montoMedio: 176_000,
    })
  })

  it("impedimentos para aceptar: exclusividad de la oferta y tope de la campaña por cuenta", () => {
    const impedimentos = impedimentosDeFilas([
      { cuenta_social_id: "c1", exclusividad: true, tope_medio: false },
      { cuenta_social_id: "c2", exclusividad: true, tope_medio: true },
    ])
    expect(impedimentos.exclusividad).toBe(true)
    expect([...impedimentos.topeCampana]).toEqual(["c2"])
    // Sin cuentas vigentes en la plataforma no hay filas: ningún impedimento.
    expect(impedimentosDeFilas([])).toEqual({
      exclusividad: false,
      topeCampana: new Set(),
    })

    const cuenta = {
      handle: "medio.e2e.amo",
      franjaClave: "F1",
      cuposRestantes: 1,
      cotizacion: null,
      aviso: null,
    }
    const cuentas = [
      { ...cuenta, cuentaSocialId: "c1" },
      { ...cuenta, cuentaSocialId: "c2" },
    ]
    expect(
      cuentasConImpedimentos(cuentas, impedimentos).map(
        (c) => c.superaTopeCampana
      )
    ).toEqual([false, true])
    // No se pudieron leer: ninguna lo marca (la reserva vuelve a comprobarlo).
    expect(
      cuentasConImpedimentos(cuentas, null).map((c) => c.superaTopeCampana)
    ).toEqual([false, false])
  })
})

describe("elegibilidad", () => {
  it("lee el motivo y su detalle; OK sin detalle", () => {
    expect(
      elegibilidadDeFila({ motivo: "NIVEL_0", detalle: " Sin nivel. " })
    ).toEqual({ motivo: "NIVEL_0", detalle: "Sin nivel." })
    expect(elegibilidadDeFila({ motivo: "OK", detalle: "x" })).toEqual({
      motivo: "OK",
      detalle: null,
    })
    expect(
      elegibilidadDeFila({ motivo: "BAJO_UMBRAL", detalle: null })
    ).toEqual({ motivo: "BAJO_UMBRAL", detalle: null })
  })

  it("un motivo desconocido o sin fila no bloquea el listado", () => {
    expect(elegibilidadDeFila(undefined).motivo).toBe("OK")
    expect(elegibilidadDeFila({ motivo: "NUEVO", detalle: null }).motivo).toBe(
      "OK"
    )
  })
})
