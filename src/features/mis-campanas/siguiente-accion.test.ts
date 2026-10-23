import { describe, expect, it } from "vitest"

import {
  accionesDe,
  type AsignacionParaPaso,
  compararAcciones,
  disponibilidadAccion,
  etiquetaAccion,
  etiquetaPlazoAccion,
  interpretarAccion,
  rutaDeAccion,
  siguientePaso,
  tipoDeAccion,
  vencimientoDelPaso,
} from "./siguiente-accion"
import type { AccionMedio, FilaAccionMedio } from "./tipos"

const ID = "0199f3a0-0000-7000-8000-00000000a501"
const OTRA = "0199f3a0-0000-7000-8000-00000000a502"
const METRICA = "0199f3a0-0000-7000-8000-0000000000c9"

function fila(cambios: Partial<FilaAccionMedio> = {}): FilaAccionMedio {
  return {
    asignacionId: ID,
    ofertaTitulo: "Reel de Halloween",
    accion: "PUBLICAR",
    venceAt: "2026-10-30T05:00:00.000Z",
    numero: null,
    corte: null,
    ...cambios,
  }
}

function accion(cambios: Partial<FilaAccionMedio> = {}): AccionMedio {
  const interpretada = interpretarAccion(fila(cambios))
  if (!interpretada) throw new Error("acción desconocida")
  return interpretada
}

function asignacion(
  cambios: Partial<AsignacionParaPaso> = {}
): AsignacionParaPaso {
  return {
    id: ID,
    ofertaTitulo: "Reel de Halloween",
    estado: "ACEPTADA",
    fechaLimitePublicacion: "2026-10-30T05:00:00.000Z",
    reclamoHasta: null,
    publicaciones: 1,
    ...cambios,
  }
}

describe("tipoDeAccion", () => {
  it("reconoce los códigos de proximas_acciones_medio", () => {
    expect(tipoDeAccion("DESCARGAR")).toBe("DESCARGAR")
    expect(tipoDeAccion("DESCARGAR_NUEVA_VERSION")).toBe(
      "DESCARGAR_NUEVA_VERSION"
    )
    expect(tipoDeAccion("CARGAR_METRICA_H72")).toBe("CARGAR_METRICA")
    expect(tipoDeAccion("CARGAR_METRICA_D7")).toBe("CARGAR_METRICA")
    expect(tipoDeAccion("CORREGIR_METRICAS")).toBe("CORREGIR_METRICAS")
    expect(tipoDeAccion("CARGAR_METRICA_PERSONALIZADO")).toBeNull()
    expect(tipoDeAccion("ALGO_NUEVO")).toBeNull()
  })
})

describe("textos de cada acción", () => {
  it("hablan en voz del medio y nombran el corte y la publicación", () => {
    expect(etiquetaAccion("DESCARGAR")).toBe("Descarga el contenido")
    expect(etiquetaAccion("PUBLICAR")).toBe("Publica y carga la evidencia")
    expect(etiquetaAccion("CARGAR_METRICA", { numero: 1, corte: "H72" })).toBe(
      "Carga las métricas de 72 horas"
    )
    expect(etiquetaAccion("CARGAR_METRICA", { numero: 2, corte: "H24" })).toBe(
      "Carga las métricas de 24 horas de la publicación 2"
    )
    expect(
      etiquetaAccion("CORREGIR_EVIDENCIA", {
        numero: 1,
        variasPublicaciones: true,
      })
    ).toBe("Corrige la evidencia de la publicación 1")
    expect(etiquetaPlazoAccion("CARGAR_METRICA", "D7")).toBe("Métricas de 7 d")
    expect(etiquetaPlazoAccion("PUBLICAR")).toBe("Publicación")
  })

  it("llevan a la pantalla donde se hace", () => {
    expect(rutaDeAccion(ID, "DESCARGAR")).toBe(`/mis-campanas/${ID}/contenido`)
    expect(rutaDeAccion(ID, "DESCARGAR_NUEVA_VERSION")).toBe(
      `/mis-campanas/${ID}/contenido`
    )
    expect(rutaDeAccion(ID, "PUBLICAR")).toBe(`/mis-campanas/${ID}/evidencia`)
    expect(rutaDeAccion(ID, "CORREGIR_EVIDENCIA", 2)).toBe(
      `/mis-campanas/${ID}/evidencia?numero=2`
    )
    expect(rutaDeAccion(ID, "CARGAR_METRICA", 1, "H72")).toBe(
      `/mis-campanas/${ID}/metricas?numero=1&corte=H72`
    )
    // Sin publicación ni corte no hay formulario al que ir: la ficha.
    expect(rutaDeAccion(ID, "CORREGIR_METRICAS")).toBe(`/mis-campanas/${ID}`)
  })

  it("un corte personalizado rechazado se corrige por su id, no en un formulario nuevo", () => {
    expect(
      rutaDeAccion(ID, "CORREGIR_METRICAS", 2, "PERSONALIZADO", METRICA)
    ).toBe(
      `/mis-campanas/${ID}/metricas?numero=2&corte=PERSONALIZADO&metrica=${METRICA}`
    )
    // Sin el id no se sabe cuál: la ficha los lista con su botón.
    expect(rutaDeAccion(ID, "CORREGIR_METRICAS", 2, "PERSONALIZADO")).toBe(
      `/mis-campanas/${ID}`
    )
    // Los fijos siguen por su corte (hay uno por publicación).
    expect(rutaDeAccion(ID, "CORREGIR_METRICAS", 1, "H24", METRICA)).toBe(
      `/mis-campanas/${ID}/metricas?numero=1&corte=H24`
    )
    expect(
      etiquetaAccion("CORREGIR_METRICAS", {
        numero: 2,
        corte: "PERSONALIZADO",
        variasPublicaciones: true,
      })
    ).toBe("Corrige el corte personalizado de la publicación 2")
    expect(etiquetaPlazoAccion("CORREGIR_METRICAS", "PERSONALIZADO")).toBe(
      "Corte personalizado"
    )
  })
})

