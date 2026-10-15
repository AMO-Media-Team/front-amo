"use server"

/**
 * Server Actions de acceso (contrato en `./acciones-contrato.ts`). Reglas:
 * mensajes genéricos que no revelan si un correo existe, destinos siempre
 * internos y el mismo orden de compuertas que el DAL (docs/modelo-datos.md §2.6).
 * Los eventos de autenticación quedan en `accesos` y las acciones sensibles
 * (activar MFA, cerrar otras sesiones) en la bitácora.
 */
import type { AuthError, User } from "@supabase/supabase-js"

import {
  obtenerClaims,
  requerirPaso,
  requerirSesionDeEnlace,
} from "@/lib/auth/dal"
import {
  type ClaimsSesion,
  type DecisionCompuertas,
  destinoFinal,
  type EstadoCuenta,
  leerClaims,
  resolverCompuertas,
  RUTA_RESTABLECER,
  rutaDePaso,
} from "@/lib/auth/compuertas"
import { destinoTrasIngreso } from "@/lib/auth/navegacion"
import { leerPerfilSesion } from "@/lib/auth/perfil-sesion"
import {
  informarFallo,
  registrarAcceso,
  registrarEvento,
  registrarIngreso,
} from "@/lib/auth/registro"
import { cerrarSesionActual } from "@/lib/auth/sesion"
import { envCliente } from "@/lib/env"
import { getEnvServidor } from "@/lib/env.server"
import { desdeErrorZod, exito, fallo, type ResultadoAccion } from "@/lib/result"
import {
  crearClienteAdmin,
  crearClienteAdminOpcional,
} from "@/lib/supabase/admin"
import {
  type AuthServidor,
  obtenerAuthServidor,
} from "@/lib/supabase/auth-server"
import { obtenerContextoSolicitud } from "@/lib/supabase/contexto"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteConToken } from "@/lib/supabase/server"

import type { EnrolamientoMfa, EstadoFormulario } from "./acciones-contrato"
import { MENSAJES_MOTIVO } from "./components/motivos"
import { claveLimitador } from "./limitador"
import { urlDeDatosSvg } from "./qr"
import {
  esquemaCodigoMfa,
  esquemaConfirmacionEnlace,
  esquemaIngreso,
  esquemaNuevaContrasena,
  esquemaRecuperacion,
  leerFormulario,
} from "./schemas"

const MENSAJES = {
  credenciales: "Correo o contraseña incorrectos.",
  demasiadosIntentos:
    "Hiciste demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.",
  inesperado:
    "No pudimos completar la operación. Intenta de nuevo en unos minutos.",
  codigoIncorrecto:
    "El código no es correcto o ya venció. Escribe el que muestra ahora tu app.",
  sinFactor:
    "No encontramos tu verificación en dos pasos. Configúrala de nuevo para continuar.",
  mismaContrasena: "Elige una contraseña distinta de la anterior.",
  contrasenaDebil:
    "Esa contraseña no es lo bastante segura. Prueba con una más larga y difícil de adivinar.",
  sinSmtp:
    "Si no recibes el correo en unos minutos, contacta a un administrador de AMO para que genere tu enlace de recuperación.",
} as const

/** Origen público para los enlaces de correo (nunca el `Host` de la solicitud: se puede falsificar). */
const SITIO = envCliente.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")

function esLimiteDeTasa(error: AuthError): boolean {
  return error.status === 429 || error.code === "over_request_rate_limit"
}

function minutosDeEspera(segundos: number): string {
  const minutos = Math.max(1, Math.ceil(segundos / 60))
  return minutos === 1 ? "1 minuto" : `${minutos} minutos`
}

function mensajeBloqueo(segundos: number): string {
  return `Hiciste demasiados intentos. Espera ${minutosDeEspera(segundos)} e inténtalo de nuevo.`
}

function tieneTotpVerificado(usuario: User): boolean {
  return (usuario.factors ?? []).some(
    (factor) => factor.factor_type === "totp" && factor.status === "verified"
  )
}

/** Ruta del paso pendiente o, con todo al día, el destino pedido. */
function destinoSegun(
  decision: DecisionCompuertas,
  claims: ClaimsSesion,
  siguiente?: string
): string {
  return decision.tipo === "pendiente"
    ? rutaDePaso(decision.paso, destinoTrasIngreso(siguiente))
    : destinoFinal(siguiente, claims)
}

