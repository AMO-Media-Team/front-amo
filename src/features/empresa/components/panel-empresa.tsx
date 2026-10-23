import { Info } from "lucide-react"

import { Nota } from "@/features/documentos-medio/components/avisos"

import type { DatosMiEmpresa } from "../tipos"
import { vistaVerificacion } from "../verificacion"
import { BotonEnviarVerificacion } from "./boton-enviar-verificacion"
import { FormularioContacto } from "./formulario-contacto"
import { FormularioEmpresa } from "./formulario-empresa"
import { LogoEmpresa } from "./logo-empresa"
import { TarjetaVerificacion } from "./tarjeta-verificacion"

/**
 * «Mi empresa»: la verificación (qué falta y el envío), los datos de la
 * empresa, la persona de contacto y, al lado, el logo. En el celular, una
 * columna en orden de prioridad; desde `lg`, el logo en la columna derecha.
 */
export function PanelEmpresa({ datos }: { datos: DatosMiEmpresa }) {
  const { empresa, contacto, catalogos, documentos } = datos
  const vista = vistaVerificacion({ empresa, contacto, documentos })

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-5">
        <TarjetaVerificacion
          situacion={vista.situacion}
          pasos={vista.pasos ?? undefined}
          progreso={vista.progreso ?? undefined}
          acciones={
            vista.envio ? (
              <BotonEnviarVerificacion
                faltantes={vista.faltantes}
                reenvio={vista.envio.reenvio}
              />
            ) : vista.situacion.tipo === "en-revision" ? (
              <Nota tono="info" icono={Info}>
                Si te pedimos corregir un documento, cárgalo de nuevo en
                Documentos: no hace falta volver a enviar tu empresa.
              </Nota>
            ) : null
          }
        />
        <FormularioEmpresa
          empresa={empresa}
          catalogos={catalogos}
          identificacionBloqueada={vista.identificacionBloqueada}
        />
        <FormularioContacto contacto={contacto} />
      </div>
      <aside className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-20">
        <LogoEmpresa
          nombre={empresa.nombreComercial}
          logoUrl={empresa.logoUrl}
          tieneLogo={empresa.tieneLogo}
        />
      </aside>
    </div>
  )
}
