import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import type {
  DepartamentoTerritorio,
  ElementoCatalogo,
  ExcepcionComision,
  Formato,
  Franja,
  NivelVerificacion,
  ParametrosAnio,
  PermisosConfiguracion,
  Plantilla,
  ResolucionDian,
  ReteicaMunicipal,
  Retencion,
  VersionTerminos,
} from "../tipos"

// Las Server Actions no se ejecutan en jsdom. Cualquier acción que se llegara
// a invocar en estas pruebas sería un fallo: ninguna resuelve nada.
const acciones = vi.hoisted(
  () =>
    new Proxy<Record<string, ReturnType<typeof vi.fn>>>(
      {},
      {
        get(objetivo, nombre: string) {
          if (nombre === "then" || nombre === "__esModule") return undefined
          objetivo[nombre] ??= vi.fn(() => new Promise(() => {}))
          return objetivo[nombre]
        },
        has: () => true,
      }
    )
)
vi.mock("../actions", () => acciones)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { CatalogoLista } from "./catalogo-lista"
import { ProveedorConfiguracion } from "./contexto-configuracion"
import { ExcepcionesComision } from "./excepciones-comision"
import { FormatosPlataforma, FranjasSeguidores } from "./franjas-formatos"
import { NivelesVerificacion } from "./niveles-verificacion"
import { PlantillasNotificacion } from "./plantillas-notificacion"
import { Territorio } from "./territorio"
import { ParametrosAnios } from "./tributario-anios"
import { ResolucionesDian } from "./tributario-resoluciones"
import { ReteicaMunicipios, Retenciones } from "./tributario-retenciones"
import { VersionesTerminos } from "./versiones-terminos"

/** Rol con solo `configuracion.ver` (p. ej. Operaciones sin auditoría). */
const SOLO_VER: PermisosConfiguracion = {
  editar: false,
  comisiones: false,
  tarifas: false,
  tributario: false,
  catalogos: false,
  verAuditoria: false,
  datosSensibles: false,
}

const MARCA = "2026-01-01T05:00:00+00:00"
const ID = (n: number) => `0190a000-0000-7000-8000-00000000000${n}`

const EXCEPCIONES: ExcepcionComision[] = [
  {
    id: ID(1),
    objetivo: {
      tipo: "anunciante",
      id: ID(2),
      nombre: "Alimentos del Valle",
      detalle: "NIT 900123456",
    },
    porcentaje: 0.15,
    vigenteDesde: "2020-01-01T05:00:00+00:00",
    vigenteHasta: null,
    motivo: "Acuerdo comercial de volumen anual.",
    creadaAt: MARCA,
    actualizadoAt: MARCA,
  },
  {
    id: ID(3),
    objetivo: {
      tipo: "campana",
      id: ID(4),
      nombre: "Temporada navideña",
      detalle: "Alimentos del Valle",
    },
    porcentaje: 0.1,
    vigenteDesde: "2099-01-01T05:00:00+00:00",
    vigenteHasta: null,
    motivo: "Lanzamiento.",
    creadaAt: MARCA,
    actualizadoAt: MARCA,
  },
]

const NIVELES: NivelVerificacion[] = [
  {
    nivel: 1,
    nombre: "Persona natural informal",
    requisitos: ["Cédula por ambas caras"],
    documentosRequeridos: ["CEDULA_FRENTE", "CEDULA_REVERSO"],
    topeAnual: 30_000_000,
    porcentajeAlerta: 0.8,
    porcentajeBloqueo: 0.95,
    pendienteValidacion: true,
    actualizadoAt: MARCA,
  },
]

const ANIOS: ParametrosAnio[] = [
  {
    anio: 2026,
    uvt: 52_374,
    smlmv: 1_750_905,
    umbralSegSocialSmlmv: 1,
    pendienteValidacion: true,
    actualizadoAt: MARCA,
  },
]

const RETENCIONES: Retencion[] = [
  {
    id: ID(5),
    tipo: "RETEFUENTE",
    concepto: "SERVICIOS",
    aplicaDeclarante: true,
    tarifa: 0.04,
    baseMinimaUvt: 4,
    vigenteDesde: "2026-01-01",
    vigenteHasta: "2027-01-01",
    pendienteValidacion: true,
    actualizadoAt: MARCA,
  },
]

const RETEICA: ReteicaMunicipal[] = [
  {
    id: ID(6),
    municipioCodigo: "11001",
    municipioNombre: "Bogotá, D.C.",
    departamentoNombre: "Bogotá",
    tarifaPorMil: 9.66,
    baseMinimaUvt: 0,
    vigenteDesde: "2026-01-01",
    vigenteHasta: null,
    pendienteValidacion: true,
    actualizadoAt: MARCA,
  },
]

