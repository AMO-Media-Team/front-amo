import type { ClienteSupabase } from "../scripts/bootstrap/supabase"
import { type Credenciales, ingresar } from "./utilidades/cuentas"
import { clienteDeLectura } from "./utilidades/datos-demo"
import { PROYECTO_CIERRE } from "./utilidades/proyectos"
import {
  type AbrirContexto,
  expect,
  type Locator,
  type Page,
  test,
} from "./utilidades/prueba"
import { credencialesDemo } from "./utilidades/sesiones"

/**
 * Aviso en vivo (NOT-007; paquete NC) contra `pnpm build && pnpm start` y la
 * pila local CON Realtime:
 *
 * Dos personas con la plataforma abierta, cada una en su navegador: A (el medio
 * demo) y B (el anunciante demo). Una fábrica crea un aviso para A (inserción
 * con la clave de servicio: el trigger `trg_notificaciones_z_realtime` emite el
 * broadcast privado `usuario:{id}`). El contador de A sube en 5 s o menos (el
 * sondeo de respaldo es de 60 s, así que solo el canal lo logra) y el de B no
 * cambia aunque su canal también está abierto. Un aviso urgente (prioridad 2)
 * además se anuncia en la región viva de la campana. Al terminar se borran los
 * avisos creados.
 *
 * Escribe: solo en el proyecto «cierre». Cada persona ingresa de nuevo (sin
 * TOTP no cierra otras sesiones) para no depender de que las sesiones guardadas
 * sigan vigentes al final de la corrida.
 */

const MARCA = Date.now().toString(36)
const LIMITE_NOT_007_MS = 5_000
const NOMBRE_CAMPANA = /^Notificaciones(?:, (\d+) sin leer)?$/

/** La campana de la barra superior (`data-en-vivo`: estado del canal). */
function campana(page: Page): Locator {
  return page.locator("button[data-en-vivo]")
}

async function noLeidasEnPantalla(page: Page): Promise<number> {
  const nombre = (await campana(page).getAttribute("aria-label")) ?? ""
  const coincidencia = NOMBRE_CAMPANA.exec(nombre)
  if (!coincidencia) {
    throw new Error(`Nombre inesperado de la campana: «${nombre}».`)
  }
  return Number(coincidencia[1] ?? 0)
}

async function perfilDe(
  servicio: ClienteSupabase,
  { email }: Credenciales
): Promise<string> {
  const { data, error } = await servicio
    .from("perfiles")
    .select("id")
    .eq("email", email)
    .single()
  if (error) {
    throw new Error(
      `No se encontró la cuenta demo: ejecuta \`pnpm demo:generar\`. ${error.message}`
    )
  }
  return data.id
}

async function noLeidasEnBase(
  servicio: ClienteSupabase,
  usuarioId: string
): Promise<number> {
  const { count, error } = await servicio
    .from("notificaciones")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuarioId)
    .eq("leida", false)
  if (error) throw new Error(`No se pudo contar: ${error.message}`)
  return count ?? 0
}

interface AvisoNuevo {
  tipo: string
  titulo: string
  prioridad: number
}

async function crearAviso(
  servicio: ClienteSupabase,
  usuarioId: string,
  aviso: AvisoNuevo
): Promise<number> {
  const { data, error } = await servicio
    .from("notificaciones")
    .insert({
      usuario_id: usuarioId,
      tipo: aviso.tipo,
      titulo: aviso.titulo,
      mensaje: "Aviso de la prueba del aviso en vivo.",
      url: null,
      prioridad: aviso.prioridad,
      leida: false,
    })
    .select("id")
    .single()
  if (error) throw new Error(`No se pudo crear el aviso: ${error.message}`)
  return data.id
}

/** Ingresa en un navegador aparte y deja la campana con el canal suscrito. */
async function abrirPersona(
  abrirContexto: AbrirContexto,
  credenciales: Credenciales
): Promise<Page> {
  const contexto = await abrirContexto()
  const page = await contexto.newPage()
  await ingresar(page, credenciales)
  await expect(page).toHaveURL(/\/inicio$/)
  await page.goto("/cuenta/preferencias")
  await expect(
    page.getByRole("region", { name: "Avisos por correo" })
  ).toBeVisible()
  await expect(campana(page)).toHaveAttribute("data-en-vivo", "true", {
    timeout: 15_000,
  })
  return page
}

test.describe("aviso en vivo (NOT-007)", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 })

  let servicio: ClienteSupabase
  const creados: number[] = []

  test.beforeAll(({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_CIERRE,
      "Crea avisos reales: corre solo en el proyecto «cierre»."
    )
    servicio = clienteDeLectura()
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_CIERRE || creados.length === 0) return
    const { error } = await servicio
      .from("notificaciones")
      .delete()
      .in("id", creados)
    if (error) throw new Error(`No se borraron los avisos: ${error.message}`)
  })

  test("el contador de A sube en 5 s o menos y el de B no cambia", async ({
    abrirContexto,
  }) => {
    const credencialesA = credencialesDemo("MEDIO")
    const credencialesB = credencialesDemo("ANUNCIANTE")
    const [idA, idB] = await Promise.all([
      perfilDe(servicio, credencialesA),
      perfilDe(servicio, credencialesB),
    ])
    const a = await abrirPersona(abrirContexto, credencialesA)
    const b = await abrirPersona(abrirContexto, credencialesB)

    const antesB = await noLeidasEnPantalla(b)
    expect(antesB).toBe(await noLeidasEnBase(servicio, idB))

    // 1. Un aviso normal para A: solo cambia el contador.
    creados.push(
      await crearAviso(servicio, idA, {
        tipo: "oferta.nueva_elegible",
        titulo: `Aviso en vivo E2E ${MARCA}`,
        prioridad: 0,
      })
    )
    const esperadoA = await noLeidasEnBase(servicio, idA)
    await expect
      .poll(() => noLeidasEnPantalla(a), { timeout: LIMITE_NOT_007_MS })
      .toBe(esperadoA)

    // B tenía el canal abierto y no recibió nada: ni el contador ni la lista.
    await b.waitForTimeout(1_500)
    await expect(campana(b)).toHaveAttribute("data-en-vivo", "true")
    expect(await noLeidasEnPantalla(b)).toBe(antesB)
    await campana(b).click()
    const panelB = b.getByRole("dialog")
    await expect(panelB).toBeVisible()
    await expect(panelB.getByText(`Aviso en vivo E2E ${MARCA}`)).toHaveCount(0)
    await b.keyboard.press("Escape")

    // 2. Un aviso urgente para A: además se anuncia a los lectores de pantalla.
    creados.push(
      await crearAviso(servicio, idA, {
        tipo: "seguridad.alerta_pais_inusual",
        titulo: `Aviso urgente E2E ${MARCA}`,
        prioridad: 2,
      })
    )
    const urgenteA = await noLeidasEnBase(servicio, idA)
    await expect
      .poll(() => noLeidasEnPantalla(a), { timeout: LIMITE_NOT_007_MS })
      .toBe(urgenteA)
    await expect(
      a.locator('[aria-live="polite"]', {
        hasText: `Nuevo aviso urgente: Seguridad. Tienes ${urgenteA} sin leer.`,
      })
    ).toHaveCount(1)

    // La lista del panel de A ya trae el aviso (se lee con la sesión, bajo RLS).
    await campana(a).click()
    await expect(
      a.getByRole("dialog").getByText(`Aviso urgente E2E ${MARCA}`)
    ).toBeVisible()
    expect(await noLeidasEnPantalla(b)).toBe(antesB)
  })
})
