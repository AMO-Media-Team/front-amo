/**
 * Operador SUPERADMIN efímero para las transiciones de perfiles que exige
 * `transicionar_srv`: un actor humano ACTIVO con sesión viva en aal2
 * (docs/modelo-datos.md §5.2), distinto de la cuenta afectada. Los scripts de
 * arranque no tienen esa sesión, así que crean una cuenta demo, la activan,
 * ingresan, enrolan un TOTP (aal2), ejecutan la acción y la borran.
 *
 * Antes de borrarla la degradan a ADMIN: Auth no puede borrar un SUPERADMIN
 * mientras haya otros activos (`fn_guardar_perfil`, regla 2). La contraseña y
 * el TOTP son aleatorios y no salen del proceso.
 */
import { randomUUID } from "node:crypto"

import { generarContrasena } from "./contrasena"
import { enrolarTotpEnSesion } from "./mfa"
import {
  activarPerfil,
  actualizarPerfil,
  type ClienteSupabase,
  crearClientePublico,
  type EntornoBootstrap,
  ErrorBootstrap,
  idDeRol,
} from "./supabase"

/** Lo que `validar_actor` revalida en cada `*_srv`. */
export interface OperadorTemporal {
  usuarioId: string
  sesionId: string
}

interface CuentaOperador {
  usuarioId: string
  email: string
  password: string
}

async function crearOperador(
  servicio: ClienteSupabase
): Promise<CuentaOperador> {
  const email = `e2e.operador-${randomUUID().slice(0, 8)}@amo.test`
  const password = generarContrasena()
  const { data, error } = await servicio.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { rol: "SUPERADMIN" },
  })
  if (error) {
    throw new ErrorBootstrap(
      `No se pudo crear el operador temporal: ${error.message}`
    )
  }
  return { usuarioId: data.user.id, email, password }
}

/** Rol, activación y sesión aal2 (como la gestión de usuarios y el primer ingreso). */
async function habilitarOperador(
  entorno: EntornoBootstrap,
  servicio: ClienteSupabase,
  cuenta: CuentaOperador
): Promise<OperadorTemporal> {
  await actualizarPerfil(servicio, cuenta.usuarioId, {
    nombre: "Operador temporal E2E",
    rol_id: await idDeRol(servicio, "SUPERADMIN"),
    debe_cambiar_password: false,
    es_demo: true,
  })
  await activarPerfil(servicio, cuenta.usuarioId)

  const cliente = crearClientePublico(entorno)
  const ingreso = await cliente.auth.signInWithPassword({
    email: cuenta.email,
    password: cuenta.password,
  })
  if (ingreso.error) {
    throw new ErrorBootstrap(
      `El operador temporal no pudo ingresar: ${ingreso.error.message}`
    )
  }
  await enrolarTotpEnSesion(cliente, "AMO operador temporal")
  const { data, error } = await cliente.auth.getClaims()
  if (error || !data) {
    throw new ErrorBootstrap(
      `No se pudo leer la sesión del operador temporal: ${error?.message ?? "sin claims"}`
    )
  }
  return { usuarioId: cuenta.usuarioId, sesionId: data.claims.session_id }
}

async function retirarOperador(
  servicio: ClienteSupabase,
  cuenta: CuentaOperador
): Promise<void> {
  await actualizarPerfil(servicio, cuenta.usuarioId, {
    rol_id: await idDeRol(servicio, "ADMIN"),
  })
  const { error } = await servicio.auth.admin.deleteUser(cuenta.usuarioId)
  if (error) {
    throw new ErrorBootstrap(
      `No se pudo borrar el operador temporal ${cuenta.email}: ${error.message}. Bórralo desde Usuarios.`
    )
  }
}

/**
 * Ejecuta `accion` con un operador temporal. `servicio` debe actuar como el
 * superadministrador (`clienteComoSuperadmin`): solo un SUPERADMIN asigna ese
 * rol. El operador se borra siempre; si la acción falló, prevalece su error.
 */
export async function conOperadorTemporal<T>(
  entorno: EntornoBootstrap,
  servicio: ClienteSupabase,
  accion: (operador: OperadorTemporal) => Promise<T>
): Promise<T> {
  const cuenta = await crearOperador(servicio)
  let resultado: T
  try {
    resultado = await accion(
      await habilitarOperador(entorno, servicio, cuenta)
    )
  } catch (error) {
    await retirarOperador(servicio, cuenta).catch((errorRetiro: unknown) => {
      process.stderr.write(
        `${errorRetiro instanceof Error ? errorRetiro.message : String(errorRetiro)}\n`
      )
    })
    throw error
  }
  await retirarOperador(servicio, cuenta)
  return resultado
}
