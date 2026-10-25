import { describe, expect, it } from "vitest"

import type { RespaldoConfiguracion } from "./configuracion-pruebas-plan"
import {
  type ArgumentosLimpieza,
  avisosDeEstado,
  confirmacionCorrecta,
  conteosOrdenados,
  entidadesConfiguracion,
  esVersionDePrueba,
  exigirNombreTabla,
  formatearTamano,
  type HechosLimpieza,
  idsConservar,
  idsTerminosARetirar,
  leerArgumentos,
  planStorage,
  problemasDeEstado,
  problemasDeOrden,
  problemasRespaldo,
  problemasVerificacion,
  proyectoDeUrl,
  resolucionesConConsecutivoUsado,
  resumirUsuarios,
  rutaInforme,
  rutasPorBucket,
  rutasRespaldoRequeridas,
  sinTerminosRetirados,
  sqlPendiente,
  type Superadmin,
  tablasSinClasificar,
  tiposSinTextoDefinitivo,
  urlApiDe,
  type VersionTermino,
} from "./limpiar-pruebas-plan"

const AHORA = new Date("2026-10-24T15:00:00Z")

function superadmin(
  id: string,
  email: string,
  cambios: Partial<Superadmin> = {}
): Superadmin {
  return {
    id,
    email,
    estado: "ACTIVO",
    eliminado: false,
    factoresVerificados: 1,
    ...cambios,
  }
}

const TRES = [
  superadmin("c", "andres@amo.co"),
  superadmin("a", "operaciones@amo.co"),
  superadmin("b", "gerencia@amo.co"),
]

function argumentos(
  cambios: Partial<ArgumentosLimpieza> = {}
): ArgumentosLimpieza {
  return {
    entorno: "produccion",
    ejecutar: true,
    confirmarProduccion: true,
    sinTextosDefinitivos: false,
    ...cambios,
  }
}

function hechos(cambios: Partial<HechosLimpieza> = {}): HechosLimpieza {
  return {
    argumentos: argumentos(),
    superadmins: TRES,
    superadminEmail: "Andres@amo.co",
    textosSinDefinitivo: [],
    respaldo: [
      { ruta: "esquema.sql", bytes: 2048, modo: 0o100600 },
      { ruta: "datos.sql", bytes: 4096, modo: 0o100600 },
    ],
    tablasSinClasificar: [],
    ...cambios,
  }
}

describe("leerArgumentos", () => {
  it("simula por defecto y exige un solo entorno", () => {
    expect(leerArgumentos(["local"])).toEqual({
      entorno: "local",
      ejecutar: false,
      confirmarProduccion: false,
      sinTextosDefinitivos: false,
    })
    expect(() => leerArgumentos([])).toThrow(/entorno/)
    expect(() => leerArgumentos(["local", "develop"])).toThrow(/entorno/)
    expect(() => leerArgumentos(["staging"])).toThrow(/entorno/)
  })

  it("lee las banderas y rechaza las desconocidas", () => {
    expect(
      leerArgumentos([
        "produccion",
        "--ejecutar",
        "--confirmar-produccion",
        "--sin-textos-definitivos",
      ])
    ).toEqual({
      entorno: "produccion",
      ejecutar: true,
      confirmarProduccion: true,
      sinTextosDefinitivos: true,
    })
    expect(() => leerArgumentos(["local", "--forzar"])).toThrow(/--forzar/)
    expect(() => leerArgumentos(["develop", "--confirmar-produccion"])).toThrow(
      /solo aplica a produccion/
    )
  })
})

