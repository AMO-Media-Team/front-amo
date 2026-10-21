import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  esquemaActivoMunicipios,
  esquemaElementoCatalogo,
  esquemaExcepcion,
  esquemaFormato,
  esquemaFranja,
  esquemaGuardarParametro,
  esquemaHistorial,
  esquemaNivel,
  esquemaPlantilla,
  esquemaProgramarTarifa,
  esquemaPublicarTerminos,
  esquemaResolucion,
  esquemaRetencion,
  esquemaValorParametro,
  esquemaVersionTerminos,
  numero,
  numeroOpcional,
  porcentaje,
} from "./schemas"
import type { ReglasParametro } from "./tipos"

const ID = "3f2c1b9a-6d4e-4f7a-9b1c-2a3b4c5d6e7f"
const OTRO_ID = "8a7b6c5d-4e3f-4a2b-8c1d-0e9f8a7b6c5d"
const MARCA = "2026-10-01T12:00:00.000000+00:00"

function reglas(cambios: Partial<ReglasParametro>): ReglasParametro {
  return {
    clave: "prueba.valor",
    tipo: "ENTERO",
    minimo: null,
    maximo: null,
    opciones: null,
    ...cambios,
  }
}

/** Primer mensaje de error de un `safeParse` fallido (o `null` si pasó). */
function primerError(resultado: {
  success: boolean
  error?: { issues: { message: string; path: PropertyKey[] }[] }
}): { mensaje: string; campo: string } | null {
  if (resultado.success || !resultado.error) return null
  const [problema] = resultado.error.issues
  return { mensaje: problema.message, campo: problema.path.join(".") }
}

describe("cifras escritas a mano", () => {
  it("convierte texto es-CO y aplica rango y precisión", () => {
    expect(numero({ min: 1 }).parse("1.250.000")).toBe(1_250_000)
    expect(numero().parse(12)).toBe(12)
    expect(numero({ min: 1 }).safeParse("0").success).toBe(false)
    expect(numero({ decimales: 0 }).safeParse("1,5").success).toBe(false)
    expect(numero({ decimales: 2 }).safeParse("1,555").success).toBe(false)
    expect(
      numero({ mensaje: "Escribe el año." }).safeParse("dos mil").error
        ?.issues[0].message
    ).toBe("Escribe el año.")
  })

  it("una cifra opcional vacía es null", () => {
    expect(numeroOpcional().parse("")).toBeNull()
    expect(numeroOpcional().parse("  ")).toBeNull()
    expect(numeroOpcional().parse(null)).toBeNull()
    expect(numeroOpcional({ min: 1 }).parse("20")).toBe(20)
    expect(numeroOpcional({ min: 1 }).safeParse("0").success).toBe(false)
  })

  it("un porcentaje se escribe de 0 a 100 y se guarda como fracción", () => {
    expect(porcentaje().parse("20")).toBe(0.2)
    expect(porcentaje().parse("15,5")).toBe(0.155)
    expect(porcentaje({ max: 50 }).safeParse("51").success).toBe(false)
    // numeric(5,4): dos decimales de porcentaje como máximo.
    expect(porcentaje().safeParse("15,555").success).toBe(false)
    // Retenciones: numeric(7,6) admite cuatro.
    expect(porcentaje({ decimalesFraccion: 6 }).parse("0,4140")).toBe(0.00414)
  })
})