// ── Limitador de intentos (Postgres, §5.5) ───────────────────────────────────

interface Bloqueo {
  bloqueado: boolean
  reintentarEnS: number
}

/**
 * `clave` sale de `claveLimitador` (un espacio de nombres por flujo). `null`
 * sin secret key (previews): allí solo aplican los límites de Supabase Auth.
 */
async function consultarBloqueo(
  clave: string,
  ip: string | null
): Promise<Bloqueo | null> {
  const admin = await crearClienteAdminOpcional()
  if (!admin) return null
  const { data, error } = await admin.rpc(
    "login_bloqueado_srv",
    argumentosRpc<"login_bloqueado_srv">({ p_email: clave, p_ip: ip })
  )
  if (error) throw error
  const fila = data[0]
  return {
    bloqueado: fila?.bloqueado ?? false,
    reintentarEnS: fila?.reintentar_en_s ?? 0,
  }
}

async function registrarIntento(
  clave: string,
  ip: string | null,
  exitoso: boolean
): Promise<void> {
  const admin = await crearClienteAdminOpcional()
  if (!admin) return
  const { error } = await admin.rpc(
    "registrar_intento_login_srv",
    argumentosRpc<"registrar_intento_login_srv">({
      p_email: clave,
      p_ip: ip,
      p_exito: exitoso,
    })
  )
  if (error) informarFallo("registrar_intento_login_srv", error)
}

// ── Sesión recién emitida (ingreso o enlace) ─────────────────────────────────

interface SesionNueva {
  claims: ClaimsSesion
  cuenta: EstadoCuenta
}

/**
 * Lee claims y perfil con el token recién emitido (las cookies nuevas aún no
 * llegaron al navegador). `null` si el perfil no puede operar.
 */
async function evaluarSesionNueva(
  auth: AuthServidor,
  accessToken: string,
  usuario: User
): Promise<SesionNueva | null> {
  const { data } = await auth.getClaims(accessToken)
  const claims = data ? leerClaims(data.claims) : null
  if (!claims) return null
  const perfil = await leerPerfilSesion(
    await crearClienteConToken(accessToken),
    usuario.id
  )
  if (!perfil?.activo) return null
  return {
    claims,
    cuenta: {
      perfilActivo: true,
      debeCambiarPassword: perfil.debeCambiarPassword,
      rolRequiereMfa: perfil.usuario.rol.requiereMfa,
      aal: claims.aal,
      tieneFactorVerificado: tieneTotpVerificado(usuario),
    },
  }
}

/** Cuenta que no puede operar: se cierra la sesión que Auth acaba de abrir. */
async function rechazarCuentaInactiva(
  auth: AuthServidor,
  usuario: User
): Promise<EstadoFormulario> {
  await registrarAcceso({
    evento: "LOGIN_FALLIDO",
    usuarioId: usuario.id,
    email: usuario.email,
  })
  await auth.signOut({ scope: "local" })
  return fallo(MENSAJES_MOTIVO["cuenta-inactiva"])
}

// ── Acciones ─────────────────────────────────────────────────────────────────

export async function iniciarSesion(
  _estadoPrevio: EstadoFormulario,
  datos: FormData
): Promise<EstadoFormulario> {
  const entrada = esquemaIngreso.safeParse(
    leerFormulario(datos, ["email", "password", "next"])
  )
  if (!entrada.success) return desdeErrorZod(entrada.error)
  const { email, password, next } = entrada.data

  try {
    const { ip } = await obtenerContextoSolicitud()
    const clave = claveLimitador("ingreso", email)
    const bloqueo = await consultarBloqueo(clave, ip)
    if (bloqueo?.bloqueado) {
      await registrarAcceso({ evento: "LOGIN_BLOQUEADO", email })
      return fallo(mensajeBloqueo(bloqueo.reintentarEnS))
    }

    const auth = await obtenerAuthServidor()
    const { data, error } = await auth.signInWithPassword({ email, password })
    await registrarIntento(clave, ip, !error)
    if (error || !data.session) {
      await registrarAcceso({ evento: "LOGIN_FALLIDO", email })
      return fallo(
        error && esLimiteDeTasa(error)
          ? MENSAJES.demasiadosIntentos
          : MENSAJES.credenciales
      )
    }

    const sesion = await evaluarSesionNueva(
      auth,
      data.session.access_token,
      data.user
    )
    if (!sesion) return rechazarCuentaInactiva(auth, data.user)
    await registrarIngreso(sesion.claims)
    return exito({
      redirigirA: destinoSegun(
        resolverCompuertas(sesion.cuenta),
        sesion.claims,
        next
      ),
    })
  } catch (error) {
    informarFallo("iniciarSesion", error)
    return fallo(MENSAJES.inesperado)
  }
}

