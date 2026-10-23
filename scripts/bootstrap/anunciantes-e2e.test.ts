// @vitest-environment node
import { describe, expect, it } from "vitest"

import { nitValido } from "../../src/lib/colombia/nit"
import {
  accionAnuncianteNuevo,
  ANUNCIANTE_E2E,
  ANUNCIANTE_E2E_ID,
  ANUNCIANTE_NUEVO_E2E,
  ANUNCIANTE_NUEVO_E2E_ID,
  cambiosAnunciante,
  describirAccionAnuncianteNuevo,
  describirPasoAnunciante,
  DOCUMENTOS_EXIGIDOS_CO,
  type FilaAnuncianteNuevo,
  filaBaseAnunciante,
  planAnuncianteVerificado,
  tiposVigentes,
  vigenciaDocumentoAnunciante,
} from "./anunciantes-e2e"
import { MEDIO_E2E_ID, MEDIO_NUEVO_E2E_ID } from "./medios-e2e"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SECTOR = "01a16525-0678-743f-a97d-e3a428a167a0"

const RECIEN_REGISTRADO: FilaAnuncianteNuevo = {
  estado_verificacion: "PENDIENTE",
  verificado_at: null,
  rechazado_at: null,
  suspendido_at: null,
  motivo_estado: null,
  deleted_at: null,
}

describe("ids y datos base", () => {
  it("los anunciantes E2E tienen ids fijos, válidos y distintos de los demás fijos", () => {
    const ids = [
      ANUNCIANTE_E2E_ID,
      ANUNCIANTE_NUEVO_E2E_ID,
      MEDIO_E2E_ID,
      MEDIO_NUEVO_E2E_ID,
    ]
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(UUID)
    expect(ANUNCIANTE_E2E.id).toBe(ANUNCIANTE_E2E_ID)
    expect(ANUNCIANTE_NUEVO_E2E.id).toBe(ANUNCIANTE_NUEVO_E2E_ID)
  })

  it("son empresas colombianas con NIT y DV válidos, distintos entre sí", () => {
    for (const datos of [ANUNCIANTE_E2E, ANUNCIANTE_NUEVO_E2E]) {
      expect(nitValido(datos.nit, datos.digitoVerificacion)).toBe(true)
    }
    // El de la migración de actores no cambia: las cuentas existentes lo usan.
    expect(ANUNCIANTE_E2E).toMatchObject({
      nit: "999000001",
      digitoVerificacion: "2",
    })
    expect(ANUNCIANTE_NUEVO_E2E.nit).not.toBe(ANUNCIANTE_E2E.nit)
    expect(ANUNCIANTE_NUEVO_E2E.nombreComercial).toBe("Anunciante Nuevo E2E")
  })

  it("la fila base es de Colombia, sin identificación extranjera, logo ni facturación", () => {
    expect(filaBaseAnunciante(ANUNCIANTE_NUEVO_E2E, SECTOR, "05001")).toEqual({
      razon_social: "Anunciante Nuevo E2E S.A.S.",
      nombre_comercial: "Anunciante Nuevo E2E",
      nit: "999000002",
      digito_verificacion: ANUNCIANTE_NUEVO_E2E.digitoVerificacion,
      identificacion_extranjera: null,
      sector_id: SECTOR,
      pais_iso2: "CO",
      municipio_codigo: "05001",
      ciudad_extranjera: null,
      datos_facturacion: {},
      logo_path: null,
      deleted_at: null,
    })
  })
})

describe("cambiosAnunciante", () => {
  const deseada = filaBaseAnunciante(ANUNCIANTE_E2E, SECTOR, "11001")

  it("no cambia nada si la fila ya es la base (tampoco por el orden de un JSON)", () => {
    expect(cambiosAnunciante({ ...deseada }, deseada)).toBeNull()
  })

  it("devuelve solo lo que una prueba cambió desde «Mi empresa»", () => {
    const cambiada = {
      ...deseada,
      nombre_comercial: "Otra marca",
      datos_facturacion: { correo: "facturas@amo.test" },
      logo_path: `anunciante/${ANUNCIANTE_E2E_ID}/logo-1.webp`,
    }
    expect(cambiosAnunciante(cambiada, deseada)).toEqual({
      nombre_comercial: "Anunciante E2E",
      datos_facturacion: {},
      logo_path: null,
    })
  })
})

