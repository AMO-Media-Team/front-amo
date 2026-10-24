/**
 * `pnpm bootstrap:e2e` (`scripts/bootstrap/usuarios-e2e.ts`) — cuentas para las pruebas E2E:
 *
 * - ADMIN con TOTP verificado (clave en `E2E_ADMIN_TOTP_SECRET`).
 * - OPERACIONES con TOTP verificado (clave en `E2E_OPERACIONES_TOTP_SECRET`):
 *   el equipo AMO de las colas de validación, disputas y suspensión.
 * - ANUNCIANTE sin MFA.
 * - ANUNCIANTE con cambio de contraseña obligatorio.
 * - MEDIO del «Medio E2E»: VERIFICADO nivel 1, con una cuenta de Instagram
 *   verificada (40.000 seguidores), datos de pago cifrados y los documentos
 *   del nivel aprobados y vigentes (`aprovisionar-medios.ts`), y sin la pauta
 *   de corridas anteriores (`fabricas-pauta.ts`).
 * - MEDIO del «Medio Nuevo E2E»: PENDIENTE recién registrado, sin cuentas,
 *   documentos ni pago. Cada corrida lo reinicia a ese estado.
 * - MEDIO del «Medio Suspensión E2E»: VERIFICADO nivel 1 como el Medio E2E
 *   (otro municipio, su cuenta de Instagram de 45.000 seguidores); si una
 *   prueba lo dejó suspendido, lo reactiva.
 * - Sin las pruebas de validación anteriores: las campañas «Validación E2E…»
 *   se limpian (`fabricas-validacion.ts`).
 * - FINANZAS con TOTP verificado (clave en `E2E_FINANZAS_TOTP_SECRET`): aprueba,
 *   emite, paga y factura en las pruebas de la fase 5.
 * - MEDIO del «Medio Finanzas E2E» (no declarante ni facturador: documento
 *   soporte) y del «Medio Factura E2E» (declarante y obligado a facturar):
 *   VERIFICADOS nivel 1 en Bogotá, con Instagram vigente, datos de pago
 *   cifrados y su certificación bancaria aprobada después del último cambio.
 * - Sin las pruebas de Finanzas anteriores (campañas «Finanzas E2E…» y lo de
 *   esos dos medios), solo si la base es la local o develop con
 *   `.env.db.develop` (`fabricas-finanzas.ts`, por la conexión directa).
 * - ANUNCIANTE (y la del cambio obligatorio) del «Anunciante E2E»: VERIFICADO
 *   con el RUT y la Cámara de Comercio aprobados y vigentes
 *   (`aprovisionar-anunciantes.ts`).
 * - ANUNCIANTE del «Anunciante Nuevo E2E»: PENDIENTE en Colombia, con NIT
 *   válido y sin documentos ni campañas. Cada corrida lo reinicia.
 *
 * Las cuentas externas aceptan los términos vigentes (si el cliente ya los
 * publicó), para que la compuerta de términos no cambie a dónde llegan.
 *
 * Contraseñas aleatorias que se AGREGAN a `.env.local` (`E2E_*`); las
 * variables que ya existen no se tocan y se reutilizan, así que el script es
 * idempotente. Requiere un superadministrador activo (`pnpm bootstrap:superadmin`)
 * y se niega a correr contra producción. No imprime contraseñas ni claves.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"

import { archivoDe } from "../db/entorno-db"
import { describirAccionAnuncianteNuevo } from "./anunciantes-e2e"
import {
  completarAnuncianteVerificado,
  prepararAnunciantesBase,
} from "./aprovisionar-anunciantes"
import {
  completarMedioVerificado,
  prepararMediosBase,
} from "./aprovisionar-medios"
import { agregarVariables } from "./archivo-env"
import { generarContrasena } from "./contrasena"
import { restablecerFinanzas } from "./fabricas-finanzas"
import { type MedioPauta, restablecerPautaMedio } from "./fabricas-pauta"
import { restablecerValidacion } from "./fabricas-validacion"
import {
  baseRestablecible,
  describirRestablecimientoFinanzas,
} from "./finanzas-e2e"
import {
  MEDIO_FACTURA_VERIFICADO_E2E,
  MEDIO_FINANZAS_VERIFICADO_E2E,
  MEDIO_SUSPENSION_VERIFICADO_E2E,
  type MedioVerificadoE2E,
} from "./medio-verificado-e2e"
import {
  describirAccionMedioNuevo,
  MEDIO_E2E_ID,
  MEDIO_SUSPENSION_E2E_ID,
} from "./medios-e2e"
import { describirLimpieza } from "./pauta-e2e"
import {
  asegurarTotp,
  clienteComoSuperadmin,
  type CuentaE2E,
  cuentaE2E,
  CUENTAS_E2E,
  emailDe,
  prepararCuenta,
  variableTotpDe,
} from "./provision-e2e"
import {
  buscarUsuarioPorEmail,
  type ClienteSupabase,
  cargarEntorno,
  describirProyecto,
  type EntornoBootstrap,
} from "./supabase"
import { aceptarTerminosVigentes, tipoRolExterno } from "./terminos-e2e"
import { describirRestablecimiento } from "./validacion-e2e"

const ARCHIVO_ENV = ".env.local"

function informar(linea: string): void {
  process.stderr.write(`${linea}\n`)
}

interface CuentaLista {
  id: string
  email: string
  password: string
}

/**
 * Lo que la cuenta necesita además de su perfil: los términos vigentes
 * aceptados (cuentas externas) y, para el Medio E2E y el Anunciante E2E, que
 * su organización esté verificada. Devuelve lo que hizo, en palabras, para el
 * registro.
 */
