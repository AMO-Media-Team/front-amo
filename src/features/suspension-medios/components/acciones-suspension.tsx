"use client"

import { Ban, RotateCcw } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"

import {
  consultarAsignacionesEnCurso,
  reactivarMedio,
  suspenderMedio,
} from "../actions"
import {
  EFECTO_REACTIVACION,
  MOTIVOS_REACTIVACION_MEDIO,
  PLACEHOLDER_MOTIVO_MEDIO,
} from "../decision"
import { avisoResultadoSuspension, ID_EN_CURSO_SUSPENDIDO } from "../en-curso"
import { MENSAJES_SUSPENSION } from "../errores"
import type { AccionSuspension } from "../tipos"
import { type CargaEnCurso, DialogoSuspension } from "./dialogo-suspension"

/** Lleva el foco a la lista de la ficha (el aviso tras suspender lo ofrece). */
function irALista() {
  const titulo = document.getElementById(ID_EN_CURSO_SUSPENDIDO)
  titulo?.scrollIntoView({ block: "start" })
  titulo?.focus({ preventScroll: true })
}

/**
 * «Suspender» (VERIFICADO) o «Reactivar» (SUSPENDIDO) en la cabecera de la
 * ficha del medio, siempre con motivo (`medios.suspender`, ADM-002). Al abrir
 * la suspensión carga sus asignaciones en curso para decidir, en la ficha de
 * cada una, si se cancelan; el aviso final dice cuántas quedan. Es un solo
 * botón que cambia de texto: tras confirmar, el foco vuelve a él.
 */
export function AccionesSuspensionMedio({
  medio,
  accion,
  verAsignaciones,
  verDisputas,
}: {
  medio: { id: string; nombre: string }
  /** Lo que la persona puede hacer (`accionSuspension`, en el servidor). */
  accion: AccionSuspension
  /** Con `asignaciones.ver` se listan las que tiene en curso. */
  verAsignaciones: boolean
  verDisputas: boolean
}) {
  const boton = useRef<HTMLButtonElement>(null)
  const solicitud = useRef(0)
  const [dialogo, setDialogo] = useState<AccionSuspension | null>(null)
  const [carga, setCarga] = useState<CargaEnCurso>({ estado: "cargando" })

  function cargarEnCurso() {
    if (!verAsignaciones) {
      setCarga({ estado: "sin_permiso" })
      return
    }
    // Solo cuenta la respuesta de la última consulta (reabrir o reintentar).
    const numero = ++solicitud.current
    setCarga({ estado: "cargando" })
    consultarAsignacionesEnCurso({ medioId: medio.id }).then(
      (resultado) => {
        if (numero !== solicitud.current) return
        setCarga(
          resultado.ok
            ? { estado: "lista", asignaciones: resultado.datos }
            : { estado: "error", mensaje: resultado.error }
        )
      },
      () => {
        if (numero !== solicitud.current) return
        setCarga({
          estado: "error",
          mensaje: MENSAJES_SUSPENSION.enCursoNoDisponible,
        })
      }
    )
  }

  function abrir() {
    if (accion === "suspender") cargarEnCurso()
    setDialogo(accion)
  }

  function cerrar(abierto: boolean) {
    if (!abierto) setDialogo(null)
  }

  const focoAlCerrar = () => boton.current

  return (
    <>
      <Button ref={boton} variant="outline" onClick={abrir}>
        {accion === "suspender" ? (
          <Ban data-icon="inline-start" aria-hidden />
        ) : (
          <RotateCcw data-icon="inline-start" aria-hidden />
        )}
        {accion === "suspender" ? "Suspender" : "Reactivar"}
      </Button>

      <DialogoSuspension
        abierto={dialogo === "suspender"}
        onAbiertoChange={cerrar}
        nombre={medio.nombre}
        carga={carga}
        verDisputas={verDisputas}
        focoAlCerrar={focoAlCerrar}
        onReintentar={cargarEnCurso}
        onConfirmar={async (motivo) => {
          const resultado = await suspenderMedio({ medioId: medio.id, motivo })
          if (resultado.ok) {
            const { enCurso } = resultado.datos
            toast.success(`Suspendiste a ${medio.nombre}`, {
              description: avisoResultadoSuspension(enCurso),
              action:
                enCurso && enCurso.total > 0
                  ? { label: "Ver la lista", onClick: irALista }
                  : undefined,
            })
          }
          return resultado
        }}
      />

      <DialogoMotivo
        abierto={dialogo === "reactivar"}
        onAbiertoChange={cerrar}
        titulo={`¿Reactivar a ${medio.nombre}?`}
        descripcion={EFECTO_REACTIVACION}
        etiqueta="Motivo de la reactivación"
        ayuda="El medio recibe un aviso; el motivo queda en la bitácora."
        sugerencias={MOTIVOS_REACTIVACION_MEDIO}
        placeholder={PLACEHOLDER_MOTIVO_MEDIO}
        textoConfirmar="Reactivar medio"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={async (motivo) => {
          const resultado = await reactivarMedio({ medioId: medio.id, motivo })
          if (resultado.ok) {
            toast.success(`Reactivaste a ${medio.nombre}`, {
              description: "Vuelve a ver las ofertas de su nivel.",
            })
          }
          return resultado
        }}
      />
    </>
  )
}
