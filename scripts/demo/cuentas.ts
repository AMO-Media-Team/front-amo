/**
 * Cuentas de los datos demo (docs/modelo-datos.md §10.2). Módulo puro: la
 * lista debe coincidir con la que espera `private.demo_actores`
 * (supabase/seed/demo/02_actores.sql), que vincula cada correo con su rol y
 * su organización.
 *
 * - Cinco cuentas con nombre (`demo.<rol>@amo.test`), cuyas credenciales se
 *   guardan en `.env.local` como `DEMO_*` para poder ingresar a la demo.
 * - El resto (`@demo.amo.co`) solo da identidad a los actores históricos:
 *   su contraseña es aleatoria y no se guarda.
 *
 * `@amo.test` y `@demo.amo.co` no reciben correo. Las cuentas E2E
 * (`e2e.*@amo.test`) NO son parte de la demo y la purga no las toca.
 */
export type ClaseDemo =
  "ADMIN" | "OPERACIONES" | "FINANZAS" | "ANUNCIANTE" | "MEDIO"

export interface CuentaDemo {
  email: string
  clase: ClaseDemo
  /** Prefijo de sus variables en `.env.local` (solo las cuentas con nombre). */
  variable: string | null
  /** Rol interno: exige verificación en dos pasos (se enrola un TOTP). */
  conTotp: boolean
}

export const TOTAL_ANUNCIANTES = 40
export const ANUNCIANTES_CON_SEGUNDO_USUARIO = 15
export const TOTAL_MEDIOS = 300

const CON_NOMBRE: readonly CuentaDemo[] = [
  {
    email: "demo.admin@amo.test",
    clase: "ADMIN",
    variable: "DEMO_ADMIN",
    conTotp: true,
  },
  {
    email: "demo.operaciones@amo.test",
    clase: "OPERACIONES",
    variable: "DEMO_OPERACIONES",
    conTotp: true,
  },
  {
    email: "demo.finanzas@amo.test",
    clase: "FINANZAS",
    variable: "DEMO_FINANZAS",
    conTotp: true,
  },
  {
    email: "demo.anunciante@amo.test",
    clase: "ANUNCIANTE",
    variable: "DEMO_ANUNCIANTE",
    conTotp: false,
  },
  {
    email: "demo.medio@amo.test",
    clase: "MEDIO",
    variable: "DEMO_MEDIO",
    conTotp: false,
  },
]

function relleno(numero: number, ancho: number): string {
  return String(numero).padStart(ancho, "0")
}

function anonima(email: string, clase: ClaseDemo): CuentaDemo {
  return { email, clase, variable: null, conTotp: false }
}

/** Todas las cuentas demo, sin repetir correos. */
export function cuentasDemo(): CuentaDemo[] {
  const cuentas: CuentaDemo[] = [
    ...CON_NOMBRE,
    anonima("equipo-operaciones-1@demo.amo.co", "OPERACIONES"),
    anonima("equipo-operaciones-2@demo.amo.co", "OPERACIONES"),
    anonima("equipo-finanzas-1@demo.amo.co", "FINANZAS"),
  ]
  for (let n = 1; n <= TOTAL_ANUNCIANTES; n++) {
    cuentas.push(
      anonima(`anunciante-${relleno(n, 2)}@demo.amo.co`, "ANUNCIANTE")
    )
    if (n <= ANUNCIANTES_CON_SEGUNDO_USUARIO) {
      cuentas.push(
        anonima(`anunciante-${relleno(n, 2)}-b@demo.amo.co`, "ANUNCIANTE")
      )
    }
  }
  for (let n = 1; n <= TOTAL_MEDIOS; n++) {
    cuentas.push(anonima(`medio-${relleno(n, 3)}@demo.amo.co`, "MEDIO"))
  }
  return cuentas
}

const CORREO_DEMO = /^(?:[a-z0-9-]+@demo\.amo\.co|demo\.[a-z]+@amo\.test)$/

/** ¿El correo pertenece a los datos demo? (nunca una cuenta E2E ni una real). */
export function esCorreoDemo(email: string): boolean {
  return CORREO_DEMO.test(email.trim().toLowerCase())
}

/** Meses `YYYY-MM-01` desde `desde` hasta el mes de `hasta`, ambos incluidos. */
export function mesesEntre(desde: string, hasta: Date): string[] {
  const coincidencia = /^(\d{4})-(\d{2})$/.exec(desde)
  if (!coincidencia) throw new Error(`Mes inválido: ${desde} (usa AAAA-MM).`)
  let anio = Number(coincidencia[1])
  let mes = Number(coincidencia[2])
  if (mes < 1 || mes > 12) throw new Error(`Mes inválido: ${desde}.`)
  // El mes civil de Bogotá (UTC−5, sin horario de verano).
  const bogota = new Date(hasta.getTime() - 5 * 3_600_000)
  const anioFin = bogota.getUTCFullYear()
  const mesFin = bogota.getUTCMonth() + 1
  const meses: string[] = []
  while (anio < anioFin || (anio === anioFin && mes <= mesFin)) {
    meses.push(`${anio}-${relleno(mes, 2)}-01`)
    mes += 1
    if (mes > 12) {
      mes = 1
      anio += 1
    }
  }
  return meses
}
