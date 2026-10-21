/**
 * Prueba por PostgREST las guardas que exceptúan al owner (`session_user = 'postgres'`) y que por eso
 * no se pueden probar desde supabase/tests/humo_m1_m4.sql: por la API, session_user es `authenticator`.
 *
 * Uso: `pnpm exec tsx scripts/db/probar-guardas-postgrest.ts` (lee .env.local o el entorno).
 * Todas las peticiones deben ser RECHAZADAS; si alguna prospera, revierte el cambio y revisa la guarda.
 * No imprime claves ni secretos.
 */
import { existsSync, readFileSync } from "node:fs"

interface Caso {
  readonly nombre: string
  readonly ruta: string
  readonly metodo: "POST" | "PATCH" | "DELETE"
  readonly cuerpo?: Record<string, unknown>
  readonly esperado: string
}

function variables(): Record<string, string> {
  const archivo = ".env.local"
  const locales = existsSync(archivo)
    ? Object.fromEntries(
        readFileSync(archivo, "utf8")
          .split("\n")
          .map((linea) => linea.match(/^([A-Z_]+)=(.*)$/))
          .filter((m): m is RegExpMatchArray => m !== null)
          .map(([, clave, valor]) => [
            clave,
            valor.trim().replace(/^["']|["']$/g, ""),
          ])
      )
    : {}
  return { ...locales, ...process.env } as Record<string, string>
}

async function mensajeDe(respuesta: Response): Promise<string> {
  const texto = await respuesta.text()
  try {
    const json: unknown = JSON.parse(texto)
    if (json && typeof json === "object" && "message" in json)
      return String(json.message)
  } catch {
    // respuesta sin JSON: se devuelve tal cual
  }
  return texto
}

async function main(): Promise<void> {
  const env = variables()
  const base = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`
  const servicio = {
    apikey: env.SUPABASE_SECRET_KEY,
    "content-type": "application/json",
    prefer: "return=minimal",
  }

  const roles = (await (
    await fetch(`${base}/roles?select=id,clave`, { headers: servicio })
  ).json()) as {
    id: string
    clave: string
  }[]
  const rolId = (clave: string) => roles.find((rol) => rol.clave === clave)?.id

  const casos: Caso[] = [
    {
      nombre: "renombrar rol de sistema",
      ruta: "roles?clave=eq.ADMIN",
      metodo: "PATCH",
      cuerpo: { nombre: "Administrador (prueba)" },
      esperado: "AMO_ROL_SISTEMA",
    },
    {
      nombre: "borrar rol de sistema",
      ruta: "roles?clave=eq.MEDIO",
      metodo: "DELETE",
      esperado: "AMO_ROL_SISTEMA",
    },
    {
      nombre: "crear rol marcado es_sistema",
      ruta: "roles",
      metodo: "POST",
      cuerpo: {
        clave: "PRUEBA_GUARDA",
        nombre: "Prueba",
        tipo: "MEDIO",
        es_sistema: true,
      },
      esperado: "AMO_ROL_SISTEMA",
    },
    {
      nombre: "otorgar permiso a rol de sistema",
      ruta: "rol_permisos",
      metodo: "POST",
      cuerpo: { rol_id: rolId("MEDIO"), permiso_clave: "usuarios.ver" },
      esperado: "AMO_ROL_SISTEMA",
    },
    {
      nombre: "perfil con rol sin actor identificado",
      ruta: "perfiles",
      metodo: "POST",
      cuerpo: {
        id: "00000000-0000-4000-a000-0000000000aa",
        email: "guarda@amo.test",
        rol_id: rolId("ADMIN"),
        estado: "ACTIVO",
      },
      esperado: "AMO_NO_AUTORIZADO",
    },
    {
      nombre: "service_role inserta en bitácora",
      ruta: "bitacora",
      metodo: "POST",
      cuerpo: { entidad: "x", accion: "OTRO", origen: "APP" },
      esperado: "permission denied for table bitacora",
    },
  ]

  let fallos = 0
  for (const caso of casos) {
    const respuesta = await fetch(`${base}/${caso.ruta}`, {
      method: caso.metodo,
      headers: servicio,
      body: caso.cuerpo ? JSON.stringify(caso.cuerpo) : undefined,
    })
    const mensaje = await mensajeDe(respuesta)
    const ok = !respuesta.ok && mensaje.includes(caso.esperado)
    if (!ok) fallos += 1
    console.log(
      `${ok ? "OK   " : "FALLA"} ${caso.nombre}: HTTP ${respuesta.status} ${mensaje}`
    )
  }

  const anon = await fetch(`${base}/paises?select=iso2&limit=1`, {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
  })
  if (anon.ok) fallos += 1
  console.log(
    `${anon.ok ? "FALLA" : "OK   "} anon lee países: HTTP ${anon.status}`
  )

  process.exitCode = fallos === 0 ? 0 : 1
}

void main()
