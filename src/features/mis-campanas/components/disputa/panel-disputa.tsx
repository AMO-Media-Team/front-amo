"use client"

import { MessagesSquare, RefreshCw, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { type ReactNode, useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { avisoEstadoDisputa } from "@/features/disputas/foco"
import { AvisoFicha } from "@/features/operacion/components/ficha"

import type { AperturaDisputa } from "../../disputa"
import { FormularioDisputa } from "./formulario-disputa"

/** El envío del formulario: abrió la disputa y, si había, mandó las pruebas. */
interface Envio {
  /** Con la que se abrió (el servidor deja de ofrecerla al refrescar). */
  apertura: AperturaDisputa
  /** `null` mientras la acción no responde. */
  disputaId: string | null
  terminado: boolean
  /** Lo que no se pudo mandar con el primer mensaje. */
  aviso: string | null
}

const ENVIADA = {
  reclamo: "Enviamos tu reclamo: el equipo AMO lo revisará.",
  problema: "Enviamos tu reporte: el equipo AMO lo revisará.",
} as const

export interface PanelDisputaProps {
  /** El formulario para abrir una (vista «abrir»); `null` si no se puede. */
  apertura: AperturaDisputa | null
  /** La disputa abierta que conoce el servidor; `null` si no hay. */
  disputaAbiertaId: string | null
  /** `Date.now()` del servidor al pintar (cuenta regresiva del reclamo). */
  ahoraServidor: number
  /** Lo que pinta el servidor: estado, conversación y disputas anteriores. */
  children: ReactNode
}

/**
 * La página de la disputa de una parte (medio o anunciante), del lado del
 * navegador: el formulario para abrirla y, al terminar, lo que pinta el
 * servidor (su estado y la conversación). Abrir la disputa refresca la página
 * en segundo plano, pero desde que empieza el envío el formulario sigue
 * montado hasta mandar las pruebas del primer mensaje (desmontarlo cancelaría
 * la subida del adjunto; si no se pudo abrir, queda como estaba). Después el
 * foco pasa al estado de la disputa, porque el botón que se usó ya no existe.
 * Si algo de las pruebas no se pudo mandar, se avisa junto al hilo, donde se
 * puede volver a enviar.
 */
export function PanelDisputa({
  apertura,
  disputaAbiertaId,
  ahoraServidor,
  children,
}: PanelDisputaProps) {
  const router = useRouter()
  const [envio, setEnvio] = useState<Envio | null>(null)
  const formulario = envio?.apertura ?? apertura
  const enFormulario = envio ? !envio.terminado : apertura !== null
  // El servidor aún no pinta la disputa recién abierta (el refresco no llegó).
  const esperandoHilo =
    envio !== null && envio.terminado && disputaAbiertaId !== envio.disputaId
  const listo = envio !== null && envio.terminado && !esperandoHilo

  useEffect(() => {
    if (esperandoHilo) router.refresh()
  }, [esperandoHilo, router])

  useEffect(() => {
    if (listo) avisoEstadoDisputa()?.focus()
  }, [listo])

  if (enFormulario && formulario) {
    return (
      <div className="flex flex-col gap-5">
        <FormularioDisputa
          apertura={formulario}
          ahoraServidor={ahoraServidor}
          onEnviando={() =>
            setEnvio({
              apertura: formulario,
              disputaId: null,
              terminado: false,
              aviso: null,
            })
          }
          onFallido={() => setEnvio(null)}
          onAbierta={({ disputaId }) =>
            setEnvio((actual) => ({
              apertura: actual?.apertura ?? formulario,
              disputaId,
              terminado: false,
              aviso: null,
            }))
          }
          onTerminado={(aviso) => {
            setEnvio((actual) =>
              actual ? { ...actual, terminado: true, aviso } : actual
            )
            toast.success(ENVIADA[formulario.modo])
          }}
        />
        {/* Las disputas anteriores, mientras el servidor siga ofreciendo abrir otra. */}
        {apertura ? children : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {envio?.aviso ? (
        <AvisoFicha
          tono="aviso"
          icono={TriangleAlert}
          titulo="Tus pruebas no se enviaron"
        >
          {envio.aviso}
        </AvisoFicha>
      ) : null}
      {esperandoHilo ? (
        <div
          role="status"
          className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-2.5 text-sm text-pretty">
            <MessagesSquare
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-primary"
            />
            Quedó abierta. Estamos cargando la conversación…
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
          >
            <RefreshCw data-icon="inline-start" aria-hidden />
            Actualizar
          </Button>
        </div>
      ) : (
        children
      )}
    </div>
  )
}
