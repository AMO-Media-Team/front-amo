/**
 * Cuentas de prueba E2E (las usan `scripts/bootstrap/usuarios-e2e.ts` y
 * `e2e/*.spec.ts`). Son perfiles `es_demo` en correos `@amo.test` (dominio
 * reservado: nunca recibe correo). Los cambios de rol y organización se
 * atribuyen al superadministrador (`x-amo-actor` con contexto confiable): los
 * triggers guardianes no permiten gestionar perfiles sin un actor identificado.
 * El estado nunca se escribe con UPDATE (AMO_ESTADO_SOLO_VIA_TRANSICION): la
 * activación va por `activar_perfil_srv` y la restauración de una cuenta
 * suspendida o desactivada, por `transicionar_srv` con un operador temporal.
 */
import { type EstadoPerfil, transicionesParaRestaurar } from "./estado-perfil"
import { enrolarTotpEnSesion } from "./mfa"
import { conOperadorTemporal } from "./operador-temporal"
import { organizacionDe, type RolCuentaPrueba } from "./organizacion"
import {
  activarPerfil,
  actualizarPerfil,
  buscarUsuarioPorEmail,
  cargarEntorno,
  type ClienteSupabase,
  crearClientePublico,
  crearClienteServicio,
  type EntornoBootstrap,
  ErrorBootstrap,
  idDeRol,
  rutaConfirmacion,
} from "./supabase"

export { codigoTotpEstable } from "./mfa"

export { ANUNCIANTE_E2E_ID } from "./organizacion"

export interface CuentaE2E {
  clave: string
  rol: RolCuentaPrueba
  /** Medio al que pertenece una cuenta de rol MEDIO (obligatorio para ese rol). */
  medioId?: string
  nombre: string
  emailPorDefecto: string
  /** Variables de `.env.local` con el correo y la contraseña. */
  variableEmail: string
  variablePassword: string
  debeCambiarPassword: boolean
  conTotp: boolean
}

export const CUENTAS_E2E: readonly CuentaE2E[] = [
  {
    clave: "ADMIN",
    rol: "ADMIN",
    nombre: "Administración E2E",
    emailPorDefecto: "e2e.admin@amo.test",
    variableEmail: "E2E_ADMIN_EMAIL",
    variablePassword: "E2E_ADMIN_PASSWORD",
    debeCambiarPassword: false,
    conTotp: true,
  },
  {
    clave: "ANUNCIANTE",
    rol: "ANUNCIANTE",
    nombre: "Anunciante E2E",
    emailPorDefecto: "e2e.anunciante@amo.test",
    variableEmail: "E2E_ANUNCIANTE_EMAIL",
    variablePassword: "E2E_ANUNCIANTE_PASSWORD",
    debeCambiarPassword: false,
    conTotp: false,
  },
  {
    clave: "CAMBIO",
    rol: "ANUNCIANTE",
    nombre: "Cambio Obligatorio E2E",
    emailPorDefecto: "e2e.cambio@amo.test",
    variableEmail: "E2E_CAMBIO_EMAIL",
    variablePassword: "E2E_CAMBIO_PASSWORD",
    debeCambiarPassword: true,
    conTotp: false,
  },
]

export const VARIABLE_TOTP_ADMIN = "E2E_ADMIN_TOTP_SECRET"

export function cuentaE2E(clave: CuentaE2E["clave"]): CuentaE2E {
  const cuenta = CUENTAS_E2E.find((candidata) => candidata.clave === clave)
  if (!cuenta) throw new ErrorBootstrap(`Cuenta E2E desconocida: ${clave}`)
  return cuenta
}

export function emailDe(cuenta: CuentaE2E): string {
  return process.env[cuenta.variableEmail] ?? cuenta.emailPorDefecto
}

/** Cliente `service_role` que actúa como el superadministrador activo. */
export async function clienteComoSuperadmin(
  entorno: EntornoBootstrap
): Promise<ClienteSupabase> {
  const email = entorno.superadminEmail
  if (!email) throw new ErrorBootstrap("Define SUPERADMIN_EMAIL en .env.local.")
  const servicio = crearClienteServicio(entorno)
  const superadmin = await buscarUsuarioPorEmail(servicio, email)
  const rolSuper = await idDeRol(servicio, "SUPERADMIN")
  const { data: perfil } = superadmin
    ? await servicio
        .from("perfiles")
        .select("rol_id, estado")
        .eq("id", superadmin.id)
        .single()
    : { data: null }
  if (
    !superadmin ||
    perfil?.rol_id !== rolSuper ||
    perfil.estado !== "ACTIVO"
  ) {
    throw new ErrorBootstrap(
      "No hay un superadministrador activo: ejecuta `pnpm bootstrap:superadmin` y confirma el enlace."
    )
  }
  return crearClienteServicio(entorno, superadmin.id)
}