describe("interpretarAccion", () => {
  it("un corte por cargar se habilita el plazo de carga antes de vencer", () => {
    const cargar = accion({
      accion: "CARGAR_METRICA_H72",
      numero: 1,
      corte: "H72",
      venceAt: "2026-10-27T17:30:00.000Z",
    })
    expect(cargar.tipo).toBe("CARGAR_METRICA")
    expect(cargar.disponibleDesde).toBe("2026-10-25T17:30:00.000Z")
    expect(cargar.ruta).toBe(`/mis-campanas/${ID}/metricas?numero=1&corte=H72`)
    expect(cargar.etiquetaPlazo).toBe("Métricas de 72 h")

    const conOtroPlazo = interpretarAccion(
      fila({
        accion: "CARGAR_METRICA_H24",
        numero: 1,
        corte: null,
        venceAt: "2026-10-27T17:30:00.000Z",
      }),
      { plazoCargaHoras: 24 }
    )
    expect(conOtroPlazo?.corte).toBe("H24")
    expect(conOtroPlazo?.disponibleDesde).toBe("2026-10-26T17:30:00.000Z")
  })

  it("cada personalizado rechazado lleva a corregir el suyo", () => {
    const primero = accion({
      accion: "CORREGIR_METRICAS",
      numero: 1,
      corte: "PERSONALIZADO",
      metricaId: METRICA,
    })
    expect(primero.metricaId).toBe(METRICA)
    expect(primero.ruta).toBe(
      `/mis-campanas/${ID}/metricas?numero=1&corte=PERSONALIZADO&metrica=${METRICA}`
    )
    expect(primero.etiqueta).toBe("Corrige el corte personalizado")
    // Una fila sin el dato (datos de antes) no inventa un id.
    expect(accion({ accion: "DESCARGAR" }).metricaId).toBeNull()
  })

  it("lo demás ya se puede hacer y un código desconocido se descarta", () => {
    expect(accion({ accion: "DESCARGAR" }).disponibleDesde).toBeNull()
    expect(
      accion({ accion: "CORREGIR_METRICAS", numero: 1, corte: "H24" })
        .disponibleDesde
    ).toBeNull()
    expect(interpretarAccion(fila({ accion: "OTRA_COSA" }))).toBeNull()
    expect(
      interpretarAccion(fila({ accion: "CARGAR_METRICA_H24", venceAt: null }))
        ?.disponibleDesde
    ).toBeNull()
  })
})

