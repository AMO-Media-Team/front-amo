import { randomInt } from "node:crypto"

import {
  clienteComoSuperadmin,
  type CuentaE2E,
} from "../scripts/bootstrap/provision-e2e"
import type { ClienteSupabase } from "../scripts/bootstrap/supabase"
import { huellaConexion } from "../src/features/vinculacion/ip"
import { infracciones } from "./utilidades/axe"
import { entorno } from "./utilidades/cuentas"
import { esperarSinDesbordeHorizontal, fijarTema } from "./utilidades/interfaz"
import {
  abrirSesionMfa,
  type CookiesSesion,
  prepararCuentaMfa,
  usarSesion,
} from "./utilidades/mfa"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { PROYECTO_CON_CUENTAS } from "./utilidades/proyectos"

/**
 * Solicitud pública de vinculación (MED-001) y su cola en
 * `/operacion/verificacion?cola=solicitudes`, contra `pnpm build && pnpm start`.
 *
 * - Formulario público (los tres tamaños): llega desde «Ingresar», valida,
 *   se envía y confirma; cumple WCAG 2.2 AA y no se desborda a 390 px.
 * - Límite por conexión y cola interna (solo escritorio): un revisor EXCLUSIVO
 *   (ADMIN con TOTP) descarta una solicitud con motivo e invita otra, que
 *   registra el medio, crea la cuenta con la organización fija y muestra el
 *   acceso UNA vez.
 *
 * Cada envío sale de una red IPv6 de documentación al azar (`x-forwarded-for`):
 * el límite diario por conexión no se acumula entre corridas. Lo creado lleva
 * el prefijo `e2e.vinculacion.<suite>.` (correos) o «E2E Vinculación
 * invitación» (medios) y se borra antes y después.
 */

const REVISOR: CuentaE2E = {
  clave: "VINCULACION",
  rol: "ADMIN",
  nombre: "Vinculación E2E",
  emailPorDefecto: "e2e.vinculacion@amo.test",
  variableEmail: "E2E_VINCULACION_EMAIL",
  variablePassword: "E2E_VINCULACION_PASSWORD",
  debeCambiarPassword: false,
  conTotp: true,
}

const PREFIJO_CORREO = "e2e.vinculacion."
const PREFIJO_MEDIO = "E2E Vinculación"
/** `vinculacion.max_solicitudes_ip_dia` por defecto. */
const LIMITE_POR_CONEXION = 5

const sufijo = Date.now().toString(36)

function prefijoDe(proyecto: string): string {
  return `${PREFIJO_CORREO}${proyecto}.`
}

/** Red /64 de documentación (2001:db8::/32) al azar: una conexión nueva. */
function ipAlAzar(): string {
  const grupo = () => randomInt(0, 0xffff).toString(16)
  return `2001:db8:${grupo()}:${grupo()}::${grupo()}`
}

async function nuevaConexion(page: Page): Promise<string> {
  const ip = ipAlAzar()
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip })
  return ip
}

/**
 * Borra lo que creó una suite: las cuentas (por correo), los medios que
 * registró «Invitar» (por nombre; antes, sus cuentas) y las solicitudes.
 */
async function limpiar(
  servicio: ClienteSupabase,
  prefijoCorreo: string,
  prefijoMedios?: string
): Promise<void> {
  const { data: perfiles, error } = await servicio
    .from("perfiles")
    .select("id")
    .like("email", `${prefijoCorreo}%`)
  if (error) throw new Error(`No se listaron las cuentas: ${error.message}`)
  for (const { id } of perfiles) {
    const borrado = await servicio.auth.admin.deleteUser(id)
    if (borrado.error)
      throw new Error(`No se borró una cuenta: ${borrado.error.message}`)
  }
  const { error: errorSolicitudes } = await servicio
    .from("solicitudes_vinculacion")
    .delete()
    .like("email", `${prefijoCorreo}%`)
  if (errorSolicitudes)
    throw new Error(
      `No se borraron las solicitudes: ${errorSolicitudes.message}`
    )
  if (!prefijoMedios) return
  const { error: errorMedios } = await servicio
    .from("medios")
    .delete()
    .like("nombre", `${prefijoMedios}%`)
  if (errorMedios)
    throw new Error(`No se borraron los medios: ${errorMedios.message}`)
}

interface Municipio {
  codigo: string
  nombre: string
  departamento: string
}

