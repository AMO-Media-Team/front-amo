import "server-only"

/**
 * Lecturas de «Mi medio › Cuentas sociales» (MED-005, MED-006). Las cuentas,
 * sus verificaciones y las franjas se leen con la sesión del medio (la RLS solo
 * le muestra lo suyo). De las verificaciones solo sale si tienen captura,
 * nunca la ruta ni la huella del código.
 *
 * Los parámetros de vigencia y del código no son públicos en `configuracion`
 * (solo `medios.umbral_seguidores` lo es): se leen como servicio, tras la
 * compuerta del DAL de la página o la acción, porque no son datos sensibles y
 * el medio necesita conocerlos. Si no se pueden leer rigen los valores de la
 * semilla (docs/modelo-datos.md §7).
 */
import { cache } from "react"

import { mimeDeArchivo } from "@/lib/archivos/mime"
import { crearClienteAdminOpcional } from "@/lib/supabase/admin"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { Json } from "@/types/database.types"

import { ordenarCuentas } from "./estado-cuenta"
import type {
  CuentaMedio,
  FranjaSeguidores,
  PanelCuentas,
  ParametrosVerificacion,
  VerificacionCuentaMedio,
} from "./tipos"

/** Intentos por cuenta que se muestran en su historial. */
export const MAX_HISTORIAL = 10
/** Tope de la lectura de verificaciones del medio (las más recientes). */
const MAX_VERIFICACIONES = 500

interface ErrorConsulta {
  code?: string | null
}

function fallar(operacion: string, error: ErrorConsulta): never {
  throw new Error(`No se pudo ${operacion} (${error.code ?? "sin código"}).`)
}

// ── Parámetros ──────────────────────────────────────────────────────────────

/** Semilla de `configuracion` (docs/modelo-datos.md §7). */
export const PARAMETROS_POR_DEFECTO: ParametrosVerificacion = {
  diasVigencia: 30,
  diasGracia: 7,
  minutosCodigo: 60,
  umbralSeguidores: 30_000,
}

const CLAVES_PARAMETROS: Readonly<
  Record<keyof ParametrosVerificacion, string>
> = {
  diasVigencia: "medios.reverificacion_dias",
  diasGracia: "medios.reverificacion_gracia_dias",
  minutosCodigo: "medios.codigo_verificacion_minutos",
  umbralSeguidores: "medios.umbral_seguidores",
}

function comoEntero(valor: Json | undefined, respaldo: number): number {
  const numero = typeof valor === "string" ? Number(valor) : valor
  return typeof numero === "number" && Number.isInteger(numero) && numero > 0
    ? numero
    : respaldo
}

/** Parámetros vigentes de la verificación (una lectura por solicitud). */
export const parametrosVerificacion = cache(
  async (): Promise<ParametrosVerificacion> => {
    const admin = await crearClienteAdminOpcional()
    if (!admin) return PARAMETROS_POR_DEFECTO
    const { data, error } = await admin
      .from("configuracion")
      .select("clave, valor")
      .in("clave", Object.values(CLAVES_PARAMETROS))
    if (error) {
      console.error(
        `[cuentas-medio] leer parámetros falló (${error.code ?? "sin código"})`
      )
      return PARAMETROS_POR_DEFECTO
    }
    const valores = new Map(data.map((fila) => [fila.clave, fila.valor]))
    return {
      diasVigencia: comoEntero(
        valores.get(CLAVES_PARAMETROS.diasVigencia),
        PARAMETROS_POR_DEFECTO.diasVigencia
      ),
      diasGracia: comoEntero(
        valores.get(CLAVES_PARAMETROS.diasGracia),
        PARAMETROS_POR_DEFECTO.diasGracia
      ),
      minutosCodigo: comoEntero(
        valores.get(CLAVES_PARAMETROS.minutosCodigo),
        PARAMETROS_POR_DEFECTO.minutosCodigo
      ),
      umbralSeguidores: comoEntero(
        valores.get(CLAVES_PARAMETROS.umbralSeguidores),
        PARAMETROS_POR_DEFECTO.umbralSeguidores
      ),
    }
  }
)

// ── Cuentas ─────────────────────────────────────────────────────────────────

type FilaVerificacion = {
  id: string
  cuenta_social_id: string
  metodo: VerificacionCuentaMedio["metodo"]
  estado_validacion: VerificacionCuentaMedio["estado"]
  seguidores_reportados: number
  seguidores_verificados: number | null
  captura_path: string | null
  codigo_expira_at: string | null
  observaciones: string | null
  created_at: string
  validada_at: string | null
}

