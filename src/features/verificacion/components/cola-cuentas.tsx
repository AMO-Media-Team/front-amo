import { Hourglass, UsersRound } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { franjasActivas } from "@/features/cuentas-medio/queries"
import { contar } from "@/features/operacion/formato"

import { COLAS_VERIFICACION } from "../colas"
import { colaCuentas } from "../queries"
import { PaginacionCola } from "./paginacion-cola"
import { RevisorCuentas } from "./revisor-cuentas"

function EsperandoCaptura({ cantidad }: { cantidad: number }) {
  if (cantidad === 0) return null
  return (
    <p className="flex items-start gap-2 rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-pretty text-muted-foreground">
      <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        {contar(cantidad, "verificación espera", "verificaciones esperan")} la
        captura del medio: entran a la cola cuando la carguen.
      </span>
    </p>
  )
}

/** Cuentas con la captura cargada que esperan verificación, la más antigua primero. */
export async function ColaCuentas({ pagina }: { pagina: number }) {
  const [cola, franjas] = await Promise.all([
    colaCuentas(pagina),
    franjasActivas(),
  ])
  if (cola.filas.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EstadoVacio
          icono={UsersRound}
          titulo={COLAS_VERIFICACION.cuentas.vacia}
          descripcion="Cuando un medio cargue la captura de una cuenta, aparecerá aquí para comprobar sus seguidores."
        />
        <EsperandoCaptura cantidad={cola.esperandoCaptura} />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-pretty text-muted-foreground">
        Compara la captura con el perfil público y fija los seguidores que ves.
        Al decidir una cuenta se abre la siguiente.
      </p>
      <RevisorCuentas verificaciones={cola.filas} franjas={franjas} />
      <PaginacionCola cola="cuentas" pagina={cola.pagina} total={cola.total} />
      <EsperandoCaptura cantidad={cola.esperandoCaptura} />
    </div>
  )
}