/** Un municipio habilitado (municipio y departamento activos). */
async function municipioActivo(servicio: ClienteSupabase): Promise<Municipio> {
  const { data, error } = await servicio
    .from("municipios")
    .select(
      "codigo, nombre, departamento:departamentos!municipios_departamento_codigo_fkey!inner ( nombre_corto, activo )"
    )
    .eq("activo", true)
    .eq("departamento.activo", true)
    .order("codigo")
    .limit(1)
    .single()
  if (error) throw new Error(`No hay municipios activos: ${error.message}`)
  return {
    codigo: data.codigo.trim(),
    nombre: data.nombre,
    departamento: data.departamento.nombre_corto,
  }
}

/** Nombre de una opción del selector (los municipios capitales llevan «Capital»). */
function opcion(texto: string): RegExp {
  const literal = texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`^${literal}(?:\\s*Capital)?$`)
}

interface Semilla {
  nombre: string
  email: string
}

async function sembrarSolicitud(
  servicio: ClienteSupabase,
  { nombre, email }: Semilla,
  municipio: Municipio,
  ipHash: string | null = null
): Promise<void> {
  const { error } = await servicio.rpc("crear_solicitud_vinculacion_srv", {
    p_datos: {
      nombre_medio: nombre,
      tipo: "PAGINA_NOTICIAS",
      contacto_nombre: "Contacto E2E",
      email,
      celular: "300 123 4567",
      municipio_codigo: municipio.codigo,
      cuentas: [
        {
          plataforma: "INSTAGRAM",
          usuario: "e2e.vinculacion",
          seguidores: 45000,
        },
        { plataforma: "TIKTOK", usuario: "e2e.vinculacion" },
      ],
      mensaje: "Publicamos noticias del municipio desde 2019.",
      autoriza_datos: true,
    },
    // Los tipos generados declaran el argumento no nulo; la RPC admite null.
    p_ip_hash: ipHash as string,
  })
  if (error) throw new Error(`No se sembró la solicitud: ${error.message}`)
}

async function elegirMunicipio(
  page: Page,
  municipio: Municipio
): Promise<void> {
  await page
    .getByRole("combobox", { name: "Departamento", exact: true })
    .click()
  await page
    .getByRole("option", { name: opcion(municipio.departamento) })
    .click()
  // La lista de municipios se abre sola al elegir el departamento.
  await page.getByRole("option", { name: opcion(municipio.nombre) }).click()
  await expect(
    page.getByRole("combobox", { name: "Municipio", exact: true })
  ).toContainText(municipio.nombre)
}

async function llenarFormulario(
  page: Page,
  { nombre, email }: Semilla,
  municipio: Municipio
): Promise<void> {
  await page.getByLabel("Nombre del medio").fill(nombre)
  await elegirMunicipio(page, municipio)
  await page
    .getByLabel("Usuario o enlace")
    .fill("instagram.com/e2e.vinculacion")
  await page.getByLabel("Seguidores").fill("45 mil")
  await page.getByLabel("Tu nombre").fill("Contacto E2E")
  await page.getByLabel("Correo electrónico").fill(email)
  await page
    .getByRole("checkbox", {
      name: "Autorizo a AMO a tratar mis datos personales",
    })
    .check()
}

