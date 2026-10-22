import type { Metadata } from "next"
import { Suspense } from "react"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoSeccionMiMedio } from "@/features/mi-medio/components/encabezado-seccion"
import { EsqueletoFormulario } from "@/features/mi-medio/components/esqueletos"
import { FormularioPagoMedio } from "@/features/mi-medio/components/formulario-pago"
import { LimiteErrorMiMedio } from "@/features/mi-medio/components/limite-error-mi-medio"
import { AvisoCertificado } from "@/features/mi-medio/components/aviso-certificado"
import { SinMedio } from "@/features/mi-medio/components/sin-medio"
import {
  documentosDelMedio,
  hoyBogota,
  pagoEditable,
} from "@/features/mi-medio/queries"
import {
  certificadoDePago,
  estadoRequisito,
} from "@/features/mi-medio/requisitos"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Pago y condición tributaria" }

async function SeccionPago({ medioId }: { medioId: string }) {
  const [pago, documentos] = await Promise.all([
    pagoEditable(medioId),
    documentosDelMedio(medioId),
  ])
  if (!pago) return <SinMedio />
  const certificado = certificadoDePago(pago.resumen.metodoPago)
  const requisito =
    certificado && pago.resumen.cuentaRegistrada
      ? estadoRequisito(certificado, documentos, hoyBogota())
      : null
  return (
    <div className="flex flex-col gap-5">
      {requisito ? <AvisoCertificado requisito={requisito} /> : null}
      {/* La versión de los datos como `key`: al guardar, el formulario se
          rehace con lo registrado (y con el esquema de lo ya cifrado). */}
      <FormularioPagoMedio
        key={pago.resumen.actualizadoAt ?? "sin-datos"}
        pago={pago}
      />
    </div>
  )
}

/**
 * Pago y condición tributaria (MED-004). Lo sensible lo cifra el servidor; la
 * página solo muestra resúmenes enmascarados.
 */
export default async function PaginaPagoMedio() {
  const usuario = await requerirPermiso("medios.editar_propio")
  return (
    <ContenedorPagina ancho="estrecho">
      <EncabezadoSeccionMiMedio
        titulo="Pago y condición tributaria"
        descripcion="A quién y dónde te pagamos, y lo que necesitamos para tus retenciones."
      />
      {usuario.medioId ? (
        <LimiteErrorMiMedio recurso="tus datos de pago">
          <Suspense
            fallback={
              <EsqueletoFormulario
                secciones={3}
                etiqueta="Cargando tus datos de pago…"
              />
            }
          >
            <SeccionPago medioId={usuario.medioId} />
          </Suspense>
        </LimiteErrorMiMedio>
      ) : (
        <SinMedio />
      )}
    </ContenedorPagina>
  )
}