describe("orden de las acciones", () => {
  it("contenido primero, luego evidencia y métricas; dentro, el plazo", () => {
    const acciones = [
      accion({
        accion: "CARGAR_METRICA_H24",
        numero: 1,
        corte: "H24",
        venceAt: "2026-10-24T00:00:00.000Z",
      }),
      accion({ accion: "PUBLICAR", venceAt: "2026-10-30T00:00:00.000Z" }),
      accion({
        accion: "DESCARGAR_NUEVA_VERSION",
        venceAt: "2026-10-30T00:00:00.000Z",
      }),
      accion({
        accion: "CARGAR_METRICA_H72",
        numero: 1,
        corte: "H72",
        venceAt: "2026-10-23T00:00:00.000Z",
      }),
      accion({ asignacionId: OTRA, accion: "DESCARGAR" }),
    ]
    expect(accionesDe(ID, acciones).map((a) => a.codigo)).toEqual([
      "DESCARGAR_NUEVA_VERSION",
      "PUBLICAR",
      "CARGAR_METRICA_H72",
      "CARGAR_METRICA_H24",
    ])
    expect(compararAcciones(acciones[0], acciones[0])).toBe(0)
  })
})

describe("disponibilidadAccion", () => {
  const cargar = accion({
    accion: "CARGAR_METRICA_H24",
    numero: 1,
    corte: "H24",
    venceAt: "2026-10-26T12:00:00.000Z",
  })

  it("bloqueada antes del corte, disponible en su plazo y vencida después", () => {
    expect(
      disponibilidadAccion(cargar, new Date("2026-10-24T11:59:00.000Z"))
    ).toBe("bloqueada")
    expect(
      disponibilidadAccion(cargar, new Date("2026-10-24T12:00:00.000Z"))
    ).toBe("disponible")
    expect(
      disponibilidadAccion(cargar, new Date("2026-10-26T12:01:00.000Z"))
    ).toBe("vencida")
    expect(
      disponibilidadAccion(
        { disponibleDesde: null, venceAt: null },
        new Date("2030-01-01T00:00:00.000Z")
      )
    ).toBe("disponible")
  })
})

describe("siguientePaso", () => {
  it("la acción más urgente de la asignación", () => {
    const paso = siguientePaso(asignacion({ estado: "CONTENIDO_ENTREGADO" }), [
      accion({ accion: "PUBLICAR" }),
      accion({ accion: "DESCARGAR_NUEVA_VERSION" }),
    ])
    expect(paso.tipo === "accion" && paso.accion.tipo).toBe(
      "DESCARGAR_NUEVA_VERSION"
    )
  })

  it("sin fila en las próximas acciones, la que pide su estado", () => {
    const descargar = siguientePaso(asignacion(), [])
    expect(descargar).toMatchObject({
      tipo: "accion",
      accion: {
        tipo: "DESCARGAR",
        ruta: `/mis-campanas/${ID}/contenido`,
        venceAt: "2026-10-30T05:00:00.000Z",
      },
    })
    const publicar = siguientePaso(
      asignacion({ estado: "CONTENIDO_ENTREGADO" }),
      []
    )
    expect(publicar.tipo === "accion" && publicar.accion.tipo).toBe("PUBLICAR")
  })

  it("espera mientras el equipo AMO revisa", () => {
    expect(
      siguientePaso(asignacion({ estado: "PUBLICADA" }), [])
    ).toMatchObject({ tipo: "espera", titulo: "Tu evidencia está en revisión" })
    expect(
      siguientePaso(asignacion({ estado: "METRICAS_CARGADAS" }), [])
    ).toMatchObject({ tipo: "espera" })
    expect(
      siguientePaso(asignacion({ estado: "EN_DISPUTA" }), [])
    ).toMatchObject({ tipo: "espera", titulo: "Hay una disputa abierta" })
  })

  it("una vencida ofrece el plazo para reclamar", () => {
    const paso = siguientePaso(
      asignacion({
        estado: "VENCIDA_SIN_PUBLICAR",
        reclamoHasta: "2026-10-26T05:00:00.000Z",
      }),
      []
    )
    expect(paso).toEqual({ tipo: "reclamo", hasta: "2026-10-26T05:00:00.000Z" })
    expect(vencimientoDelPaso(paso)).toBe("2026-10-26T05:00:00.000Z")
  })

  it("las cerradas dicen cómo terminaron", () => {
    for (const [estado, tono] of [
      ["VERIFICADA", "exito"],
      ["LIQUIDADA", "exito"],
      ["PAGADA", "exito"],
      ["RECHAZADA", "neutro"],
      ["CANCELADA", "peligro"],
    ] as const) {
      const paso = siguientePaso(asignacion({ estado }), [])
      expect(paso).toMatchObject({ tipo: "cerrada", tono })
      expect(vencimientoDelPaso(paso)).toBeNull()
    }
  })
})