export async function cerrarSesion(): Promise<ResultadoAccion<null>> {
  const claims = await obtenerClaims()
  const cerrada = await cerrarSesionActual(claims, "CIERRE_SESION")
  return cerrada
    ? exito(null)
    : fallo("No pudimos cerrar la sesión. Intenta de nuevo.")
}

export async function solicitarRecuperacion(
  _estadoPrevio: EstadoFormulario,
  datos: FormData
): Promise<EstadoFormulario> {
  const entrada = esquemaRecuperacion.safeParse(
    leerFormulario(datos, ["email"])
  )
  if (!entrada.success) return desdeErrorZod(entrada.error)
  const { email } = entrada.data

  try {
    const { ip } = await obtenerContextoSolicitud()
    const claveRecuperacion = claveLimitador("recuperacion", email)
    const bloqueos = await Promise.all([
      consultarBloqueo(claveLimitador("ingreso", email), ip),
      consultarBloqueo(claveRecuperacion, ip),
    ])
    // La respuesta es la misma haya o no envío: nada revela si la cuenta existe.
    if (!bloqueos.some((bloqueo) => bloqueo?.bloqueado)) {
      // Cada solicitud cuenta como intento: si no, el limitador nunca frenaría
      // un envío masivo de correos (agotaría la cuota de Auth para todos).
      await registrarIntento(claveRecuperacion, ip, false)
      const auth = await obtenerAuthServidor()
      const { error } = await auth.resetPasswordForEmail(email, {
        redirectTo: `${SITIO}/auth/callback?next=${RUTA_RESTABLECER}`,
      })
      if (error) informarFallo("resetPasswordForEmail", error)
    }
    await registrarAcceso({ evento: "RECUPERACION_SOLICITADA", email })
  } catch (error) {
    informarFallo("solicitarRecuperacion", error)
  }
  const { AMO_SMTP_CONFIGURADO } = getEnvServidor()
  return exito(AMO_SMTP_CONFIGURADO ? {} : { aviso: MENSAJES.sinSmtp })
}

interface CambioContrasena {
  claims: ClaimsSesion
  usuarioId: string
  cuenta: EstadoCuenta
}

function falloDeContrasena(error: AuthError): EstadoFormulario {
  switch (error.code) {
    case "same_password":
      return fallo(MENSAJES.mismaContrasena, {
        password: [MENSAJES.mismaContrasena],
      })
    case "weak_password":
      return fallo(MENSAJES.contrasenaDebil, {
        password: [MENSAJES.contrasenaDebil],
      })
    default:
      informarFallo("updateUser(password)", error)
      return fallo(MENSAJES.inesperado)
  }
}

/**
 * Fija la contraseña nueva y cierra el cambio obligatorio. `debe_cambiar_password`
 * solo pasa a false desde el servidor (trigger guardián, §5.4): se escribe con
 * la secret key y el propio usuario como actor.
 */
async function fijarContrasena(
  auth: AuthServidor,
  cambio: CambioContrasena,
  datos: FormData
): Promise<EstadoFormulario> {
  const entrada = esquemaNuevaContrasena.safeParse(
    leerFormulario(datos, ["password", "confirmacion"])
  )
  if (!entrada.success) return desdeErrorZod(entrada.error)

  const { error } = await auth.updateUser({ password: entrada.data.password })
  if (error) return falloDeContrasena(error)

  if (cambio.cuenta.debeCambiarPassword) {
    const admin = await crearClienteAdmin({ actorId: cambio.usuarioId })
    const { error: errorPerfil } = await admin
      .from("perfiles")
      .update({ debe_cambiar_password: false })
      .eq("id", cambio.usuarioId)
    if (errorPerfil) {
      throw new Error(
        `No se pudo cerrar el cambio obligatorio (${errorPerfil.code}).`
      )
    }
  }
  await registrarAcceso({
    evento: "CONTRASENA_CAMBIADA",
    usuarioId: cambio.usuarioId,
    email: cambio.claims.email,
    sessionId: cambio.claims.sessionId,
    aal: cambio.claims.aal,
  })
  // La cookie queda con un token emitido después del cambio.
  await auth.refreshSession()
  return exito({
    redirigirA: destinoSegun(
      resolverCompuertas({ ...cambio.cuenta, debeCambiarPassword: false }),
      cambio.claims
    ),
  })
}

