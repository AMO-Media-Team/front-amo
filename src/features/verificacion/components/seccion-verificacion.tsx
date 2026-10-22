import "server-only"

import { LockKeyhole, RadioTower } from "lucide-react"

import {
  ListaDatos,
  SinDato,
  TarjetaFicha,
} from "@/features/operacion/components/ficha"
import { PanelPrivado } from "@/features/operacion/components/panel-privado"
import { TIPOS_MEDIO } from "@/features/operacion/estados"
import { unirUbicacion } from "@/features/operacion/formato"
import {
  type PerfilAudiencia,
  perfilAudiencia,
} from "@/features/operacion/queries/medios"
import type { MedioDetalle } from "@/features/operacion/tipos"
import { formatearPorcentaje } from "@/lib/format"

import { expedienteMedio } from "../queries"
import { ExpedienteVerificacion } from "./expediente-verificacion"

/** Países con más audiencia que se muestran en el perfil. */
const PAISES_VISIBLES = 3

function PerfilDeclarado({
  medio,
  perfil,
}: {
  medio: MedioDetalle
  perfil: PerfilAudiencia
}) {
  const audiencia = perfil.audiencia.slice(0, PAISES_VISIBLES)
  return (
    <TarjetaFicha
      titulo="Perfil declarado"
      icono={RadioTower}
      descripcion="Lo que el medio dice de sí mismo."
    >
      <ListaDatos
        className="lg:grid-cols-1"
        datos={[
          { etiqueta: "Tipo", valor: TIPOS_MEDIO[medio.tipo] },
          {
            etiqueta: "Ubicación",
            valor: unirUbicacion(medio.municipio, medio.departamento) ?? (
              <SinDato>Sin municipio</SinDato>
            ),
          },
          {
            etiqueta: "Categorías",
            valor:
              perfil.categorias.length > 0 ? (
                perfil.categorias.join(", ")
              ) : (
                <SinDato>Sin categorías</SinDato>
              ),
          },
          {
            etiqueta: "Audiencia",
            valor: medio.descripcionAudiencia ?? (
              <SinDato>No la ha descrito</SinDato>
            ),
          },
          {
            etiqueta: "Origen de la audiencia",
            valor:
              audiencia.length > 0 ? (
                audiencia
                  .map(
                    (pais) =>
                      `${pais.nombre} ${formatearPorcentaje(pais.porcentaje / 100, 0)}`
                  )
                  .join(" · ")
              ) : (
                <SinDato>Sin declarar</SinDato>
              ),
          },
        ]}
      />
    </TarjetaFicha>
  )
}

function PagoProtegido() {
  return (
    <TarjetaFicha titulo="Datos tributarios y de pago" icono={LockKeyhole}>
      <p className="text-sm text-pretty text-muted-foreground">
        Protegidos: verlos exige el permiso de datos sensibles.
      </p>
    </TarjetaFicha>
  )
}

/**
 * Pestaña «Verificación» de la ficha del medio (ADM-001): expediente y
 * decisión. Los documentos solo se consultan con `datos_sensibles.ver`
 * (como su RLS); los datos de pago se revelan aparte y quedan en la bitácora.
 */
export async function SeccionVerificacionMedio({
  medio,
  verDocumentos,
  verSensibles,
}: {
  medio: MedioDetalle
  verDocumentos: boolean
  verSensibles: boolean
}) {
  const [expediente, perfil] = await Promise.all([
    expedienteMedio(medio, { verDocumentos }),
    perfilAudiencia(medio.id),
  ])
  return (
    <ExpedienteVerificacion
      expediente={expediente}
      pago={
        verSensibles ? (
          <PanelPrivado
            entidad="medio"
            id={medio.id}
            grupo="pago"
            nombre={medio.nombre}
          />
        ) : (
          <PagoProtegido />
        )
      }
      perfil={<PerfilDeclarado medio={medio} perfil={perfil} />}
    />
  )
}
