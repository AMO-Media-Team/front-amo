import { generarContrasena } from "../scripts/bootstrap/contrasena"
import {
  clienteComoSuperadmin,
  type CuentaE2E,
} from "../scripts/bootstrap/provision-e2e"
import type { ClienteSupabase } from "../scripts/bootstrap/supabase"
import { credenciales, entorno, ingresar } from "./utilidades/cuentas"
import {
  abrirSesionMfa,
  type CookiesSesion,
  prepararCuentaMfa,
  usarSesion,
} from "./utilidades/mfa"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { PROYECTO_CON_CUENTAS } from "./utilidades/proyectos"

/**
 * Módulo de Usuarios contra `pnpm build && pnpm start` y el Supabase real.
 *
 * Usa un administrador EXCLUSIVO de esta suite (rol ADMIN con TOTP): auth.spec
 * cierra las sesiones de `e2e.admin` al probar la recuperación de contraseña y
 * ambas suites corren en paralelo. Los usuarios que crea la prueba usan el
 * prefijo `e2e.usuarios.` y se borran antes y después.
 */

const GESTOR: CuentaE2E = {
  clave: "ADMIN",
  rol: "ADMIN",
  nombre: "Gestión E2E",
  emailPorDefecto: "e2e.gestion@amo.test",
  variableEmail: "E2E_GESTION_EMAIL",
  variablePassword: "E2E_GESTION_PASSWORD",
  debeCambiarPassword: false,
  conTotp: true,
}

const PREFIJO_CREADOS = "e2e.usuarios."

async function borrarCreados(servicio: ClienteSupabase): Promise<void> {
  const { data, error } = await servicio
    .from("perfiles")
    .select("id")
    .like("email", `${PREFIJO_CREADOS}%`)
  if (error)
    throw new Error(
      `No se pudieron listar los usuarios de prueba: ${error.message}`
    )
  for (const { id } of data) {
    const { error: errorBorrado } = await servicio.auth.admin.deleteUser(id)
    if (errorBorrado)
      throw new Error(
        `No se pudo borrar un usuario de prueba: ${errorBorrado.message}`
      )
  }
}

async function elegirOpcion(
  page: Page,
  combo: string,
  opcion: string,
  ambito: Page | Locator = page
) {
  await ambito.getByRole("combobox", { name: combo }).click()
  await page.getByRole("option", { name: opcion, exact: true }).click()
}

async function buscar(page: Page, texto: string): Promise<void> {
  await page
    .getByRole("searchbox", { name: "Buscar por nombre o correo" })
    .fill(texto)
  // La búsqueda se escribe en la URL tras una breve espera (debounce).
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(texto)
}

