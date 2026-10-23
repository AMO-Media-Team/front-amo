import { ArrowRight } from "lucide-react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Nota } from "@/features/documentos-medio/components/avisos"
import type { ResumenDocumentos } from "@/features/documentos-anunciante/situacion"
import { ID_RESUMEN_DOCUMENTOS } from "@/features/documentos-anunciante/textos"
import type { EmpresaDocumentos } from "@/features/documentos-anunciante/tipos"
import { formatearFecha } from "@/lib/format"

import { RUTA_CONTACTO } from "../rutas"
import { puedeEnviar, situacionEmpresa } from "../verificacion"
import { BotonEnviarVerificacion } from "./boton-enviar-verificacion"

/**
 * Qué sigue después de cargar los documentos (va dentro del resumen de
 * «Documentos»): enviar la empresa a verificación ahí mismo, completar antes
 * la persona de contacto, o saber que ya está en revisión.
 */
export function SiguientePasoDocumentos({
  empresa,
  resumen,
  conContacto,
}: {
  empresa: Pick<EmpresaDocumentos, "estado" | "enviadoVerificacionAt">
  resumen: Pick<ResumenDocumentos, "listoParaEnviar">
  /** La persona de contacto tiene nombre y correo. */
  conContacto: boolean
}) {
  const situacion = situacionEmpresa({
    estado: empresa.estado,
    enviadoVerificacionAt: empresa.enviadoVerificacionAt,
    motivoEstado: null,
    verificadoAt: null,
  })
  if (situacion.tipo === "en-revision") {
    return (
      <Nota tono="info" titulo="Tu empresa está en revisión">
        La enviaste el {formatearFecha(situacion.enviadoAt)}. Si te pedimos
        corregir un documento, cárgalo de nuevo: no hace falta volver a
        enviarla.
      </Nota>
    )
  }
  if (!puedeEnviar(situacion) || !resumen.listoParaEnviar) return null
  const reenvio = situacion.tipo === "rechazado"
  if (!conContacto) {
    return (
      <Nota tono="info" titulo="Ya cargaste los documentos">
        <p>
          Para {reenvio ? "volver a enviar" : "enviar"} tu empresa a
          verificación, completa los datos de la persona de contacto.
        </p>
        <EnlaceBoton
          href={RUTA_CONTACTO}
          variant="outline"
          size="sm"
          className="mt-2"
        >
          Completar la persona de contacto
          <ArrowRight data-icon="inline-end" aria-hidden />
        </EnlaceBoton>
      </Nota>
    )
  }
  return (
    <Nota
      tono="info"
      titulo={
        reenvio
          ? "Ya puedes volver a enviar tu empresa"
          : "Ya puedes enviar tu empresa a verificación"
      }
    >
      <BotonEnviarVerificacion
        faltantes={[]}
        reenvio={reenvio}
        compacto
        // Enviada, esta nota cambia: el foco va al titular del resumen.
        destinoFoco={ID_RESUMEN_DOCUMENTOS}
      />
    </Nota>
  )
}
