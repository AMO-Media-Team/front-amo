import { describe, expect, it } from "vitest"

import type { ClavePermiso } from "@/lib/auth/permisos"

import {
  accionesPermitidas,
  buscarTransicion,
  transicionesDesde,
} from "./acciones"
import type { EntidadTransicion } from "./tipos"
import { TRANSICIONES } from "./transiciones.generated"

/** Entidades del CHECK `transiciones_estado_entidad_chk`. */
const ENTIDADES: readonly EntidadTransicion[] = [
  "anunciantes",
  "asignaciones",
  "campanas",
  "disputas",
  "documentos_anunciante",
  "documentos_medio",
  "documentos_soporte",
  "facturas",
  "liquidaciones",
  "medios",
  "metricas",
  "ofertas",
  "perfiles",
  "publicaciones",
  "verificaciones_cuenta",
]

function clave(t: (typeof TRANSICIONES)[number]): string {
  return [t.entidad, t.desde, t.hacia, t.actor].join("|")
}

describe("transiciones.generated", () => {
  it("cubre todas las entidades sin filas repetidas", () => {
    expect(new Set(TRANSICIONES.map((t) => t.entidad))).toEqual(
      new Set(ENTIDADES)
    )
    const claves = TRANSICIONES.map(clave)
    expect(new Set(claves).size).toBe(claves.length)
  })

  it("está ordenado por entidad, origen, destino y actor", () => {
    const campos = (t: (typeof TRANSICIONES)[number]) => [
      t.entidad,
      t.desde,
      t.hacia,
      t.actor,
    ]
    for (let i = 1; i < TRANSICIONES.length; i++) {
      const anterior = campos(TRANSICIONES[i - 1])
      const actual = campos(TRANSICIONES[i])
      const diferencia = anterior.findIndex((valor, j) => valor !== actual[j])
      expect(
        anterior[diferencia] < actual[diferencia],
        clave(TRANSICIONES[i])
      ).toBe(true)
    }
  })

  it("solo las del SISTEMA van sin permiso", () => {
    for (const t of TRANSICIONES) {
      expect(t.permiso === null, clave(t)).toBe(t.actor === "SISTEMA")
      expect(t.descripcion.trim().length, clave(t)).toBeGreaterThan(0)
    }
  })
})

describe("transicionesDesde", () => {
  it("lista lo que admite la BD para ese actor", () => {
    const destinos = transicionesDesde(
      "asignaciones",
      "PUBLICADA",
      "ADMIN"
    ).map((t) => t.hacia)
    expect(destinos.sort()).toEqual([
      "CANCELADA",
      "CONTENIDO_ENTREGADO",
      "EN_DISPUTA",
      "EVIDENCIA_VALIDADA",
    ])
  })

  it("incluye las del SISTEMA solo si se piden", () => {
    expect(
      transicionesDesde("ofertas", "PUBLICADA", "SISTEMA").map((t) => t.hacia)
    ).toEqual(
      expect.arrayContaining(["CUPOS_COMPLETOS", "EN_EJECUCION", "VENCIDA"])
    )
    expect(
      transicionesDesde("ofertas", "PUBLICADA", "ADMIN").map((t) => t.hacia)
    ).toEqual(["CANCELADA"])
  })

  it("un estado terminal no tiene salidas", () => {
    expect(transicionesDesde("asignaciones", "PAGADA", "ADMIN")).toEqual([])
    expect(transicionesDesde("facturas", "ANULADA", "ADMIN")).toEqual([])
  })
})

describe("buscarTransicion", () => {
  it("encuentra la transición exacta con su motivo", () => {
    expect(
      buscarTransicion("perfiles", "ACTIVO", "SUSPENDIDO", "ADMIN")
    ).toMatchObject({
      permiso: "usuarios.suspender",
      requiereMotivo: true,
      descripcion: "Suspender la cuenta",
    })
  })

  it("no existe para otro actor o un destino no previsto", () => {
    expect(
      buscarTransicion("perfiles", "ACTIVO", "SUSPENDIDO", "MEDIO")
    ).toBeUndefined()
    expect(
      buscarTransicion("asignaciones", "ACEPTADA", "PAGADA", "ADMIN")
    ).toBeUndefined()
  })
})

describe("accionesPermitidas", () => {
  const VALIDADOR: readonly ClavePermiso[] = ["evidencias.validar"]

  it("ofrece solo los destinos cuyo permiso tiene la persona", () => {
    expect(
      accionesPermitidas("asignaciones", "PUBLICADA", "ADMIN", VALIDADOR)
    ).toEqual([
      {
        hacia: "CONTENIDO_ENTREGADO",
        permiso: "evidencias.validar",
        requiereMotivo: true,
        descripcion: "Evidencia rechazada: el medio la vuelve a cargar",
      },
      {
        hacia: "EVIDENCIA_VALIDADA",
        permiso: "evidencias.validar",
        requiereMotivo: false,
        descripcion: "Validar la evidencia",
      },
    ])
  })

  it("depende del tipo de rol, no solo del permiso", () => {
    const disputas: readonly ClavePermiso[] = ["disputas.abrir"]
    expect(
      accionesPermitidas("asignaciones", "PUBLICADA", "MEDIO", disputas)
    ).toEqual([
      {
        hacia: "EN_DISPUTA",
        permiso: "disputas.abrir",
        requiereMotivo: true,
        descripcion: "Abrir disputa",
      },
    ])
    expect(
      accionesPermitidas(
        "asignaciones",
        "VENCIDA_SIN_PUBLICAR",
        "ANUNCIANTE",
        disputas
      )
    ).toEqual([])
  })

  it("incluye la creación desde NUEVO", () => {
    expect(
      accionesPermitidas("campanas", "NUEVO", "ANUNCIANTE", [
        "campanas.gestionar_propias",
      ]).map((accion) => accion.hacia)
    ).toEqual(["BORRADOR"])
  })

  it("sin permisos no ofrece nada y nunca ofrece transiciones del SISTEMA", () => {
    expect(accionesPermitidas("ofertas", "PUBLICADA", "ADMIN", [])).toEqual([])
    const todos = new Set(
      TRANSICIONES.flatMap((t) => (t.permiso ? [t.permiso] : []))
    )
    expect(
      accionesPermitidas("ofertas", "PUBLICADA", "ADMIN", todos).map(
        (accion) => accion.hacia
      )
    ).toEqual(["CANCELADA"])
  })

  it("el medio puede cambiar de nivel sin cambiar de estado", () => {
    expect(
      accionesPermitidas("medios", "VERIFICADO", "ADMIN", ["medios.verificar"])
    ).toEqual([
      expect.objectContaining({ hacia: "VERIFICADO", requiereMotivo: true }),
    ])
  })
})
