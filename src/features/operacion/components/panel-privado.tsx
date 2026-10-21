"use client"

import { Eye, EyeOff, LockKeyhole } from "lucide-react"
import { useEffect, useState } from "react"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"

import { revelarDatosPrivados } from "../actions"
import { type DatoRevelado, grupoPrivado } from "../privados"
import type { EntradaRevelar } from "../schemas"
import { ListaDatos, SinDato, TarjetaFicha } from "./ficha"

/** Los datos revelados se vuelven a ocultar solos tras este tiempo. */
const OCULTAR_TRAS_MS = 120_000

/**
 * Grupo de datos `_privado` (contacto, datos de pago) oculto por defecto.
 * Revelarlo pide confirmación porque queda en la bitácora a nombre de quien
 * consulta (`REVELAR_DATO`, con los campos pedidos); solo lo ve quien tiene
 * `datos_sensibles.ver` y la BD lo vuelve a validar.
 */
export function PanelPrivado({
  entidad,
  id,
  grupo,
  nombre,
}: EntradaRevelar & {
  /** Nombre del medio o anunciante (texto de la confirmación). */
  nombre: string
}) {
  const definicion = grupoPrivado(entidad, grupo)
  const [datos, setDatos] = useState<DatoRevelado[] | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  useEffect(() => {
    if (!datos) return
    const temporizador = window.setTimeout(
      () => setDatos(null),
      OCULTAR_TRAS_MS
    )
    return () => window.clearTimeout(temporizador)
  }, [datos])

  if (!definicion) return null
  const titulo = definicion.titulo

  return (
    <TarjetaFicha
      titulo={titulo}
      icono={LockKeyhole}
      descripcion={
        datos
          ? "Visibles por 2 minutos. La consulta quedó registrada en la bitácora."
          : "Protegidos. Revelarlos queda registrado en la bitácora."
      }
      acciones={
        datos ? (
          <Button variant="outline" size="sm" onClick={() => setDatos(null)}>
            <EyeOff data-icon="inline-start" aria-hidden />
            Ocultar
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmando(true)}
          >
            <Eye data-icon="inline-start" aria-hidden />
            Revelar
          </Button>
        )
      }
    >
      <div aria-live="polite">
        <ListaDatos
          datos={
            datos
              ? datos.map((dato) => ({
                  etiqueta: dato.etiqueta,
                  valor: dato.valor ?? <SinDato>No registrado</SinDato>,
                }))
              : definicion.campos.map((campo) => ({
                  etiqueta: campo.etiqueta,
                  valor: (
                    <span
                      role="img"
                      aria-label="Oculto"
                      className="inline-block h-4 w-28 rounded bg-[repeating-linear-gradient(135deg,var(--muted)_0_6px,transparent_6px_10px)] align-middle"
                    />
                  ),
                }))
          }
        />
      </div>

      <DialogoConfirmacion
        abierto={confirmando}
        onAbiertoChange={setConfirmando}
        titulo={`¿Revelar ${titulo.toLocaleLowerCase("es-CO")}?`}
        descripcion={
          <>
            Verás los datos de <strong>{nombre}</strong>. La consulta queda en
            la bitácora a tu nombre, con los campos consultados. Hazlo solo si
            una gestión lo requiere.
          </>
        }
        textoConfirmar="Revelar"
        onConfirmar={async () => {
          const resultado = await revelarDatosPrivados({ entidad, id, grupo })
          if (resultado.ok) setDatos(resultado.datos.datos)
          return resultado
        }}
      />
    </TarjetaFicha>
  )
}