describe("esquemaValorParametro (mismas reglas que fn_validar_configuracion)", () => {
  it("ENTERO: entero y dentro del rango", () => {
    const esquema = esquemaValorParametro(reglas({ minimo: 1, maximo: 168 }))
    expect(esquema.parse(24)).toBe(24)
    expect(esquema.safeParse(1.5).error?.issues[0].message).toBe(
      "Debe ser un número entero."
    )
    expect(esquema.safeParse(999).error?.issues[0].message).toBe(
      "Debe estar entre 1 y 168."
    )
    expect(esquema.safeParse("24").success).toBe(false)
  })

  it("DECIMAL: admite fracciones y límites abiertos", () => {
    expect(
      esquemaValorParametro(
        reglas({ tipo: "DECIMAL", minimo: 1, maximo: 3 })
      ).parse(1.25)
    ).toBe(1.25)
    expect(
      esquemaValorParametro(reglas({ tipo: "DECIMAL", minimo: 1 })).safeParse(
        0.5
      ).error?.issues[0].message
    ).toBe("Debe ser al menos 1.")
    expect(
      esquemaValorParametro(reglas({ tipo: "DECIMAL", maximo: 2 })).safeParse(3)
        .error?.issues[0].message
    ).toBe("No puede pasar de 2.")
  })

  it("PORCENTAJE: fracción entre 0 y 1 aunque la fila no traiga límites, y el mensaje va en %", () => {
    const libre = esquemaValorParametro(reglas({ tipo: "PORCENTAJE" }))
    expect(libre.parse(0.2)).toBe(0.2)
    expect(libre.safeParse(1.2).success).toBe(false)
    expect(libre.safeParse(-0.1).success).toBe(false)
    const comision = esquemaValorParametro(
      reglas({ tipo: "PORCENTAJE", minimo: 0, maximo: 0.5 })
    )
    expect(comision.safeParse(0.6).error?.issues[0].message).toBe(
      "Debe estar entre 0% y 50%."
    )
  })

  it("BOOLEANO: solo verdadero o falso", () => {
    const esquema = esquemaValorParametro(reglas({ tipo: "BOOLEANO" }))
    expect(esquema.parse(false)).toBe(false)
    expect(esquema.safeParse("true").success).toBe(false)
  })

  it("TEXTO: una de sus opciones, o un valor que exista en otra tabla", () => {
    const corte = esquemaValorParametro(
      reglas({ tipo: "TEXTO", opciones: ["H24", "H72", "D7"] })
    )
    expect(corte.parse("D7")).toBe("D7")
    expect(corte.safeParse("D30").error?.issues[0].message).toBe(
      "No es una opción permitida."
    )
    const municipio = esquemaValorParametro(reglas({ tipo: "TEXTO" }), {
      existe: (codigo) => codigo === "11001",
    })
    expect(municipio.parse("11001")).toBe("11001")
    expect(municipio.safeParse("99999").error?.issues[0].message).toBe(
      "No es un valor válido."
    )
    expect(municipio.safeParse("").success).toBe(false)
  })

  it("LISTA_TEXTO: no vacía, solo opciones permitidas, sin repetidos y en el orden de las opciones", () => {
    const cortes = esquemaValorParametro(
      reglas({ tipo: "LISTA_TEXTO", opciones: ["H24", "H72", "D7"] })
    )
    expect(cortes.parse(["D7", "H24", "D7"])).toEqual(["H24", "D7"])
    expect(cortes.safeParse([]).error?.issues[0].message).toBe(
      "Elige al menos una opción."
    )
    expect(cortes.safeParse(["H24", "D30"]).error?.issues[0].message).toBe(
      "Contiene opciones no permitidas."
    )
    const paises = esquemaValorParametro(reglas({ tipo: "LISTA_TEXTO" }), {
      existe: (iso2) => ["CO", "EC"].includes(iso2),
    })
    expect(paises.safeParse(["CO", "XX"]).error?.issues[0].message).toBe(
      "Contiene valores que no existen."
    )
  })

  it("MAPA_DECIMAL: un valor por opción, todos en rango y sin claves ajenas", () => {
    const multiplo = esquemaValorParametro(
      reglas({
        tipo: "MAPA_DECIMAL",
        minimo: 1,
        maximo: 100,
        opciones: ["FACEBOOK", "INSTAGRAM", "TIKTOK"],
      })
    )
    expect(multiplo.parse({ TIKTOK: 20, FACEBOOK: 3, INSTAGRAM: 2 })).toEqual({
      FACEBOOK: 3,
      INSTAGRAM: 2,
      TIKTOK: 20,
    })
    expect(
      multiplo.safeParse({ FACEBOOK: 3, INSTAGRAM: 2 }).error?.issues[0].message
    ).toBe("Completa el valor de cada opción.")
    expect(
      multiplo.safeParse({ FACEBOOK: 3, INSTAGRAM: 2, TIKTOK: 500 }).error
        ?.issues[0].message
    ).toBe("Cada valor debe estar entre 1 y 100.")
    expect(
      multiplo.safeParse({ FACEBOOK: 3, INSTAGRAM: 2, TIKTOK: 20, X: 1 }).error
        ?.issues[0].message
    ).toBe("Contiene claves no permitidas.")
  })

  it("la acción solo acepta claves con forma de parámetro", () => {
    const base = { valor: 1, actualizadoAt: MARCA }
    expect(
      esquemaGuardarParametro.safeParse({
        ...base,
        clave: "medios.umbral_seguidores",
      }).success
    ).toBe(true)
    expect(
      esquemaGuardarParametro.safeParse({ ...base, clave: "medios" }).success
    ).toBe(false)
    expect(
      esquemaGuardarParametro.safeParse({ ...base, clave: "a.b; drop" }).success
    ).toBe(false)
    expect(
      esquemaGuardarParametro.safeParse({
        clave: "a.b",
        valor: 1,
        actualizadoAt: "",
      }).success
    ).toBe(false)
  })
})

