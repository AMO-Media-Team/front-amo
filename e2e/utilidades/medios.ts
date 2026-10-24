/**
 * Medios de las pruebas E2E y sus cuentas (las prepara `pnpm bootstrap:e2e`):
 *
 * - «Medio E2E» (`E2E_MEDIO_*`): VERIFICADO nivel 1, con una cuenta de
 *   Instagram verificada de 40.000 seguidores, datos de pago completos y los
 *   documentos del nivel aprobados y vigentes.
 * - «Medio Nuevo E2E» (`E2E_MEDIO_NUEVO_*`): PENDIENTE recién registrado, sin
 *   cuentas, documentos ni pago, para recorrer la lista de alta.
 * - «Medio Suspensión E2E» (`E2E_MEDIO_SUSPENSION_*`): VERIFICADO nivel 1 como
 *   el Medio E2E, en Barranquilla y con su propia cuenta de Instagram
 *   (`@medio.suspension.e2e.amo`, 45.000 seguidores). Es el que suspenden y
 *   reactivan las pruebas del equipo AMO (`validacion.ts`).
 * - «Medio Finanzas E2E» (`E2E_MEDIO_FINANZAS_*`) y «Medio Factura E2E»
 *   (`E2E_MEDIO_FACTURA_*`): VERIFICADOS nivel 1 en Bogotá para las pruebas de
 *   Finanzas (`finanzas.ts`). El primero no es declarante ni factura (lleva
 *   documento soporte); el segundo es declarante y factura (carga su factura).
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
  MEDIO_FACTURA_VERIFICADO_E2E,
  MEDIO_FINANZAS_VERIFICADO_E2E,
  MEDIO_SUSPENSION_VERIFICADO_E2E,
  MEDIO_VERIFICADO_E2E,
  type MedioVerificadoE2E,
} from "../../scripts/bootstrap/medio-verificado-e2e"
import {
  type AccionMedioNuevo,
  CUENTA_INSTAGRAM_E2E,
  CUENTA_INSTAGRAM_FACTURA_E2E,
  CUENTA_INSTAGRAM_FINANZAS_E2E,
  CUENTA_INSTAGRAM_SUSPENSION_E2E,
  MEDIO_E2E,
  MEDIO_FACTURA_E2E,
  MEDIO_FINANZAS_E2E,
  MEDIO_NUEVO_E2E,
  MEDIO_SUSPENSION_E2E,
  NIVEL_MEDIO_E2E,
} from "../../scripts/bootstrap/medios-e2e"
import { clienteComoSuperadmin } from "../../scripts/bootstrap/provision-e2e"
import { crearClienteServicio } from "../../scripts/bootstrap/supabase"
import type { Database } from "../../src/types/database.types"
import { type Credenciales, credenciales, entorno } from "./cuentas"
import { esperarStreaming, expect, type Page } from "./prueba"

export type CuentaMedio =
  | "MEDIO"
  | "MEDIO_NUEVO"
  | "MEDIO_SUSPENSION"
  | "MEDIO_FINANZAS"
  | "MEDIO_FACTURA"

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

/** «Medio Suspensión E2E»: verificado en nivel 1, para suspenderlo y reactivarlo. */
export const MEDIO_SUSPENSION: MedioDePrueba = {
  id: MEDIO_SUSPENSION_E2E.id,
  nombre: MEDIO_SUSPENSION_E2E.nombre,
  cuenta: "MEDIO_SUSPENSION",
}

/** «Medio Finanzas E2E»: verificado, no declarante ni facturador (documento soporte). */
export const MEDIO_FINANZAS: MedioDePrueba = {
  id: MEDIO_FINANZAS_E2E.id,
  nombre: MEDIO_FINANZAS_E2E.nombre,
  cuenta: "MEDIO_FINANZAS",
}

/** «Medio Factura E2E»: verificado, declarante y obligado a facturar. */
export const MEDIO_FACTURA: MedioDePrueba = {
  id: MEDIO_FACTURA_E2E.id,
  nombre: MEDIO_FACTURA_E2E.nombre,
  cuenta: "MEDIO_FACTURA",
}

/** Nivel del Medio E2E y su cuenta verificada (`@medio.e2e.amo`, 40.000 seguidores). */
export const NIVEL_MEDIO_VERIFICADO = NIVEL_MEDIO_E2E
export const CUENTA_MEDIO_VERIFICADO = CUENTA_INSTAGRAM_E2E
/** Cuenta verificada del Medio Suspensión E2E (`@medio.suspension.e2e.amo`, 45.000 seguidores). */
export const CUENTA_MEDIO_SUSPENSION = CUENTA_INSTAGRAM_SUSPENSION_E2E
/** Cuentas verificadas de los medios de Finanzas (42.000 y 48.000 seguidores, franja F1). */
export const CUENTA_MEDIO_FINANZAS = CUENTA_INSTAGRAM_FINANZAS_E2E
export const CUENTA_MEDIO_FACTURA = CUENTA_INSTAGRAM_FACTURA_E2E

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
  await esperarStreaming(page)
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

async function completarVerificado(
  cuenta: Exclude<CuentaMedio, "MEDIO_NUEVO">,
  medio: MedioVerificadoE2E
): Promise<string[]> {
  const servicio = await clienteComoSuperadmin(entorno)
  const { email, password } = credencialesMedio(cuenta)
  const { data, error } = await servicio
    .from("perfiles")
    .select("id")
    .eq("email", email)
    .single()
  if (error) {
    throw new Error(
      `No se encontró la cuenta de «${medio.datos.nombre}» (${email}): ejecuta \`pnpm bootstrap:e2e\`. ${error.message}`
    )
  }
  return completarMedioVerificado(
    entorno,
    servicio,
    { id: data.id, email, password },
    medio
  )
}

/**
 * Devuelve el «Medio E2E» a VERIFICADO nivel 1 con su cuenta, pago y
 * documentos al día (solo hace lo que falte). Va en el `afterAll` de un spec
 * que lo rechaza, suspende o cambia de nivel. Devuelve lo que hizo.
 */
export async function restablecerMedioVerificadoE2E(): Promise<string[]> {
  return completarVerificado("MEDIO", MEDIO_VERIFICADO_E2E)
}

/**
 * Devuelve el «Medio Suspensión E2E» a VERIFICADO nivel 1 con su cuenta, pago
 * y documentos al día (lo reactiva si quedó suspendido). Devuelve lo que hizo.
 */
export async function restablecerMedioSuspensionE2E(): Promise<string[]> {
  return completarVerificado(
    "MEDIO_SUSPENSION",
    MEDIO_SUSPENSION_VERIFICADO_E2E
  )
}

/**
 * Devuelve un medio de Finanzas a VERIFICADO nivel 1 con su cuenta, su pago y
 * la certificación bancaria posterior al último cambio (solo hace lo que
 * falte). Va en el `afterAll` de un spec que le cambia los datos de pago o el
 * estado. Devuelve lo que hizo.
 */
export async function restablecerMedioFinanzasE2E(
  medio: "MEDIO_FINANZAS" | "MEDIO_FACTURA" = "MEDIO_FINANZAS"
): Promise<string[]> {
  return completarVerificado(
    medio,
    medio === "MEDIO_FINANZAS"
      ? MEDIO_FINANZAS_VERIFICADO_E2E
      : MEDIO_FACTURA_VERIFICADO_E2E
  )
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