test.describe("administración de usuarios", () => {
  test.describe.configure({ mode: "serial", timeout: 150_000 })

  let sesionGestor: CookiesSesion
  let servicio: ClienteSupabase
  const sufijo = Date.now().toString(36)
  const invitado = {
    email: `${PREFIJO_CREADOS}invitado.${sufijo}@amo.test`,
    nombre: "Invitación E2E",
  }
  const temporal = {
    email: `${PREFIJO_CREADOS}temporal.${sufijo}@amo.test`,
    nombre: "Temporal E2E",
  }

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({ browser }, info) => {
    info.skip(
      info.project.name !== PROYECTO_CON_CUENTAS,
      "Cuenta compartida y datos reales: esta suite corre solo en el proyecto de escritorio."
    )
    info.setTimeout(90_000)
    servicio = await clienteComoSuperadmin(entorno)
    await borrarCreados(servicio)
    const gestor = await prepararCuentaMfa(servicio, GESTOR)
    sesionGestor = await abrirSesionMfa(
      browser,
      info.project.use.baseURL,
      gestor
    )
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name === PROYECTO_CON_CUENTAS && servicio)
      await borrarCreados(servicio)
  })

  test("crea con enlace, lo encuentra, edita su rol y suspende/reactiva otra cuenta", async ({
    page,
  }) => {
    await usarSesion(page, sesionGestor)
    await page.goto("/administracion/usuarios")
    await expect(
      page.getByRole("heading", { level: 1, name: "Usuarios" })
    ).toBeVisible()
    await expect(
      page.getByRole("region", { name: "Resumen de usuarios" })
    ).toBeVisible()

    await test.step("crear un usuario con enlace de invitación", async () => {
      await page.getByRole("button", { name: "Crear usuario" }).click()
      const hoja = page.getByRole("dialog", { name: "Nuevo usuario" })
      await hoja.getByLabel("Correo electrónico").fill(invitado.email)
      await hoja.getByLabel("Nombre completo").fill(invitado.nombre)
      // Anti-escalada: un ADMIN no puede asignar SUPERADMIN.
      await hoja.getByRole("combobox", { name: "Rol" }).click()
      await expect(
        page.getByRole("option", { name: "Superadministrador" })
      ).toHaveCount(0)
      await page
        .getByRole("option", { name: "Operaciones", exact: true })
        .click()
      await expect(
        hoja.getByRole("radio", { name: /Enlace de invitación/ })
      ).toBeChecked()
      await hoja.getByRole("button", { name: "Crear usuario" }).click()

      const dialogo = page.getByRole("dialog", {
        name: "Comparte el enlace de invitación",
      })
      await expect(dialogo.getByLabel("Enlace de invitación")).toHaveValue(
        /\/auth\/confirm\?token_hash=[^&]+&type=invite$/
      )
      await expect(dialogo.getByText("Solo se muestra esta vez")).toBeVisible()
      await dialogo.getByRole("button", { name: "Ya lo compartí" }).click()
      await expect(dialogo).toBeHidden()
    })

    await test.step("aparece en el listado como invitado", async () => {
      await buscar(page, invitado.email)
      const fila = page.getByRole("row").filter({ hasText: invitado.email })
      await expect(fila).toHaveCount(1)
      await expect(fila.getByText("Invitado", { exact: true })).toBeVisible()
      await expect(fila.getByText("Operaciones")).toBeVisible()
    })

    await test.step("exportar la vista a Excel", async () => {
      const descarga = page.waitForEvent("download")
      await page.getByRole("button", { name: "Exportar" }).click()
      await page.getByRole("menuitem", { name: "Excel (.xlsx)" }).click()
      expect((await descarga).suggestedFilename()).toMatch(
        /^usuarios-amo-\d{4}-\d{2}-\d{2}\.xlsx$/
      )
    })

    await test.step("editar su rol desde el menú de la fila", async () => {
      await page
        .getByRole("button", { name: `Acciones para ${invitado.nombre}` })
        .click()
      await page.getByRole("menuitem", { name: "Editar datos y rol" }).click()
      await expect(page).toHaveURL(
        /\/administracion\/usuarios\/[0-9a-f-]+\?editar=1$/
      )

      const hoja = page.getByRole("dialog", { name: "Editar usuario" })
      await elegirOpcion(page, "Rol", "Administrador", hoja)
      await hoja.getByRole("button", { name: "Guardar cambios" }).click()
      await expect(hoja).toBeHidden()
      await expect(page.getByText("Cambios guardados")).toBeVisible()
      const cabecera = page
        .locator("header")
        .filter({ hasText: invitado.email })
      await expect(
        cabecera.getByText("Administrador", { exact: true })
      ).toBeVisible()
    })

    await test.step("crear otra cuenta con contraseña temporal", async () => {
      await page.goto("/administracion/usuarios")
      await page.getByRole("button", { name: "Crear usuario" }).click()
      const hoja = page.getByRole("dialog", { name: "Nuevo usuario" })
      await hoja.getByLabel("Correo electrónico").fill(temporal.email)
      await hoja.getByLabel("Nombre completo").fill(temporal.nombre)
      await elegirOpcion(page, "Rol", "Operaciones", hoja)
      await hoja.getByRole("radio", { name: /Contraseña temporal/ }).check()
      await hoja.getByRole("button", { name: "Crear usuario" }).click()

      const dialogo = page.getByRole("dialog", { name: "Contraseña temporal" })
      await expect(dialogo.getByLabel("Contraseña temporal")).toHaveValue(
        /^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/
      )
      await dialogo.getByRole("button", { name: "Ya lo compartí" }).click()
    })

    await test.step("suspender y reactivar desde la ficha", async () => {
      await buscar(page, temporal.email)
      await page.getByRole("link", { name: temporal.nombre }).click()
      await expect(
        page.getByRole("heading", { level: 1, name: temporal.nombre })
      ).toBeVisible()
      const cabecera = page
        .locator("header")
        .filter({ hasText: temporal.email })
      await expect(cabecera.getByText("Activo", { exact: true })).toBeVisible()

      await page.getByRole("button", { name: "Más acciones" }).click()
      await page.getByRole("menuitem", { name: "Suspender" }).click()
      const suspender = page.getByRole("alertdialog", {
        name: `¿Suspender a ${temporal.nombre}?`,
      })
      await suspender
        .getByLabel("Motivo")
        .fill("Prueba automatizada de suspensión")
      await suspender.getByRole("button", { name: "Suspender" }).click()
      await expect(suspender).toBeHidden()
      await expect(
        cabecera.getByText("Suspendido", { exact: true })
      ).toBeVisible()
      await expect(
        page.getByText("Motivo: Prueba automatizada de suspensión")
      ).toBeVisible()

      await page.getByRole("button", { name: "Más acciones" }).click()
      await page.getByRole("menuitem", { name: "Reactivar cuenta" }).click()
      const reactivar = page.getByRole("alertdialog", {
        name: `¿Reactivar a ${temporal.nombre}?`,
      })
      await reactivar.getByLabel("Motivo").fill("Fin de la prueba automatizada")
      await reactivar.getByRole("button", { name: "Reactivar" }).click()
      await expect(reactivar).toBeHidden()
      await expect(cabecera.getByText("Activo", { exact: true })).toBeVisible()
    })

    await test.step("la bitácora registra los cambios en la línea de tiempo", async () => {
      await page.getByRole("tab", { name: "Actividad" }).click()
      await expect(page).toHaveURL(/pestana=actividad/)
      const linea = page.getByRole("tabpanel", { name: "Actividad" })
      await expect(linea.getByText("Cuenta reactivada")).toBeVisible()
      await expect(linea.getByText("Cuenta suspendida")).toBeVisible()
      await expect(linea.getByText("Invitación creada")).toBeVisible()
      await expect(linea.getByText("Con contraseña temporal.")).toBeVisible()
    })
  })

  test("una cuenta registrada fuera de AMO no se adopta: crearla de nuevo la reemplaza", async ({
    page,
  }) => {
    // Simula un registro directo en Supabase Auth: el perfil queda INVITADO y
    // sin rol, y quien se registró eligió la contraseña (pre-secuestro).
    const externo = `${PREFIJO_CREADOS}externo.${sufijo}@amo.test`
    const { data, error } = await servicio.auth.admin.createUser({
      email: externo,
      password: generarContrasena(),
    })
    if (error)
      throw new Error(`No se pudo simular el registro: ${error.message}`)
    const idExterno = data.user.id

    await usarSesion(page, sesionGestor)
    await page.goto(`/administracion/usuarios/${idExterno}`)
    await expect(
      page.getByRole("heading", { level: 1, name: /externo/ })
    ).toBeVisible()
    // Ni editar (asignarle un rol) ni generarle un enlace: solo revocarla.
    await expect(
      page.getByRole("button", { name: "Editar", exact: true })
    ).toHaveCount(0)

    await page.goto("/administracion/usuarios")
    await page.getByRole("button", { name: "Crear usuario" }).click()
    const hoja = page.getByRole("dialog", { name: "Nuevo usuario" })
    await hoja.getByLabel("Correo electrónico").fill(externo)
    await hoja.getByLabel("Nombre completo").fill("Externo E2E")
    await elegirOpcion(page, "Rol", "Operaciones", hoja)
    await hoja.getByRole("button", { name: "Crear usuario" }).click()
    const dialogo = page.getByRole("dialog", {
      name: "Comparte el enlace de invitación",
    })
    await expect(dialogo).toBeVisible()
    await dialogo.getByRole("button", { name: "Ya lo compartí" }).click()

    // La cuenta anterior (con la contraseña ajena) ya no existe.
    const { data: perfil } = await servicio
      .from("perfiles")
      .select("id, rol_id, invitado_por")
      .eq("email", externo)
      .single()
    expect(perfil?.id).not.toBe(idExterno)
    expect(perfil?.rol_id).not.toBeNull()
    expect(perfil?.invitado_por).not.toBeNull()
  })
})

test.describe("anunciante", () => {
  test("no ve la administración de usuarios ni sus datos", async ({ page }) => {
    await ingresar(page, credenciales("ANUNCIANTE"))
    await expect(page).toHaveURL(/\/inicio$/)
    await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0)

    for (const ruta of [
      "/administracion/usuarios",
      "/administracion/usuarios/0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b",
    ]) {
      await page.goto(ruta)
      await expect(
        page.getByRole("heading", {
          name: "No tienes permiso para ver esta sección",
        })
      ).toBeVisible()
      // Ni la interfaz ni datos de otros usuarios llegan en el HTML/RSC.
      const html = await page.content()
      expect(html).not.toContain("Resumen de usuarios")
      expect(html).not.toContain("Crear usuario")
      expect(html).not.toContain("e2e.admin@amo.test")
    }
  })
})