export async function cambiarContrasenaObligatoria(
  _estadoPrevio: EstadoFormulario,
  datos: FormData
): Promise<EstadoFormulario> {
  const acceso = await requerirPaso("cambiar-contrasena")
  const auth = await obtenerAuthServidor()
  return fijarContrasena(
    auth,
    {
      claims: acceso.claims,
      usuarioId: acceso.usuario.id,
      cuenta: acceso.cuenta,
    },
    datos
  )
}

/**
 * Tras un enlace de recuperación. Además cierra las demás sesiones de la
 * cuenta: si alguien más tenía acceso, lo pierde con la contraseña anterior.
 */
export async function restablecerContrasena(
  _estadoPrevio: EstadoFormulario,
  datos: FormData
): Promise<EstadoFormulario> {
  const acceso = await requerirSesionDeEnlace()
  const auth = await obtenerAuthServidor()
  const resultado = await fijarContrasena(
    auth,
    {
      claims: acceso.claims,
      usuarioId: acceso.usuario.id,
      cuenta: acceso.cuenta,
    },
    datos
  )
  if (!resultado?.ok) return resultado

  const { error } = await auth.signOut({ scope: "others" })
  if (error) informarFallo("signOut(others)", error)
  else {
    await registrarEvento({
      actorId: acceso.usuario.id,
      accion: "CERRAR_SESIONES",
      entidad: "perfiles",
      entidadId: acceso.usuario.id,
      metadatos: { alcance: "otras", motivo: "restablecer_contrasena" },
    })
  }
  return resultado
}

/** Borra enrolamientos TOTP abandonados para poder crear uno nuevo con el mismo nombre. */
async function descartarFactoresSinVerificar(
  auth: AuthServidor
): Promise<void> {
  const { data, error } = await auth.mfa.listFactors()
  if (error) throw error
  const pendientes = data.all.filter(
    (factor) => factor.factor_type === "totp" && factor.status === "unverified"
  )
  for (const factor of pendientes) {
    const { error: errorBorrado } = await auth.mfa.unenroll({
      factorId: factor.id,
    })
    if (errorBorrado) throw errorBorrado
  }
}

export async function iniciarEnrolamientoMfa(): Promise<
  ResultadoAccion<EnrolamientoMfa>
> {
  await requerirPaso("mfa-configurar")
  try {
    const auth = await obtenerAuthServidor()
    await descartarFactoresSinVerificar(auth)
    const { data, error } = await auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "AMO",
      issuer: "AMO",
    })
    if (error) throw error
    return exito({
      factorId: data.id,
      qrSvg: urlDeDatosSvg(data.totp.qr_code),
      secreto: data.totp.secret,
      uri: data.totp.uri,
    })
  } catch (error) {
    informarFallo("mfa.enroll", error)
    return fallo(MENSAJES.inesperado)
  }
}

async function factorTotpVerificado(
  auth: AuthServidor
): Promise<string | null> {
  const { data, error } = await auth.mfa.listFactors()
  if (error) throw error
  return data.totp[0]?.id ?? null
}

interface DatosAccesoMfa {
  usuarioId: string
  email: string | null
  sessionId: string
}

/**
 * Verifica el código con el limitador por cuenta: Supabase Auth solo limita
 * por IP, así que quien conozca la contraseña podría probar códigos desde
 * muchas IP. `null` si el código es correcto; si no, el error para la interfaz.
 */
async function comprobarCodigoMfa(
  datosAcceso: DatosAccesoMfa,
  codigo: string,
  factorIndicado: string | undefined
): Promise<EstadoFormulario | null> {
  const { ip } = await obtenerContextoSolicitud()
  const clave = claveLimitador("mfa", datosAcceso.usuarioId)
  const bloqueo = await consultarBloqueo(clave, ip)
  if (bloqueo?.bloqueado) {
    await registrarAcceso({
      ...datosAcceso,
      evento: "LOGIN_BLOQUEADO",
      aal: "aal1",
    })
    return fallo(mensajeBloqueo(bloqueo.reintentarEnS))
  }

  const auth = await obtenerAuthServidor()
  const factorId = factorIndicado ?? (await factorTotpVerificado(auth))
  if (!factorId) return fallo(MENSAJES.sinFactor)

  const { error } = await auth.mfa.challengeAndVerify({
    factorId,
    code: codigo,
  })
  await registrarIntento(clave, ip, !error)
  if (!error) return null

  await registrarAcceso({ ...datosAcceso, evento: "MFA_FALLIDO", aal: "aal1" })
  return fallo(
    esLimiteDeTasa(error)
      ? MENSAJES.demasiadosIntentos
      : MENSAJES.codigoIncorrecto
  )
}

