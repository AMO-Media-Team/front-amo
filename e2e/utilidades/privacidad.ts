/**
 * Fábrica de titulares DESECHABLES para las pruebas de los derechos del
 * titular (CTA-007): un medio recién registrado y su cuenta MEDIO, creados
 * con la API de administración, que la prueba puede suprimir sin tocar las
 * cuentas compartidas. Solo en la base local o en develop: la guarda de
 * producción (`exigirFueraDeProduccion`, también en `clienteComoSuperadmin`)
 * se niega antes de escribir.
 *
 * Los nombres y correos llevan prefijos propios (`e2e.privacidad.`, «Medio
 * Privacidad E2E») y las solicitudes una marca en la descripción: así
 * `borrarTitularesDesechables` limpia antes y después de la suite, aunque una
 * corrida anterior se haya cortado.
 */
import { createHash } from "node:crypto"

import { municipioActivo } from "../../scripts/bootstrap/aprovisionar-medios"
import { generarContrasena } from "../../scripts/bootstrap/contrasena"
import { credencialesInternasDe } from "../../scripts/bootstrap/fabricas-finanzas"
import { exigirFueraDeProduccion } from "../../scripts/bootstrap/produccion"
import { clienteComoSuperadmin } from "../../scripts/bootstrap/provision-e2e"
import {
  activarPerfil,
  actualizarPerfil,
  type ClienteSupabase,
  idDeRol,
} from "../../scripts/bootstrap/supabase"
import { aceptarTerminosVigentes } from "../../scripts/bootstrap/terminos-e2e"
import { type Credenciales, entorno } from "./cuentas"
import { codigoNuevo, type CookiesSesion } from "./mfa"
import { sufijoCorrida } from "./organizaciones"
import { esperarStreaming, expect, type Page } from "./prueba"

/** Inicio del correo de las cuentas desechables (dominio reservado `@amo.test`). */
export const PREFIJO_CORREO_PRIVACIDAD = "e2e.privacidad."

/** Inicio del nombre de los medios desechables. */
export const PREFIJO_MEDIO_PRIVACIDAD = "Medio Privacidad E2E"

/** Marca de las solicitudes que radica la prueba (va en la descripción). */
export const MARCA_SOLICITUD_E2E = "[E2E privacidad]"

