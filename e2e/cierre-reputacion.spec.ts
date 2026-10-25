import postgres from "postgres"

import { supabaseUrlDe } from "../scripts/bootstrap/produccion"
import { clienteComoSuperadmin } from "../scripts/bootstrap/provision-e2e"
import {
  type ClienteSupabase,
  crearClientePublico,
} from "../scripts/bootstrap/supabase"
import { esBaseLocal } from "../scripts/bootstrap/validacion-e2e"
import { URL_DB_LOCAL } from "../scripts/db/entorno-db"
import { formatearNumero } from "../src/lib/format"
import {
  type Credenciales,
  credenciales,
  entorno,
  escribirCodigoMfa,
  ingresar,
} from "./utilidades/cuentas"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { credencialesMedio, ingresarComoMedio } from "./utilidades/medios"
import { PROYECTO_CIERRE } from "./utilidades/proyectos"
import { esperarStreaming, expect, type Page, test } from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"

/**
 * Reputación del medio y confirmación de parámetros (MED-016, CFG-001; paquete
 * RP) contra `pnpm build && pnpm start`:
 *
 * - Solo lectura (escritorio, tablet y móvil), con la sesión del medio demo:
 *   «Tu reputación» de Inicio lleva a «Mi medio › Reputación», que muestra el
 *   cumplimiento, las publicaciones, el multiplicador y la calificación sin
 *   desbordar la pantalla.
 * - Proyecto «cierre»: el «Medio E2E» ve su reputación tal como la calcula la
 *   base (`mi_reputacion()` con su propia sesión): la tasa o «Sin historial
 *   suficiente» con «n de N negocios», y los negocios de la ventana.
 * - Proyecto «cierre» y solo la base LOCAL: el ADMIN E2E confirma un parámetro
 *   «Por validar», la insignia desaparece y la bitácora lo registra a su
 *   nombre (`actor_id`; `actor_email` va enmascarado). Al terminar se vuelve
 *   a marcar pendiente por la conexión directa de Postgres (la API no lo
 *   permite: `AMO_CONFIG_INVALIDA`); nunca corre contra develop ni producción.
 */

const RUTA = "/mi-medio/reputacion"
const RUTA_CONFIGURACION = "/administracion/configuracion"
const VENTANA_DIAS = 180

/** Plazo de las solicitudes de titulares: no interviene en ninguna otra prueba. */
const PARAMETRO = {
  clave: "privacidad.desistimiento_meses",
  titulo: "Desistimiento por falta de respuesta",
  seccion: "legal",
} as const

const plural = (cantidad: number, singular: string, varios: string) =>
  `${formatearNumero(cantidad)} ${cantidad === 1 ? singular : varios}`

function resumen(page: Page) {
  return page.getByRole("region", { name: "Resumen de tu reputación" })
}

function listaNegocios(page: Page) {
  return page.getByRole("list", {
    name: `Negocios de los últimos ${VENTANA_DIAS} días`,
  })
}

// ── Solo lectura ─────────────────────────────────────────────────────────────