describe("formularios con fechas", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Lunes 5 de octubre de 2026, 10:00 en Bogotá.
    vi.setSystemTime(new Date("2026-10-05T15:00:00Z"))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const tarifa = {
    formatoId: ID,
    franjaId: OTRO_ID,
    valor: "450.000",
    inicio: "manana" as const,
    dia: "",
    hora: "00:00",
  }

  it("una tarifa es un valor entero en pesos con un inicio", () => {
    expect(esquemaProgramarTarifa.parse(tarifa).valor).toBe(450_000)
    expect(
      primerError(esquemaProgramarTarifa.safeParse({ ...tarifa, valor: "0" }))
        ?.campo
    ).toBe("valor")
    expect(
      primerError(
        esquemaProgramarTarifa.safeParse({ ...tarifa, valor: "450.000,50" })
      )?.campo
    ).toBe("valor")
    expect(
      primerError(esquemaProgramarTarifa.safeParse({ ...tarifa, valor: "" }))
        ?.mensaje
    ).toBe("Escribe el valor en pesos.")
  })

  it("con fecha propia exige un día y que quede en el futuro (hora de Bogotá)", () => {
    const conFecha = { ...tarifa, inicio: "fecha" as const }
    expect(primerError(esquemaProgramarTarifa.safeParse(conFecha))).toEqual({
      mensaje: "Elige el día.",
      campo: "dia",
    })
    expect(
      primerError(
        esquemaProgramarTarifa.safeParse({
          ...conFecha,
          dia: "2026-10-05",
          hora: "09:59",
        })
      )
    ).toEqual({
      mensaje: "La nueva vigencia debe empezar en el futuro.",
      campo: "hora",
    })
    expect(
      esquemaProgramarTarifa.safeParse({
        ...conFecha,
        dia: "2026-10-05",
        hora: "10:01",
      }).success
    ).toBe(true)
  })

  const publicar = {
    id: ID,
    inmediata: true,
    dia: "",
    hora: "",
    confirmacion: " publicar ",
    actualizadoAt: MARCA,
  }

  it("publicar una versión exige escribir PUBLICAR y, si se programa, una fecha futura", () => {
    expect(esquemaPublicarTerminos.safeParse(publicar).success).toBe(true)
    expect(
      primerError(
        esquemaPublicarTerminos.safeParse({ ...publicar, confirmacion: "si" })
      )?.campo
    ).toBe("confirmacion")
    expect(
      primerError(
        esquemaPublicarTerminos.safeParse({ ...publicar, inmediata: false })
      )?.campo
    ).toBe("dia")
    expect(
      primerError(
        esquemaPublicarTerminos.safeParse({
          ...publicar,
          inmediata: false,
          dia: "2026-10-01",
          hora: "08:00",
        })
      )?.campo
    ).toBe("hora")
  })

  const excepcion = {
    id: null,
    objetivo: "anunciante" as const,
    objetivoId: ID,
    porcentaje: "15",
    desdeAhora: true,
    desde: "",
    hasta: "",
    motivo: "Acuerdo de lanzamiento",
    actualizadoAt: null,
  }

  it("una excepción de comisión va de 0% a 50% con motivo y destinatario", () => {
    expect(esquemaExcepcion.parse(excepcion)).toMatchObject({
      porcentaje: 0.15,
      hasta: null,
    })
    expect(
      primerError(
        esquemaExcepcion.safeParse({ ...excepcion, porcentaje: "60" })
      )?.campo
    ).toBe("porcentaje")
    expect(
      primerError(esquemaExcepcion.safeParse({ ...excepcion, objetivoId: "" }))
        ?.campo
    ).toBe("objetivoId")
    expect(
      primerError(esquemaExcepcion.safeParse({ ...excepcion, motivo: "ok" }))
        ?.campo
    ).toBe("motivo")
  })

  it("con fecha de inicio propia, el fin no puede quedar antes", () => {
    const programada = { ...excepcion, desdeAhora: false, desde: "2026-11-01" }
    expect(
      esquemaExcepcion.safeParse({ ...programada, hasta: "2026-11-01" }).success
    ).toBe(true)
    expect(
      primerError(
        esquemaExcepcion.safeParse({ ...programada, hasta: "2026-10-31" })
      )
    ).toEqual({
      mensaje: "Debe ser igual o posterior al inicio.",
      campo: "hasta",
    })
    expect(
      primerError(esquemaExcepcion.safeParse({ ...programada, desde: "" }))
        ?.campo
    ).toBe("desde")
  })
})

