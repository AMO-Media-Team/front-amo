import { Building2 } from "lucide-react"

import { banderaEmoji } from "@/features/accesos/catalogo"
import {
  ListaDatos,
  SinDato,
  TarjetaFicha,
} from "@/features/operacion/components/ficha"

import type { ExpedienteAnunciante } from "../tipos"

/**
 * Datos registrados de la empresa para compararlos con sus documentos:
 * razón social, NIT con su dígito (o la identificación tributaria
 * extranjera), país y ciudad. Mientras no esté verificada, la empresa los
 * corrige desde «Mi empresa»; después, solo el equipo AMO.
 */
export function DatosEmpresa({
  anunciante,
}: {
  anunciante: ExpedienteAnunciante["anunciante"]
}) {
  const bandera = banderaEmoji(anunciante.paisIso2)
  const protegida =
    anunciante.estado === "VERIFICADO" || anunciante.estado === "SUSPENDIDO"
  return (
    <TarjetaFicha
      titulo="Datos para comparar"
      icono={Building2}
      descripcion="Lo que la empresa registró: debe coincidir con sus documentos."
    >
      <div className="flex flex-col gap-4">
        <ListaDatos
          className="sm:grid-cols-2 lg:grid-cols-1"
          datos={[
            { etiqueta: "Razón social", valor: anunciante.razonSocial },
            {
              etiqueta: anunciante.tipoIdentificacion,
              valor: anunciante.identificacion ? (
                <span className="font-mono text-[0.8125rem] tracking-tight">
                  {anunciante.identificacion}
                </span>
              ) : (
                <SinDato>Sin registrar</SinDato>
              ),
            },
            {
              etiqueta: "País",
              valor: (
                <span className="inline-flex items-center gap-1.5">
                  {bandera ? <span aria-hidden>{bandera}</span> : null}
                  {anunciante.pais}
                </span>
              ),
            },
            {
              etiqueta: "Ciudad",
              valor: anunciante.ciudad ?? <SinDato>Sin registrar</SinDato>,
            },
            {
              etiqueta: "Sector",
              valor: anunciante.sector ?? <SinDato>Sin registrar</SinDato>,
            },
          ]}
        />
        <p className="text-xs text-pretty text-muted-foreground">
          {protegida
            ? "Como ya está verificada, la razón social y la identificación solo las corrige el equipo AMO (Editar datos)."
            : "Mientras no esté verificada, la empresa corrige estos datos desde «Mi empresa». Si no coinciden, rechaza el documento con el motivo."}
        </p>
      </div>
    </TarjetaFicha>
  )
}