async function completarCuenta(
  entorno: EntornoBootstrap,
  servicio: ClienteSupabase,
  cuenta: CuentaE2E,
  lista: CuentaLista
): Promise<string[]> {
  const hechos: string[] = []
  const tipoRol = tipoRolExterno(cuenta.rol)
  if (tipoRol) {
    const aceptados = await aceptarTerminosVigentes(servicio, {
      id: lista.id,
      email: lista.email,
      tipoRol,
    })
    if (aceptados > 0) hechos.push(`${aceptados} términos vigentes aceptados`)
  }
  if (cuenta.clave === "MEDIO") {
    hechos.push(...(await completarMedioVerificado(entorno, servicio, lista)))
    // Sin la pauta de corridas anteriores: ni asignaciones ni campañas «Pauta E2E…».
    const pauta = await restablecerPautaMedio(entorno, servicio, {
      id: MEDIO_E2E_ID,
      credenciales: lista,
    })
    if (
      pauta.asignaciones + pauta.campanas + pauta.archivadas > 0 ||
      pauta.plan.liberar.length > 0
    ) {
      hechos.push(
        describirLimpieza({
          plan: pauta.plan,
          campanasBorradas: pauta.campanas,
          campanasArchivadas: pauta.archivadas,
        })
      )
    }
  }
  const verificados: Record<string, MedioVerificadoE2E> = {
    MEDIO_SUSPENSION: MEDIO_SUSPENSION_VERIFICADO_E2E,
    MEDIO_FINANZAS: MEDIO_FINANZAS_VERIFICADO_E2E,
    MEDIO_FACTURA: MEDIO_FACTURA_VERIFICADO_E2E,
  }
  const verificado = verificados[cuenta.clave]
  if (verificado) {
    hechos.push(
      ...(await completarMedioVerificado(entorno, servicio, lista, verificado))
    )
  }
  if (cuenta.clave === "ANUNCIANTE") {
    hechos.push(
      ...(await completarAnuncianteVerificado(entorno, servicio, lista))
    )
  }
  return hechos
}

/** Los medios verificados cuyas credenciales ya están listas (para cerrar sus reclamos). */
function mediosVerificados(
  variables: Readonly<Record<string, string>>
): MedioPauta[] {
  const medios: [string, string][] = [
    ["MEDIO", MEDIO_E2E_ID],
    ["MEDIO_SUSPENSION", MEDIO_SUSPENSION_E2E_ID],
  ]
  return medios.flatMap(([clave, id]) => {
    const cuenta = cuentaE2E(clave)
    const email = variables[cuenta.variableEmail]
    const password = variables[cuenta.variablePassword]
    return email && password ? [{ id, credenciales: { email, password } }] : []
  })
}

/**
 * Limpia las pruebas de Finanzas anteriores si la base lo permite (la local, o
 * develop con su conexión en `.env.db.develop`); si no, lo dice y sigue.
 */
