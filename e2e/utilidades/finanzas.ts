/**
 * Fábricas E2E de la fase 5 (`scripts/bootstrap/fabricas-finanzas.ts`):
 * campaña «Finanzas E2E» con una oferta para los dos medios de Finanzas,
 * asignaciones verificadas, liquidaciones en cada etapa, facturas al
 * anunciante, resoluciones de prueba y la limpieza. Todo por el camino real
 * (sesiones de las personas, `*_srv` con actor y sesión, archivos reales en
 * Storage) y nunca en producción.
 *
 * Quién hace qué (como en la app):
 *
 * - La empresa («Anunciante E2E») crea la campaña y las ofertas; el medio
 *   acepta, publica y mide; un operador temporal valida y verifica.
 * - El ADMIN E2E genera las liquidaciones y Finanzas las aprueba: quien genera
 *   no aprueba (D17), así que en la interfaz Finanzas PUEDE aprobar las de las
 *   fábricas. Finanzas emite el documento soporte, registra pagos, genera el
 *   archivo de pagos y las facturas; el medio que factura carga su factura.
 *
 * Reglas para que los specs no se pisen:
 *
 * - Los specs `finanzas-*` (proyecto `finanzas`, en serie) llaman a
 *   `restablecerFinanzasE2E()` en su `beforeAll` (y conviene también en el
 *   `afterAll`): borra las campañas «Finanzas E2E» con sus facturas, pagos y
 *   notas crédito, y TODO lo de los dos medios de Finanzas (asignaciones,
 *   liquidaciones, documentos soporte y archivos de pagos), con sus avisos y
 *   archivos. Así cada corrida genera su corte sin traslapes. Solo base local
 *   o develop (con `.env.db.develop`).
 * - Una liquidación vigente por medio y por día: el periodo termina hoy (lo
 *   verificado hoy solo entra así). Para una segunda del mismo medio, usa el
 *   otro medio o restablece antes. `liquidacionFinanzasE2E` liquida TODO lo
 *   verificado sin liquidar del medio: si quieres algo «por liquidar» al lado
 *   de una liquidación, verifica esa asignación DESPUÉS de liquidar.
 * - Ubica lo tuyo por su id o por el nombre de la campaña / título de la
 *   oferta, nunca por su posición en una lista (también hay datos demo).
 * - Un corte por la interfaz («Generar corte») liquida a TODOS los medios con
 *   verificadas por liquidar, también los de la demo: la limpieza solo
 *   deshace lo de los medios de Finanzas.
 * - Finanzas entra con `ingresarComoFinanzas(page)` (rol FINANZAS, con TOTP).
 *   Los medios, con `ingresarComoMedio(page, { cuenta: "MEDIO_FINANZAS" })`
 *   (`medios.ts`); la empresa, con `ingresarComoAnunciante(page)`.
 *
 * Tiempos: una asignación verificada tarda unos segundos (campaña, oferta,
 * aceptar, publicar, validar con un operador temporal); una liquidación suma
 * los ingresos con TOTP del ADMIN E2E y de Finanzas (hasta 30 s si el periodo
 * TOTP ya se gastó en este proceso). Súbele el tiempo a la prueba o al
 * `beforeAll` que encadene varias (`test.setTimeout(180_000)`).
 */
import {
  type AsignacionVerificadaFinanzas,
  asegurarResolucionesPrueba,
  type CampanaFinanzas,
  type CredencialesInternas,
  crearCampanaFinanzas,
  credencialesInternasDe,
  type FacturaFinanzas,
  leerFacturaFinanzas,
  leerLiquidacionFinanzas,
  type LiquidacionFinanzas,
  type PartesFinanzas,
  partesFinanzasDelEntorno,
  prepararAsignacionVerificadaFinanzas,
  prepararFacturaFinanzas,
  prepararLiquidacionFinanzas,
  type ResolucionAsegurada,
  restablecerFinanzas,
} from "../../scripts/bootstrap/fabricas-finanzas"
import {
  ETAPAS_FACTURA,
  ETAPAS_LIQUIDACION,
  type EtapaFactura,
  type EtapaLiquidacion,
  type FinanzasRestablecidas,
  type MedioFinanzas,
  MEDIOS_FINANZAS,
  PREFIJO_FINANZAS,
} from "../../scripts/bootstrap/finanzas-e2e"
import { cuentaE2E } from "../../scripts/bootstrap/provision-e2e"
import { entorno } from "./cuentas"
import { MEDIO_FACTURA, MEDIO_FINANZAS, type MedioDePrueba } from "./medios"
import { codigoNuevo, type CookiesSesion } from "./mfa"
import { esperarStreaming, expect, type Page } from "./prueba"

