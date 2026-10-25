import { generarContrasena } from "../scripts/bootstrap/contrasena"
import {
  clienteComoSuperadmin,
  type CuentaE2E,
  emailDe,
  MEDIO_E2E_ID,
  prepararCuenta,
} from "../scripts/bootstrap/provision-e2e"
import {
  type ClienteSupabase,
  crearClientePublico,
} from "../scripts/bootstrap/supabase"
import {
  AGENTE_ACEPTACION_E2E,
  aceptarTerminosVigentes,
  huellaCorreo,
} from "../scripts/bootstrap/terminos-e2e"
import { infracciones } from "./utilidades/axe"
import { type Credenciales, entorno, ingresar } from "./utilidades/cuentas"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { expect, type Page, test } from "./utilidades/prueba"
import { PROYECTO_CON_CUENTAS } from "./utilidades/proyectos"

/**
 * Compuerta de términos (AUT-012) contra `pnpm build && pnpm start` y el
 * Supabase real, a 390 px (el medio acepta desde el celular).
 *
 * Una versión publicada es inmutable y aplica a TODOS los medios: la suite
 * publica la suya con la vigencia unos segundos en el futuro y, antes de que
 * entre en vigor, la acepta por las demás cuentas de rol MEDIO (las E2E, la
 * demo de las sesiones compartidas y las de los datos demo). Así ninguna otra
 * suite que corra en paralelo se topa con la compuerta; solo la cuenta
 * EXCLUSIVA de esta suite la tiene pendiente. Cada corrida deja una versión de
 * prueba más de los términos para medios (fuera de producción, como toda la
 * suite).
 */

const CUENTA: CuentaE2E = {
  clave: "TERMINOS",
  rol: "MEDIO",
  medioId: MEDIO_E2E_ID,
  nombre: "Términos E2E",
  emailPorDefecto: "e2e.terminos@amo.test",
  variableEmail: "E2E_TERMINOS_EMAIL",
  variablePassword: "E2E_TERMINOS_PASSWORD",
  debeCambiarPassword: false,
  conTotp: false,
}

const TITULO = "Términos para medios"
const CASILLA = "He leído y acepto los términos para medios."
const DESTINO = "/notificaciones"

/** Tiempo para aceptar por las demás cuentas antes de que la versión rija. */
const MARGEN_VIGENCIA_MS = 10_000
/** Filas por consulta o inserción (PostgREST limita las respuestas a 1.000). */
const LOTE = 500

const CLAUSULA = "Cláusula de prueba de la suite E2E."
const TEXTO_VERSION = [
  "# Términos para medios (prueba E2E)",
  "Texto de prueba publicado por la suite E2E de AMO: no es un documento real.",
  ...Array.from(
    { length: 6 },
    (_, i) =>
      `## ${i + 1}. Sección de prueba\n\n${CLAUSULA} Su extensión obliga a desplazarse para leer el documento completo en la pantalla del celular.`
  ),
].join("\n\n")

function falla(accion: string, error: { message: string } | null): never {
  throw new Error(`No se pudo ${accion}: ${error?.message ?? "sin detalle"}`)
}

/** Publica la versión con la vigencia en el futuro; devuelve su id. */
async function publicarVersion(
  servicio: ClienteSupabase,
  version: string
): Promise<string> {
  const { data, error } = await servicio
    .from("terminos_versiones")
    .insert({
      tipo: "TERMINOS_MEDIO",
      version,
      contenido_md: TEXTO_VERSION,
      publicada: true,
      vigente_desde: new Date(Date.now() + MARGEN_VIGENCIA_MS).toISOString(),
    })
    .select("id")
    .single()
  if (error) falla("publicar la versión de prueba", error)
  return data.id
}

async function perfilesDeMedio(
  servicio: ClienteSupabase
): Promise<{ id: string; email: string }[]> {
  // También los roles personalizados de tipo MEDIO.
  const roles = await servicio.from("roles").select("id").eq("tipo", "MEDIO")
  if (roles.error) falla("leer los roles de medio", roles.error)
  const rolesMedio = roles.data.map(({ id }) => id)
  const perfiles: { id: string; email: string }[] = []
  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await servicio
      .from("perfiles")
      .select("id, email")
      .in("rol_id", rolesMedio)
      .order("id")
      .range(desde, desde + LOTE - 1)
    if (error) falla("leer los perfiles de medio", error)
    perfiles.push(...data)
    if (data.length < LOTE) return perfiles
  }
}

