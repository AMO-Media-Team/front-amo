/**
 * Anunciantes de las pruebas E2E y sus cuentas (las prepara `pnpm
 * bootstrap:e2e`, `scripts/bootstrap/anunciantes-e2e.ts`):
 *
 * - «Anunciante E2E» (`E2E_ANUNCIANTE_*`): VERIFICADO, con el RUT y la Cámara
 *   de Comercio aprobados y vigentes. Es la empresa de las campañas y ofertas
 *   de las fábricas (`negocio.ts`).
 * - «Anunciante Nuevo E2E» (`E2E_ANUNCIANTE_NUEVO_*`): PENDIENTE recién
 *   registrado en Colombia, con NIT válido y sin documentos ni campañas.
 *
 * Sus ids son fijos. Las cuentas son de rol ANUNCIANTE, sin verificación en
 * dos pasos y con los términos vigentes aceptados: cada prueba puede ingresar
 * con la suya sin cerrar la sesión de otra. Un spec que cambia la empresa
 * nueva la devuelve a su estado con `restablecerAnuncianteNuevoE2E` (en su
 * `beforeAll`); uno que suspende o rechaza la verificada, con
 * `restablecerAnuncianteVerificadoE2E` (en su `afterAll`).
 */
import {
  ANUNCIANTE_E2E as DATOS_ANUNCIANTE_E2E,
  ANUNCIANTE_NUEVO_E2E as DATOS_ANUNCIANTE_NUEVO_E2E,
  type AccionAnuncianteNuevo,
  type EstadoAnunciante,
} from "../../scripts/bootstrap/anunciantes-e2e"
import {
  completarAnuncianteVerificado,
  prepararAnuncianteEnVerificacion as prepararEnVerificacion,
  restablecerAnuncianteNuevo,
} from "../../scripts/bootstrap/aprovisionar-anunciantes"
import { clienteComoSuperadmin } from "../../scripts/bootstrap/provision-e2e"
import { crearClienteServicio } from "../../scripts/bootstrap/supabase"
import { type Credenciales, credenciales, entorno } from "./cuentas"
import { expect, type Page } from "./prueba"

export type CuentaAnunciante = "ANUNCIANTE" | "ANUNCIANTE_NUEVO"

export interface AnuncianteDePrueba {
  id: string
  /** Nombre comercial: como lo muestran la app y las colas. */
  nombre: string
  razonSocial: string
  nit: string
  digitoVerificacion: string
  /** Cuenta E2E de la persona de la empresa. */
  cuenta: CuentaAnunciante
}

/** «Anunciante E2E» (VERIFICADO). */
export const ANUNCIANTE_E2E = {
  id: DATOS_ANUNCIANTE_E2E.id,
  nombre: DATOS_ANUNCIANTE_E2E.nombreComercial,
  razonSocial: DATOS_ANUNCIANTE_E2E.razonSocial,
  nit: DATOS_ANUNCIANTE_E2E.nit,
  digitoVerificacion: DATOS_ANUNCIANTE_E2E.digitoVerificacion,
  cuenta: "ANUNCIANTE",
} as const satisfies AnuncianteDePrueba

/** «Anunciante Nuevo E2E» (PENDIENTE, sin documentos). */
export const ANUNCIANTE_NUEVO_E2E = {
  id: DATOS_ANUNCIANTE_NUEVO_E2E.id,
  nombre: DATOS_ANUNCIANTE_NUEVO_E2E.nombreComercial,
  razonSocial: DATOS_ANUNCIANTE_NUEVO_E2E.razonSocial,
  nit: DATOS_ANUNCIANTE_NUEVO_E2E.nit,
  digitoVerificacion: DATOS_ANUNCIANTE_NUEVO_E2E.digitoVerificacion,
  cuenta: "ANUNCIANTE_NUEVO",
} as const satisfies AnuncianteDePrueba

export function anuncianteDe(cuenta: CuentaAnunciante): AnuncianteDePrueba {
  return cuenta === "ANUNCIANTE" ? ANUNCIANTE_E2E : ANUNCIANTE_NUEVO_E2E
}

export function credencialesAnunciante(
  cuenta: CuentaAnunciante = "ANUNCIANTE"
): Credenciales {
  return credenciales(cuenta)
}

/** Ficha de la empresa en Operación (equipo AMO). */
export function rutaFichaAnunciante(
  anunciante: Pick<AnuncianteDePrueba, "id">,
  pestana?: string
): string {
  const ruta = `/operacion/anunciantes/${anunciante.id}`
  return pestana ? `${ruta}?${new URLSearchParams({ pestana })}` : ruta
}

/**
 * Ingresa con la cuenta de la empresa y espera llegar a `destino` (Inicio por
 * omisión). Con otro destino entra por `/ingresar?next=…`, como un enlace
 * profundo: el ingreso lleva allí tras pasar las compuertas.
 */