/** Crea la cuenta o le fija la contraseña; devuelve su id. */
async function asegurarUsuario(
  servicio: ClienteSupabase,
  cuenta: CuentaE2E,
  password: string
): Promise<string> {
  const email = emailDe(cuenta)
  // `ban_duration: "none"` levanta el bloqueo de Auth que deja una suspensión.
  const atributos = {
    password,
    email_confirm: true,
    app_metadata: { rol: cuenta.rol },
    ban_duration: "none",
  }
  const existente = await buscarUsuarioPorEmail(servicio, email)
  const { data, error } = existente
    ? await servicio.auth.admin.updateUserById(existente.id, atributos)
    : await servicio.auth.admin.createUser({ email, ...atributos })
  if (error) {
    throw new ErrorBootstrap(`No se pudo preparar ${email}: ${error.message}`)
  }
  return data.user.id
}

const MOTIVO_RESTAURACION = "Restauración de la cuenta de prueba E2E"

async function estadoDe(
  servicio: ClienteSupabase,
  usuarioId: string
): Promise<EstadoPerfil> {
  const { data, error } = await servicio
    .from("perfiles")
    .select("estado")
    .eq("id", usuarioId)
    .single()
  if (error) {
    throw new ErrorBootstrap(`No se encontró el perfil: ${error.message}`)
  }
  return data.estado
}

/**
 * Devuelve una cuenta suspendida o desactivada a ACTIVO o INVITADO con
 * `transicionar_srv` (motivo obligatorio). Solo carga el entorno en este caso
 * poco frecuente: el operador temporal necesita la clave publicable.
 */
async function restaurarEstado(
  servicio: ClienteSupabase,
  usuarioId: string,
  estado: EstadoPerfil
): Promise<void> {
  const destinos = transicionesParaRestaurar(estado)
  if (destinos.length === 0) return
  await conOperadorTemporal(cargarEntorno(), servicio, async (operador) => {
    for (const hacia of destinos) {
      const { error } = await servicio.rpc("transicionar_srv", {
        p_entidad: "perfiles",
        p_id: usuarioId,
        p_hacia: hacia,
        p_actor_id: operador.usuarioId,
        p_session_id: operador.sesionId,
        p_motivo: MOTIVO_RESTAURACION,
      })
      if (error) {
        throw new ErrorBootstrap(
          `No se pudo restaurar la cuenta (${estado} → ${hacia}): ${error.message}${error.details ? ` (${error.details})` : ""}`
        )
      }
    }
  })
}

/**
 * Restaura el estado si hace falta, fija rol y organización (sin tocar
 * `estado`) y activa la cuenta si quedó INVITADA. Restaurar va primero porque
 * DESACTIVADO → INVITADO vuelve a exigir el cambio de contraseña.
 */
async function asegurarPerfil(
  servicio: ClienteSupabase,
  usuarioId: string,
  cuenta: CuentaE2E
): Promise<void> {
  await restaurarEstado(
    servicio,
    usuarioId,
    await estadoDe(servicio, usuarioId)
  )
  await actualizarPerfil(servicio, usuarioId, {
    nombre: cuenta.nombre,
    rol_id: await idDeRol(servicio, cuenta.rol),
    ...organizacionDe(cuenta),
    debe_cambiar_password: cuenta.debeCambiarPassword,
    es_demo: true,
  })
  await activarPerfil(servicio, usuarioId)
}

/**
 * Deja la cuenta como la esperan las pruebas: contraseña, rol, organización,
 * cambio obligatorio y estado ACTIVO (por transición, nunca con UPDATE).
 */
export async function prepararCuenta(
  servicio: ClienteSupabase,
  cuenta: CuentaE2E,
  password: string
): Promise<string> {
  const usuarioId = await asegurarUsuario(servicio, cuenta, password)
  await asegurarPerfil(servicio, usuarioId, cuenta)
  return usuarioId
}

async function tieneTotpVerificado(
  servicio: ClienteSupabase,
  usuarioId: string
): Promise<boolean> {
  const { data, error } = await servicio.auth.admin.mfa.listFactors({
    userId: usuarioId,
  })
  if (error) {
    throw new ErrorBootstrap(
      `No se pudieron leer los factores: ${error.message}`
    )
  }
  return data.factors.some(
    (factor) => factor.factor_type === "totp" && factor.status === "verified"
  )
}