/** Acepta la versión por todas las cuentas de medio menos la de esta suite. */
async function aceptarPorLasDemas(
  servicio: ClienteSupabase,
  versionId: string,
  excepto: string
): Promise<void> {
  const filas = (await perfilesDeMedio(servicio))
    .filter(({ id }) => id !== excepto)
    .map(({ id, email }) => ({
      perfil_id: id,
      termino_version_id: versionId,
      email_sha256: huellaCorreo(email),
      user_agent: AGENTE_ACEPTACION_E2E,
    }))
  for (let desde = 0; desde < filas.length; desde += LOTE) {
    const { error } = await servicio
      .from("aceptaciones_terminos")
      .upsert(filas.slice(desde, desde + LOTE), {
        onConflict: "perfil_id,termino_version_id",
        ignoreDuplicates: true,
      })
    if (error) falla("aceptar por las demás cuentas de medio", error)
  }
}

/**
 * Espera a que la versión rija para la cuenta de la suite, preguntando a la BD
 * con su propia sesión lo mismo que consulta la compuerta del DAL.
 */
async function esperarPendiente(
  credenciales: Credenciales,
  versionId: string
): Promise<void> {
  const cliente = crearClientePublico(entorno)
  const ingreso = await cliente.auth.signInWithPassword(credenciales)
  if (ingreso.error) falla("ingresar con la cuenta de la suite", ingreso.error)
  try {
    await expect
      .poll(
        async () => {
          const { data, error } = await cliente.rpc("terminos_pendientes")
          if (error) falla("consultar los términos pendientes", error)
          return data.map(({ id }) => id)
        },
        {
          message: "La versión de prueba no entró en vigencia",
          timeout: MARGEN_VIGENCIA_MS + 20_000,
        }
      )
      .toContain(versionId)
  } finally {
    // Solo esta sesión: `global` cerraría también la del navegador.
    await cliente.auth.signOut({ scope: "local" })
  }
}

async function aceptacionesDe(
  servicio: ClienteSupabase,
  usuarioId: string,
  versionId: string
): Promise<{ aceptada_at: string }[]> {
  const { data, error } = await servicio
    .from("aceptaciones_terminos")
    .select("aceptada_at")
    .eq("perfil_id", usuarioId)
    .eq("termino_version_id", versionId)
  if (error) falla("leer las aceptaciones", error)
  return data
}

/** ¿La cuenta ya había aceptado alguna versión anterior de los términos para medios? */
async function aceptoVersionAnterior(
  servicio: ClienteSupabase,
  usuarioId: string
): Promise<boolean> {
  const { data, error } = await servicio
    .from("aceptaciones_terminos")
    .select("version:terminos_versiones ( tipo )")
    .eq("perfil_id", usuarioId)
  if (error) falla("leer las aceptaciones anteriores", error)
  return data.some(({ version }) => version.tipo === "TERMINOS_MEDIO")
}

const documento = (page: Page) =>
  page.getByRole("region", { name: TITULO, exact: true })

async function esperarCompuerta(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/aceptar-terminos(?:\?|$)/)
  await expect(documento(page)).toBeVisible()
}

