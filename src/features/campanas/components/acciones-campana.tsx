"use client"

import { Archive, CircleSlash, Pencil, Rocket } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useRef, useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Button } from "@/components/ui/button"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import type { ResultadoAccion } from "@/lib/result"

import { activarCampana, archivarCampana, cancelarCampana } from "../actions"
import type { AccionCampana, AccionDisponible } from "../reglas"
import { RUTA_MIS_CAMPANAS, rutaEditarCampana } from "../rutas"
import type { EstadoCampana } from "../tipos"

/** Motivos frecuentes de una cancelación (un toque llena el campo). */
const SUGERENCIAS_CANCELACION = [
  "Cambió la estrategia de la marca.",
  "El presupuesto se reasignó a otra campaña.",
  "La campaña se aplazó para otra fecha.",
  "La campaña se creó por error.",
] as const

async function conAviso(
  resultado: Promise<ResultadoAccion>,
  mensaje: string,
  descripcion: string
): Promise<ResultadoAccion> {
  const respuesta = await resultado
  if (respuesta.ok) toast.success(mensaje, { description: descripcion })
  return respuesta
}

/**
 * El título de la ficha (h1 de la cabecera que contiene las acciones): destino
 * estable del foco cuando el cambio de estado quita el botón que abrió el
 * diálogo. Se vuelve enfocable solo por programa (fuera del orden de Tab).
 */
function tituloDeLaFicha(desde: HTMLElement | null): HTMLElement | null {
  const titulo =
    desde?.closest("header")?.querySelector<HTMLElement>("h1") ?? null
  if (titulo && !titulo.hasAttribute("tabindex")) titulo.tabIndex = -1
  return titulo
}

/** Texto del diálogo de cancelación (ANU-014): qué la impide y qué arrastra. */
const DESCRIPCION_CANCELACION =
  "Puedes cancelarla si lo que los medios ya aceptaron está verificado o pagado; si alguna publicación sigue en curso, espera a que AMO la verifique. Sus ofertas sin cupos aceptados se cancelan y dejan de verse en el marketplace; las que ya tienen obligaciones con medios se cierran solas. No se puede deshacer."

/** Qué pasa al archivar, según cómo terminó la campaña. */
function descripcionArchivo(estado: EstadoCampana): string {
  return estado === "BORRADOR"
    ? "Sale de «Mis campañas» junto con sus ofertas y ya no podrás activarla. No se puede deshacer."
    : "Sale de «Mis campañas» junto con sus ofertas; el equipo AMO conserva su historial. No se puede deshacer."
}

/**
 * Botones de la cabecera de la campaña: editar, los cambios de estado que
 * permite la máquina de estados y archivar (borrador, cancelada o
 * finalizada). «Activar» con la empresa sin verificar se muestra
 * deshabilitado pero enfocable, con el porqué asociado al botón. Cada fallo
 * de la BD se muestra dentro de su diálogo; archivada, se vuelve al listado.
 * Tras un cambio de estado el botón que abrió el diálogo puede desaparecer: el
 * foco va al título de la ficha y no se pierde en <body>; si se cierra sin
 * cambiar nada, vuelve al botón.
 */