describe("franjas y formatos", () => {
  const franja = {
    id: null,
    clave: "f4",
    nombre: "Más de 500.000",
    seguidoresMin: "500.001",
    seguidoresMax: "",
    orden: "4",
    activa: true,
    actualizadoAt: null,
  }

  it("normaliza la clave y deja abierto el máximo vacío", () => {
    expect(esquemaFranja.parse(franja)).toMatchObject({
      clave: "F4",
      seguidoresMin: 500_001,
      seguidoresMax: null,
      orden: 4,
    })
  })

  it("exige F + dígito al crear y un máximo mayor que el mínimo", () => {
    expect(
      primerError(esquemaFranja.safeParse({ ...franja, clave: "G1" }))?.campo
    ).toBe("clave")
    expect(
      primerError(
        esquemaFranja.safeParse({ ...franja, seguidoresMax: "500.001" })
      )
    ).toEqual({
      mensaje: "Debe ser mayor que el mínimo.",
      campo: "seguidoresMax",
    })
    // Al editar, la clave ya existe y no se vuelve a validar.
    expect(
      esquemaFranja.safeParse({
        ...franja,
        id: ID,
        clave: "LEGADO",
        actualizadoAt: MARCA,
      }).success
    ).toBe(true)
  })

  const formato = {
    id: null,
    plataforma: "INSTAGRAM" as const,
    clave: "REEL" as const,
    nombre: "Reel",
    activo: true,
    orden: "1",
    relacionesAspecto: ["9:16"],
    mime: ["video/mp4"],
    duracionMaxS: "90",
    pesoMaxMb: "50",
    maxArchivos: "",
    actualizadoAt: null,
  }

  it("valida relaciones de aspecto y tipos de archivo", () => {
    expect(esquemaFormato.parse(formato)).toMatchObject({
      duracionMaxS: 90,
      maxArchivos: null,
    })
    expect(
      primerError(
        esquemaFormato.safeParse({
          ...formato,
          relacionesAspecto: ["vertical"],
        })
      )?.campo
    ).toBe("relacionesAspecto")
    expect(
      primerError(
        esquemaFormato.safeParse({ ...formato, mime: ["application/pdf"] })
      )?.campo
    ).toBe("mime")
    expect(
      primerError(esquemaFormato.safeParse({ ...formato, pesoMaxMb: "501" }))
        ?.campo
    ).toBe("pesoMaxMb")
  })
})