async function borrarFactores(
  servicio: ClienteSupabase,
  usuarioId: string
): Promise<void> {
  const { data, error } = await servicio.auth.admin.mfa.listFactors({
    userId: usuarioId,
  })
  if (error) {
    throw new ErrorBootstrap(
      `No se pudieron leer los factores: ${error.message}`
    )
  }
  for (const factor of data.factors) {
    const { error: errorBorrado } = await servicio.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: usuarioId,
    })
    if (errorBorrado) {
      throw new ErrorBootstrap(
        `No se pudo borrar un factor: ${errorBorrado.message}`
      )
    }
  }
}

/**
 * Enrola y verifica un TOTP como lo haría el usuario (ingreso con contraseña
 * + `mfa.enroll` + `challengeAndVerify`) y devuelve la clave base32.
 */
async function enrolarTotp(
  entorno: EntornoBootstrap,
  email: string,
  password: string
): Promise<string> {
  const publico = crearClientePublico(entorno)
  const ingreso = await publico.auth.signInWithPassword({ email, password })
  if (ingreso.error) {
    throw new ErrorBootstrap(`No se pudo ingresar: ${ingreso.error.message}`)
  }
  const secreto = await enrolarTotpEnSesion(publico, "AMO E2E")
  await publico.auth.signOut({ scope: "local" })
  return secreto
}

/**
 * Garantiza un TOTP verificado cuya clave conocemos. Si la clave ya está en el
 * entorno y el factor existe, no hace nada; si falta alguna de las dos, borra
 * los factores y enrola uno nuevo (devuelve la clave nueva).
 */
export async function asegurarTotp(
  entorno: EntornoBootstrap,
  servicio: ClienteSupabase,
  usuarioId: string,
  credenciales: { email: string; password: string },
  secretoConocido: string | undefined
): Promise<string> {
  if (secretoConocido && (await tieneTotpVerificado(servicio, usuarioId))) {
    return secretoConocido
  }
  if (secretoConocido) {
    throw new ErrorBootstrap(
      `${VARIABLE_TOTP_ADMIN} está en .env.local pero la cuenta no tiene ese factor: borra la línea y vuelve a ejecutar.`
    )
  }
  await borrarFactores(servicio, usuarioId)
  return enrolarTotp(entorno, credenciales.email, credenciales.password)
}

/**
 * Devuelve una cuenta al estado inicial de las pruebas (contraseña de
 * `.env.local`, rol, estado y cambio obligatorio) tras una prueba que la modifica.
 */
export async function restablecerCuenta(
  entorno: EntornoBootstrap,
  clave: CuentaE2E["clave"]
): Promise<void> {
  const cuenta = cuentaE2E(clave)
  const password = process.env[cuenta.variablePassword]
  if (!password) {
    throw new ErrorBootstrap(
      `Falta ${cuenta.variablePassword}: ejecuta \`pnpm exec tsx scripts/bootstrap/usuarios-e2e.ts\`.`
    )
  }
  await prepararCuenta(await clienteComoSuperadmin(entorno), cuenta, password)
}

/** Administrador invitado para probar el primer ingreso completo. */
export const EMAIL_INVITADO_E2E = "e2e.invitado@amo.test"
export const NOMBRE_INVITADO_E2E = "Invitada E2E"

/**
 * Invitación nueva como la haría un administrador: borra la cuenta anterior
 * (si existe), genera el enlace `invite`, asigna el rol ADMIN y deja el
 * perfil INVITADO. Devuelve la ruta `/auth/confirm?…` (sin el origen).
 */
export async function prepararInvitacionE2E(
  entorno: EntornoBootstrap
): Promise<string> {
  const servicio = await clienteComoSuperadmin(entorno)
  const anterior = await buscarUsuarioPorEmail(servicio, EMAIL_INVITADO_E2E)
  if (anterior) {
    const { error } = await servicio.auth.admin.deleteUser(anterior.id)
    if (error) {
      throw new ErrorBootstrap(
        `No se pudo borrar la invitación anterior: ${error.message}`
      )
    }
  }

  const { data, error } = await servicio.auth.admin.generateLink({
    type: "invite",
    email: EMAIL_INVITADO_E2E,
  })
  if (error) throw new ErrorBootstrap(`No se pudo invitar: ${error.message}`)
  const { error: errorMetadatos } = await servicio.auth.admin.updateUserById(
    data.user.id,
    { app_metadata: { rol: "ADMIN" } }
  )
  if (errorMetadatos) {
    throw new ErrorBootstrap(
      `No se pudo fijar app_metadata: ${errorMetadatos.message}`
    )
  }
  await actualizarPerfil(servicio, data.user.id, {
    nombre: NOMBRE_INVITADO_E2E,
    rol_id: await idDeRol(servicio, "ADMIN"),
    es_demo: true,
  })
  return rutaConfirmacion(data.properties.hashed_token, "invite")
}
