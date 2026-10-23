import "server-only"

import { requerirUsuario } from "@/lib/auth/dal"

import { estaEnCurso, SEGMENTOS_MIS_CAMPANAS } from "../estados"
import { medioSuspendido } from "../queries"
import { AvisoSuspensionMedio } from "./aviso-suspension"
import {
  TableroCampanasCliente,
  type TableroMisCampanasProps,
} from "./tablero-cliente"

export type { TableroMisCampanasProps }

/**
 * Tablero de «Mis campañas» (Server Component): el tablero por estado
 * (`TableroCampanasCliente`) con, encima, el aviso de suspensión del medio
 * (D73: lo que tiene en curso lo sigue cumpliendo mientras el equipo AMO no le
 * avise que se cancela). La suspensión es un dato de apoyo: si no se puede
 * leer, el tablero se muestra sin el aviso.
 */
export async function TableroMisCampanasMedio(props: TableroMisCampanasProps) {
  const usuario = await requerirUsuario()
  const suspendido = await medioSuspendido(usuario.medioId)
  if (!suspendido) return <TableroCampanasCliente {...props} />
  const enCurso = SEGMENTOS_MIS_CAMPANAS.some((segmento) =>
    props.tablero[segmento].some((tarjeta) => estaEnCurso(tarjeta.estado))
  )
  return (
    <div className="flex flex-col gap-4">
      <AvisoSuspensionMedio enCurso={enCurso} />
      <TableroCampanasCliente {...props} />
    </div>
  )
}