export async function verificarMfa(
  _estadoPrevio: EstadoFormulario,
  datos: FormData
): Promise<EstadoFormulario> {
  const entrada = esquemaCodigoMfa.safeParse(
    leerFormulario(datos, ["codigo", "factorId", "next"])
  )
  const siguiente = entrada.success ? entrada.data.next : undefined
  const acceso = await requerirPaso(["mfa-verificar", "mfa-configurar"], {
    siguiente,
  })
  if (!entrada.success) return desdeErrorZod(entrada.error)

  const datosAcceso: DatosAccesoMfa = {
    usuarioId: acceso.usuario.id,
    email: acceso.claims.email,
    sessionId: acceso.claims.sessionId,
  }
  try {
    const rechazo = await comprobarCodigoMfa(
      datosAcceso,
      entrada.data.codigo,
      entrada.data.factorId
    )
    if (rechazo) return rechazo
  } catch (error) {
    informarFallo("verificarMfa", error)
    return fallo(MENSAJES.inesperado)
  }

  await registrarAcceso({ ...datosAcceso, evento: "MFA_EXITOSO", aal: "aal2" })
  if (acceso.paso === "mfa-configurar") {
    await registrarEvento({
      actorId: acceso.usuario.id,
      accion: "OTRO",
      entidad: "perfiles",
      entidadId: acceso.usuario.id,
      metadatos: { evento: "MFA_ACTIVADA", factor: "totp" },
    })
  }
  // Coincide con lo que decide la página al volver a renderizarse tras la
  // acción (la sesión cambió): una recuperación continúa en /restablecer.
  const decision = resolverCompuertas({
    ...acceso.cuenta,
    aal: "aal2",
    tieneFactorVerificado: true,
  })
  return exito({
    redirigirA: destinoSegun(decision, acceso.claims, siguiente),
  })
}

async function activarSiEsInvitacion(usuarioId: string): Promise<void> {
  const admin = await crearClienteAdmin()
  const { error } = await admin.rpc("activar_perfil_srv", {
    p_usuario_id: usuarioId,
  })
  if (error) informarFallo("activar_perfil_srv", error)
}

export async function confirmarEnlace(
  _estadoPrevio: EstadoFormulario,
  datos: FormData
): Promise<EstadoFormulario> {
  const entrada = esquemaConfirmacionEnlace.safeParse(
    leerFormulario(datos, ["token_hash", "type", "next"])
  )
  if (!entrada.success) return fallo(MENSAJES_MOTIVO["enlace-invalido"])
  const { token_hash, type, next } = entrada.data

  try {
    const auth = await obtenerAuthServidor()
    const { data, error } = await auth.verifyOtp({ token_hash, type })
    if (error || !data.session || !data.user) {
      return fallo(
        error?.code === "otp_expired"
          ? MENSAJES_MOTIVO["enlace-vencido"]
          : MENSAJES_MOTIVO["enlace-invalido"]
      )
    }
    if (type === "invite") await activarSiEsInvitacion(data.user.id)

    const sesion = await evaluarSesionNueva(
      auth,
      data.session.access_token,
      data.user
    )
    if (!sesion) return rechazarCuentaInactiva(auth, data.user)
    await registrarIngreso(sesion.claims)

    if (type === "recovery") {
      return exito({
        redirigirA: sesion.cuenta.tieneFactorVerificado
          ? rutaDePaso("mfa-verificar", RUTA_RESTABLECER)
          : RUTA_RESTABLECER,
      })
    }
    return exito({
      redirigirA: destinoSegun(
        resolverCompuertas(sesion.cuenta),
        sesion.claims,
        next
      ),
    })
  } catch (error) {
    informarFallo("confirmarEnlace", error)
    return fallo(MENSAJES.inesperado)
  }
}
