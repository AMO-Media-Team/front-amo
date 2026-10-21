import { permisosDeRol } from "../src/lib/auth/permisos"
import { generarContrasena } from "../scripts/bootstrap/contrasena"
import {
  clienteComoSuperadmin,
  type CuentaE2E,
  prepararCuenta,
} from "../scripts/bootstrap/provision-e2e"
import type { ClienteSupabase } from "../scripts/bootstrap/supabase"
import { credenciales, entorno, ingresar } from "./utilidades/cuentas"
import {
  abrirSesionMfa,
  type CookiesSesion,
  prepararCuentaMfa,
  usarSesion,
} from "./utilidades/mfa"
import { expect, type Page, test } from "./utilidades/prueba"
import { PROYECTO_CON_CUENTAS } from "./utilidades/proyectos"

/**
 * Módulo de Roles y permisos contra `pnpm build && pnpm start` y el Supabase real.
 *
 * Dos cuentas EXCLUSIVAS de esta suite (verificar un TOTP cierra las demás
 * sesiones del usuario, y las suites corren en paralelo):
 * - un SUPERADMIN que crea, ajusta, edita y elimina un rol personalizado;
 * - un gestor LIMITADO (rol personalizado con los permisos de ADMIN +
 *   `roles.gestionar`) para comprobar la anti-escalada y el rol propio.
 * Los roles de prueba usan la clave `E2E_ROLES_*` y se borran antes y después.
 * Un rol externo solo admite los permisos de su portal (`esAplicable`): la
 * matriz no ofrece los internos y la base de datos los rechaza.
 */

const PREFIJO_CLAVE = "E2E_ROLES_"
const CLAVE_ROL_LIMITADO = `${PREFIJO_CLAVE}GESTOR_LIMITADO`
const CLAVE_ROL_AJENO = `${PREFIJO_CLAVE}FINANZAS_AJENO`
const CLAVE_ROL_EXTERNO = `${PREFIJO_CLAVE}ANUNCIANTE_HEREDADO`

const SUPERADMIN: CuentaE2E = {
  clave: "ROLES_SUPER",
  rol: "SUPERADMIN",
  nombre: "Roles E2E",
  emailPorDefecto: "e2e.roles@amo.test",
  variableEmail: "E2E_ROLES_EMAIL",
  variablePassword: "E2E_ROLES_PASSWORD",
  debeCambiarPassword: false,
  conTotp: true,
}

const LIMITADO: CuentaE2E = {
  clave: "ROLES_LIMITADO",
  rol: "ADMIN",
  nombre: "Roles Limitado E2E",
  emailPorDefecto: "e2e.roles-limitado@amo.test",
  variableEmail: "E2E_ROLES_LIMITADO_EMAIL",
  variablePassword: "E2E_ROLES_LIMITADO_PASSWORD",
  debeCambiarPassword: false,
  conTotp: true,
}

// ── Datos de prueba ──────────────────────────────────────────────────────────

async function borrarRolesDePrueba(servicio: ClienteSupabase): Promise<void> {
  const { data, error } = await servicio
    .from("roles")
    .select("id")
    .like("clave", `${PREFIJO_CLAVE}%`)
  if (error)
    throw new Error(`No se pudieron listar los roles: ${error.message}`)
  for (const { id } of data) {
    // Los perfiles de prueba que lo usen vuelven a un rol de sistema primero.
    const { error: errorBorrado } = await servicio
      .from("roles")
      .delete()
      .eq("id", id)
    if (errorBorrado)
      throw new Error(
        `No se pudo borrar un rol de prueba: ${errorBorrado.message}`
      )
  }
}

