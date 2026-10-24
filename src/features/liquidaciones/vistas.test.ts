import { describe, expect, it } from "vitest"

import type { FilaPendiente } from "./tipos"
import {
  accesoLiquidaciones,
  alertasDe,
  cargarVista,
  estadoTablaLiquidaciones,
  estadoTablaPendientes,
  type EstadoTablaPendientes,
  etiquetaPestana,
  filtrarPendientes,
  ordenarPendientes,
  paginar,
  vistaDeEstado,
  vistaPendientes,
} from "./vistas"

function pendiente(
  numero: number,
  cambios: Partial<FilaPendiente> = {}
): FilaPendiente {
  return {
    medioId: `0192f3a4-5b6c-7d8e-9f01-00000000000${numero}`,
    medio: `Medio ${numero}`,
    municipio: "Pasto",
    asignaciones: numero,
    montoMedio: numero * 100_000,
    primeraVerificada: `2026-10-0${numero}T15:00:00Z`,
    ultimaVerificada: `2026-10-1${numero}T15:00:00Z`,
    ultimaLiquidacionFin: null,
    requiereDocumentoSoporte: true,
    datosPagoListos: true,
    segSocialPendiente: false,
    ...cambios,
  }
}

const RADIO = pendiente(1, { medio: "Radio Ñuñoa Pasto" })
const NOTICIAS = pendiente(2, {
  medio: "Noticias del Sur",
  requiereDocumentoSoporte: false,
  datosPagoListos: false,
})
const CREADOR = pendiente(3, {
  medio: "Creador Cali",
  segSocialPendiente: true,
})

function estado(
  cambios: Partial<EstadoTablaPendientes> = {}
): EstadoTablaPendientes {
  return {
    q: "",
    pagina: 1,
    tamano: 20,
    orden: { campo: "valor", descendente: true },
    soporte: [],
    alerta: [],
    ...cambios,
  }
}

describe("cargarVista", () => {
  it("sin vista (o con una que no existe) abre «Por liquidar»", async () => {
    expect(await cargarVista(Promise.resolve({}))).toEqual({
      vista: "pendientes",
    })
    expect(await cargarVista(Promise.resolve({ vista: "otra" }))).toEqual({
      vista: "pendientes",
    })
    expect(await cargarVista(Promise.resolve({ vista: "borrador" }))).toEqual({
      vista: "borrador",
    })
  })
})

describe("estado de las tablas en la URL", () => {
  it("un orden que no es de la tabla cae al de por defecto", async () => {
    const pendientes = await estadoTablaPendientes.cargar(
      Promise.resolve({ orden: "periodo.desc" })
    )
    expect(pendientes.orden).toEqual({ campo: "valor", descendente: true })
    const liquidaciones = await estadoTablaLiquidaciones.cargar(
      Promise.resolve({ orden: "neto.asc", soporte: "FACTURA" })
    )
    expect(liquidaciones.orden).toEqual({ campo: "neto", descendente: false })
    expect(liquidaciones.soporte).toEqual(["FACTURA"])
  })
})

describe("vistaDeEstado", () => {
  it("cada estado vuelve a su pestaña", () => {
    expect(vistaDeEstado("BORRADOR")).toBe("borrador")
    expect(vistaDeEstado("APROBADA")).toBe("aprobadas")
    expect(vistaDeEstado("PAGADA")).toBe("pagadas")
    expect(vistaDeEstado("ANULADA")).toBe("anuladas")
  })
})

describe("etiquetaPestana", () => {
  it("nombra la vista con su cuenta (medios en «Por liquidar»)", () => {
    expect(etiquetaPestana("pendientes", 1)).toBe("Por liquidar: 1 medio")
    expect(etiquetaPestana("pendientes", 1234)).toBe(
      "Por liquidar: 1.234 medios"
    )
    expect(etiquetaPestana("borrador", 3)).toBe("Por aprobar: 3")
    expect(etiquetaPestana("anuladas", 0)).toBe("Anuladas: ninguna")
  })
})