export interface TitularDesechable extends Credenciales {
  usuarioId: string
  medioId: string
  nombre: string
  medio: string
}

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`)
}

async function servicio(): Promise<ClienteSupabase> {
  exigirFueraDeProduccion(entorno.url, "La fábrica de titulares desechables")
  return clienteComoSuperadmin(entorno)
}

/**
 * Crea un medio sin historial (nombre, tipo y municipio) y su cuenta MEDIO
 * activa, con los términos vigentes aceptados y sin cambio de contraseña
 * pendiente: entra directo a la plataforma.
 */
export async function crearMedioDesechable(): Promise<TitularDesechable> {
  const cliente = await servicio()
  const sufijo = sufijoCorrida()
  const medio = `${PREFIJO_MEDIO_PRIVACIDAD} ${sufijo}`
  const nombre = `Titular Privacidad ${sufijo}`
  const email = `${PREFIJO_CORREO_PRIVACIDAD}${sufijo}@amo.test`
  const password = generarContrasena()

  const { data: filaMedio, error: errorMedio } = await cliente
    .from("medios")
    .insert({
      nombre: medio,
      tipo: "CREADOR",
      municipio_codigo: await municipioActivo(cliente, "05001"),
      es_demo: true,
    })
    .select("id")
    .single()
  if (errorMedio) fallo("No se pudo registrar el medio desechable", errorMedio)

  const { data: creado, error: errorUsuario } =
    await cliente.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { rol: "MEDIO" },
    })
  if (errorUsuario) fallo("No se pudo crear la cuenta desechable", errorUsuario)
  const usuarioId = creado.user.id

  await actualizarPerfil(cliente, usuarioId, {
    nombre,
    rol_id: await idDeRol(cliente, "MEDIO"),
    medio_id: filaMedio.id,
    anunciante_id: null,
    debe_cambiar_password: false,
    es_demo: true,
  })
  await activarPerfil(cliente, usuarioId)
  await aceptarTerminosVigentes(cliente, {
    id: usuarioId,
    email,
    tipoRol: "MEDIO",
  })
  return { usuarioId, medioId: filaMedio.id, nombre, medio, email, password }
}

/**
 * Borra lo que dejaron las corridas: las cuentas desechables (si la prueba no
 * las suprimió), sus medios y las solicitudes marcadas. La bitácora es de
 * solo inserción y se queda.
 */
export async function borrarTitularesDesechables(): Promise<void> {
  const cliente = await servicio()
  const { data: personas, error } = await cliente
    .from("perfiles")
    .select("id")
    .like("email", `${PREFIJO_CORREO_PRIVACIDAD}%`)
  if (error) fallo("No se pudieron listar las cuentas desechables", error)
  for (const { id } of personas) {
    const { error: errorBorrado } = await cliente.auth.admin.deleteUser(id)
    if (errorBorrado)
      fallo("No se pudo borrar una cuenta desechable", errorBorrado)
  }

  const { error: errorSolicitudes } = await cliente
    .from("solicitudes_titular")
    .delete()
    .like("descripcion", `%${MARCA_SOLICITUD_E2E}%`)
  if (errorSolicitudes) {
    fallo("No se pudieron borrar las solicitudes de prueba", errorSolicitudes)
  }

  const { data: medios, error: errorMedios } = await cliente
    .from("medios")
    .select("id")
    .like("nombre", `${PREFIJO_MEDIO_PRIVACIDAD}%`)
  if (errorMedios)
    fallo("No se pudieron listar los medios desechables", errorMedios)
  for (const { id } of medios) {
    const { error: errorCuentas } = await cliente
      .from("cuentas_sociales")
      .delete()
      .eq("medio_id", id)
    if (errorCuentas)
      fallo("No se pudieron borrar las cuentas sociales", errorCuentas)
    const { error: errorMedio } = await cliente
      .from("medios")
      .delete()
      .eq("id", id)
    if (errorMedio) fallo("No se pudo borrar un medio desechable", errorMedio)
  }
}

// ── Lecturas para las comprobaciones ─────────────────────────────────────────

export interface SolicitudLeida {
  id: string
  numero: number
  estado: string
  perfilId: string | null
  recibidaAt: string
  plazoVence: string
  emailSha256: string
  supresionEjecutadaAt: string | null
}

/** La solicitud con ese radicado (como servicio). */
export async function leerSolicitudPorNumero(
  numero: number
): Promise<SolicitudLeida> {
  const cliente = await servicio()
  const { data, error } = await cliente
    .from("solicitudes_titular")
    .select(
      "id, numero, estado, perfil_id, recibida_at, plazo_vence, email_sha256, supresion_ejecutada_at"
    )
    .eq("numero", numero)
    .single()
  if (error) fallo(`No se encontró la solicitud N.º ${numero}`, error)
  return {
    id: data.id,
    numero: data.numero,
    estado: data.estado,
    perfilId: data.perfil_id,
    recibidaAt: data.recibida_at,
    plazoVence: data.plazo_vence,
    emailSha256: data.email_sha256,
    supresionEjecutadaAt: data.supresion_ejecutada_at,
  }
}

/** Cuántos avisos de la cola «Solicitud de un titular» recibió el equipo por esa solicitud. */
export async function avisosAlEquipo(solicitudId: string): Promise<number> {
  const cliente = await servicio()
  const { count, error } = await cliente
    .from("notificaciones")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "cola.solicitud_titular")
    .eq("entidad", "solicitudes_titular")
    .eq("entidad_id", solicitudId)
  if (error) fallo("No se pudieron contar los avisos al equipo", error)
  return count ?? 0
}

/** ¿Sigue existiendo el perfil? (la supresión borra la cuenta). */
export async function existePerfil(usuarioId: string): Promise<boolean> {
  const cliente = await servicio()
  const { data, error } = await cliente
    .from("perfiles")
    .select("id")
    .eq("id", usuarioId)
    .maybeSingle()
  if (error) fallo("No se pudo leer el perfil", error)
  return data !== null
}

/** Huella del correo como la guarda `solicitudes_titular.email_sha256`. */
export function huellaCorreo(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex")
}

// ── El equipo: administración (rol ADMIN, con TOTP) ──────────────────────────

let sesionAdministracion: CookiesSesion | null = null

function rutaDe(destino: string): string {
  return new URL(destino, "http://amo.local").pathname
}

/**
 * Entra como el ADMIN E2E (contraseña y TOTP; tiene `privacidad.gestionar`)
 * y espera llegar a `destino`. Reutiliza la sesión del proceso mientras siga
 * viva: cada ingreso con TOTP exige un código de un periodo nuevo.
 */
export async function ingresarComoAdministracion(
  page: Page,
  { destino = "/inicio" }: { destino?: string } = {}
): Promise<void> {
  const ruta = rutaDe(destino)
  if (sesionAdministracion) {
    await page.context().addCookies(sesionAdministracion)
    await page.goto(destino)
    if (new URL(page.url()).pathname === ruta) {
      sesionAdministracion = await page.context().cookies()
      return
    }
    sesionAdministracion = null
    await page.context().clearCookies()
  }
  const { email, password, secreto } = credencialesInternasDe("ADMIN")
  await page.goto(
    destino === "/inicio"
      ? "/ingresar"
      : `/ingresar?${new URLSearchParams({ next: destino })}`
  )
  await page.getByLabel("Correo electrónico").fill(email)
  await page.getByLabel("Contraseña", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Ingresar" }).click()
  await expect(page).toHaveURL(/\/mfa\/verificar/)
  // Al completar los 6 dígitos el formulario se envía solo.
  await page
    .getByLabel("Código de verificación")
    .fill(await codigoNuevo(secreto))
  await expect(page).toHaveURL((url) => url.pathname === ruta)
  await esperarStreaming(page)
  sesionAdministracion = await page.context().cookies()
}