describe("accionAnuncianteNuevo", () => {
  it("lo crea si no existe y lo limpia si sigue recién registrado", () => {
    expect(accionAnuncianteNuevo(null)).toBe("CREAR")
    expect(accionAnuncianteNuevo(RECIEN_REGISTRADO)).toBe("LIMPIAR")
  })

  it("lo registra de nuevo si el equipo AMO ya decidió sobre él", () => {
    const decididos: FilaAnuncianteNuevo[] = [
      {
        ...RECIEN_REGISTRADO,
        estado_verificacion: "VERIFICADO",
        verificado_at: "2026-10-22T00:00:00Z",
      },
      {
        ...RECIEN_REGISTRADO,
        estado_verificacion: "RECHAZADO",
        motivo_estado: "RUT ilegible",
      },
      // Reenviado tras un rechazo: PENDIENTE, pero con la marca del rechazo.
      { ...RECIEN_REGISTRADO, rechazado_at: "2026-10-22T00:00:00Z" },
      { ...RECIEN_REGISTRADO, deleted_at: "2026-10-22T00:00:00Z" },
    ]
    for (const fila of decididos)
      expect(accionAnuncianteNuevo(fila)).toBe("RECREAR")
  })

  it("describe cada acción para el registro", () => {
    expect(describirAccionAnuncianteNuevo("CREAR")).toMatch(/PENDIENTE/)
    expect(describirAccionAnuncianteNuevo("LIMPIAR")).toMatch(/reiniciado/)
    expect(describirAccionAnuncianteNuevo("RECREAR")).toMatch(/de nuevo/)
  })
})

describe("documentos del anunciante verificado", () => {
  it("cuenta como vigentes los aprobados sin vencimiento o que vencen hoy o después", () => {
    expect(
      tiposVigentes(
        [
          { tipo: "RUT", fecha_vencimiento: null },
          { tipo: "CAMARA_COMERCIO", fecha_vencimiento: "2026-10-21" },
          { tipo: "OTRO", fecha_vencimiento: "2026-10-22" },
        ],
        "2026-10-22"
      ).sort()
    ).toEqual(["OTRO", "RUT"])
  })

  it("la Cámara de Comercio vence en un año (Bogotá) y el RUT no vence", () => {
    // 23:30 del 21 en Bogotá = 04:30 UTC del 22.
    const ahora = new Date("2026-10-22T04:30:00Z")
    expect(vigenciaDocumentoAnunciante("CAMARA_COMERCIO", ahora)).toBe(
      "2027-10-21"
    )
    expect(vigenciaDocumentoAnunciante("RUT", ahora)).toBeNull()
  })
})

describe("planAnuncianteVerificado", () => {
  const todos = [...DOCUMENTOS_EXIGIDOS_CO]

  it("no hace nada si ya está verificado con sus documentos al día", () => {
    expect(
      planAnuncianteVerificado({
        estado: "VERIFICADO",
        documentosVigentes: todos,
      })
    ).toEqual([])
  })

  it("carga y aprueba los documentos que falten, aunque ya esté verificado", () => {
    expect(
      planAnuncianteVerificado({
        estado: "VERIFICADO",
        documentosVigentes: ["RUT"],
      })
    ).toEqual([{ paso: "APROBAR_DOCUMENTO", documento: "CAMARA_COMERCIO" }])
  })

  it("recién registrado (tras una purga): documentos primero, luego verificar", () => {
    expect(
      planAnuncianteVerificado({ estado: "PENDIENTE", documentosVigentes: [] })
    ).toEqual([
      { paso: "APROBAR_DOCUMENTO", documento: "RUT" },
      { paso: "APROBAR_DOCUMENTO", documento: "CAMARA_COMERCIO" },
      { paso: "VERIFICAR" },
    ])
  })

  it("rechazado: lo reenvía su usuario y luego se verifica; suspendido: se reactiva", () => {
    expect(
      planAnuncianteVerificado({
        estado: "RECHAZADO",
        documentosVigentes: todos,
      })
    ).toEqual([{ paso: "REENVIAR_A_VERIFICACION" }, { paso: "VERIFICAR" }])
    expect(
      planAnuncianteVerificado({
        estado: "SUSPENDIDO",
        documentosVigentes: todos,
      })
    ).toEqual([{ paso: "REACTIVAR" }])
  })

  it("describe cada paso para el registro", () => {
    expect(
      describirPasoAnunciante({ paso: "APROBAR_DOCUMENTO", documento: "RUT" })
    ).toBe("documento RUT aprobado")
    expect(describirPasoAnunciante({ paso: "REACTIVAR" })).toMatch(/suspendido/)
  })
})