const RESOLUCIONES: ResolucionDian[] = [
  {
    id: ID(7),
    tipo: "FACTURA_VENTA",
    prefijo: "AMO",
    numeroResolucion: "18764000001",
    fechaResolucion: "2026-01-01",
    rangoDesde: 1,
    rangoHasta: 1000,
    consecutivoActual: 250,
    vigenteDesde: "2026-01-01",
    vigenteHasta: "2099-12-31",
    activa: true,
    actualizadoAt: MARCA,
  },
]

const SECTORES: ElementoCatalogo[] = [
  {
    id: ID(8),
    nombre: "Alimentos y bebidas",
    descripcion: null,
    orden: 1,
    activo: true,
    archivado: false,
    actualizadoAt: MARCA,
  },
]

const DEPARTAMENTOS: DepartamentoTerritorio[] = [
  {
    codigo: "91",
    nombre: "Amazonas",
    region: "Amazonía",
    activo: true,
    municipios: 11,
    municipiosInactivos: 1,
  },
  {
    codigo: "05",
    nombre: "Antioquia",
    region: "Andina",
    activo: false,
    municipios: 125,
    municipiosInactivos: 0,
  },
]

const VERSIONES: VersionTerminos[] = [
  {
    id: ID(9),
    tipo: "POLITICA_DATOS",
    version: "1.0",
    contenido: "",
    hash: "a".repeat(64),
    publicada: true,
    vigenteDesde: "2026-01-01T05:00:00+00:00",
    creadaAt: MARCA,
    actualizadoAt: MARCA,
    aceptaciones: null,
  },
  {
    id: ID(0),
    tipo: "POLITICA_DATOS",
    version: "1.1",
    contenido: "",
    hash: null,
    publicada: false,
    vigenteDesde: null,
    creadaAt: MARCA,
    actualizadoAt: MARCA,
    aceptaciones: null,
  },
]

const PLANTILLAS: Plantilla[] = [
  {
    clave: "usuario.invitado",
    canal: "EMAIL",
    nombre: "Invitación a AMO",
    asunto: "Te invitaron a AMO",
    cuerpo: "Hola **{{nombre}}**, {{invitador}} te invitó.",
    variables: ["nombre", "invitador"],
    activa: true,
    actualizadoAt: MARCA,
  },
  {
    clave: "oferta.devuelta",
    canal: "APP",
    nombre: "Oferta devuelta",
    asunto: null,
    cuerpo: "Tu oferta {{oferta}} fue devuelta.",
    variables: ["oferta"],
    activa: false,
    actualizadoAt: MARCA,
  },
]

const FRANJAS: Franja[] = [
  {
    id: ID(1),
    clave: "F1",
    nombre: "30.000 – 60.000",
    seguidoresMin: 30_000,
    seguidoresMax: 60_000,
    orden: 1,
    activa: true,
    actualizadoAt: MARCA,
  },
]

const FORMATOS: Formato[] = [
  {
    id: ID(2),
    plataforma: "INSTAGRAM",
    clave: "REEL",
    nombre: "Reel",
    requisitos: {
      relacionesAspecto: ["9:16"],
      mime: ["video/mp4"],
      duracionMaxS: 90,
      pesoMaxMb: 50,
      maxArchivos: null,
    },
    activo: true,
    orden: 1,
    actualizadoAt: MARCA,
  },
]

function renderizar(
  contenido: ReactNode,
  permisos: Partial<PermisosConfiguracion> = {}
) {
  return render(
    <ProveedorConfiguracion permisos={{ ...SOLO_VER, ...permisos }}>
      {contenido}
    </ProveedorConfiguracion>
  )
}

/** Verbos de escritura que una persona con solo lectura no debe encontrar. */
const ESCRITURA =
  /^(nuev[oa]|agregar|crear|registrar|editar|eliminar|archivar|restaurar|finalizar|publicar|guardar|confirmar|programar|acciones de|habilitar todos|deshabilitar todos)/i

function botonesDeEscritura(): string[] {
  return screen
    .queryAllByRole("button")
    .map(
      (boton) =>
        boton.getAttribute("aria-label") ?? boton.textContent?.trim() ?? ""
    )
    .filter((nombre) => ESCRITURA.test(nombre))
}

const ESPACIOS = /[\s  ]+/g
function textoPlano(): string {
  return (document.body.textContent ?? "").replace(ESPACIOS, " ")
}