export async function ingresarComoAnunciante(
  page: Page,
  {
    cuenta = "ANUNCIANTE",
    destino = "/inicio",
  }: { cuenta?: CuentaAnunciante; destino?: string } = {}
): Promise<void> {
  const { email, password } = credencialesAnunciante(cuenta)
  await page.goto(
    destino === "/inicio"
      ? "/ingresar"
      : `/ingresar?${new URLSearchParams({ next: destino })}`
  )
  await page.getByLabel("Correo electrónico").fill(email)
  await page.getByLabel("Contraseña", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Ingresar" }).click()
  const esperada = new URL(destino, "http://amo.local").pathname
  await expect(page).toHaveURL((url) => url.pathname === esperada)
}

/** Perfil (id) y contraseña de la cuenta de la empresa, para las fábricas. */
export async function usuarioAnunciante(
  cuenta: CuentaAnunciante = "ANUNCIANTE"
): Promise<{ id: string; email: string; password: string }> {
  const { email, password } = credencialesAnunciante(cuenta)
  const { data, error } = await crearClienteServicio(entorno)
    .from("perfiles")
    .select("id")
    .eq("email", email)
    .single()
  if (error) {
    throw new Error(
      `No se encontró la cuenta ${email}: ejecuta \`pnpm bootstrap:e2e\`. ${error.message}`
    )
  }
  return { id: data.id, email, password }
}

/**
 * Devuelve el «Anunciante Nuevo E2E» a recién registrado: PENDIENTE con sus
 * datos base, sin documentos, contacto, logo, campañas, envío a verificación
 * ni avisos (si el equipo AMO llegó a decidir sobre él, lo registra de nuevo
 * con el mismo id). Va en el `beforeAll` de un spec que lo cambia. Devuelve lo
 * que hizo.
 */
export async function restablecerAnuncianteNuevoE2E(): Promise<AccionAnuncianteNuevo> {
  const servicio = await clienteComoSuperadmin(entorno)
  return restablecerAnuncianteNuevo(
    servicio,
    credencialesAnunciante("ANUNCIANTE_NUEVO").email
  )
}

/**
 * El «Anunciante Nuevo E2E» con el RUT y la Cámara de Comercio cargados
 * (PENDIENTE, PDF reales en Storage) y enviado a verificación por su usuario:
 * lo que el equipo AMO encuentra en la cola de anunciantes. Parte del
 * anunciante recién registrado (lo restablece primero).
 */
export async function prepararAnuncianteEnVerificacion(): Promise<{
  anuncianteId: string
  nombre: string
}> {
  const servicio = await clienteComoSuperadmin(entorno)
  return prepararEnVerificacion(
    entorno,
    servicio,
    await usuarioAnunciante("ANUNCIANTE_NUEVO")
  )
}

/**
 * Devuelve el «Anunciante E2E» a VERIFICADO con su RUT y su Cámara de
 * Comercio al día (solo hace lo que falte). Va en el `afterAll` de un spec que
 * lo suspende o rechaza. Devuelve lo que hizo, en palabras.
 */
export async function restablecerAnuncianteVerificadoE2E(): Promise<string[]> {
  const servicio = await clienteComoSuperadmin(entorno)
  return completarAnuncianteVerificado(
    entorno,
    servicio,
    await usuarioAnunciante("ANUNCIANTE")
  )
}

export interface EstadoAnuncianteDePrueba {
  estado: EstadoAnunciante
  enviadoVerificacionAt: string | null
  motivo: string | null
  /** Documentos por tipo con su estado de validación. */
  documentos: { tipo: string; estado: string; observaciones: string | null }[]
}

/** Estado actual de la empresa en la base (para comprobar el efecto de una acción). */
export async function leerEstadoAnunciante(
  anunciante: Pick<AnuncianteDePrueba, "id" | "nombre">
): Promise<EstadoAnuncianteDePrueba> {
  const servicio = crearClienteServicio(entorno)
  const [fila, documentos] = await Promise.all([
    servicio
      .from("anunciantes")
      .select("estado_verificacion, enviado_verificacion_at, motivo_estado")
      .eq("id", anunciante.id)
      .single(),
    servicio
      .from("documentos_anunciante")
      .select("tipo, estado_validacion, observaciones, created_at")
      .eq("anunciante_id", anunciante.id)
      .order("created_at"),
  ])
  if (fila.error || documentos.error) {
    throw new Error(
      `No se pudo leer «${anunciante.nombre}»: ${(fila.error ?? documentos.error)?.message}`
    )
  }
  return {
    estado: fila.data.estado_verificacion,
    enviadoVerificacionAt: fila.data.enviado_verificacion_at,
    motivo: fila.data.motivo_estado,
    documentos: documentos.data.map((documento) => ({
      tipo: documento.tipo,
      estado: documento.estado_validacion,
      observaciones: documento.observaciones,
    })),
  }
}