describe("urlApiDe y proyectoDeUrl", () => {
  it("en local exige la pila de supabase start", () => {
    expect(urlApiDe("local", "http://127.0.0.1:54321/", ".env.local")).toBe(
      "http://127.0.0.1:54321"
    )
    expect(() => urlApiDe("local", undefined, ".env.local")).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/
    )
    expect(() =>
      urlApiDe(
        "local",
        "https://oriuuuaczpncmtglfgpv.supabase.co",
        ".env.local"
      )
    ).toThrow(/pila local/)
  })

  it("en develop y producción sale del ref y no admite otro proyecto", () => {
    expect(urlApiDe("develop", undefined, ".env.develop")).toBe(
      "https://depbmnlpfnrcsbqlwxxd.supabase.co"
    )
    expect(
      urlApiDe(
        "produccion",
        "https://oriuuuaczpncmtglfgpv.supabase.co",
        ".env.produccion"
      )
    ).toBe("https://oriuuuaczpncmtglfgpv.supabase.co")
    expect(() =>
      urlApiDe(
        "produccion",
        "https://depbmnlpfnrcsbqlwxxd.supabase.co",
        ".env.produccion"
      )
    ).toThrow(/otro proyecto/)
  })

  it("nombra el proyecto como el respaldo de prod:config-pruebas", () => {
    expect(proyectoDeUrl("https://oriuuuaczpncmtglfgpv.supabase.co")).toBe(
      "oriuuuaczpncmtglfgpv"
    )
    expect(proyectoDeUrl("http://127.0.0.1:54321")).toBe("127.0.0.1")
  })
})

describe("estado de la base", () => {
  it("conserva solo a los superadministradores activos, en orden", () => {
    const todos = [
      ...TRES,
      superadmin("d", "invitado@amo.co", { estado: "INVITADO" }),
      superadmin("e", "borrado@amo.co", { eliminado: true }),
    ]
    expect(idsConservar(todos)).toEqual(["a", "b", "c"])
  })

  it("detecta tablas que nadie clasificó", () => {
    expect(
      tablasSinClasificar(
        ["public.medios", "public.nueva", "private.festivos", "private.otra"],
        { conservar: ["private.festivos"], borrar: ["public.medios"] }
      )
    ).toEqual(["private.otra", "public.nueva"])
  })

  it("solo interpola nombres calificados de public y private", () => {
    expect(exigirNombreTabla("public.medios_privado")).toBe(
      "public.medios_privado"
    )
    expect(() => exigirNombreTabla("auth.users")).toThrow()
    expect(() => exigirNombreTabla("public.x; drop table y")).toThrow()
  })

  it("retoma en Storage solo si la limpieza ya corrió y no queda negocio", () => {
    const vacio = { "public.medios": 0, "public.bitacora": 0 }
    expect(sqlPendiente(vacio, false, 0)).toBe(true)
    expect(
      sqlPendiente(
        { ...vacio, "public.bitacora": 12, "public.accesos": 3 },
        true,
        0
      )
    ).toBe(false)
    expect(sqlPendiente({ ...vacio, "public.medios": 1 }, true, 0)).toBe(true)
    expect(sqlPendiente(vacio, true, 2)).toBe(true)
  })
})

describe("textos legales", () => {
  const versiones: VersionTermino[] = [
    {
      id: "t1",
      tipo: "TERMINOS_MEDIO",
      version: "1.0",
      publicada: true,
      vigenteDesde: "2026-10-01T00:00:00Z",
    },
    {
      id: "t2",
      tipo: "TERMINOS_ANUNCIANTE",
      version: "0.1-PRUEBA",
      publicada: true,
      vigenteDesde: "2026-10-01T00:00:00Z",
    },
    {
      id: "t3",
      tipo: "POLITICA_DATOS",
      version: "1.0",
      publicada: true,
      vigenteDesde: "2026-11-01T00:00:00Z",
    },
    {
      id: "t4",
      tipo: "CONDICIONES_COMERCIALES",
      version: "1.0",
      publicada: false,
      vigenteDesde: null,
    },
    {
      id: "t5",
      tipo: "CONDICIONES_COMERCIALES",
      version: "0.9",
      publicada: true,
      vigenteDesde: "2026-09-01T00:00:00Z",
    },
  ]

  it("reconoce las versiones de prueba con la misma regla que la base", () => {
    expect(esVersionDePrueba("0.1-PRUEBA")).toBe(true)
    expect(esVersionDePrueba("1.0")).toBe(false)
    expect(idsTerminosARetirar(versiones, ["t2", "x"])).toEqual(["t2", "x"])
  })

  it("exige una versión publicada, vigente y no de prueba por documento", () => {
    // Anunciante: solo la de prueba; datos: definitiva aún no vigente.
    expect(tiposSinTextoDefinitivo(versiones, AHORA, new Set(["t2"]))).toEqual([
      "TERMINOS_ANUNCIANTE",
      "POLITICA_DATOS",
    ])
    // Una versión que se retira (por su id en el respaldo) no cuenta.
    expect(
      tiposSinTextoDefinitivo(versiones, AHORA, new Set(["t2", "t5"]))
    ).toContain("CONDICIONES_COMERCIALES")
  })

  it("olvida del respaldo de configuración las versiones retiradas", () => {
    const respaldo: RespaldoConfiguracion = {
      proyecto: "127.0.0.1",
      creado: AHORA.toISOString(),
      parametros: {},
      terminos: [
        { id: "t2", tipo: "TERMINOS_ANUNCIANTE", version: "0.1-PRUEBA" },
      ],
    }
    expect(sinTerminosRetirados(respaldo, new Set(["otro"]))).toBe(respaldo)
    expect(sinTerminosRetirados(respaldo, new Set(["t2"])).terminos).toEqual([])
  })
})