async function restablecerFinanzasSiSePuede(
  entorno: EntornoBootstrap
): Promise<string> {
  let base
  try {
    base = baseRestablecible(entorno.url)
  } catch {
    return "omitido (solo en la base local o develop)"
  }
  if (base === "develop" && !existsSync(archivoDe("develop"))) {
    return `omitido (falta ${archivoDe("develop")} con la conexión de develop)`
  }
  return describirRestablecimientoFinanzas(await restablecerFinanzas(entorno))
}

const CUENTAS_DEMO_EXTERNAS = [
  ["DEMO_ANUNCIANTE_EMAIL", "ANUNCIANTE"],
  ["DEMO_MEDIO_EMAIL", "MEDIO"],
] as const

async function main(): Promise<void> {
  const entorno = cargarEntorno(ARCHIVO_ENV)
  const servicio = await clienteComoSuperadmin(entorno)
  informar(`Cuentas E2E en ${describirProyecto(entorno)}`)
  const variables: Record<string, string> = {}

  // Antes que las cuentas: un perfil MEDIO o ANUNCIANTE activo exige su
  // organización.
  const accionNuevo = await prepararMediosBase(
    servicio,
    emailDe(cuentaE2E("MEDIO_NUEVO"))
  )
  informar(`✓ Medio Nuevo E2E: ${describirAccionMedioNuevo(accionNuevo)}`)
  const accionAnunciante = await prepararAnunciantesBase(
    servicio,
    emailDe(cuentaE2E("ANUNCIANTE_NUEVO"))
  )
  informar(
    `✓ Anunciante Nuevo E2E: ${describirAccionAnuncianteNuevo(accionAnunciante)}`
  )

  for (const cuenta of CUENTAS_E2E) {
    const email = emailDe(cuenta)
    const password = process.env[cuenta.variablePassword] ?? generarContrasena()
    const usuarioId = await prepararCuenta(servicio, cuenta, password)
    variables[cuenta.variableEmail] = email
    variables[cuenta.variablePassword] = password

    if (cuenta.conTotp) {
      const variableTotp = variableTotpDe(cuenta)
      variables[variableTotp] = await asegurarTotp(
        entorno,
        servicio,
        usuarioId,
        { email, password },
        process.env[variableTotp],
        variableTotp
      )
    }
    const hechos = await completarCuenta(entorno, servicio, cuenta, {
      id: usuarioId,
      email,
      password,
    })
    informar(
      `✓ ${cuenta.clave}: ${email}${hechos.length > 0 ? ` (${hechos.join("; ")})` : ""}`
    )
  }

  // Sin las pruebas de validación anteriores (campañas «Validación E2E…») y
  // con el Medio Suspensión E2E verificado.
  const validacion = await restablecerValidacion(entorno, servicio, {
    medios: mediosVerificados(variables),
    medioSuspension: MEDIO_SUSPENSION_E2E_ID,
  })
  informar(`✓ Validación E2E: ${describirRestablecimiento(validacion)}`)
  informar(`✓ Finanzas E2E: ${await restablecerFinanzasSiSePuede(entorno)}`)

  // Sesiones compartidas de la suite (e2e/preparacion.setup.ts): las cuentas
  // demo externas tampoco deben quedar retenidas en la compuerta de términos.
  for (const [variable, tipoRol] of CUENTAS_DEMO_EXTERNAS) {
    const email = process.env[variable]
    const usuario = email ? await buscarUsuarioPorEmail(servicio, email) : null
    if (!email || !usuario) continue
    const aceptados = await aceptarTerminosVigentes(servicio, {
      id: usuario.id,
      email,
      tipoRol,
    })
    if (aceptados > 0) {
      informar(`✓ ${email}: ${aceptados} términos vigentes aceptados`)
    }
  }

  const { contenido, agregadas } = agregarVariables(
    readFileSync(ARCHIVO_ENV, "utf8"),
    variables,
    "Cuentas de prueba E2E (scripts/bootstrap/usuarios-e2e.ts). No usar en producción."
  )
  if (agregadas.length > 0) writeFileSync(ARCHIVO_ENV, contenido)
  informar(
    agregadas.length > 0
      ? `Variables agregadas a ${ARCHIVO_ENV}: ${agregadas.join(", ")}`
      : `${ARCHIVO_ENV} ya tenía todas las variables E2E.`
  )
}

main().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error)
  process.stderr.write(`usuarios-e2e falló: ${mensaje}\n`)
  process.exitCode = 1
})
