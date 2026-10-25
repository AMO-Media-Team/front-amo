import type { Metadata } from "next"

import { NuevaCampanaAsistida } from "@/features/campanas/components/paginas"
import { UUID } from "@/features/operacion/components/ficha"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Nueva campaña" }

/**
 * Alta de una campaña por cuenta de un anunciante (ADM-014): el equipo AMO
 * elige la empresa (`?anunciante=<id>` la trae preseleccionada desde su
 * ficha) y llena lo mismo que el anunciante. Nace en borrador, marcada como
 * asistida, y la empresa recibe un aviso; la bitácora queda con el operador
 * como actor. Exige TODOS sus permisos (el catálogo no los encadena):
 * gestionar campañas, verlas (la recién creada se vuelve a leer) y ver los
 * anunciantes (el selector). Mientras carga, `loading.tsx`; un fallo al leer
 * lo recoge `(app)/error.tsx`. Tipos de `searchParams` explícitos: la ruta
 * es nueva en esta fase.
 */
export default async function PaginaNuevaCampanaAsistida({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requerirPermiso("campanas.gestionar")
  await requerirPermiso("campanas.ver")
  await requerirPermiso("anunciantes.ver")
  const { anunciante } = await searchParams
  const valor = typeof anunciante === "string" ? anunciante.trim() : ""
  return (
    <NuevaCampanaAsistida
      anuncianteInicial={UUID.test(valor) ? valor.toLowerCase() : null}
    />
  )
}
