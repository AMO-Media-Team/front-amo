import { describe, expect, it } from "vitest"

import { construirCambios } from "./diferencias"
import { datosExportacionBitacora, describirCambios } from "./exportacion"
import { describirEvento, type FilaBitacora } from "./presentacion"

const FILA: FilaBitacora = {
  id: 7,
  created_at: "2026-09-30T22:30:00Z",
  accion: "UPDATE",
  entidad: "perfiles",
  entidad_id: "c2b7b4c9-3b92-4ca6-8d16-e05f37b8231c",
  actor_id: null,
  actor_email: null,
  actor_rol: null,
  estado_anterior: null,
  estado_nuevo: null,
  cambios: {
    nombre: { antes: null, despues: "Ana" },
    celular: { antes: "••••1234", despues: "••••9876" },
  },
  metadatos: {},
  motivo: "Corrección",
  origen: "DB",
  ip: "181.52.10.20",
  pais_iso2: null,
  ciudad: null,
  user_agent: null,
}

describe("describirCambios", () => {
  it("antes → después en una línea; creaciones con un solo valor", () => {
    expect(
      describirCambios(construirCambios("UPDATE", FILA.cambios).campos)
    ).toBe("Celular: ••••1234 → ••••9876; Nombre: Vacío → Ana")
    expect(
      describirCambios(construirCambios("INSERT", { nombre: "Norte" }).campos)
    ).toBe("Nombre: Norte")
  })
})

describe("datosExportacionBitacora", () => {
  it("una fila por evento con tantas celdas como columnas y la IP ya enmascarada", () => {
    const evento = describirEvento(FILA, {
      nombres: new Map(),
      perfiles: new Map(),
      roles: new Map(),
      nombrePais: () => null,
      ipCompleta: false,
    })
    const datos = datosExportacionBitacora([evento])
    expect(datos.titulo).toBe("Bitácora AMO")
    expect(datos.filas).toHaveLength(1)
    expect(datos.filas[0]).toHaveLength(datos.columnas.length)
    expect(datos.filas[0][0]).toEqual(new Date(FILA.created_at))
    expect(datos.filas[0]).toContain("181.52.•••.•••")
    expect(datos.filas[0]).toContain("Base de datos")
    expect(datos.filas[0]).not.toContain("181.52.10.20")
  })
})