test.describe("formulario público de vinculación", () => {
  let servicio: ClienteSupabase
  let municipio: Municipio

  test.beforeAll(async ({}, info) => {
    servicio = await clienteComoSuperadmin(entorno)
    await limpiar(servicio, prefijoDe(info.project.name))
    municipio = await municipioActivo(servicio)
  })

  test.afterAll(async ({}, info) => {
    if (servicio) await limpiar(servicio, prefijoDe(info.project.name))
  })

  test("«Ingresar» lleva al formulario", async ({ page }) => {
    await page.goto("/ingresar")
    await page.getByRole("link", { name: "Pide unirte" }).click()
    await expect(page).toHaveURL(/\/vincular$/)
    await expect(
      page.getByRole("heading", { level: 1, name: "Suma tu medio a AMO" })
    ).toBeVisible()
  })

  test("valida, envía y confirma sin desbordarse", async ({ page }, info) => {
    const solicitud: Semilla = {
      nombre: `${PREFIJO_MEDIO} ${sufijo}`,
      email: `${prefijoDe(info.project.name)}${sufijo}@amo.test`,
    }
    await nuevaConexion(page)
    await page.goto("/vincular")
    await esperarSinDesbordeHorizontal(page)

    await page.getByRole("button", { name: "Enviar solicitud" }).click()
    await expect(page.getByLabel("Nombre del medio")).toBeFocused()
    await expect(page.getByText("Escribe el nombre del medio.")).toBeVisible()
    await expect(
      page.getByText(
        "Para enviar la solicitud debes autorizar el tratamiento de tus datos."
      )
    ).toBeVisible()

    await llenarFormulario(page, solicitud, municipio)
    await page.getByRole("button", { name: "Enviar solicitud" }).click()

    await expect(
      page.getByRole("heading", { name: "¡Recibimos tu solicitud!" })
    ).toBeFocused()
    await expect(page.getByText(solicitud.email)).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    const { data, error } = await servicio
      .from("solicitudes_vinculacion")
      .select("nombre_medio, estado, cuentas, ip_hash")
      .eq("email", solicitud.email)
      .single()
    expect(error).toBeNull()
    expect(data).toMatchObject({
      nombre_medio: solicitud.nombre,
      estado: "PENDIENTE",
      cuentas: [
        {
          plataforma: "INSTAGRAM",
          usuario: "e2e.vinculacion",
          seguidores: 45000,
        },
      ],
    })
    // Se guarda la huella de la conexión, nunca la IP.
    expect(data?.ip_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  test.describe("accesibilidad", () => {
    // Sin animaciones de entrada: un texto a medio aparecer da un contraste falso.
    test.use({ contextOptions: { reducedMotion: "reduce" } })

    test("cumple WCAG 2.2 AA en tema oscuro y claro", async ({ page }) => {
      await page.goto("/vincular")
      await expect(
        page.getByRole("button", { name: "Enviar solicitud" })
      ).toBeVisible()
      expect(await infracciones(page), "/vincular (oscuro)").toEqual([])
      await fijarTema(page, "light")
      await expect(
        page.getByRole("button", { name: "Enviar solicitud" })
      ).toBeVisible()
      expect(await infracciones(page), "/vincular (claro)").toEqual([])
    })
  })
})

test.describe("límite de solicitudes por conexión", () => {
  let servicio: ClienteSupabase
  const prefijo = `${PREFIJO_CORREO}limite.`

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_CON_CUENTAS,
      "Escribe en la base: corre solo en el proyecto de escritorio."
    )
    servicio = await clienteComoSuperadmin(entorno)
    await limpiar(servicio, prefijo)
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name === PROYECTO_CON_CUENTAS && servicio)
      await limpiar(servicio, prefijo)
  })

  test("al pasar el límite lo explica y conserva lo escrito", async ({
    page,
  }) => {
    const ip = await nuevaConexion(page)
    const municipio = await municipioActivo(servicio)
    const huella = huellaConexion(ip, entorno.secretoServidor)
    for (let indice = 0; indice < LIMITE_POR_CONEXION; indice++) {
      await sembrarSolicitud(
        servicio,
        {
          nombre: `${PREFIJO_MEDIO} límite ${indice}`,
          email: `${prefijo}${sufijo}.${indice}@amo.test`,
        },
        municipio,
        huella
      )
    }

    await page.goto("/vincular")
    const email = `${prefijo}${sufijo}.extra@amo.test`
    await llenarFormulario(
      page,
      { nombre: `${PREFIJO_MEDIO} extra`, email },
      municipio
    )
    await page.getByRole("button", { name: "Enviar solicitud" }).click()

    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Recibimos varias solicitudes" })
    ).toBeVisible()
    await expect(page.getByLabel("Correo electrónico")).toHaveValue(email)
    const { count } = await servicio
      .from("solicitudes_vinculacion")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
    expect(count).toBe(0)
  })
})

