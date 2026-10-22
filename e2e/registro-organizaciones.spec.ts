import {
  clienteComoSuperadmin,
  type CuentaE2E,
} from "../scripts/bootstrap/provision-e2e"
import type { ClienteSupabase } from "../scripts/bootstrap/supabase"
import { TIPOS_MEDIO } from "../src/features/operacion/estados"
import { formatearNit } from "../src/lib/colombia/nit"
import { entorno } from "./utilidades/cuentas"
import {
  abrirSesionMfa,
  type CookiesSesion,
  prepararCuentaMfa,
  usarSesion,
} from "./utilidades/mfa"
import {
  borrarOrganizacionesE2E,
  nitDePrueba,
  type PrefijosPrueba,
  sufijoCorrida,
} from "./utilidades/organizaciones"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { PROYECTO_CON_CUENTAS } from "./utilidades/proyectos"

/**
 * Registro de organizaciones por el equipo AMO (fase 0: paquetes RM y RA)
 * contra `pnpm build && pnpm start` y el Supabase real: registrar un medio
 * desde `?registrar=1` (el enlace del aviso de «Crear usuario»), editarlo e
 * invitar a su equipo con el medio fijo; registrar un anunciante colombiano
 * (NIT con DV, el errado se rechaza en el campo) y uno extranjero.
 *
 * Usa un administrador EXCLUSIVO (rol ADMIN con TOTP): verificar un factor
 * cierra las demás sesiones de la cuenta. Lo que crea lleva el prefijo
 * «E2E Registro» y el sufijo de la corrida, y se borra antes y después.
 */

const REGISTRADOR: CuentaE2E = {
  clave: "ADMIN",
  rol: "ADMIN",
  nombre: "Registro E2E",
  emailPorDefecto: "e2e.registro@amo.test",
  variableEmail: "E2E_REGISTRO_EMAIL",
  variablePassword: "E2E_REGISTRO_PASSWORD",
  debeCambiarPassword: false,
  conTotp: true,
}