test.describe("términos y política de datos (AUT-012)", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 })
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    // Sin animaciones de entrada: axe daría un contraste falso a medio aparecer.
    contextOptions: { reducedMotion: "reduce" },
  })

  let servicio: ClienteSupabase
  let usuarioId: string
  let versionId: string
  let titulo: string
  let esActualizacion: boolean
  const version = `e2e-${Date.now().toString(36)}`
  const cuenta: Credenciales = { email: emailDe(CUENTA), password: "" }

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_CON_CUENTAS,
      "Publica términos y usa una cuenta exclusiva: corre solo en el proyecto de escritorio."
    )
    // Las versiones publicadas son inmutables: en develop dejaría como vigente
    // un texto de prueba (incluso sobre los términos reales del cliente).
    info.skip(
      !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(entorno.url),
      "Publica términos que no se pueden borrar: solo en la pila local."
    )
    info.setTimeout(90_000)
    servicio = await clienteComoSuperadmin(entorno)
    cuenta.password = generarContrasena()
    usuarioId = await prepararCuenta(servicio, CUENTA, cuenta.password)
    // Solo la versión de esta corrida queda pendiente.
    await aceptarTerminosVigentes(servicio, {
      id: usuarioId,
      email: cuenta.email,
      tipoRol: "MEDIO",
    })
    esActualizacion = await aceptoVersionAnterior(servicio, usuarioId)
    titulo = esActualizacion
      ? "Actualizamos los términos"
      : "Revisa y acepta los términos"

    versionId = await publicarVersion(servicio, version)
    await aceptarPorLasDemas(servicio, versionId, usuarioId)
    await esperarPendiente(cuenta, versionId)
  })

  test("retiene al medio en la compuerta y permite salir sin aceptar", async ({
    page,
  }) => {
    await ingresar(page, cuenta)
    await esperarCompuerta(page)
    await expect(
      page.getByRole("heading", { level: 1, name: titulo })
    ).toBeVisible()

    const terminos = documento(page)
    await expect(
      terminos.getByText(new RegExp(`^Versión ${version} · vigente desde el `))
    ).toBeVisible()
    await expect(
      terminos.getByText("Versión nueva", { exact: true })
    ).toHaveCount(esActualizacion ? 1 : 0)
    await expect(
      terminos.getByRole("region", { name: `Texto de ${TITULO}` })
    ).toContainText(CLAUSULA)
    await expect(page.getByRole("checkbox")).toHaveCount(1)
    await expect(
      page.getByRole("checkbox", { name: CASILLA })
    ).not.toBeChecked()
    await esperarSinDesbordeHorizontal(page)

    expect(await infracciones(page), "/aceptar-terminos").toEqual([])

    // Ninguna sección se abre sin aceptar: el DAL vuelve a la compuerta.
    await page.goto(DESTINO)
    await esperarCompuerta(page)

    await page.getByRole("button", { name: "Salir sin aceptar" }).click()
    await expect(page).toHaveURL(/\/ingresar\?motivo=sesion-cerrada$/)
    expect(await aceptacionesDe(servicio, usuarioId, versionId)).toEqual([])
  })

  test("acepta desde la lectura completa y continúa al destino", async ({
    page,
  }) => {
    await ingresar(page, cuenta)
    await esperarCompuerta(page)
    await page.goto(`/aceptar-terminos?next=${encodeURIComponent(DESTINO)}`)
    await esperarCompuerta(page)

    // Sin marcar la casilla no se registra nada: el foco va a la casilla.
    await page.getByRole("button", { name: "Aceptar y continuar" }).click()
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Te falta aceptar 1 documento para continuar." })
    ).toBeVisible()
    const casilla = page.getByRole("checkbox", { name: CASILLA })
    await expect(casilla).toBeFocused()
    await expect(casilla).toHaveAttribute("aria-invalid", "true")

    await documento(page)
      .getByRole("button", { name: "Leer en pantalla completa" })
      .click()
    const hoja = page.getByRole("dialog", { name: TITULO })
    await expect(
      hoja.getByRole("region", { name: `Texto de ${TITULO}` })
    ).toContainText(CLAUSULA)
    await hoja.getByRole("button", { name: "Acepto los términos" }).click()
    await expect(hoja).toBeHidden()
    await expect(casilla).toBeChecked()

    await page.getByRole("button", { name: "Aceptar y continuar" }).click()
    await expect(page).toHaveURL(new RegExp(`${DESTINO}$`))
    await expect(
      page.getByRole("heading", { level: 1, name: "Notificaciones" })
    ).toBeVisible()
    expect(await aceptacionesDe(servicio, usuarioId, versionId)).toHaveLength(1)

    // Con todo aceptado, la compuerta ya no retiene: lleva a Inicio.
    await page.goto("/aceptar-terminos")
    await expect(page).toHaveURL(/\/inicio$/)
  })
})