describe("niveles de verificación", () => {
  const nivel = {
    nivel: 1,
    nombre: "Persona natural informal",
    requisitos: "Cédula por ambas caras\n\n  Prueba de vida  \n",
    documentosRequeridos: ["CEDULA_FRENTE" as const],
    sinTope: false,
    topeAnual: "30.000.000",
    porcentajeAlerta: "80",
    porcentajeBloqueo: "95",
    pendienteValidacion: true,
    actualizadoAt: MARCA,
  }

  it("convierte los requisitos en una lista limpia y los porcentajes en fracciones", () => {
    expect(esquemaNivel.parse(nivel)).toMatchObject({
      requisitos: ["Cédula por ambas caras", "Prueba de vida"],
      topeAnual: 30_000_000,
      porcentajeAlerta: 0.8,
      porcentajeBloqueo: 0.95,
    })
  })

  it("exige tope o «sin tope», y que la alerta no supere al bloqueo", () => {
    expect(
      primerError(esquemaNivel.safeParse({ ...nivel, topeAnual: "" }))?.campo
    ).toBe("topeAnual")
    expect(
      esquemaNivel.safeParse({ ...nivel, topeAnual: "", sinTope: true }).success
    ).toBe(true)
    expect(
      primerError(esquemaNivel.safeParse({ ...nivel, porcentajeAlerta: "96" }))
        ?.campo
    ).toBe("porcentajeAlerta")
    expect(
      primerError(esquemaNivel.safeParse({ ...nivel, requisitos: " \n " }))
        ?.campo
    ).toBe("requisitos")
    expect(
      primerError(
        esquemaNivel.safeParse({ ...nivel, documentosRequeridos: [] })
      )?.campo
    ).toBe("documentosRequeridos")
  })
})

describe("tributario", () => {
  const retencion = {
    id: null,
    tipo: "RETEFUENTE" as const,
    concepto: "SERVICIOS" as const,
    aplicaDeclarante: true,
    tarifa: "4",
    baseMinimaUvt: "4",
    desde: "2026-01-01",
    hasta: "",
    pendienteValidacion: true,
    actualizadoAt: null,
  }

  it("una retención guarda la tarifa como fracción y admite vigencia abierta", () => {
    expect(esquemaRetencion.parse(retencion)).toMatchObject({
      tarifa: 0.04,
      hasta: null,
    })
    // «Hasta» es el último día incluido: un solo día de vigencia es válido.
    expect(
      esquemaRetencion.safeParse({ ...retencion, hasta: "2026-01-01" }).success
    ).toBe(true)
    expect(
      primerError(
        esquemaRetencion.safeParse({ ...retencion, hasta: "2025-12-31" })
      )
    ).toEqual({
      mensaje: "Debe ser igual o posterior al inicio.",
      campo: "hasta",
    })
    expect(
      primerError(
        esquemaRetencion.safeParse({ ...retencion, desde: "2026-13-01" })
      )?.campo
    ).toBe("desde")
  })

  const resolucion = {
    id: null,
    tipo: "FACTURA_VENTA" as const,
    prefijo: "amo",
    numeroResolucion: "18760000001",
    fechaResolucion: "2026-01-10",
    rangoDesde: "1",
    rangoHasta: "5.000",
    vigenteDesde: "2026-01-10",
    vigenteHasta: "2027-01-10",
    activa: false,
    actualizadoAt: null,
  }

  it("una resolución DIAN normaliza el prefijo y valida rango y vigencia", () => {
    expect(esquemaResolucion.parse(resolucion)).toMatchObject({
      prefijo: "AMO",
      rangoHasta: 5000,
    })
    expect(
      primerError(
        esquemaResolucion.safeParse({ ...resolucion, prefijo: "FACTU" })
      )?.campo
    ).toBe("prefijo")
    expect(
      primerError(
        esquemaResolucion.safeParse({ ...resolucion, rangoHasta: "0" })
      )?.campo
    ).toBe("rangoHasta")
    expect(
      primerError(
        esquemaResolucion.safeParse({ ...resolucion, rangoDesde: "6.000" })
      )?.campo
    ).toBe("rangoHasta")
    expect(
      primerError(
        esquemaResolucion.safeParse({
          ...resolucion,
          vigenteHasta: "2025-12-31",
        })
      )?.campo
    ).toBe("vigenteHasta")
  })
})