describe("respaldo del mismo día", () => {
  it("usa el día de Bogotá y la etiqueta de la limpieza", () => {
    // 10 p. m. del 24 en Bogotá ya es el 25 en UTC.
    expect(rutasRespaldoRequeridas(new Date("2026-10-25T03:00:00Z"))).toEqual([
      "context/respaldos/produccion-2026-10-24-antes-limpieza-esquema.sql",
      "context/respaldos/produccion-2026-10-24-antes-limpieza-datos.sql",
    ])
  })

  it("exige archivos presentes, no vacíos y privados", () => {
    expect(
      problemasRespaldo([
        { ruta: "a.sql", bytes: null, modo: null },
        { ruta: "b.sql", bytes: 0, modo: 0o100600 },
        { ruta: "c.sql", bytes: 10, modo: 0o100644 },
        { ruta: "d.sql", bytes: 10, modo: 0o100600 },
      ])
    ).toEqual([
      expect.stringMatching(/Falta el respaldo de hoy a\.sql/),
      expect.stringMatching(/b\.sql está vacío/),
      expect.stringMatching(/c\.sql es legible/),
    ])
  })
})

describe("salvaguardas", () => {
  it("deja ejecutar en producción con todo en regla", () => {
    expect(problemasDeEstado(hechos())).toEqual([])
    expect(problemasDeOrden(argumentos(), { tty: true, ci: false })).toEqual([])
  })

  it("exige exactamente 3 superadministradores activos con MFA", () => {
    expect(
      problemasDeEstado(hechos({ superadmins: TRES.slice(0, 2) }))
    ).toEqual([expect.stringMatching(/exactamente 3 .* hay 2/)])
    const sinFactor = [
      ...TRES.slice(0, 2),
      superadmin("b", "gerencia@amo.co", { factoresVerificados: 0 }),
    ]
    expect(problemasDeEstado(hechos({ superadmins: sinFactor }))).toEqual([
      expect.stringMatching(/sin un factor MFA verificado: ge•••@amo\.co/),
    ])
  })

  it("no borra superadministradores inactivos sin que alguien lo decida", () => {
    const conInvitado = [
      ...TRES,
      superadmin("d", "nuevo@amo.co", { estado: "INVITADO" }),
    ]
    expect(problemasDeEstado(hechos({ superadmins: conInvitado }))).toEqual([
      expect.stringMatching(/no están activos .* nu•••@amo\.co \(INVITADO\)/),
    ])
  })

  it("exige SUPERADMIN_EMAIL entre los activos", () => {
    expect(problemasDeEstado(hechos({ superadminEmail: undefined }))).toEqual([
      expect.stringMatching(/Define SUPERADMIN_EMAIL/),
    ])
    expect(
      problemasDeEstado(hechos({ superadminEmail: "otra@amo.co" }))
    ).toEqual([expect.stringMatching(/no es uno de los superadministradores/)])
  })

  it("exige los textos definitivos salvo --sin-textos-definitivos", () => {
    const sinPolitica = hechos({ textosSinDefinitivo: ["POLITICA_DATOS"] })
    expect(problemasDeEstado(sinPolitica)).toEqual([
      expect.stringMatching(/Sin versión definitiva vigente .*POLITICA_DATOS/),
    ])
    const permitido = {
      ...sinPolitica,
      argumentos: argumentos({ sinTextosDefinitivos: true }),
    }
    expect(problemasDeEstado(permitido)).toEqual([])
    expect(avisosDeEstado(permitido)).toEqual([
      expect.stringMatching(/Quedarán sin versión vigente/),
    ])
  })

  it("exige el respaldo y las tablas clasificadas", () => {
    expect(
      problemasDeEstado(
        hechos({
          respaldo: [{ ruta: "x.sql", bytes: null, modo: null }],
          tablasSinClasificar: ["public.nueva"],
        })
      )
    ).toEqual([
      expect.stringMatching(/Tablas sin clasificar .*public\.nueva/),
      expect.stringMatching(/Falta el respaldo/),
    ])
  })

  it("fuera de producción solo bloquea lo que dejaría la limpieza mal hecha", () => {
    const local = hechos({
      argumentos: argumentos({ entorno: "local", confirmarProduccion: false }),
      superadmins: [
        superadmin("a", "dev@amo.test", { factoresVerificados: 0 }),
      ],
      superadminEmail: undefined,
      textosSinDefinitivo: ["POLITICA_DATOS"],
      respaldo: null,
    })
    expect(problemasDeEstado(local)).toEqual([])
    expect(avisosDeEstado(local)).toEqual([
      expect.stringMatching(/sin MFA verificado/),
      expect.stringMatching(/Sin versión legal definitiva/),
    ])
    expect(problemasDeEstado({ ...local, superadmins: [] })).toEqual([
      expect.stringMatching(/No hay superadministradores activos/),
    ])
    const conSuspendido = {
      ...local,
      superadmins: [
        superadmin("a", "dev@amo.test"),
        superadmin("b", "viejo@amo.test", { estado: "SUSPENDIDO" }),
      ],
    }
    expect(problemasDeEstado(conSuspendido)).toEqual([])
    expect(avisosDeEstado(conSuspendido)).toContainEqual(
      expect.stringMatching(
        /no activos que se borrarán.*vi•••@amo\.test \(SUSPENDIDO\)/
      )
    )
  })

  it("pide la confirmación en una terminal real fuera de local", () => {
    expect(
      problemasDeOrden(argumentos({ entorno: "local" }), {
        tty: false,
        ci: true,
      })
    ).toEqual([])
    expect(
      problemasDeOrden(argumentos({ confirmarProduccion: false }), {
        tty: false,
        ci: true,
      })
    ).toHaveLength(3)
    expect(
      problemasDeOrden(
        argumentos({ entorno: "develop", confirmarProduccion: false }),
        { tty: false, ci: false }
      )
    ).toEqual([expect.stringMatching(/terminal interactiva/)])
    expect(
      confirmacionCorrecta(" oriuuuaczpncmtglfgpv\n", "oriuuuaczpncmtglfgpv")
    ).toBe(true)
    expect(confirmacionCorrecta("si", "oriuuuaczpncmtglfgpv")).toBe(false)
  })
})

