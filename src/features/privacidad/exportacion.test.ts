import { describe, expect, it } from "vitest"

import {
  conteosDatosTitular,
  jsonDatosTitular,
  leerDatosTitular,
  libroDatosTitular,
  seccionesDatosTitular,
} from "./exportacion"

/** Forma real de `datos_titular()` (base local, Medio E2E, recortada). */
const DATOS_MEDIO = {
  generado_at: "2026-10-24T13:37:04.397926-05:00",
  responsable: "AMO — Advertising Market Optimization",
  perfil: {
    rol: "Medio",
    correo: "e2e.medio@amo.test",
    estado: "ACTIVO",
    nombre: "Medio E2E",
    celular: null,
    creado_at: "2026-10-24T09:44:51.930857-05:00",
    tiene_foto: false,
    activado_at: "2026-10-24T09:44:51.94987-05:00",
    preferencias: {},
    ultimo_acceso_at: "2026-10-24T10:26:17.110678-05:00",
  },
  identificacion: null,
  medio: {
    tipo: "PAGINA_NOTICIAS",
    estado: "VERIFICADO",
    nombre: "Medio E2E",
    creado_at: "2026-10-24T09:44:50.308758-05:00",
    municipio: "Medellín",
    nivel_verificacion: 1,
    documentos: [
      {
        tipo: "CERT_BANCARIA",
        vence: "2027-10-24",
        estado: "APROBADO",
        cargado_at: "2026-10-24T09:44:52.316497-05:00",
      },
    ],
    cuentas_sociales: [
      {
        enlace: "https://www.instagram.com/medio.e2e.amo",
        usuario: "medio.e2e.amo",
        plataforma: "INSTAGRAM",
        seguidores: 40000,
        verificada: true,
        ultima_verificacion: "2026-10-24T09:44:52.24225-05:00",
      },
    ],
    datos_reservados: {
      correo: "pagos.medio.e2e@amo.test",
      celular: "+57 3000000001",
      titular: "Titular Medio E2E",
      direccion: "Calle 10 # 20-30, Medellín",
      declarante: false,
      metodo_pago: "BANCARIO",
      cuenta_de_pago: "Bancolombia •••• 2345",
      tipo_documento: "CC",
      numero_documento: "•••• 0001",
      responsable_de_iva: false,
      obligado_a_facturar: false,
    },
  },
  empresa: null,
  autorizaciones: [
    {
      ip: "190.24.x.x",
      version: "1.0",
      documento: "POLITICA_DATOS",
      aceptada_at: "2026-10-24T10:16:53.013018-05:00",
    },
  ],
  accesos: [
    {
      pais: "CO",
      fecha: "2026-10-24T10:26:17.110678-05:00",
      ciudad: "Medellín",
      evento: "LOGIN_EXITOSO",
      sistema: "Windows",
      navegador: "Chrome",
      dispositivo: "ESCRITORIO",
    },
  ],
  actividad: [
    {
      fecha: "2026-10-24T10:28:19.72766-05:00",
      accion: "TRANSICION",
      entidad: "asignaciones",
      estado_nuevo: "PUBLICADA",
    },
  ],
  consultas_de_tus_datos_reservados: [
    {
      fecha: "2026-10-24T11:00:00-05:00",
      rol_de_quien_consulto: "FINANZAS",
      campos: ["datos_pago"],
    },
  ],
  solicitudes: [
    {
      numero: 41,
      tipo: "SUPRESION",
      estado: "RADICADA",
      recibida_at: "2026-10-24T13:39:12-05:00",
      vence: "2026-11-17",
      decision: null,
      respondida_at: null,
    },
  ],
}

describe("leerDatosTitular", () => {
  it("lee la respuesta de la BD y completa las listas vacías", () => {
    const datos = leerDatosTitular({
      generado_at: "2026-10-24T13:37:04-05:00",
      perfil: null,
      medio: null,
      empresa: null,
    })
    expect(datos).not.toBeNull()
    expect(datos?.accesos).toEqual([])
    expect(datos?.solicitudes).toEqual([])
  })

  it("devuelve null sin la fecha de generación", () => {
    expect(leerDatosTitular({ perfil: {} })).toBeNull()
    expect(leerDatosTitular("texto")).toBeNull()
  })
})