/** MIME por la extensión de la ruta: el visor lo necesita y la ruta no se expone. */
function tipoDeCaptura(ruta: string | null): string | null {
  if (!ruta) return null
  return mimeDeArchivo({ name: ruta, type: "" }) || null
}

function aVerificacion(fila: FilaVerificacion): VerificacionCuentaMedio {
  return {
    id: fila.id,
    metodo: fila.metodo,
    estado: fila.estado_validacion,
    seguidoresReportados: fila.seguidores_reportados,
    seguidoresVerificados: fila.seguidores_verificados,
    tieneCaptura: fila.captura_path !== null,
    capturaTipo: tipoDeCaptura(fila.captura_path),
    codigoExpiraAt: fila.codigo_expira_at,
    observaciones: fila.observaciones,
    creadaAt: fila.created_at,
    validadaAt: fila.validada_at,
  }
}

/** Historial por cuenta, del intento más reciente al más antiguo. */
function agruparPorCuenta(
  filas: readonly FilaVerificacion[]
): Map<string, VerificacionCuentaMedio[]> {
  const porCuenta = new Map<string, VerificacionCuentaMedio[]>()
  for (const fila of filas) {
    const lista = porCuenta.get(fila.cuenta_social_id) ?? []
    if (lista.length < MAX_HISTORIAL) lista.push(aVerificacion(fila))
    porCuenta.set(fila.cuenta_social_id, lista)
  }
  return porCuenta
}

/** Franjas activas de seguidores, de la menor a la mayor. */
export const franjasActivas = cache(async (): Promise<FranjaSeguidores[]> => {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("franjas")
    .select("id, clave, nombre, seguidores_min, seguidores_max")
    .eq("activa", true)
    .order("seguidores_min")
  if (error) fallar("leer las franjas", error)
  return data.map((franja) => ({
    id: franja.id,
    clave: franja.clave,
    nombre: franja.nombre,
    seguidoresMin: franja.seguidores_min,
    seguidoresMax: franja.seguidores_max,
  }))
})

/** Cuentas sociales del medio con su historial de verificaciones. */
export const panelCuentas = cache(
  async (medioId: string): Promise<PanelCuentas> => {
    const supabase = await crearClienteServidor()
    const [cuentas, verificaciones, franjas, parametros] = await Promise.all([
      supabase
        .from("cuentas_sociales")
        .select(
          `id, plataforma, handle, url, tarifa_referencia, verificada, seguidores_verificados, franja_id,
           metodo_verificacion, fecha_ultima_verificacion, created_at, updated_at`
        )
        .eq("medio_id", medioId)
        .is("deleted_at", null)
        .order("created_at"),
      supabase
        .from("verificaciones_cuenta")
        .select(
          `id, cuenta_social_id, metodo, estado_validacion, seguidores_reportados, seguidores_verificados,
           captura_path, codigo_expira_at, observaciones, created_at, validada_at`
        )
        .eq("medio_id", medioId)
        .order("created_at", { ascending: false })
        .limit(MAX_VERIFICACIONES),
      franjasActivas(),
      parametrosVerificacion(),
    ])
    if (cuentas.error) fallar("leer las cuentas sociales", cuentas.error)
    if (verificaciones.error) {
      fallar("leer las verificaciones", verificaciones.error)
    }

    const historial = agruparPorCuenta(verificaciones.data)
    const porId = new Map(franjas.map((franja) => [franja.id, franja]))
    const lista = cuentas.data.map((cuenta): CuentaMedio => {
      const franja = cuenta.franja_id ? porId.get(cuenta.franja_id) : null
      return {
        id: cuenta.id,
        plataforma: cuenta.plataforma,
        handle: cuenta.handle,
        url: cuenta.url,
        tarifaReferencia: cuenta.tarifa_referencia,
        verificada: cuenta.verificada,
        seguidoresVerificados: cuenta.seguidores_verificados,
        franja: franja ? { clave: franja.clave, nombre: franja.nombre } : null,
        metodoVerificacion: cuenta.metodo_verificacion,
        ultimaVerificacionAt: cuenta.fecha_ultima_verificacion,
        creadaAt: cuenta.created_at,
        actualizadaAt: cuenta.updated_at,
        verificaciones: historial.get(cuenta.id) ?? [],
      }
    })
    return { cuentas: ordenarCuentas(lista), franjas, parametros }
  }
)
