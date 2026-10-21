import { describe, expect, it } from "vitest"

import { construirHistorial, VENTANA_AGRUPACION_MS } from "./historial"
import type { EventoBitacoraRol } from "./tipos"

const ACTOR = "actor-1"
const OTRO = "actor-2"
const T0 = Date.parse("2026-09-30T15:00:00.000Z")

let secuencia = 1000

function evento(
  cambios: Partial<EventoBitacoraRol> & Pick<EventoBitacoraRol, "accion">
): EventoBitacoraRol {
  secuencia -= 1
  return {
    id: secuencia,
    at: new Date(T0).toISOString(),
    entidad: "rol_permisos",
    actorId: ACTOR,
    actorEmail: "an•••@amo.test",
    actorRol: "SUPERADMIN",
    cambios: {},
    origen: "APP",
    ...cambios,
  }
}

function permiso(
  accion: "INSERT" | "DELETE",
  clave: string,
  desfaseMs = 0,
  actorId = ACTOR
): EventoBitacoraRol {
  return evento({
    accion,
    actorId,
    at: new Date(T0 - desfaseMs).toISOString(),
    cambios: { rol_id: "rol", permiso_clave: clave },
  })
}

describe("construirHistorial", () => {
  it("agrupa los permisos de un mismo guardado por actor y cercanía", () => {
    const historial = construirHistorial([
      permiso("INSERT", "roles.ver"),
      permiso("INSERT", "inicio.admin", 200),
      permiso("DELETE", "usuarios.ver", 400),
    ])
    expect(historial).toHaveLength(1)
    expect(historial[0]).toMatchObject({
      tipo: "permisos",
      agregados: ["inicio.admin", "roles.ver"],
      quitados: ["usuarios.ver"],
      actor: { id: ACTOR, email: "an•••@amo.test", rol: "SUPERADMIN" },
    })
  })

  it("separa guardados de actores distintos o fuera de la ventana", () => {
    const historial = construirHistorial([
      permiso("INSERT", "roles.ver"),
      permiso("INSERT", "inicio.admin", 100, OTRO),
      permiso("INSERT", "usuarios.ver", 100 + VENTANA_AGRUPACION_MS + 1, OTRO),
    ])
    expect(historial.map((entrada) => entrada.tipo)).toEqual([
      "permisos",
      "permisos",
      "permisos",
    ])
  })

  it("no funde la copia al crear el rol con un ajuste hecho poco después", () => {
    const historial = construirHistorial([
      permiso("DELETE", "roles.ver"),
      permiso("INSERT", "roles.ver", 3_000),
      permiso("INSERT", "inicio.admin", 3_050),
    ])
    expect(historial).toMatchObject([
      { tipo: "permisos", agregados: [], quitados: ["roles.ver"] },
      {
        tipo: "permisos",
        agregados: ["inicio.admin", "roles.ver"],
        quitados: [],
      },
    ])
  })

  it("un permiso otorgado y retirado en el mismo grupo no cuenta; el grupo vacío desaparece", () => {
    expect(
      construirHistorial([
        permiso("DELETE", "roles.ver"),
        permiso("INSERT", "roles.ver", 50),
      ])
    ).toEqual([])
  })

  it("ignora claves que ya no existen en el catálogo", () => {
    const historial = construirHistorial([
      permiso("INSERT", "modulo.retirado"),
      permiso("INSERT", "roles.ver", 10),
    ])
    expect(historial[0]).toMatchObject({
      agregados: ["roles.ver"],
      quitados: [],
    })
  })

  it("describe la creación y las ediciones de datos del rol", () => {
    const historial = construirHistorial([
      evento({
        accion: "UPDATE",
        entidad: "roles",
        cambios: {
          color: { antes: "#8C66EE", despues: "#3987E5" },
          descripcion: { antes: null, despues: "Nuevo texto" },
          updated_at: { antes: "a", despues: "b" },
        },
      }),
      evento({
        accion: "INSERT",
        entidad: "roles",
        actorEmail: null,
        actorId: null,
        cambios: { clave: "SOPORTE", nombre: "Soporte" },
      }),
    ])
    expect(historial).toMatchObject([
      {
        tipo: "editado",
        cambios: [
          { campo: "descripcion", antes: null, despues: "Nuevo texto" },
          { campo: "color", antes: "#8C66EE", despues: "#3987E5" },
        ],
      },
      {
        tipo: "creado",
        clave: "SOPORTE",
        nombre: "Soporte",
        actor: { id: null, email: null },
      },
    ])
  })

  it("omite ediciones sin campos visibles y otras entidades", () => {
    expect(
      construirHistorial([
        evento({
          accion: "UPDATE",
          entidad: "roles",
          cambios: { updated_at: { antes: "a", despues: "b" } },
        }),
        evento({ accion: "DELETE", entidad: "roles" }),
        evento({ accion: "INSERT", entidad: "perfiles" }),
      ])
    ).toEqual([])
  })

  it("mantiene el orden de más reciente a más antiguo entre tipos", () => {
    const historial = construirHistorial([
      permiso("INSERT", "roles.ver"),
      evento({
        accion: "UPDATE",
        entidad: "roles",
        cambios: { nombre: { antes: "A", despues: "B" } },
      }),
      permiso("INSERT", "inicio.admin", 1000),
    ])
    expect(historial.map((entrada) => entrada.tipo)).toEqual([
      "permisos",
      "editado",
      "permisos",
    ])
  })
})