const PREFIJOS: PrefijosPrueba = {
  nombre: "E2E Registro",
  correo: "e2e.registro.",
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

/** Lo que la hoja ofrece hoy (los catálogos cambian entre entornos). */
interface Catalogos {
  categoria: string
  sector: string
}

async function leerCatalogos(servicio: ClienteSupabase): Promise<Catalogos> {
  const [categoria, sector] = await Promise.all([
    servicio
      .from("categorias")
      .select("nombre")
      .eq("activo", true)
      .is("deleted_at", null)
      .order("orden")
      .order("nombre")
      .limit(1)
      .single(),
    servicio
      .from("sectores")
      .select("nombre")
      .eq("activo", true)
      .is("deleted_at", null)
      .order("orden")
      .order("nombre")
      .limit(1)
      .single(),
  ])
  if (categoria.error || sector.error) {
    throw new Error(
      `No hay categorías o sectores activos: ${(categoria.error ?? sector.error)?.message}`
    )
  }
  return { categoria: categoria.data.nombre, sector: sector.data.nombre }
}

function hoja(page: Page, titulo: string): Locator {
  return page.getByRole("dialog", { name: titulo })
}

/** Lista de Base UI (rol, tipo de medio, sector): abre el combo y elige. */
async function elegirOpcion(
  page: Page,
  ambito: Locator,
  combo: string,
  opcion: string
): Promise<void> {
  await ambito.getByRole("combobox", { name: combo }).click()
  await page.getByRole("option", { name: opcion, exact: true }).click()
}

/** Selector de territorio: departamento y, en la lista que se abre sola, el municipio. */
async function elegirMunicipio(
  page: Page,
  ambito: Locator,
  departamento: string,
  municipio: string
): Promise<void> {
  await ambito.getByRole("combobox", { name: "Departamento" }).click()
  await page
    .getByRole("combobox", { name: "Busca un departamento…" })
    .fill(departamento)
  await page
    .getByRole("option", { name: new RegExp(`^${departamento}`) })
    .click()
  const busqueda = page.getByRole("combobox", { name: "Busca un municipio…" })
  await expect(busqueda).toBeFocused()
  await busqueda.fill(municipio)
  await page.getByRole("option", { name: new RegExp(`^${municipio}`) }).click()
  await expect(
    ambito.getByRole("combobox", { name: "Municipio" })
  ).toContainText(municipio)
}

/** Cabecera de la ficha: la que lleva el título de la organización. */
function cabecera(page: Page, titulo: string): Locator {
  return page.locator("header").filter({
    has: page.getByRole("heading", { level: 1, name: titulo, exact: true }),
  })
}

function idDeLaUrl(page: Page, seccion: "medios" | "anunciantes"): string {
  const id = new RegExp(`/operacion/${seccion}/(${UUID})`).exec(page.url())?.[1]
  if (!id) throw new Error(`La URL no es la de una ficha: ${page.url()}`)
  return id
}

test.describe("registro de organizaciones (equipo AMO)", () => {
  test.describe.configure({ mode: "serial", timeout: 150_000 })

  let sesion: CookiesSesion
  let servicio: ClienteSupabase
  let catalogos: Catalogos
  const sufijo = sufijoCorrida()

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({ browser }, info) => {
    info.skip(
      info.project.name !== PROYECTO_CON_CUENTAS,
      "Crea organizaciones y usuarios reales: esta suite corre solo en el proyecto de escritorio."
    )
    info.setTimeout(90_000)
    servicio = await clienteComoSuperadmin(entorno)
    await borrarOrganizacionesE2E(servicio, PREFIJOS)
    catalogos = await leerCatalogos(servicio)
    const registrador = await prepararCuentaMfa(servicio, REGISTRADOR)
    sesion = await abrirSesionMfa(
      browser,
      info.project.use.baseURL,
      registrador
    )
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name === PROYECTO_CON_CUENTAS && servicio) {
      await borrarOrganizacionesE2E(servicio, PREFIJOS)
    }
  })

  test("registra un medio desde ?registrar=1, lo edita e invita a su equipo con el medio fijo", async ({
    page,
  }) => {
    const nombre = `${PREFIJOS.nombre} Medio ${sufijo}`
    const nombreEditado = `${nombre} Sur`
    const persona = {
      nombre: "Persona Medio E2E",
      email: `${PREFIJOS.correo}medio.${sufijo}@amo.test`,
    }
    await usarSesion(page, sesion)

    await test.step("el enlace del aviso abre la hoja y cerrarla limpia la URL", async () => {
      await page.goto("/operacion/medios?registrar=1")
      const registro = hoja(page, "Registrar medio")
      await expect(registro).toBeVisible()
      await registro.getByRole("button", { name: "Cancelar" }).click()
      await expect(registro).toBeHidden()
      await expect
        .poll(() => new URL(page.url()).searchParams.has("registrar"))
        .toBe(false)
    })

    await test.step("registrar el medio", async () => {
      await page.getByRole("button", { name: "Registrar medio" }).click()
      const registro = hoja(page, "Registrar medio")
      await registro.getByLabel("Nombre del medio").fill(nombre)
      await elegirOpcion(
        page,
        registro,
        "Tipo de medio",
        TIPOS_MEDIO.PAGINA_NOTICIAS
      )
      await elegirMunicipio(page, registro, "Antioquia", "Medellín")
      await registro
        .getByRole("checkbox", { name: catalogos.categoria })
        .check()
      await registro
        .getByLabel(/^Descripción de la audiencia/)
        .fill("Audiencia de prueba del Valle de Aburrá (E2E).")
      await registro.getByRole("button", { name: "Registrar medio" }).click()

      // El aviso sale al guardar y dura unos segundos: antes de esperar la ficha.
      await expect(page.getByText("Medio registrado")).toBeVisible()
      await expect(page).toHaveURL(
        new RegExp(`/operacion/medios/${UUID}\\?pestana=usuarios$`)
      )
      const ficha = cabecera(page, nombre)
      await expect(ficha.getByText("En verificación")).toBeVisible()
      await expect(ficha.getByText(TIPOS_MEDIO.PAGINA_NOTICIAS)).toBeVisible()
      await expect(ficha.getByText(/Medellín/)).toBeVisible()
      // Sin personas aún: la pestaña invita a crear la primera.
      await expect(page.getByRole("tab", { name: "Usuarios" })).toHaveAttribute(
        "aria-selected",
        "true"
      )
      await expect(
        page.getByText("Aún no hay usuarios en este medio")
      ).toBeVisible()
    })
    const medioId = idDeLaUrl(page, "medios")

    await test.step("editar sus datos", async () => {
      await cabecera(page, nombre)
        .getByRole("button", { name: "Editar datos" })
        .click()
      const edicion = hoja(page, "Editar datos del medio")
      await expect(edicion.getByLabel("Nombre del medio")).toHaveValue(nombre)
      await edicion.getByLabel("Nombre del medio").fill(nombreEditado)
      await elegirOpcion(page, edicion, "Tipo de medio", TIPOS_MEDIO.EMISORA)
      await edicion.getByRole("button", { name: "Guardar cambios" }).click()
      await expect(edicion).toBeHidden()
      await expect(page.getByText("Datos del medio actualizados")).toBeVisible()
      await expect(
        cabecera(page, nombreEditado).getByText(TIPOS_MEDIO.EMISORA)
      ).toBeVisible()
    })

    await test.step("invitar a una persona con el medio fijo", async () => {
      await cabecera(page, nombreEditado)
        .getByRole("button", { name: "Invitar usuario" })
        .click()
      const alta = hoja(page, "Nuevo usuario")
      await expect(
        alta.getByText(`Invita a una persona del equipo de ${nombreEditado}.`)
      ).toBeVisible()
      // El medio no se elige: se muestra fijo.
      await expect(alta.getByText(nombreEditado, { exact: true })).toBeVisible()
      await expect(
        alta.getByText("La persona quedará vinculada a esta organización.")
      ).toBeVisible()
      await expect(
        alta.getByRole("combobox", { name: "Medio", exact: true })
      ).toHaveCount(0)

      await alta.getByLabel("Correo electrónico").fill(persona.email)
      await alta.getByLabel("Nombre completo").fill(persona.nombre)
      await elegirOpcion(page, alta, "Rol", "Medio")
      await alta.getByRole("radio", { name: /Contraseña temporal/ }).check()
      await alta.getByRole("button", { name: "Crear usuario" }).click()

      const credencial = page.getByRole("dialog", {
        name: "Contraseña temporal",
      })
      await expect(credencial.getByLabel("Contraseña temporal")).toHaveValue(
        /^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/
      )
      await credencial.getByRole("button", { name: "Ya lo compartí" }).click()
      await expect(credencial).toBeHidden()

      const usuarios = page.getByRole("tabpanel", { name: "Usuarios" })
      await expect(
        usuarios.getByRole("link", { name: persona.nombre })
      ).toBeVisible()
      await expect(usuarios.getByText(persona.email)).toBeVisible()
    })

    await test.step("la base guarda el medio editado y a la persona en él", async () => {
      const [{ data: medio }, { data: perfil }] = await Promise.all([
        servicio
          .from("medios")
          .select(
            "nombre, tipo, estado, municipio_codigo, medio_categorias(categoria_id)"
          )
          .eq("id", medioId)
          .single(),
        servicio
          .from("perfiles")
          .select("medio_id, anunciante_id")
          .eq("email", persona.email)
          .single(),
      ])
      expect(medio).toMatchObject({
        nombre: nombreEditado,
        tipo: "EMISORA",
        estado: "PENDIENTE",
        municipio_codigo: "05001",
      })
      expect(medio?.medio_categorias).toHaveLength(1)
      expect(perfil).toEqual({ medio_id: medioId, anunciante_id: null })
    })
  })

  test("registra un anunciante colombiano: el DV errado se rechaza en el campo", async ({
    page,
  }) => {
    const nombreComercial = `${PREFIJOS.nombre} Andina ${sufijo}`
    const razonSocial = `${nombreComercial} S.A.S.`
    const { nit, dv, dvErrado } = nitDePrueba()
    const correo = `facturacion.${sufijo}@amo.test`
    await usarSesion(page, sesion)
    await page.goto("/operacion/anunciantes?registrar=1")
    const registro = hoja(page, "Registrar anunciante")
    await expect(registro).toBeVisible()

    await test.step("datos de la empresa", async () => {
      await registro.getByLabel("Razón social").fill(razonSocial)
      await registro.getByLabel("Nombre comercial").fill(nombreComercial)
      await elegirOpcion(page, registro, "Sector", catalogos.sector)
      await expect(
        registro.getByRole("combobox", { name: "País" })
      ).toContainText("Colombia")
    })

    await test.step("un DV que no corresponde al NIT se rechaza antes de enviar", async () => {
      const campoNit = registro.getByRole("textbox", {
        name: "NIT",
        exact: true,
      })
      const campoDv = registro.getByRole("textbox", { name: /^DV/ })
      await campoNit.fill(nit)
      await campoDv.fill(dvErrado)
      await campoDv.blur()
      const error = registro.getByText(
        `No corresponde al NIT: para ${formatearNit(nit)} es ${dv}. Revisa ambos en el RUT.`
      )
      await expect(error).toBeVisible()
      await expect(campoDv).toHaveAttribute("aria-invalid", "true")
      // Al salir del campo, el NIT se muestra con puntos, como en el RUT.
      await expect(campoNit).toHaveValue(formatearNit(nit))

      await elegirMunicipio(page, registro, "Antioquia", "Medellín")
      await registro
        .getByRole("button", { name: "Registrar", exact: true })
        .click()
      await expect(registro).toBeVisible()
      await expect(error).toBeVisible()
      const { count } = await servicio
        .from("anunciantes")
        .select("id", { count: "exact", head: true })
        .eq("nit", nit)
      expect(count).toBe(0)

      await registro.getByRole("button", { name: `Usar ${dv}` }).click()
      await expect(campoDv).toHaveValue(dv)
      await expect(
        registro.getByText("El dígito de verificación coincide con el NIT.")
      ).toBeVisible()
      await expect(error).toBeHidden()
    })

    await test.step("registrar y llegar a la ficha", async () => {
      await registro.getByLabel(/^Correo de facturación/).fill(correo)
      await registro
        .getByRole("button", { name: "Registrar", exact: true })
        .click()
      await expect(page.getByText("Anunciante registrado")).toBeVisible()
      await expect(page).toHaveURL(
        new RegExp(`/operacion/anunciantes/${UUID}\\?pestana=usuarios$`)
      )
      const ficha = cabecera(page, nombreComercial)
      await expect(ficha.getByText(formatearNit(nit, dv))).toBeVisible()
      await expect(ficha.getByText("En verificación")).toBeVisible()
      await expect(ficha.getByText(razonSocial)).toBeVisible()
    })

    const { data } = await servicio
      .from("anunciantes")
      .select(
        "nit, digito_verificacion, pais_iso2, municipio_codigo, identificacion_extranjera, estado_verificacion, datos_facturacion"
      )
      .eq("id", idDeLaUrl(page, "anunciantes"))
      .single()
    expect(data).toMatchObject({
      nit,
      digito_verificacion: dv,
      pais_iso2: "CO",
      municipio_codigo: "05001",
      identificacion_extranjera: null,
      estado_verificacion: "PENDIENTE",
      datos_facturacion: { email_facturacion: correo },
    })
  })

  test("registra un anunciante extranjero sin NIT ni municipio", async ({
    page,
  }) => {
    const nombreComercial = `${PREFIJOS.nombre} Global ${sufijo}`
    const razonSocial = `${nombreComercial} LLC`
    const identificacion = `EIN 98-${sufijo}`
    await usarSesion(page, sesion)
    await page.goto("/operacion/anunciantes?registrar=1")
    const registro = hoja(page, "Registrar anunciante")

    await registro.getByLabel("Razón social").fill(razonSocial)
    await registro.getByLabel("Nombre comercial").fill(nombreComercial)
    await elegirOpcion(page, registro, "Sector", catalogos.sector)

    await registro.getByRole("combobox", { name: "País" }).click()
    // El buscador de países no tiene nombre propio: se ubica por su indicación.
    await page
      .getByPlaceholder("Nombre o código (CO, US…)")
      .fill("Estados Unidos")
    // Exacto: otro territorio podría contener el mismo nombre.
    await page
      .getByRole("option", { name: "Estados Unidos", exact: true })
      .click()
    await expect(
      registro.getByRole("combobox", { name: "País" })
    ).toContainText("Estados Unidos")
    // Sin NIT, DV ni municipio: identificación tributaria y ciudad.
    await expect(
      registro.getByRole("textbox", { name: "NIT", exact: true })
    ).toHaveCount(0)
    await expect(
      registro.getByRole("combobox", { name: "Departamento" })
    ).toHaveCount(0)
    await registro.getByLabel("Identificación tributaria").fill(identificacion)
    await registro.getByLabel(/^Ciudad/).fill("Miami")
    await registro
      .getByRole("button", { name: "Registrar", exact: true })
      .click()

    await expect(page).toHaveURL(
      new RegExp(`/operacion/anunciantes/${UUID}\\?pestana=usuarios$`)
    )
    const ficha = cabecera(page, nombreComercial)
    await expect(ficha.getByText(identificacion)).toBeVisible()
    await expect(ficha.getByText("Estados Unidos")).toBeVisible()

    const { data } = await servicio
      .from("anunciantes")
      .select(
        "nit, digito_verificacion, pais_iso2, municipio_codigo, identificacion_extranjera, ciudad_extranjera"
      )
      .eq("id", idDeLaUrl(page, "anunciantes"))
      .single()
    expect(data).toEqual({
      nit: null,
      digito_verificacion: null,
      pais_iso2: "US",
      municipio_codigo: null,
      identificacion_extranjera: identificacion,
      ciudad_extranjera: "Miami",
    })
  })
})
