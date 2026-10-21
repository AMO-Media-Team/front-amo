import { describe, expect, it } from "vitest"

import {
  describirActividad,
  describirNavegador,
  describirUbicacion,
  enmascararIp,
  nombreVisibleFactor,
  PREFIJO_FACTOR_AUTOMATICO,
} from "./presentacion"

describe("enmascararIp", () => {
  it("IPv4: conserva la red y oculta el equipo", () => {
    expect(enmascararIp("181.51.23.4")).toBe("181.51.•••.•••")
    expect(enmascararIp("10.0.0.1/32")).toBe("10.0.•••.•••")
  })

  it("IPv6: conserva los dos primeros grupos", () => {
    expect(enmascararIp("2800:e2:1a80::5d1")).toBe("2800:e2:•••")
  })

  it("sin IP o con formato inesperado", () => {
    expect(enmascararIp(null)).toBeNull()
    expect(enmascararIp("  ")).toBeNull()
    expect(enmascararIp("no-es-ip")).toBe("•••")
  })

  it("omite el propio equipo (loopback)", () => {
    expect(enmascararIp("::1")).toBeNull()
    expect(enmascararIp("127.0.0.1")).toBeNull()
  })
})

describe("describirUbicacion", () => {
  it("ciudad y país en español", () => {
    expect(describirUbicacion("CO", "Medellín")).toBe("Medellín, Colombia")
    expect(describirUbicacion("us", null)).toBe("Estados Unidos")
    expect(describirUbicacion(null, null)).toBeNull()
  })
})

describe("describirNavegador", () => {
  it("combina navegador y sistema cuando existen", () => {
    expect(describirNavegador("Chrome", "macOS")).toBe("Chrome en macOS")
    expect(describirNavegador(null, "Android")).toBe("Navegador en Android")
    expect(describirNavegador("Firefox", null)).toBe("Firefox")
    expect(describirNavegador(null, null)).toBeNull()
  })
})

describe("describirActividad", () => {
  const yo = "0192a0b0-0000-7000-8000-000000000001"

  it("distingue los cambios sobre el propio perfil", () => {
    expect(
      describirActividad(
        { accion: "UPDATE", entidad: "perfiles", entidadId: yo },
        yo
      )
    ).toEqual({ titulo: "Actualizaste tu perfil", tono: "edicion" })
    expect(
      describirActividad(
        { accion: "UPDATE", entidad: "perfiles", entidadId: "otro" },
        yo
      ).titulo
    ).toBe("Modificaste un usuario")
  })

  it("marca como seguridad el cierre de las propias sesiones", () => {
    expect(
      describirActividad(
        { accion: "CERRAR_SESIONES", entidad: "perfiles", entidadId: yo },
        yo
      )
    ).toEqual({ titulo: "Cerraste tus otras sesiones", tono: "seguridad" })
  })

  it("acciones desconocidas no rompen la línea de tiempo", () => {
    expect(
      describirActividad(
        { accion: "NUEVA_ACCION", entidad: "x", entidadId: null },
        yo
      )
    ).toEqual({ titulo: "Otra acción en la plataforma", tono: "neutro" })
  })
})

describe("nombreVisibleFactor", () => {
  it("oculta la fecha de los nombres automáticos", () => {
    const automatico = `${PREFIJO_FACTOR_AUTOMATICO}30 sept 2026, 6:44 p. m.`
    expect(nombreVisibleFactor(automatico, 0)).toBe("App autenticadora")
    expect(nombreVisibleFactor(automatico, 1)).toBe("App autenticadora 2")
    expect(nombreVisibleFactor("  ", 0)).toBe("App autenticadora")
  })

  it("respeta un nombre propio", () => {
    expect(nombreVisibleFactor(" iPhone de Ana ", 0)).toBe("iPhone de Ana")
  })
})