describe("lo que se borra", () => {
  it("resume las cuentas por rol con los correos enmascarados", () => {
    const resumen = resumirUsuarios([
      { email: "demo.medio1@demo.amo.co", rol: "MEDIO" },
      { email: "demo.medio2@demo.amo.co", rol: "MEDIO" },
      { email: "cliente@empresa.co", rol: "ANUNCIANTE" },
      { email: null, rol: null },
    ])
    expect(resumen).toEqual({
      total: 4,
      porRol: { MEDIO: 2, ANUNCIANTE: 1, SIN_PERFIL: 1 },
      correos: [
        { correo: "de•••@demo.amo.co", cuentas: 2 },
        { correo: "(sin correo)", cuentas: 1 },
        { correo: "cl•••@empresa.co", cuentas: 1 },
      ],
    })
    expect(JSON.stringify(resumen)).not.toContain("demo.medio1")
  })

  it("borra todo Storage salvo los avatares de los superadministradores", () => {
    const plan = planStorage(
      [
        { bucket: "avatares", nombre: "perfil/a/foto.webp", bytes: 100 },
        { bucket: "avatares", nombre: "perfil/z/foto.webp", bytes: 200 },
        { bucket: "creativos", nombre: "oferta/o/1.mp4", bytes: 1000 },
        { bucket: "creativos", nombre: "oferta/o/2.jpg", bytes: 300 },
        // Misma ruta en otro bucket: no es un avatar.
        { bucket: "documentos", nombre: "perfil/a/foto.webp", bytes: 50 },
      ],
      ["perfil/a/foto.webp"]
    )
    expect(plan.conservar).toEqual([
      { bucket: "avatares", nombre: "perfil/a/foto.webp", bytes: 100 },
    ])
    expect(plan.total).toEqual({ objetos: 4, bytes: 1550 })
    expect(plan.porBucket).toEqual({
      avatares: { objetos: 1, bytes: 200 },
      creativos: { objetos: 2, bytes: 1300 },
      documentos: { objetos: 1, bytes: 50 },
    })
    expect([...rutasPorBucket(plan.borrar)]).toEqual([
      ["avatares", ["perfil/z/foto.webp"]],
      ["creativos", ["oferta/o/1.mp4", "oferta/o/2.jpg"]],
      ["documentos", ["perfil/a/foto.webp"]],
    ])
  })

  it("formatea tamaños y ordena los conteos", () => {
    expect(formatearTamano(512)).toBe("512 B")
    expect(formatearTamano(1638)).toBe("1,6 KB")
    expect(formatearTamano(12.3 * 1024 * 1024)).toBe("12,3 MB")
    expect(
      conteosOrdenados({ "public.a": 2, "public.b": 0, "public.c": 9 })
    ).toEqual([
      ["public.c", 9],
      ["public.a", 2],
    ])
  })
})