describe("accesoLiquidaciones", () => {
  it("traduce permisos y reconoce al SUPERADMIN (D17)", () => {
    expect(
      accesoLiquidaciones({
        permisos: ["liquidaciones.ver", "liquidaciones.aprobar", "medios.ver"],
        rol: { clave: "ADMIN" },
      })
    ).toEqual({
      generar: false,
      aprobar: true,
      registrarPago: false,
      verMedios: true,
      verAsignaciones: false,
      superadmin: false,
    })
    expect(
      accesoLiquidaciones({ permisos: [], rol: { clave: "SUPERADMIN" } })
        .superadmin
    ).toBe(true)
  })
})

describe("alertasDe", () => {
  it("datos de pago y seguridad social, en ese orden", () => {
    expect(alertasDe(RADIO)).toEqual([])
    expect(alertasDe(NOTICIAS)).toEqual(["DATOS_PAGO"])
    expect(
      alertasDe(
        pendiente(4, { datosPagoListos: false, segSocialPendiente: true })
      )
    ).toEqual(["DATOS_PAGO", "SEG_SOCIAL"])
  })
})

describe("filtrarPendientes", () => {
  const filas = [RADIO, NOTICIAS, CREADOR]

  it("busca por nombre sin tildes ni mayúsculas, todas las palabras", () => {
    expect(filtrarPendientes(filas, estado({ q: "nunoa" }))).toEqual([RADIO])
    expect(filtrarPendientes(filas, estado({ q: "SUR noticias" }))).toEqual([
      NOTICIAS,
    ])
    expect(filtrarPendientes(filas, estado({ q: "bogota" }))).toEqual([])
  })

  it("filtra por documento del pago y por avisos (cualquiera de los elegidos)", () => {
    expect(filtrarPendientes(filas, estado({ soporte: ["FACTURA"] }))).toEqual([
      NOTICIAS,
    ])
    expect(
      filtrarPendientes(filas, estado({ alerta: ["DATOS_PAGO", "SEG_SOCIAL"] }))
    ).toEqual([NOTICIAS, CREADOR])
  })
})

describe("ordenarPendientes", () => {
  const filas = [NOTICIAS, RADIO, CREADOR]

  it("ordena por valor, asignaciones, antigüedad o nombre", () => {
    expect(
      ordenarPendientes(filas, { campo: "valor", descendente: true }).map(
        (f) => f.medio
      )
    ).toEqual(["Creador Cali", "Noticias del Sur", "Radio Ñuñoa Pasto"])
    expect(
      ordenarPendientes(filas, { campo: "desde", descendente: false })[0]
    ).toBe(RADIO)
    expect(
      ordenarPendientes(filas, { campo: "medio", descendente: false }).map(
        (f) => f.medio
      )
    ).toEqual(["Creador Cali", "Noticias del Sur", "Radio Ñuñoa Pasto"])
    expect(
      ordenarPendientes(filas, { campo: "asignaciones", descendente: true })[0]
    ).toBe(CREADOR)
  })

  it("ante un empate desempata por nombre (orden estable)", () => {
    const empate = [
      pendiente(5, { medio: "Zeta", montoMedio: 1 }),
      pendiente(6, { medio: "Alfa", montoMedio: 1 }),
    ]
    expect(
      ordenarPendientes(empate, { campo: "valor", descendente: true }).map(
        (f) => f.medio
      )
    ).toEqual(["Alfa", "Zeta"])
  })
})

describe("paginar", () => {
  const numeros = Array.from({ length: 45 }, (_, indice) => indice + 1)

  it("devuelve la página pedida con el total", () => {
    expect(paginar(numeros, 2, 20)).toEqual({
      filas: numeros.slice(20, 40),
      total: 45,
    })
  })

  it("una página que ya no existe cae en la última; sin filas, vacía", () => {
    expect(paginar(numeros, 9, 20).filas).toEqual([41, 42, 43, 44, 45])
    expect(paginar([], 3, 20)).toEqual({ filas: [], total: 0 })
  })
})

describe("vistaPendientes", () => {
  it("filtra, ordena y pagina con el estado de la URL", () => {
    const resultado = vistaPendientes(
      [RADIO, NOTICIAS, CREADOR],
      estado({ soporte: ["DOCUMENTO_SOPORTE"], tamano: 10 })
    )
    expect(resultado.total).toBe(2)
    expect(resultado.filas.map((f) => f.medio)).toEqual([
      "Creador Cali",
      "Radio Ñuñoa Pasto",
    ])
  })
})