async function crearRol(
  servicio: ClienteSupabase,
  rol: {
    clave: string
    nombre: string
    permisos: readonly string[]
    tipo?: "ADMIN" | "ANUNCIANTE"
  }
): Promise<string> {
  const tipo = rol.tipo ?? "ADMIN"
  const { data, error } = await servicio
    .from("roles")
    .insert({
      clave: rol.clave,
      nombre: rol.nombre,
      tipo,
      requiere_mfa: tipo === "ADMIN",
      color: "#3987E5",
    })
    .select("id")
    .single()
  if (error) throw new Error(`No se pudo crear ${rol.clave}: ${error.message}`)
  const { error: errorPermisos } = await servicio
    .from("rol_permisos")
    .insert(
      rol.permisos.map((clave) => ({ rol_id: data.id, permiso_clave: clave }))
    )
  if (errorPermisos)
    throw new Error(`No se pudieron otorgar permisos: ${errorPermisos.message}`)
  return data.id
}

// ── Navegación ───────────────────────────────────────────────────────────────

async function abrirRoles(page: Page): Promise<void> {
  await page.goto("/administracion/roles")
  await expect(
    page.getByRole("heading", { level: 1, name: "Roles y permisos" })
  ).toBeVisible()
  await expect(
    page.getByRole("region", { name: "Resumen de roles" })
  ).toBeVisible()
}

/** Abre la ficha de un rol desde su tarjeta (búsqueda + enlace). */
async function abrirRol(page: Page, nombre: string): Promise<void> {
  await page.getByRole("searchbox", { name: "Buscar roles" }).fill(nombre)
  await page.getByRole("link", { name: nombre, exact: true }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: new RegExp(nombre) })
  ).toBeVisible()
}

const permiso = (page: Page, descripcion: string) =>
  page.getByRole("switch", { name: descripcion, exact: true })

// ── Pruebas ──────────────────────────────────────────────────────────────────

