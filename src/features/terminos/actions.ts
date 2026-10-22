"use server"

/**
 * Aceptación de términos y política de datos (AUT-012).
 *
 * 1. DAL: solo con el paso `aceptar-terminos` pendiente (`requerirPaso`); con
 *    todo al día lleva al destino y con otro paso, a ese paso.
 * 2. zod sobre el `FormData` del formulario.
 * 3. Se registran las versiones pendientes según la BD en la misma solicitud
 *    (las que evaluó la compuerta), nunca ids arbitrarios de la pantalla.
 * 4. `insert` con el cliente de la sesión: la RLS exige la fila propia y la
 *    versión publicada, y el trigger sella correo, IP y navegador como
 *    constancia. Repetir el envío no duplica nada (`on conflict do nothing`).
 */
import "server-only"

import { refresh } from "next/cache"

import type { EstadoFormulario } from "@/features/auth/acciones-contrato"
import { destinoFinal } from "@/lib/auth/compuertas"
import { requerirPaso } from "@/lib/auth/dal"
import { informarFallo } from "@/lib/auth/registro"
import { interpretarErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
import { desdeErrorZod, exito, fallo } from "@/lib/result"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { TablesInsert } from "@/types/database.types"

import { revisarAceptacion } from "./aceptacion"
import { MENSAJE_CASILLA, textoFaltan } from "./presentacion"
import { esquemaAceptacion, leerFormularioAceptacion } from "./schemas"

const MENSAJE_DESACTUALIZADA =
  "Mientras leías se publicó una versión nueva de un documento. Revísala y acéptala para continuar."

/**
 * `email_sha256`, la IP y el navegador los fija el trigger: `authenticated`
 * solo puede escribir estas dos columnas. Los tipos generados exigen
 * `email_sha256` porque la columna es NOT NULL sin valor por defecto.
 */
type FilaAceptacion = Pick<
  TablesInsert<"aceptaciones_terminos">,
  "perfil_id" | "termino_version_id"
>

export async function aceptarTerminos(
  _estadoPrevio: EstadoFormulario,
  datos: FormData
): Promise<EstadoFormulario> {
  const entrada = esquemaAceptacion.safeParse(leerFormularioAceptacion(datos))
  const siguiente = entrada.success ? entrada.data.siguiente : undefined
  const acceso = await requerirPaso("aceptar-terminos", { siguiente })
  if (!entrada.success) return desdeErrorZod(entrada.error)

  const revision = revisarAceptacion({
    pendientes: acceso.terminosPorAceptar.map(({ id }) => id),
    mostradas: entrada.data.mostradas,
    aceptadas: entrada.data.aceptadas,
  })
  switch (revision.tipo) {
    case "desactualizada":
      // La pantalla vuelve a pintarse con las versiones vigentes.
      refresh()
      return fallo(MENSAJE_DESACTUALIZADA)
    case "incompleta":
      return fallo(
        textoFaltan(revision.faltan.length),
        Object.fromEntries(revision.faltan.map((id) => [id, [MENSAJE_CASILLA]]))
      )
    case "completa":
      break
  }

  const filas: FilaAceptacion[] = revision.versiones.map((id) => ({
    perfil_id: acceso.usuario.id,
    termino_version_id: id,
  }))
  try {
    const supabase = await crearClienteServidor()
    const { error } = await supabase
      .from("aceptaciones_terminos")
      .upsert(filas as TablesInsert<"aceptaciones_terminos">[], {
        onConflict: "perfil_id,termino_version_id",
        ignoreDuplicates: true,
      })
    if (error) {
      const { mensaje, esperado } = interpretarErrorBd(error)
      if (!esperado) informarFallo("aceptarTerminos", error)
      return fallo(mensaje)
    }
  } catch (error) {
    informarFallo("aceptarTerminos", error)
    return fallo(MENSAJE_INESPERADO)
  }
  return exito({ redirigirA: destinoFinal(siguiente, acceso.claims) })
}
