/**
 * Medios de las pruebas E2E y sus cuentas (las prepara `pnpm bootstrap:e2e`):
 *
 * - «Medio E2E» (`E2E_MEDIO_*`): VERIFICADO nivel 1, con una cuenta de
 *   Instagram verificada de 40.000 seguidores, datos de pago completos y los
 *   documentos del nivel aprobados y vigentes.
 * - «Medio Nuevo E2E» (`E2E_MEDIO_NUEVO_*`): PENDIENTE recién registrado, sin
 *   cuentas, documentos ni pago, para recorrer la lista de alta.
 *
 * Sus ids son fijos: las pruebas los ubican sin buscarlos. Las cuentas son de
 * rol MEDIO, sin verificación en dos pasos: cada prueba puede ingresar con la
 * suya sin cerrar la sesión de otra. Un spec que cambia uno de estos medios lo
 * devuelve a su estado con `restablecerMedioNuevoE2E` (en su `beforeAll`) o
 * `restablecerMedioVerificadoE2E` (en su `afterAll`): así la suite se puede
 * repetir sin volver a aprovisionar.
 */
import {
  completarMedioVerificado,
  restablecerMedioNuevo,
} from "../../scripts/bootstrap/aprovisionar-medios"
import {
  type AccionMedioNuevo,
  CUENTA_INSTAGRAM_E2E,
  MEDIO_E2E,
  MEDIO_NUEVO_E2E,
  NIVEL_MEDIO_E2E,
} from "../../scripts/bootstrap/medios-e2e"
import { clienteComoSuperadmin } from "../../scripts/bootstrap/provision-e2e"
import { crearClienteServicio } from "../../scripts/bootstrap/supabase"
import type { Database } from "../../src/types/database.types"
import { type Credenciales, credenciales, entorno } from "./cuentas"
import { expect, type Page } from "./prueba"

export type CuentaMedio = "MEDIO" | "MEDIO_NUEVO"

export interface MedioDePrueba {
  id: string
  nombre: string
  /** Cuenta E2E de la persona vinculada al medio. */
  cuenta: CuentaMedio
}

/** «Medio E2E»: verificado en nivel 1, listo para operar. */
export const MEDIO_VERIFICADO: MedioDePrueba = {
  id: MEDIO_E2E.id,
  nombre: MEDIO_E2E.nombre,
  cuenta: "MEDIO",
}

/** «Medio Nuevo E2E»: recién registrado, con toda la lista de alta por hacer. */
export const MEDIO_NUEVO: MedioDePrueba = {
  id: MEDIO_NUEVO_E2E.id,
  nombre: MEDIO_NUEVO_E2E.nombre,
  cuenta: "MEDIO_NUEVO",
}

/** Nivel del Medio E2E y su cuenta verificada (`@medio.e2e.amo`, 40.000 seguidores). */
export const NIVEL_MEDIO_VERIFICADO = NIVEL_MEDIO_E2E
export const CUENTA_MEDIO_VERIFICADO = CUENTA_INSTAGRAM_E2E

export function credencialesMedio(cuenta: CuentaMedio = "MEDIO"): Credenciales {
  return credenciales(cuenta)
}

/** Ficha del medio en Operación (equipo AMO). */
export function rutaFichaMedio(medio: MedioDePrueba): string {
  return `/operacion/medios/${medio.id}`
}

/**
 * Ingresa con la cuenta del medio y espera llegar a `destino` (Inicio por
 * omisión). Con otro destino entra por `/ingresar?next=…`, como un enlace
 * profundo: el ingreso lleva allí tras pasar las compuertas.
 */
export async function ingresarComoMedio(
  page: Page,
  {
    cuenta = "MEDIO",
    destino = "/inicio",
  }: { cuenta?: CuentaMedio; destino?: string } = {}
): Promise<void> {
  const { email, password } = credencialesMedio(cuenta)
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

/**
 * Devuelve el «Medio Nuevo E2E» a recién registrado: sin cuentas, documentos,
 * pago, archivos ni avisos (y, si el equipo AMO llegó a decidir sobre él, lo
 * registra de nuevo con el mismo id). Va en el `beforeAll` de un spec de alta.
 */
export async function restablecerMedioNuevoE2E(): Promise<AccionMedioNuevo> {
  const servicio = await clienteComoSuperadmin(entorno)
  return restablecerMedioNuevo(servicio, credencialesMedio("MEDIO_NUEVO").email)
}

/**
 * Devuelve el «Medio E2E» a VERIFICADO nivel 1 con su cuenta, pago y
 * documentos al día (solo hace lo que falte). Va en el `afterAll` de un spec
 * que lo rechaza, suspende o cambia de nivel. Devuelve lo que hizo.
 */
export async function restablecerMedioVerificadoE2E(): Promise<string[]> {
  const servicio = await clienteComoSuperadmin(entorno)
  const { email, password } = credencialesMedio("MEDIO")
  const { data, error } = await servicio
    .from("perfiles")
    .select("id")
    .eq("email", email)
    .single()
  if (error) {
    throw new Error(
      `No se encontró la cuenta del Medio E2E (${email}): ejecuta \`pnpm bootstrap:e2e\`. ${error.message}`
    )
  }
  return completarMedioVerificado(entorno, servicio, {
    id: data.id,
    email,
    password,
  })
}

type FilaMedio = Database["public"]["Tables"]["medios"]["Row"]

export interface EstadoMedioDePrueba {
  estado: FilaMedio["estado"]
  nivel: number
  enviadoVerificacionAt: string | null
  motivo: string | null
}

/** Estado actual del medio en la base (para comprobar el efecto de una acción). */
export async function leerEstadoMedio(
  medio: MedioDePrueba
): Promise<EstadoMedioDePrueba> {
  const { data, error } = await crearClienteServicio(entorno)
    .from("medios")
    .select(
      "estado, nivel_verificacion, enviado_verificacion_at, motivo_estado"
    )
    .eq("id", medio.id)
    .single()
  if (error) {
    throw new Error(`No se pudo leer «${medio.nombre}»: ${error.message}`)
  }
  return {
    estado: data.estado,
    nivel: data.nivel_verificacion,
    enviadoVerificacionAt: data.enviado_verificacion_at,
    motivo: data.motivo_estado,
  }
}
