// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  CLAVES_PERMISO,
  CLAVES_ROL_SISTEMA,
  PERMISOS,
  ROLES_SISTEMA,
  esPermisoValido,
  esRolSistema,
  permisosDeRol,
  type ClaveRol,
} from "./permisos"

interface FilaDocumento {
  readonly clave: string
  readonly modulo: string
  readonly descripcion: string
  readonly esSensible: boolean
  readonly roles: readonly ClaveRol[]
}

/** Tabla de §6 de docs/modelo-datos.md (fuente de verdad del catálogo). */
function leerCatalogoDocumento(): FilaDocumento[] {
  const documento = readFileSync(
    join(process.cwd(), "docs/modelo-datos.md"),
    "utf8"
  )
  const seccion = documento
    .split("## 6. Catálogo de permisos")[1]
    .split("## 7.")[0]
  return seccion
    .split("\n")
    .filter((linea) => linea.startsWith("| `"))
    .map((linea) => {
      const celdas = linea
        .split("|")
        .slice(1, -1)
        .map((celda) => celda.trim())
      const [claveCelda, modulo, descripcion, ...marcas] = celdas
      return {
        clave: claveCelda.replace(/[`★]/g, "").trim(),
        modulo,
        descripcion,
        esSensible: claveCelda.includes("★"),
        roles: CLAVES_ROL_SISTEMA.filter((_, i) => marcas[i] === "✔"),
      }
    })
}

describe("catálogo de permisos", () => {
  it("coincide con la tabla de §6 de docs/modelo-datos.md (clave, orden, módulo, descripción, sensibilidad y roles)", () => {
    const documento = leerCatalogoDocumento()
    const catalogo = CLAVES_PERMISO.map((clave) => ({
      clave,
      modulo: PERMISOS[clave].modulo,
      descripcion: PERMISOS[clave].descripcion,
      esSensible: PERMISOS[clave].esSensible,
      roles: [...PERMISOS[clave].rolesPorDefecto].sort(
        (a, b) => CLAVES_ROL_SISTEMA.indexOf(a) - CLAVES_ROL_SISTEMA.indexOf(b)
      ),
    }))
    expect(documento.length).toBeGreaterThan(60)
    expect(catalogo).toEqual(documento)
  })

  it("usa claves modulo.accion cuyo prefijo es el módulo", () => {
    for (const clave of CLAVES_PERMISO) {
      expect(clave).toMatch(/^[a-z_]+\.[a-z_]+$/)
      expect(PERMISOS[clave].modulo).toBe(clave.split(".")[0])
    }
  })

  it("otorga todo a SUPERADMIN y no repite roles en un permiso", () => {
    for (const clave of CLAVES_PERMISO) {
      const roles = PERMISOS[clave].rolesPorDefecto
      expect(roles).toContain("SUPERADMIN")
      expect(new Set(roles).size).toBe(roles.length)
    }
    expect(permisosDeRol("SUPERADMIN")).toEqual(CLAVES_PERMISO)
  })

  it("separa funciones: FINANZAS no modera ni verifica y ADMIN no registra pagos", () => {
    expect(permisosDeRol("FINANZAS")).not.toContain("ofertas.moderar")
    expect(permisosDeRol("FINANZAS")).not.toContain("medios.verificar")
    expect(permisosDeRol("ADMIN")).not.toContain("liquidaciones.registrar_pago")
    expect(permisosDeRol("ADMIN")).not.toContain("roles.gestionar")
  })

  it("da a anunciantes y medios solo permisos propios, de su panel o compartidos", () => {
    const externos = new Set([
      ...permisosDeRol("ANUNCIANTE"),
      ...permisosDeRol("MEDIO"),
    ])
    for (const clave of externos) {
      expect(clave).toMatch(
        /(propio|propias|^inicio\.(anunciante|medio)$|^reportes\.(ver|exportar)$|^ofertas\.(marketplace|aceptar)$|^asignaciones\.ejecutar$|^disputas\.abrir$|^notificaciones\.ver$|^cuenta\.gestionar$)/
      )
    }
  })
})

describe("roles de sistema", () => {
  it("exige MFA a todo rol interno y usa colores HEX", () => {
    for (const rol of CLAVES_ROL_SISTEMA) {
      const { tipo, requiereMfa, color, nombre } = ROLES_SISTEMA[rol]
      if (tipo === "ADMIN") expect(requiereMfa).toBe(true)
      expect(color).toMatch(/^#[0-9A-F]{6}$/)
      expect(nombre.length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe("helpers", () => {
  it("esPermisoValido reconoce solo claves del catálogo", () => {
    expect(esPermisoValido("usuarios.ver")).toBe(true)
    expect(esPermisoValido("usuarios.borrar_todo")).toBe(false)
    expect(esPermisoValido("toString")).toBe(false)
  })

  it("esRolSistema reconoce solo los seis roles de sistema", () => {
    expect(esRolSistema("MEDIO")).toBe(true)
    expect(esRolSistema("SOPORTE")).toBe(false)
  })

  it("permisosDeRol respeta el orden del catálogo", () => {
    const medio = permisosDeRol("MEDIO")
    const indices = medio.map((clave) => CLAVES_PERMISO.indexOf(clave))
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
    expect(medio).toContain("ofertas.aceptar")
    expect(medio).not.toContain("ofertas.moderar")
  })
})