describe("libroDatosTitular", () => {
  const datos = leerDatosTitular(DATOS_MEDIO)
  if (!datos) throw new Error("Los datos de prueba no se leyeron.")
  const libro = libroDatosTitular(datos, { titular: "Medio E2E" })
  const hoja = (nombre: string) => {
    const encontrada = libro.hojas.find((h) => h.nombre === nombre)
    if (!encontrada) throw new Error(`Falta la hoja ${nombre}`)
    return encontrada
  }

  it("tiene el resumen y una hoja por lista (con las del medio)", () => {
    expect(libro.hojas.map((h) => h.nombre)).toEqual([
      "Resumen",
      "Autorizaciones",
      "Cuentas sociales",
      "Documentos",
      "Accesos",
      "Actividad",
      "Consultas de tus datos",
      "Solicitudes",
    ])
    expect(libro.filtros).toEqual([{ etiqueta: "Titular", valor: "Medio E2E" }])
  })

  it("el resumen es texto legible, con los datos reservados ya resumidos", () => {
    const filas = hoja("Resumen").filas
    expect(filas).toContainEqual(["Tu cuenta", "Correo", "e2e.medio@amo.test"])
    expect(filas).toContainEqual(["Tu medio", "Tipo", "Página de noticias"])
    expect(filas).toContainEqual(["Tu medio", "Nivel de verificación", "1"])
    expect(filas).toContainEqual([
      "Datos de pago y tributarios",
      "Cuenta de pago",
      "Bancolombia •••• 2345",
    ])
    const creada = filas.find((fila) => fila[1] === "Cuenta creada")
    expect(typeof creada?.[2]).toBe("string")
  })

  it("las listas llevan rótulos en español y fechas como fechas", () => {
    expect(hoja("Autorizaciones").filas[0]).toEqual([
      "Política de tratamiento de datos",
      "1.0",
      expect.any(Date),
      "190.24.x.x",
    ])
    expect(hoja("Accesos").filas[0][1]).toBe("Ingreso")
    expect(hoja("Actividad").filas[0][1]).toBe("Cambio de estado")
    expect(hoja("Solicitudes").filas[0]).toEqual([
      "N.º 41",
      "Supresión de datos",
      "Recibida",
      expect.any(Date),
      expect.any(Date),
      null,
      null,
    ])
  })

  it("sin medio no lleva sus hojas", () => {
    const sinMedio = leerDatosTitular({ ...DATOS_MEDIO, medio: null })
    if (!sinMedio) throw new Error("No se leyó.")
    expect(
      libroDatosTitular(sinMedio).hojas.map((h) => h.nombre)
    ).not.toContain("Documentos")
  })
})

describe("jsonDatosTitular", () => {
  it("entrega el JSON legible, tal como llegó", () => {
    const texto = jsonDatosTitular({ a: 1 })
    expect(texto).toBe('{\n  "a": 1\n}\n')
  })
})

describe("vista en pantalla de los datos del titular", () => {
  it("agrupa el resumen por secciones y escribe cada valor como texto", () => {
    const datos = leerDatosTitular(DATOS_MEDIO)
    if (!datos) throw new Error("forma inesperada")
    const secciones = seccionesDatosTitular(datos)
    expect(secciones.map((seccion) => seccion.titulo)).toEqual([
      "Tu cuenta",
      "Tu medio",
      "Datos de pago y tributarios",
    ])
    const cuenta = secciones[0].filas
    expect(cuenta).toContainEqual({ dato: "Celular", valor: "—" })
    expect(cuenta).toContainEqual({ dato: "Tiene foto de perfil", valor: "No" })
    const pago = secciones[2].filas
    expect(pago).toContainEqual({
      dato: "Cuenta de pago",
      valor: "Bancolombia •••• 2345",
    })
  })

  it("para el equipo titula en tercera persona", () => {
    const datos = leerDatosTitular(DATOS_MEDIO)
    if (!datos) throw new Error("forma inesperada")
    expect(
      seccionesDatosTitular(datos, { interno: true }).map((s) => s.titulo)
    ).toEqual(["Cuenta", "Medio", "Datos de pago y tributarios"])
  })

  it("cuenta los registros de cada lista (las del medio solo si lo tiene)", () => {
    const datos = leerDatosTitular(DATOS_MEDIO)
    if (!datos) throw new Error("forma inesperada")
    const conteos = conteosDatosTitular(datos)
    expect(conteos).toContainEqual({ etiqueta: "Cuentas sociales", total: 1 })
    expect(conteos).toContainEqual({ etiqueta: "Documentos", total: 1 })
    const sinMedio = conteosDatosTitular({ ...datos, medio: null })
    expect(sinMedio.map((c) => c.etiqueta)).not.toContain("Documentos")
  })
})