describe("avisos de lo que se conserva", () => {
  it("señala las resoluciones reales cuyo consecutivo avanzó", () => {
    const base = { tipo: "FACTURA_VENTA", numeroResolucion: "18760000001" }
    expect(
      resolucionesConConsecutivoUsado(
        [
          {
            ...base,
            id: "r1",
            prefijo: "AMO",
            rangoDesde: 1,
            consecutivoActual: 12,
          },
          {
            ...base,
            id: "r2",
            prefijo: "AMO2",
            rangoDesde: 1,
            consecutivoActual: 0,
          },
          {
            ...base,
            id: "r3",
            prefijo: "PFE",
            rangoDesde: 1,
            consecutivoActual: 4,
          },
          {
            ...base,
            id: "r4",
            prefijo: "DEMO",
            rangoDesde: 1,
            consecutivoActual: 9,
          },
        ],
        new Set(["r3"])
      ).map((resolucion) => resolucion.id)
    ).toEqual(["r1"])
  })

  it("lista la configuración que se conserva, sin perfiles ni geografía", () => {
    expect(
      entidadesConfiguracion({
        conservar: [
          "public.configuracion",
          "public.perfiles",
          "public.municipios",
          "public.tarifas",
          "private.festivos",
        ],
        borrar: ["public.medios"],
      })
    ).toEqual(["configuracion", "tarifas"])
  })
})

describe("verificación", () => {
  const limpia = {
    restantes: { "public.medios": 0, "public.bitacora": 0 },
    perfiles: 3,
    usuariosAuth: 3,
    conservar: 3,
    storagePendiente: 0,
    parametrosPendientes: [],
    finanzasPendientes: 0,
  }

  it("pasa sin negocio, con las cuentas conservadas y Storage vacío", () => {
    expect(problemasVerificacion(limpia)).toEqual([])
  })

  it("enumera lo que quedó", () => {
    expect(
      problemasVerificacion({
        ...limpia,
        restantes: { "public.medios": 2, "public.bitacora": 1500 },
        perfiles: 4,
        usuariosAuth: 5,
        storagePendiente: 7,
        parametrosPendientes: ["archivos.max_creativo_mb"],
        finanzasPendientes: 2,
      })
    ).toEqual([
      "public.bitacora: quedan 1.500 filas anteriores a la limpieza.",
      "public.medios: quedan 2 filas.",
      "Quedan 4 perfiles; se esperaban 3.",
      "Quedan 5 cuentas en auth.users; se esperaban 3.",
      expect.stringMatching(/7 objetos de Storage/),
      expect.stringMatching(/archivos\.max_creativo_mb/),
      expect.stringMatching(/Siguen 2 vigencias/),
    ])
  })

  it("nombra el informe con el ref y el día de Bogotá", () => {
    expect(
      rutaInforme("oriuuuaczpncmtglfgpv", new Date("2026-10-25T03:00:00Z"))
    ).toBe("context/respaldos/limpieza-oriuuuaczpncmtglfgpv-2026-10-24.json")
  })
})