export type {
  AsignacionVerificadaFinanzas,
  CampanaFinanzas,
  EtapaFactura,
  EtapaLiquidacion,
  FacturaFinanzas,
  FinanzasRestablecidas,
  LiquidacionFinanzas,
  MedioFinanzas,
  ResolucionAsegurada,
}
export { ETAPAS_FACTURA, ETAPAS_LIQUIDACION, PREFIJO_FINANZAS }

/** Los dos medios de Finanzas como `MedioDePrueba` (id, nombre y cuenta). */
export const MEDIOS_DE_FINANZAS: Readonly<
  Record<MedioFinanzas, MedioDePrueba>
> = {
  MEDIO_FINANZAS,
  MEDIO_FACTURA,
}

/** Si el medio factura (carga su factura) o lleva documento soporte. */
export function medioFactura(medio: MedioFinanzas): boolean {
  return MEDIOS_FINANZAS[medio].factura
}

// ── Finanzas (rol FINANZAS, con TOTP) ────────────────────────────────────────

const CUENTA_FINANZAS = cuentaE2E("FINANZAS")

/** Nombre de la persona de Finanzas (como lo muestran el saludo y la bitácora). */
export const NOMBRE_FINANZAS = CUENTA_FINANZAS.nombre

/** Nombre del ADMIN E2E, que genera las liquidaciones de las fábricas. */
export const NOMBRE_ADMINISTRACION = cuentaE2E("ADMIN").nombre

/** Correo, contraseña y clave TOTP de Finanzas (`E2E_FINANZAS_*`; las crea `pnpm bootstrap:e2e`). */
export function credencialesFinanzas(): CredencialesInternas {
  return credencialesInternasDe("FINANZAS")
}

/**
 * Sesión de Finanzas de este proceso de pruebas. Cada ingreso con TOTP exige
 * un código de un periodo nuevo (hasta 30 s): se reutiliza mientras siga viva.
 */
let sesionFinanzas: CookiesSesion | null = null

function rutaDe(destino: string): string {
  return new URL(destino, "http://amo.local").pathname
}

/**
 * Entra como Finanzas (contraseña y TOTP) y espera llegar a `destino` (Inicio
 * por omisión). Reutiliza la sesión de una prueba anterior del mismo proceso
 * si sigue viva (si el servidor la cerró por inactividad, vuelve a ingresar).
 * Va en el `beforeEach` o al empezar cada prueba.
 */
export async function ingresarComoFinanzas(
  page: Page,
  { destino = "/inicio" }: { destino?: string } = {}
): Promise<void> {
  const ruta = rutaDe(destino)
  if (sesionFinanzas) {
    await page.context().addCookies(sesionFinanzas)
    await page.goto(destino)
    if (new URL(page.url()).pathname === ruta) {
      sesionFinanzas = await page.context().cookies()
      return
    }
    sesionFinanzas = null
    await page.context().clearCookies()
  }
  const { email, password, secreto } = credencialesFinanzas()
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
  sesionFinanzas = await page.context().cookies()
}

// ── Las partes ───────────────────────────────────────────────────────────────

let partesGuardadas: Promise<PartesFinanzas> | null = null

/** Las credenciales de `.env.local` y el id de la empresa (se leen una vez por proceso). */
function partes(): Promise<PartesFinanzas> {
  partesGuardadas ??= partesFinanzasDelEntorno(entorno).catch(
    (error: unknown) => {
      partesGuardadas = null
      throw error
    }
  )
  return partesGuardadas
}

// ── Campaña y asignaciones ───────────────────────────────────────────────────

/**
 * Campaña ACTIVA «Finanzas E2E <sufijo>» del Anunciante E2E con una oferta
 * PUBLICADA dirigida a los dos medios de Finanzas (Bogotá, 2 cupos en F1,
 * solo el corte de 24 h). Devuelve su id, su nombre y la oferta.
 */
export async function campanaFinanzasE2E(): Promise<CampanaFinanzas> {
  return crearCampanaFinanzas(entorno, await partes())
}

