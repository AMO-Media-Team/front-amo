import { describe, expect, it } from "vitest"

import { entradaVacia } from "../fixtures"
import type { AccesoSospechoso } from "../tipos"
import { MOTIVO_PAIS_INUSUAL, reglaAccesosInusuales } from "./accesos-inusuales"

function acceso(
  usuarioId: string,
  paisIso2: string | null,
  extra: Partial<AccesoSospechoso> = {}
): AccesoSospechoso {
  return {
    usuarioId,
    paisIso2,
    esInterno: false,
    motivo: MOTIVO_PAIS_INUSUAL,
    ...extra,
  }
}

describe("reglaAccesosInusuales", () => {
  it("resume accesos, países (en español y en orden) y usuarios", () => {
    const insight = reglaAccesosInusuales(
      entradaVacia({
        accesosSospechosos: [
          acceso("u1", "RU"),
          acceso("u1", "ng"),
          acceso("u2", "RU"),
        ],
      })
    )
    expect(insight).toMatchObject({
      id: "accesos-inusuales",
      regla: 6,
      severidad: "atencion",
      titulo: "3 accesos desde países inusuales",
      metrica: "accesos_sospechosos",
      valor: 3,
    })
    expect(insight?.detalle).toBe(
      "3 inicios de sesión desde países inusuales (Nigeria y Rusia) para 2 usuarios."
    )
    expect(insight?.accion?.href).toBe(
      "/administracion/accesos?motivo=PAIS_INUSUAL&periodo=personalizado&desde=2026-09-01&hasta=2026-09-30"
    )
  })

  it("es crítico si hay cuentas internas", () => {
    const insight = reglaAccesosInusuales(
      entradaVacia({
        accesosSospechosos: [acceso("admin", "BR", { esInterno: true })],
      })
    )
    expect(insight?.severidad).toBe("critico")
    expect(insight?.titulo).toBe("1 acceso desde un país inusual")
    expect(insight?.detalle).toBe(
      "1 inicio de sesión desde un país inusual (Brasil) para 1 usuario. Incluye cuentas internas con permisos administrativos."
    )
  })

  it("usa el nombre que trae la RPC y limita la lista de países", () => {
    const insight = reglaAccesosInusuales(
      entradaVacia({
        accesosSospechosos: [
          acceso("u1", "US", { paisNombre: "EE. UU." }),
          acceso("u2", "DE"),
          acceso("u3", "FR"),
          acceso("u4", "JP"),
          acceso("u5", "MX"),
        ],
      })
    )
    expect(insight?.detalle).toContain("(Alemania, EE. UU., Francia y 2 más)")
  })

  it("sin país conocido no inventa la lista", () => {
    const insight = reglaAccesosInusuales(
      entradaVacia({
        accesosSospechosos: [acceso("u1", null), acceso("u1", null)],
      })
    )
    expect(insight?.detalle).toBe(
      "2 inicios de sesión desde países inusuales para 1 usuario."
    )
  })

  it("ignora otros motivos y sin accesos no dispara", () => {
    expect(
      reglaAccesosInusuales(
        entradaVacia({
          accesosSospechosos: [
            acceso("u1", "RU", { motivo: "MULTIPLES_FALLOS" }),
          ],
        })
      )
    ).toBeNull()
    expect(reglaAccesosInusuales(entradaVacia())).toBeNull()
  })
})