test.describe("reputación del medio · solo lectura", () => {
  test.use({ storageState: sesion("medio") })

  test("se llega desde «Tu reputación» de Inicio y se lee sin desbordar", async ({
    page,
  }, info) => {
    test.skip(
      info.project.name === PROYECTO_CIERRE,
      "Solo lectura: la cubren escritorio, tablet y móvil."
    )
    await page.goto("/inicio")
    await page
      .getByRole("region", { name: "Tu reputación", exact: true })
      .getByRole("link", { name: "Ver tu reputación" })
      .click()
    await expect(page).toHaveURL((url) => url.pathname === RUTA)
    await esperarStreaming(page)

    await expect(
      page.getByRole("heading", { level: 1, name: "Reputación" })
    ).toBeVisible()
    const bloque = resumen(page)
    await expect(bloque).toBeVisible()
    await expect(bloque).toContainText(
      `Cumplimiento · últimos ${VENTANA_DIAS} días`
    )
    // Una tasa o, bajo el mínimo de negocios, «Sin historial suficiente».
    await expect(bloque).toContainText(/\d+\s?%|Sin historial suficiente/)
    await expect(bloque.getByRole("term")).toHaveText([
      "Publicaciones realizadas",
      "Multiplicador de calidad",
      "Calificación promedio",
    ])
    await expect(bloque).toContainText(
      "Llega con la calificación de los anunciantes"
    )
    await expect(
      page.getByRole("heading", {
        name: `Tus negocios de los últimos ${VENTANA_DIAS} días`,
      })
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })
})

// ── Medio E2E frente a la base ───────────────────────────────────────────────

interface ReputacionBd {
  tasa: number | null
  n: number
  cumplidas: number
  nMinimo: number
  publicacionesTotal: number
  publicaciones180d: number
}

/** `mi_reputacion()` con la sesión del propio medio (otra sesión que la del navegador). */
async function reputacionDeLaBase(cuenta: Credenciales): Promise<ReputacionBd> {
  const cliente = crearClientePublico(entorno)
  const ingreso = await cliente.auth.signInWithPassword(cuenta)
  if (ingreso.error) {
    throw new Error(
      `No se pudo ingresar como el medio: ${ingreso.error.message}`
    )
  }
  try {
    const { data, error } = await cliente.rpc("mi_reputacion")
    if (error) throw new Error(`mi_reputacion falló: ${error.message}`)
    const [fila] = data
    if (!fila) throw new Error("mi_reputacion no devolvió la fila del medio.")
    return {
      tasa: fila.tasa === null ? null : Number(fila.tasa),
      n: Number(fila.n),
      cumplidas: Number(fila.cumplidas),
      nMinimo: Number(fila.n_minimo),
      publicacionesTotal: Number(fila.publicaciones_total),
      publicaciones180d: Number(fila.publicaciones_180d),
    }
  } finally {
    // Solo esta sesión: `global` cerraría también la del navegador.
    await cliente.auth.signOut({ scope: "local" })
  }
}

test.describe("reputación del Medio E2E", () => {
  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeEach(({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_CIERRE,
      "Ingresa con el Medio E2E después de la pauta y las finanzas: corre solo en el proyecto «cierre»."
    )
  })

  test("ve su cumplimiento y sus negocios tal como los calcula la base", async ({
    page,
  }) => {
    const esperada = await reputacionDeLaBase(credencialesMedio())
    await ingresarComoMedio(page, { destino: RUTA })

    const bloque = resumen(page)
    if (esperada.tasa === null) {
      // MED-016: bajo el mínimo de negocios no hay tasa.
      await expect(bloque).toContainText("Sin historial suficiente")
      await expect(bloque).toContainText(
        esperada.n === 0
          ? `Aún no tienes negocios con fecha límite en los últimos ${VENTANA_DIAS} días.`
          : `${formatearNumero(esperada.n)} de ${plural(esperada.nMinimo, "negocio", "negocios")} en los últimos ${VENTANA_DIAS} días.`
      )
      await expect(bloque.getByRole("meter")).toHaveCount(0)
    } else {
      const porcentaje = Math.round(esperada.tasa * 100)
      await expect(
        bloque.getByRole("meter", { name: "Tasa de cumplimiento" })
      ).toHaveAttribute("aria-valuenow", String(porcentaje))
      await expect(bloque).toContainText(
        `${formatearNumero(esperada.cumplidas)} de ${plural(esperada.n, "negocio", "negocios")} cumplidos en los últimos ${VENTANA_DIAS} días.`
      )
    }
    await expect(bloque.getByRole("definition").first()).toHaveText(
      formatearNumero(esperada.publicacionesTotal)
    )
    await expect(bloque).toContainText(
      `${plural(esperada.publicaciones180d, "publicación", "publicaciones")} en los últimos ${VENTANA_DIAS} días`
    )

    // Los negocios de la ventana son los mismos que forman la tasa.
    if (esperada.n === 0) {
      await expect(listaNegocios(page)).toHaveCount(0)
    } else {
      await expect(listaNegocios(page)).toBeVisible()
      const restantes = page.getByRole("button", { name: /^Ver (el|los) / })
      if (await restantes.isVisible()) await restantes.click()
      await expect(listaNegocios(page).getByRole("listitem")).toHaveCount(
        esperada.n
      )
      await expect(
        listaNegocios(page).getByText(/^(Cumplido|No cumplido)$/)
      ).toHaveCount(esperada.n)
    }
    await esperarSinDesbordeHorizontal(page)
  })
})

// ── Confirmar un parámetro «Por validar» (CFG-001) ───────────────────────────

/**
 * Vuelve a marcar el parámetro como pendiente por la conexión directa de la
 * base LOCAL como `postgres` en modo carga (la API no deja volver a marcarlo).
 */
async function marcarPendiente(): Promise<void> {
  const sql = postgres(URL_DB_LOCAL, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    onnotice: () => {},
    connection: { application_name: "amo-e2e-cierre-reputacion" },
  })
  try {
    await sql.begin(async (tx) => {
      await tx`set local amo.modo_carga = 'on'`
      await tx`update public.configuracion set pendiente_validacion = true
                where clave = ${PARAMETRO.clave} and not pendiente_validacion`
    })
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function pendienteEnLaBase(servicio: ClienteSupabase): Promise<boolean> {
  const { data, error } = await servicio
    .from("configuracion")
    .select("pendiente_validacion")
    .eq("clave", PARAMETRO.clave)
    .single()
  if (error) throw new Error(`No se pudo leer el parámetro: ${error.message}`)
  return data.pendiente_validacion
}

test.describe("confirmar un parámetro pendiente de validación", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 })

  let servicio: ClienteSupabase

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_CIERRE,
      "Cambia un parámetro real: corre solo en el proyecto «cierre»."
    )
    info.skip(
      !esBaseLocal(supabaseUrlDe()),
      "Volver a marcarlo pendiente solo se puede en la base local (conexión directa de Postgres)."
    )
    servicio = await clienteComoSuperadmin(entorno)
    // Punto de partida conocido: el parámetro está «Por validar».
    await marcarPendiente()
  })

  // Red de seguridad: pase lo que pase, la base local queda como estaba.
  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_CIERRE) return
    if (!esBaseLocal(supabaseUrlDe())) return
    await marcarPendiente()
  })

  test("el administrador lo confirma, la insignia desaparece y queda en la bitácora", async ({
    page,
  }) => {
    const desde = new Date().toISOString()
    const admin = credenciales("ADMIN")
    await ingresar(page, admin)
    await escribirCodigoMfa(page)
    await expect(page).toHaveURL(/\/inicio$/)

    await page.goto(`${RUTA_CONFIGURACION}?seccion=${PARAMETRO.seccion}`)
    await esperarStreaming(page)
    const fila = page.getByRole("listitem").filter({
      has: page.getByRole("heading", { name: PARAMETRO.titulo, exact: true }),
    })
    await expect(fila.getByText("Por validar", { exact: true })).toBeVisible()

    await fila
      .getByRole("button", { name: `Confirmar valor de ${PARAMETRO.titulo}` })
      .click()
    const dialogo = page.getByRole("alertdialog", {
      name: `¿Confirmar el valor de «${PARAMETRO.titulo}»?`,
    })
    await expect(dialogo).toContainText("queda en la bitácora a tu nombre")
    await dialogo.getByRole("button", { name: "Confirmar valor" }).click()
    await expect(dialogo).toBeHidden()
    await expect(
      page.getByText(`${PARAMETRO.titulo} confirmado`, { exact: true })
    ).toBeVisible()

    // La insignia y el botón se van; el foco queda en «Editar» de la misma fila.
    await expect(fila.getByText("Por validar", { exact: true })).toHaveCount(0)
    await expect(
      fila.getByRole("button", { name: /^Confirmar valor/ })
    ).toHaveCount(0)
    await expect(
      fila.getByRole("button", {
        name: `Editar ${PARAMETRO.titulo}`,
        exact: true,
      })
    ).toBeFocused()

    // En la base: sin la marca y con el cambio a nombre del administrador. El
    // actor se compara por `actor_id`: `actor_email` guarda una copia
    // enmascarada del correo (`e***@amo.test`).
    expect(await pendienteEnLaBase(servicio)).toBe(false)
    const { data: perfil, error: errorPerfil } = await servicio
      .from("perfiles")
      .select("id")
      .eq("email", admin.email)
      .single()
    if (errorPerfil) {
      throw new Error(
        `No se encontró la cuenta ${admin.email}: ejecuta \`pnpm bootstrap:e2e\`. ${errorPerfil.message}`
      )
    }
    const { data: rastro, error } = await servicio
      .from("bitacora")
      .select("actor_id, cambios")
      .eq("entidad", "configuracion")
      .eq("entidad_id", PARAMETRO.clave)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(1)
    if (error) throw new Error(`No se pudo leer la bitácora: ${error.message}`)
    expect(rastro[0]?.actor_id).toBe(perfil.id)
    expect(JSON.stringify(rastro[0]?.cambios)).toContain("pendiente_validacion")

    // Sobrevive a una recarga: salió de la base de datos.
    await page.reload()
    await esperarStreaming(page)
    await expect(
      fila.getByRole("button", {
        name: `Editar ${PARAMETRO.titulo}`,
        exact: true,
      })
    ).toBeVisible()
    await expect(fila.getByText("Por validar", { exact: true })).toHaveCount(0)
  })
})