/**
 * Asignación VERIFICADA del medio en la campaña «Finanzas E2E» por el camino
 * real: lista para liquidar (Pendientes de Liquidaciones) y para facturar.
 * Usa una oferta de la campaña que el medio no haya tomado; si no hay, crea
 * otra. Trae el valor bruto y el del medio (precio congelado).
 */
export async function asignacionVerificadaFinanzasE2E(opciones: {
  medio: MedioFinanzas
  campanaId: string
}): Promise<AsignacionVerificadaFinanzas> {
  return prepararAsignacionVerificadaFinanzas(entorno, await partes(), opciones)
}

// ── Liquidaciones ────────────────────────────────────────────────────────────

/**
 * Liquidación del medio en la etapa pedida (`hasta`):
 *
 * - `BORRADOR`: la genera el ADMIN E2E con lo verificado sin liquidar del
 *   medio (si no tiene nada, verifica antes una asignación en `campanaId` o en
 *   una campaña nueva), periodo desde el inicio del periodo vigente hasta hoy.
 *   Finanzas la puede aprobar en la interfaz (D17).
 * - `APROBADA`: además la aprueba Finanzas (el medio que factura queda en
 *   «Carga tu factura»; el que no, con el documento soporte en borrador).
 * - `EMITIDA`: además, documento soporte emitido con su PDF y su archivo para
 *   el proveedor (medio que no factura; `conCuds` registra también el CUDS) o
 *   la factura del medio cargada por él (medio que factura). Queda lista para
 *   el archivo de pagos; con `dispersada`, ya va en uno («En proceso de pago»).
 * - `PAGADA`: además, Finanzas registra el pago de hoy con su soporte.
 */
export async function liquidacionFinanzasE2E(opciones: {
  medio: MedioFinanzas
  hasta: EtapaLiquidacion
  campanaId?: string
  conCuds?: boolean
  dispersada?: boolean
}): Promise<LiquidacionFinanzas> {
  return prepararLiquidacionFinanzas(entorno, await partes(), opciones)
}

/** Estado actual de la liquidación (para comprobar el efecto de una acción en la interfaz). */
export async function leerLiquidacionFinanzasE2E(
  liquidacionId: string
): Promise<LiquidacionFinanzas> {
  return leerLiquidacionFinanzas(entorno, liquidacionId)
}

// ── Facturas al anunciante ───────────────────────────────────────────────────

/**
 * Factura de la campaña por lo verificado sin facturar hasta hoy:
 *
 * - `BORRADOR`: la genera Finanzas (el anunciante no la ve).
 * - `EMITIDA`: además la registra como expedida con el siguiente número libre
 *   de la resolución de factura vigente, un CUFE de 96 hex, su PDF y el total
 *   del borrador (vence según `facturacion.dias_vencimiento`).
 *
 * Si la campaña no tiene nada por facturar, verifica antes una asignación
 * (`medio`, el Medio Finanzas E2E por omisión).
 */
export async function facturaFinanzasE2E(opciones: {
  campanaId: string
  hasta: EtapaFactura
  medio?: MedioFinanzas
}): Promise<FacturaFinanzas> {
  return prepararFacturaFinanzas(entorno, await partes(), opciones)
}

/** Estado actual de la factura (para comprobar el efecto de una acción en la interfaz). */
export async function leerFacturaFinanzasE2E(
  facturaId: string
): Promise<FacturaFinanzas> {
  return leerFacturaFinanzas(entorno, facturaId)
}

// ── Configuración y limpieza ─────────────────────────────────────────────────

/**
 * Garantiza una resolución DIAN activa y vigente de documento soporte y de
 * factura: si no la hay, crea (o activa) las «PRUEBA» (`PDS` y `PFE`). En la
 * base local ya están las de la demo. Va en el `beforeAll` de los specs que
 * emiten documentos o registran facturas.
 */
export async function resolucionesPruebaE2E(): Promise<ResolucionAsegurada[]> {
  return asegurarResolucionesPrueba(entorno)
}

/**
 * Deja la base sin las pruebas de Finanzas anteriores (campañas «Finanzas
 * E2E» con sus facturas, pagos y notas, y todo lo de los dos medios de
 * Finanzas, con sus avisos y archivos) y cierra las sesiones internas de las
 * fábricas. Solo base local o develop; nunca producción. Va en el `beforeAll`
 * (y en el `afterAll`) de cada spec `finanzas-*`.
 */
export async function restablecerFinanzasE2E(): Promise<FinanzasRestablecidas> {
  return restablecerFinanzas(entorno)
}