test.describe("roles y permisos", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 })

  let servicio: ClienteSupabase
  let sesionSuperadmin: CookiesSesion
  let sesionLimitado: CookiesSesion
  let rolExterno: string
  const sufijo = Date.now().toString(36).toUpperCase()
  const nombreRol = `Coordinación E2E ${sufijo}`
  const nombreAjeno = `Finanzas ajeno E2E ${sufijo}`
  const nombreExterno = `Anunciante heredado E2E ${sufijo}`

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({ browser }, info) => {
    info.skip(
      info.project.name !== PROYECTO_CON_CUENTAS,
      "Cuentas exclusivas y datos reales: esta suite corre solo en el proyecto de escritorio."
    )
    info.setTimeout(120_000)
    servicio = await clienteComoSuperadmin(entorno)
    // El perfil limitado podría seguir en un rol de prueba de otra ejecución.
    await prepararCuenta(servicio, LIMITADO, generarContrasena())
    await borrarRolesDePrueba(servicio)

    const rolLimitado = await crearRol(servicio, {
      clave: CLAVE_ROL_LIMITADO,
      nombre: `Gestor limitado E2E ${sufijo}`,
      permisos: [...permisosDeRol("ADMIN"), "roles.gestionar"],
    })
    await crearRol(servicio, {
      clave: CLAVE_ROL_AJENO,
      nombre: nombreAjeno,
      permisos: ["inicio.admin", "pagos.registrar"],
    })
    rolExterno = await crearRol(servicio, {
      clave: CLAVE_ROL_EXTERNO,
      nombre: nombreExterno,
      tipo: "ANUNCIANTE",
      permisos: ["inicio.anunciante"],
    })
    const { baseURL } = info.project.use
    sesionSuperadmin = await abrirSesionMfa(
      browser,
      baseURL,
      await prepararCuentaMfa(servicio, SUPERADMIN)
    )
    sesionLimitado = await abrirSesionMfa(
      browser,
      baseURL,
      await prepararCuentaMfa(servicio, LIMITADO, rolLimitado)
    )
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_CON_CUENTAS || !servicio) return
    await prepararCuenta(servicio, LIMITADO, generarContrasena())
    await borrarRolesDePrueba(servicio)
  })

  test("el superadministrador crea, ajusta con diff, edita y elimina un rol", async ({
    page,
  }) => {
    await usarSesion(page, sesionSuperadmin)
    await abrirRoles(page)

    await test.step("buscar sin resultados muestra el estado vacío", async () => {
      await page
        .getByRole("searchbox", { name: "Buscar roles" })
        .fill("zzz-sin-coincidencias")
      await expect(page.getByText("Ningún rol coincide")).toBeVisible()
      await page.getByRole("button", { name: "Limpiar filtros" }).click()
      await expect(
        page.getByRole("link", { name: "Superadministrador", exact: true })
      ).toBeVisible()
    })

    await test.step("crear un rol copiando los permisos de Anunciante", async () => {
      await page.getByRole("button", { name: "Crear rol" }).first().click()
      const hoja = page.getByRole("dialog", { name: "Nuevo rol" })
      await hoja.getByLabel("Nombre", { exact: true }).fill(nombreRol)
      // La clave se deriva del nombre: mayúsculas, sin tildes, con guion bajo.
      await expect(hoja.getByLabel("Clave", { exact: true })).toHaveValue(
        `COORDINACION_E2E_${sufijo}`
      )
      await hoja
        .getByLabel("Clave", { exact: true })
        .fill(`${PREFIJO_CLAVE}${sufijo}`)
      // Un rol externo no hereda los permisos internos del rol de origen.
      await hoja.getByRole("radio", { name: /^Anunciante/ }).check()
      await hoja.getByRole("combobox", { name: "Permisos iniciales" }).click()
      await page
        .getByRole("option", { name: /^Copiar de Finanzas\s*\d+$/ })
        .click()
      const noAdmitidos = hoja.getByText(
        /no se copiar(á|án) porque un rol de tipo «Anunciante» no los admite/
      )
      await expect(noAdmitidos).toBeVisible()
      await hoja.getByRole("radio", { name: /^Equipo interno/ }).check()
      await expect(noAdmitidos).toHaveCount(0)
      // Cada color es un radio nativo dentro de su muestra (etiqueta con título).
      await hoja.getByTitle("Esmeralda").click()
      await expect(hoja.getByRole("radio", { name: "Esmeralda" })).toBeChecked()
      await hoja.getByRole("combobox", { name: "Permisos iniciales" }).click()
      await page
        .getByRole("option", { name: /^Copiar de Anunciante\s*\d+$/ })
        .click()
      await expect(
        hoja.getByText(/Copiará \d+ permisos de «Anunciante»/)
      ).toBeVisible()
      await hoja.getByRole("button", { name: "Crear rol" }).click()

      await expect(page).toHaveURL(/\/administracion\/roles\/[0-9a-f-]{36}$/)
      await expect(
        page.getByRole("heading", { level: 1, name: nombreRol })
      ).toBeVisible()
      await expect(page.getByText(`${PREFIJO_CLAVE}${sufijo}`)).toBeVisible()
      await expect(
        permiso(page, "Exportar reportes a Excel y PDF")
      ).toBeChecked()
    })

    await test.step("ajustar la matriz y confirmar el diff", async () => {
      await permiso(page, "Exportar reportes a Excel y PDF").click()
      await permiso(page, "Registrar pagos de anunciantes").click()
      const barra = page.getByRole("region", { name: "Cambios sin guardar" })
      await expect(barra.getByText("2 cambios")).toBeVisible()
      await expect(page.getByRole("tab", { name: /Permisos/ })).toContainText(
        "2 cambios sin guardar"
      )

      await barra.getByRole("button", { name: /Revisar y guardar/ }).click()
      const revision = page.getByRole("dialog", {
        name: "Revisa los cambios antes de guardar",
      })
      await expect(revision.getByText("1 se otorga")).toBeVisible()
      await expect(revision.getByText("1 se retira")).toBeVisible()
      await expect(
        revision.getByText("Registrar pagos de anunciantes")
      ).toBeVisible()
      await expect(
        revision.getByText(/Otorgas 1 permiso sensible/)
      ).toBeVisible()
      await revision.getByRole("button", { name: "Guardar 2 cambios" }).click()
      await expect(revision).toBeHidden()
      await expect(page.getByText("Permisos actualizados")).toBeVisible()
      await expect(barra).toBeHidden()
      await expect(
        permiso(page, "Registrar pagos de anunciantes")
      ).toBeChecked()
      await expect(
        permiso(page, "Exportar reportes a Excel y PDF")
      ).not.toBeChecked()
    })

    await test.step("buscar permisos y seleccionar un módulo entero", async () => {
      await page
        .getByRole("searchbox", { name: "Buscar permisos" })
        .fill("liquidacion")
      await expect(permiso(page, "Generar cortes de liquidación")).toBeVisible()
      await expect(permiso(page, "Registrar pagos de anunciantes")).toHaveCount(
        0
      )
      await page.getByRole("searchbox", { name: "Buscar permisos" }).fill("")

      await page
        .getByRole("checkbox", {
          name: "Seleccionar todos los permisos de Facturas",
        })
        .click()
      await expect(
        permiso(page, "Crear, emitir y anular facturas")
      ).toBeChecked()
      await page.getByRole("button", { name: "Descartar" }).click()
      await expect(
        page.getByRole("region", { name: "Cambios sin guardar" })
      ).toBeHidden()
      await expect(
        permiso(page, "Crear, emitir y anular facturas")
      ).not.toBeChecked()
    })

    await test.step("la guardia de salida protege los cambios sin guardar", async () => {
      await permiso(page, "Ver todas las facturas").click()
      await page
        .getByRole("main")
        .getByRole("link", { name: "Roles y permisos" })
        .click()
      const guardia = page.getByRole("alertdialog", {
        name: "¿Salir sin guardar?",
      })
      await expect(guardia).toBeVisible()
      await guardia.getByRole("button", { name: "Seguir editando" }).click()
      await expect(
        page.getByRole("heading", { level: 1, name: nombreRol })
      ).toBeVisible()
      await page.getByRole("button", { name: "Descartar" }).click()
    })

    await test.step("el historial muestra la creación y el guardado", async () => {
      await page.getByRole("tab", { name: /Historial/ }).click()
      await expect(page).toHaveURL(/pestana=historial/)
      const historial = page.getByRole("tabpanel", { name: /Historial/ })
      await expect(historial.getByText("Rol creado")).toBeVisible()
      await expect(
        historial.getByText(/permisos? otorgados?/).first()
      ).toBeVisible()
      // Con una persona real, la copia y el ajuste quedan en entradas distintas;
      // la prueba es tan rápida que pueden agruparse: se comprueba el permiso.
      // (Si se agrupan, puede quedar dentro de «Ver N más»: basta con que esté.)
      await expect(
        historial.getByText("Registrar pagos de anunciantes")
      ).toHaveCount(1)
    })

    await test.step("editar la descripción desde la hoja", async () => {
      await page.getByRole("button", { name: "Editar", exact: true }).click()
      const hoja = page.getByRole("dialog", { name: "Editar rol" })
      await hoja.getByLabel(/Descripción/).fill("Coordina la pauta de prueba.")
      await hoja.getByRole("button", { name: "Guardar cambios" }).click()
      await expect(hoja).toBeHidden()
      // La cabecera muestra la descripción nueva (el historial también la cita).
      await expect(
        page.getByText("Coordina la pauta de prueba.").first()
      ).toBeVisible()
    })

    await test.step("eliminar el rol escribiendo su nombre", async () => {
      await page.getByRole("button", { name: "Más acciones" }).click()
      await page.getByRole("menuitem", { name: /Eliminar rol/ }).click()
      const dialogo = page.getByRole("alertdialog", {
        name: `¿Eliminar el rol «${nombreRol}»?`,
      })
      await dialogo.getByRole("textbox").fill(nombreRol)
      await dialogo.getByRole("button", { name: "Eliminar rol" }).click()
      await expect(page).toHaveURL(/\/administracion\/roles$/)
      await expect(page.getByText("Rol eliminado")).toBeVisible()
      await expect(
        page.getByRole("link", { name: nombreRol, exact: true })
      ).toHaveCount(0)
    })
  })

  test("los roles de sistema son de solo lectura", async ({ page }) => {
    await usarSesion(page, sesionSuperadmin)
    await abrirRoles(page)
    await abrirRol(page, "Administrador")
    await expect(page.getByText("Rol de sistema: solo lectura")).toBeVisible()
    await expect(page.getByRole("switch")).toHaveCount(0)
    // De un rol de sistema solo se edita la apariencia (descripción y color).
    await expect(page.getByRole("button", { name: "Apariencia" })).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Más acciones" })
    ).toHaveCount(0)

    await page.getByRole("tab", { name: /Usuarios con este rol/ }).click()
    await expect(
      page.getByRole("tabpanel", { name: /Usuarios con este rol/ })
    ).toBeVisible()
  })

  test("un rol externo solo ofrece los permisos de su portal", async ({
    page,
  }) => {
    await usarSesion(page, sesionSuperadmin)
    await abrirRoles(page)
    await abrirRol(page, nombreExterno)
    await expect(
      permiso(page, "Ver el panel de inicio del anunciante")
    ).toBeChecked()
    await expect(
      permiso(page, "Crear y gestionar las campañas propias")
    ).toBeEnabled()
    // Los permisos internos ni se ofrecen…
    await expect(permiso(page, "Ver todas las campañas")).toHaveCount(0)
    await expect(
      permiso(page, "Ver el listado y la ficha de usuarios")
    ).toHaveCount(0)
    await expect(permiso(page, "Registrar pagos de anunciantes")).toHaveCount(0)
    // …y la base de datos tampoco los admite, ni con la clave de servicio.
    const { error } = await servicio
      .from("rol_permisos")
      .insert({ rol_id: rolExterno, permiso_clave: "campanas.ver" })
    expect(error?.message).toBe("AMO_PERMISO_NO_APLICABLE")
  })

  test("anti-escalada: un gestor limitado no otorga lo que no tiene ni toca su propio rol", async ({
    page,
  }) => {
    await usarSesion(page, sesionLimitado)
    await abrirRoles(page)

    await abrirRol(page, nombreAjeno)
    const bloqueado = permiso(page, "Registrar pagos de anunciantes")
    await expect(bloqueado).toBeDisabled()
    await expect(bloqueado).toBeChecked()
    await expect(
      page
        .getByRole("button", {
          name: "Tú no tienes este permiso: no puedes otorgarlo ni retirarlo.",
        })
        .first()
    ).toBeVisible()
    // Lo que sí tiene se puede cambiar.
    await expect(
      permiso(page, "Ver el listado y la ficha de usuarios")
    ).toBeEnabled()
    // Eliminarlo retiraría un permiso que no tiene: la acción queda bloqueada con su motivo.
    await page.getByRole("button", { name: "Más acciones" }).click()
    const eliminar = page.getByRole("menuitem", { name: /Eliminar rol/ })
    await expect(eliminar).toBeDisabled()
    await expect(eliminar).toContainText("Incluye permisos que tú no tienes")
    await page.keyboard.press("Escape")

    await abrirRoles(page)
    await abrirRol(page, `Gestor limitado E2E ${sufijo}`)
    await expect(page.getByText("Tu rol", { exact: true })).toBeVisible()
    await expect(page.getByText("Es tu propio rol")).toBeVisible()
    await expect(page.getByRole("switch")).toHaveCount(0)
  })
})

test.describe("anunciante", () => {
  test("no ve la administración de roles ni sus datos", async ({ page }) => {
    await ingresar(page, credenciales("ANUNCIANTE"))
    await expect(page).toHaveURL(/\/inicio$/)
    await expect(
      page.getByRole("link", { name: "Roles y permisos" })
    ).toHaveCount(0)

    for (const ruta of [
      "/administracion/roles",
      "/administracion/roles/0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b",
    ]) {
      await page.goto(ruta)
      await expect(
        page.getByRole("heading", {
          name: "No tienes permiso para ver esta sección",
        })
      ).toBeVisible()
      const html = await page.content()
      expect(html).not.toContain("Resumen de roles")
      expect(html).not.toContain("Crear rol")
      expect(html).not.toContain("Roles de sistema")
    }
  })
})