describe("catálogos, legal y plantillas", () => {
  it("un elemento de catálogo recorta el nombre y vacía la descripción en blanco", () => {
    expect(
      esquemaElementoCatalogo.parse({
        catalogo: "sectores",
        id: null,
        nombre: "  Turismo  ",
        descripcion: "   ",
        orden: "3",
        activo: true,
        actualizadoAt: null,
      })
    ).toMatchObject({ nombre: "Turismo", descripcion: null, orden: 3 })
    expect(
      esquemaElementoCatalogo.safeParse({
        catalogo: "roles",
        id: null,
        nombre: "X",
        descripcion: "",
        orden: 0,
        activo: true,
        actualizadoAt: null,
      }).success
    ).toBe(false)
  })

  it("los municipios se cambian por código DIVIPOLA y en lotes acotados", () => {
    expect(
      esquemaActivoMunicipios.safeParse({ codigos: ["05001"], activo: false })
        .success
    ).toBe(true)
    expect(
      esquemaActivoMunicipios.safeParse({ codigos: [], activo: false }).success
    ).toBe(false)
    expect(
      esquemaActivoMunicipios.safeParse({ codigos: ["5001"], activo: false })
        .success
    ).toBe(false)
    expect(
      esquemaActivoMunicipios.safeParse({
        codigos: Array(201).fill("05001"),
        activo: true,
      }).success
    ).toBe(false)
  })

  it("una versión legal lleva un identificador corto y contenido", () => {
    const version = {
      id: null,
      tipo: "POLITICA_DATOS" as const,
      version: "1.0",
      contenido: "# Política",
      actualizadoAt: null,
    }
    expect(esquemaVersionTerminos.safeParse(version).success).toBe(true)
    expect(
      primerError(
        esquemaVersionTerminos.safeParse({ ...version, version: "v 1" })
      )?.campo
    ).toBe("version")
    expect(
      primerError(
        esquemaVersionTerminos.safeParse({ ...version, contenido: "  " })
      )?.campo
    ).toBe("contenido")
  })

  it("un correo necesita asunto; un aviso en la aplicación no", () => {
    const plantilla = {
      clave: "usuario.invitado",
      canal: "EMAIL" as const,
      nombre: "Invitación a AMO",
      asunto: "",
      cuerpo: "Hola {{nombre}}",
      activa: true,
      actualizadoAt: MARCA,
    }
    expect(primerError(esquemaPlantilla.safeParse(plantilla))).toEqual({
      mensaje: "Un correo necesita asunto.",
      campo: "asunto",
    })
    expect(
      esquemaPlantilla.parse({ ...plantilla, canal: "APP" }).asunto
    ).toBeNull()
    expect(
      esquemaPlantilla.safeParse({ ...plantilla, asunto: "Te invitaron" })
        .success
    ).toBe(true)
  })

  it("el historial solo consulta entidades de configuración", () => {
    expect(
      esquemaHistorial.safeParse({ entidad: "franjas", entidadId: ID }).success
    ).toBe(true)
    expect(
      esquemaHistorial.safeParse({ entidad: "perfiles", entidadId: ID }).success
    ).toBe(false)
    expect(
      esquemaHistorial.safeParse({ entidad: "configuracion", entidadId: " " })
        .success
    ).toBe(false)
  })
})