describe("Configuración con solo `configuracion.ver`", () => {
  it.each<[string, ReactNode]>([
    [
      "comisiones de excepción",
      <ExcepcionesComision
        key="e"
        excepciones={EXCEPCIONES}
        comisionGlobal={0.2}
      />,
    ],
    [
      "niveles de verificación",
      <NivelesVerificacion key="n" niveles={NIVELES} />,
    ],
    ["parámetros por año", <ParametrosAnios key="a" anios={ANIOS} />],
    [
      "retenciones",
      <Retenciones key="r" retenciones={RETENCIONES} uvt={52_374} />,
    ],
    [
      "ReteICA municipal",
      <ReteicaMunicipios key="i" reteica={RETEICA} uvt={52_374} />,
    ],
    [
      "resoluciones DIAN",
      <ResolucionesDian key="d" resoluciones={RESOLUCIONES} />,
    ],
    [
      "sectores",
      <CatalogoLista key="s" catalogo="sectores" elementos={SECTORES} />,
    ],
    ["versiones legales", <VersionesTerminos key="v" versiones={VERSIONES} />],
    ["plantillas", <PlantillasNotificacion key="p" plantillas={PLANTILLAS} />],
    ["franjas", <FranjasSeguidores key="f" franjas={FRANJAS} />],
    ["formatos", <FormatosPlataforma key="o" formatos={FORMATOS} />],
  ])("%s: muestra los datos sin ofrecer ningún cambio", (_nombre, bloque) => {
    renderizar(bloque)
    expect(botonesDeEscritura()).toEqual([])
    // Sin `auditoria.ver` tampoco se ofrece el historial de la bitácora.
    expect(
      screen.queryByRole("button", { name: /historial/i })
    ).not.toBeInTheDocument()
  })

  it("los mismos bloques vacíos no invitan a crear lo que no se puede crear", () => {
    renderizar(
      <>
        <ExcepcionesComision excepciones={[]} comisionGlobal={0.2} />
        <Retenciones retenciones={[]} uvt={null} />
        <ReteicaMunicipios reteica={[]} uvt={null} />
        <ResolucionesDian resoluciones={[]} />
        <CatalogoLista catalogo="categorias" elementos={[]} />
        <VersionesTerminos versiones={[]} />
      </>
    )
    expect(botonesDeEscritura()).toEqual([])
    expect(screen.queryByText(/Crea un borrador/)).not.toBeInTheDocument()
  })

  it("territorio: los interruptores se ven pero están deshabilitados", () => {
    renderizar(<Territorio departamentos={DEPARTAMENTOS} />)
    const interruptores = screen.getAllByRole("switch")
    expect(interruptores).toHaveLength(DEPARTAMENTOS.length)
    for (const interruptor of interruptores) {
      // Base UI marca el interruptor deshabilitado con `aria-disabled`.
      expect(
        interruptor.hasAttribute("disabled") ||
          interruptor.getAttribute("aria-disabled") === "true"
      ).toBe(true)
    }
    expect(textoPlano()).toContain("1 de 2 departamentos habilitados")
    expect(textoPlano()).toContain("1 municipio deshabilitado")
  })

  it("un borrador legal se puede leer, pero no editar ni publicar", () => {
    renderizar(<VersionesTerminos versiones={VERSIONES} />)
    const politica = screen.getByRole("region", {
      name: "Política de tratamiento de datos",
    })
    expect(within(politica).getByText("Borrador")).toBeInTheDocument()
    expect(
      within(politica).getAllByRole("button", { name: "Ver" })
    ).toHaveLength(2)
  })

  it("una plantilla abre su vista previa, no el formulario", async () => {
    renderizar(<PlantillasNotificacion plantillas={PLANTILLAS} />)
    expect(textoPlano()).toContain("2 plantillas · 1 desactivada.")
    expect(textoPlano()).toContain("Elige una para ver su texto.")

    await userEvent.click(
      screen.getByRole("button", { name: /Invitación a AMO/ })
    )
    const hoja = await screen.findByRole("dialog")
    expect(
      within(hoja).queryByRole("button", { name: "Guardar plantilla" })
    ).not.toBeInTheDocument()
    expect(within(hoja).queryByRole("textbox")).not.toBeInTheDocument()
    // La vista previa reemplaza las variables por valores de ejemplo.
    expect(within(hoja).getByText("Laura Gómez")).toBeInTheDocument()
  })
})

describe("Datos tributarios con fechas de calendario", () => {
  it("la resolución muestra sus días tal cual (sin retroceder uno por la zona horaria)", () => {
    renderizar(<ResolucionesDian resoluciones={RESOLUCIONES} />)
    const texto = textoPlano()
    expect(texto).toContain("N.º 18764000001 del 1 de ene de 2026")
    expect(texto).toContain("Vigente del 1 de ene de 2026 al 31 de dic de 2099")
    expect(texto).not.toContain("31 de dic de 2025")
    expect(texto).toContain("250 emitidos · 750 disponibles")
    expect(texto).toContain("Siguiente: AMO251")
    // Los números de documento van como se imprimen, sin separador de miles.
    expect(texto).toContain("AMO1 – AMO1000")
  })

  it("retenciones y ReteICA muestran el último día incluido de su vigencia", () => {
    renderizar(
      <>
        <Retenciones retenciones={RETENCIONES} uvt={52_374} />
        <ReteicaMunicipios reteica={RETEICA} uvt={52_374} />
      </>
    )
    const texto = textoPlano()
    // La columna guarda el fin exclusivo (1 de ene de 2027).
    expect(texto).toContain("1 de ene de 2026 – 31 de dic de 2026")
    expect(texto).toContain("Desde 4 UVT ($ 209.496)")
    expect(texto).toContain("Sin base mínima · Desde el 1 de ene de 2026")
  })
})

