import { History } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"

import { actividadPropia } from "../queries"
import { ListaActividad } from "./lista-actividad"
import { SeccionCuenta } from "./seccion-cuenta"

/**
 * Actividad reciente propia desde la bitácora (`mi_actividad`: sin el detalle
 * de los cambios). Útil para reconocer acciones que no hiciste.
 */
export async function TarjetaActividad({ usuarioId }: { usuarioId: string }) {
  const pagina = await actividadPropia()

  return (
    <SeccionCuenta
      id="actividad"
      titulo="Actividad reciente"
      icono={History}
      descripcion="Lo que hiciste en AMO, con el dispositivo y el lugar desde donde lo hiciste."
    >
      {pagina.eventos.length === 0 ? (
        <EstadoVacio
          variante="simple"
          icono={History}
          titulo="Aún no hay actividad"
          descripcion="Cuando cambies datos, exportes reportes o ajustes tu seguridad, lo verás aquí."
          className="py-6"
        />
      ) : (
        // Tras un `refresh()` (p. ej. al cambiar la contraseña) llega un evento
        // nuevo: la clave vuelve a montar la lista con la primera página al día.
        <ListaActividad
          key={pagina.eventos[0]?.id}
          inicial={pagina}
          usuarioId={usuarioId}
        />
      )}
    </SeccionCuenta>
  )
}