test.describe("cola de solicitudes", () => {
  test.describe.configure({ mode: "serial", timeout: 150_000 })

  let servicio: ClienteSupabase
  let sesionRevisor: CookiesSesion
  const prefijo = `${PREFIJO_CORREO}cola.`
  const descartar: Semilla = {
    nombre: `${PREFIJO_MEDIO} descarte ${sufijo}`,
    email: `${prefijo}descarte.${sufijo}@amo.test`,
  }
  /** Los medios que registra «Invitar» en esta suite (y en corridas fallidas). */
  const medios = `${PREFIJO_MEDIO} invitación `
  const invitar: Semilla = {
    nombre: `${medios}${sufijo}`,
    email: `${prefijo}invitacion.${sufijo}@amo.test`,
  }

  test.beforeAll(async ({ browser }, info) => {
    info.skip(
      info.project.name !== PROYECTO_CON_CUENTAS,
      "Cuenta exclusiva y datos reales: corre solo en el proyecto de escritorio."
    )
    info.setTimeout(90_000)
    servicio = await clienteComoSuperadmin(entorno)
    await limpiar(servicio, prefijo, medios)
    const municipio = await municipioActivo(servicio)
    await sembrarSolicitud(servicio, descartar, municipio)
    await sembrarSolicitud(servicio, invitar, municipio)
    const revisor = await prepararCuentaMfa(servicio, REVISOR)
    sesionRevisor = await abrirSesionMfa(
      browser,
      info.project.use.baseURL,
      revisor
    )
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name === PROYECTO_CON_CUENTAS && servicio)
      await limpiar(servicio, prefijo, medios)
  })

  async function abrirCola(page: Page): Promise<void> {
    await usarSesion(page, sesionRevisor)
    await page.goto("/operacion/verificacion?cola=solicitudes")
    await expect(
      page.getByRole("list", { name: "Solicitudes por atender" })
    ).toBeVisible()
  }

  function tarjeta(page: Page, nombre: string): Locator {
    return page.getByRole("article", { name: nombre })
  }

  test("muestra lo declarado y descarta con motivo", async ({ page }) => {
    await abrirCola(page)
    const solicitud = tarjeta(page, descartar.nombre)
    await expect(solicitud).toBeVisible()
    await expect(
      solicitud.getByRole("link", { name: /^Instagram @e2e\.vinculacion/ })
    ).toHaveAttribute("href", "https://www.instagram.com/e2e.vinculacion/")
    await expect(solicitud).toContainText("45 mil seguidores")
    await expect(
      solicitud.getByRole("link", { name: descartar.email })
    ).toHaveAttribute("href", `mailto:${descartar.email}`)

    await solicitud
      .getByRole("button", {
        name: `Descartar la solicitud de ${descartar.nombre}`,
      })
      .click()
    const dialogo = page.getByRole("alertdialog", {
      name: `¿Descartar la solicitud de ${descartar.nombre}?`,
    })
    await dialogo.getByLabel("Motivo").fill("Prueba E2E: no es un medio.")
    await dialogo.getByRole("button", { name: "Descartar" }).click()

    await expect(dialogo).toBeHidden()
    await expect(solicitud).toBeHidden()
    await page.getByText("Atendidas recientemente").click()
    // En `main`: el aviso emergente (toast) también es un listitem con el nombre.
    await expect(
      page
        .getByRole("main")
        .getByRole("listitem")
        .filter({ hasText: descartar.nombre })
    ).toContainText("Prueba E2E: no es un medio.")

    const { data } = await servicio
      .from("solicitudes_vinculacion")
      .select("estado, motivo_descarte, resuelta_at")
      .eq("email", descartar.email)
      .single()
    expect(data).toMatchObject({
      estado: "DESCARTADA",
      motivo_descarte: "Prueba E2E: no es un medio.",
    })
  })

  test("invita: registra el medio, crea la cuenta y muestra el acceso una vez", async ({
    page,
  }) => {
    await abrirCola(page)
    const solicitud = tarjeta(page, invitar.nombre)
    await solicitud
      .getByRole("button", { name: `Invitar a ${invitar.nombre}` })
      .click()

    const hoja = page.getByRole("dialog", {
      name: `Invitar a ${invitar.nombre}`,
    })
    await expect(hoja.getByLabel("Nombre del medio")).toHaveValue(
      invitar.nombre
    )
    await expect(hoja.getByLabel("Correo electrónico")).toHaveValue(
      invitar.email
    )
    // Con varios roles de medio asignables, se elige el de sistema.
    const rol = hoja.getByRole("combobox", { name: "Rol", exact: true })
    if ((await rol.count()) > 0) {
      await rol.click()
      await page.getByRole("option", { name: "Medio", exact: true }).click()
    }
    await hoja.getByRole("button", { name: "Invitar", exact: true }).click()

    const acceso = page.getByRole("dialog", {
      name: /Comparte el enlace de invitación|Invitación enviada/,
    })
    await expect(acceso).toBeVisible()
    await acceso
      .getByRole("button", { name: /Ya lo compartí|Entendido/ })
      .click()
    await expect(acceso).toBeHidden()
    await expect(solicitud).toBeHidden()

    const { data: atendida } = await servicio
      .from("solicitudes_vinculacion")
      .select(
        "estado, medio:medios!solicitudes_vinculacion_medio_id_fkey ( id, nombre, estado )"
      )
      .eq("email", invitar.email)
      .single()
    expect(atendida).toMatchObject({
      estado: "INVITADA",
      medio: { nombre: invitar.nombre, estado: "PENDIENTE" },
    })
    const { data: perfil } = await servicio
      .from("perfiles")
      .select("medio_id, rol:roles!perfiles_rol_id_fkey ( tipo )")
      .eq("email", invitar.email)
      .single()
    expect(perfil).toMatchObject({
      medio_id: atendida?.medio?.id,
      rol: { tipo: "MEDIO" },
    })
  })
})