export function AccionesCampana({
  campana,
  acciones,
  puedeEditar,
}: {
  campana: { id: string; nombre: string; estado: EstadoCampana }
  acciones: readonly AccionDisponible[]
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [abierta, setAbierta] = useState<AccionCampana | null>(null)
  const idBloqueo = useId()
  const raiz = useRef<HTMLDivElement>(null)
  // La última confirmación cambió el estado (y quizá quitó su botón).
  const cambio = useRef(false)
  const activar = acciones.find((accion) => accion.accion === "activar")
  const cancelar = acciones.find((accion) => accion.accion === "cancelar")
  const archivar = acciones.find((accion) => accion.accion === "archivar")
  if (!puedeEditar && acciones.length === 0) return null

  const cerrar = (abierto: boolean) => {
    if (!abierto) setAbierta(null)
  }
  const confirmar = async (
    accion: Promise<ResultadoAccion>,
    mensaje: string
  ): Promise<ResultadoAccion> => {
    // Si la ficha se refresca antes de que la acción responda, el cambio ya
    // ocurrió; un fallo deja el diálogo abierto y lo desmarca.
    cambio.current = true
    try {
      const respuesta = await conAviso(accion, mensaje, campana.nombre)
      cambio.current = respuesta.ok
      return respuesta
    } catch (error) {
      cambio.current = false
      throw error
    }
  }
  const focoAlCerrar = () => {
    if (!cambio.current) return null
    cambio.current = false
    return tituloDeLaFicha(raiz.current)
  }

  return (
    <div ref={raiz} className="flex flex-col gap-2 lg:items-end">
      <div className="flex flex-wrap gap-2 lg:justify-end">
        {activar ? (
          <Button
            type="button"
            disabled={activar.bloqueo !== null}
            focusableWhenDisabled
            aria-describedby={activar.bloqueo ? idBloqueo : undefined}
            // Enfocable aunque esté deshabilitado: no hay `:disabled` que lo atenúe.
            className="data-disabled:cursor-not-allowed data-disabled:opacity-50"
            onClick={() => setAbierta("activar")}
          >
            <Rocket data-icon="inline-start" aria-hidden />
            Activar campaña
          </Button>
        ) : null}
        {puedeEditar ? (
          <EnlaceBoton href={rutaEditarCampana(campana.id)} variant="outline">
            <Pencil data-icon="inline-start" aria-hidden />
            Editar
          </EnlaceBoton>
        ) : null}
        {cancelar ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setAbierta("cancelar")}
          >
            <CircleSlash data-icon="inline-start" aria-hidden />
            Cancelar campaña
          </Button>
        ) : null}
        {archivar ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setAbierta("archivar")}
          >
            <Archive data-icon="inline-start" aria-hidden />
            Archivar campaña
          </Button>
        ) : null}
      </div>
      {activar?.bloqueo ? (
        <p
          id={idBloqueo}
          className="max-w-xs text-xs text-pretty text-muted-foreground lg:text-right"
        >
          {activar.bloqueo}
        </p>
      ) : null}

      <DialogoConfirmacion
        abierto={abierta === "activar"}
        onAbiertoChange={cerrar}
        titulo="¿Activar la campaña?"
        descripcion="Al activarla podrás enviar sus ofertas a revisión para que AMO las publique. Una campaña activa no vuelve a borrador: si necesitas detenerla, la cancelas."
        textoConfirmar="Activar campaña"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={() =>
          confirmar(
            activarCampana({ campanaId: campana.id }),
            "Campaña activada"
          )
        }
      />
      <DialogoMotivo
        abierto={abierta === "cancelar"}
        onAbiertoChange={cerrar}
        titulo={`¿Cancelar «${campana.nombre}»?`}
        descripcion={DESCRIPCION_CANCELACION}
        textoConfirmar="Cancelar campaña"
        textoCancelar="Volver"
        destructivo
        etiqueta="Motivo de la cancelación"
        placeholder="Cuéntanos por qué cancelas la campaña."
        ayuda="Queda en el historial de la campaña y lo ve el equipo de AMO."
        sugerencias={SUGERENCIAS_CANCELACION}
        focoAlCerrar={focoAlCerrar}
        onConfirmar={(motivo) =>
          confirmar(
            cancelarCampana({ campanaId: campana.id, motivo }),
            "Campaña cancelada"
          )
        }
      />
      <DialogoConfirmacion
        abierto={abierta === "archivar"}
        onAbiertoChange={cerrar}
        titulo={`¿Archivar «${campana.nombre}»?`}
        descripcion={descripcionArchivo(campana.estado)}
        textoConfirmar="Archivar campaña"
        textoCancelar="Conservar"
        destructivo
        focoAlCerrar={focoAlCerrar}
        onConfirmar={async () => {
          const respuesta = await confirmar(
            archivarCampana({ campanaId: campana.id }),
            "Campaña archivada"
          )
          // La ficha ya no existe: de vuelta al listado, sin dejarla en el historial.
          if (respuesta.ok) router.replace(RUTA_MIS_CAMPANAS)
          return respuesta
        }}
      />
    </div>
  )
}