describe("Lista de ReteICA con muchos municipios", () => {
  const MUNICIPIOS = [
    "Zipaquirá",
    "Medellín",
    "Cali",
    "Ábrego",
    "Bello",
    "Itagüí",
    "Envigado",
    "Rionegro",
    "Apartadó",
    "Turbo",
    "Caucasia",
    "Yarumal",
  ]
  const FILAS: ReteicaMunicipal[] = MUNICIPIOS.map((nombre, indice) => ({
    ...RETEICA[0],
    id: `0190a000-0000-7000-8000-0000000002${String(indice).padStart(2, "0")}`,
    municipioCodigo: `05${String(indice).padStart(3, "0")}`,
    municipioNombre: nombre,
    departamentoNombre: nombre === "Cali" ? "Valle del Cauca" : "Antioquia",
  }))

  function municipiosVisibles(): string[] {
    const lista = within(
      screen.getByRole("region", { name: "ReteICA municipal" })
    ).getAllByRole("list")[0]
    return within(lista)
      .getAllByRole("listitem")
      .map((fila) => (fila.textContent ?? "").split("·")[0].trim())
  }

  it("sale en orden alfabético y de entrada muestra una página corta", async () => {
    renderizar(<ReteicaMunicipios reteica={FILAS} uvt={null} />)
    expect(municipiosVisibles()).toEqual([
      "Ábrego",
      "Apartadó",
      "Bello",
      "Cali",
      "Caucasia",
      "Envigado",
      "Itagüí",
      "Medellín",
      "Rionegro",
      "Turbo",
    ])
    expect(screen.getByRole("status")).toHaveTextContent("12 tarifas")

    await userEvent.click(
      screen.getByRole("button", { name: "Ver 2 más de 12" })
    )
    expect(municipiosVisibles()).toHaveLength(12)
  })

  it("busca por municipio o departamento sin tildes y conserva el buscador si nada coincide", async () => {
    renderizar(<ReteicaMunicipios reteica={FILAS} uvt={null} />, {
      tributario: true,
    })
    const buscador = screen.getByLabelText("Buscar en las tarifas de ReteICA")

    await userEvent.type(buscador, "valle")
    expect(municipiosVisibles()).toEqual(["Cali"])
    expect(screen.getByRole("status")).toHaveTextContent("1 coincidencia de 12")

    await userEvent.clear(buscador)
    await userEvent.type(buscador, "itagui")
    expect(municipiosVisibles()).toEqual(["Itagüí"])

    await userEvent.clear(buscador)
    await userEvent.type(buscador, "zzz")
    expect(
      screen.getByText("Ningún municipio coincide con «zzz».")
    ).toBeInTheDocument()
    // No es el estado vacío de «aún no hay tarifas»: el buscador sigue ahí.
    expect(buscador).toBeInTheDocument()
    expect(
      screen.queryByText("Sin tarifas municipales")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Agregar el primero" })
    ).not.toBeInTheDocument()
  })
})

describe("Con el permiso de la tabla sí se ofrecen los cambios", () => {
  it("configuracion.tributario habilita retenciones, ReteICA, años y resoluciones", () => {
    renderizar(
      <>
        <ParametrosAnios anios={ANIOS} />
        <Retenciones retenciones={RETENCIONES} uvt={52_374} />
        <ReteicaMunicipios reteica={RETEICA} uvt={52_374} />
        <ResolucionesDian resoluciones={RESOLUCIONES} />
      </>,
      { tributario: true }
    )
    expect(botonesDeEscritura()).toEqual(
      expect.arrayContaining([
        "Agregar año",
        "Editar 2026",
        "Nueva retención",
        "Agregar municipio",
        "Nueva resolución",
        "Editar la resolución 18764000001",
      ])
    )
  })

  it("configuracion.catalogos no alcanza para tocar comisiones ni niveles", () => {
    renderizar(
      <>
        <ExcepcionesComision excepciones={EXCEPCIONES} comisionGlobal={0.2} />
        <NivelesVerificacion niveles={NIVELES} />
      </>,
      { catalogos: true }
    )
    expect(botonesDeEscritura()).toEqual([])
  })
})
