import { LockKeyhole } from "lucide-react"
import type { Route } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { enFrase } from "@/features/cuentas-medio/franjas"
import { ColaAnunciantes } from "@/features/verificacion-anunciantes/components/cola-anunciantes"
import {
  ColaSolicitudes,
  EsqueletoColaSolicitudes,
} from "@/features/vinculacion/components/cola-solicitudes"

import {
  type AccesoColas,
  type Cola,
  COLAS_VERIFICACION,
  rutaCola,
  tieneAccesoCola,
} from "../colas"
import { MENSAJES_VERIFICACION } from "../errores"
import { ColaCuentas } from "./cola-cuentas"
import { ColaDocumentos } from "./cola-documentos"
import { ColaMedios } from "./cola-medios"
import { EsqueletoCola } from "./esqueletos"

function SinAcceso({ cola, acceso }: { cola: Cola; acceso: AccesoColas }) {
  if (cola === "documentos" && acceso.verificarMedios) {
    return (
      <EstadoVacio
        icono={LockKeyhole}
        titulo="Sin acceso a los documentos"
        descripcion={MENSAJES_VERIFICACION.sinPermisoDocumentos}
      />
    )
  }
  if (cola === "anunciantes") {
    return (
      <EstadoVacio
        icono={LockKeyhole}
        titulo="Sin acceso a la cola de anunciantes"
        descripcion="Revisarla exige el permiso de verificar anunciantes."
      >
        <EnlaceBoton href={rutaCola("medios")} variant="outline">
          Ir a la cola de medios
        </EnlaceBoton>
      </EstadoVacio>
    )
  }
  return (
    <EstadoVacio
      icono={LockKeyhole}
      titulo="Sin acceso a las colas de medios"
      descripcion="Revisarlas exige el permiso de verificar medios."
    >
      {acceso.verificarAnunciantes ? (
        <EnlaceBoton href={rutaCola("anunciantes")} variant="outline">
          Ir a la cola de anunciantes
        </EnlaceBoton>
      ) : (
        <EnlaceBoton href={"/operacion/anunciantes" as Route} variant="outline">
          Ir a Anunciantes
        </EnlaceBoton>
      )}
    </EstadoVacio>
  )
}

function Contenido({
  cola,
  pagina,
  acceso,
}: {
  cola: Cola
  pagina: number
  acceso: AccesoColas
}) {
  switch (cola) {
    case "medios":
      return <ColaMedios pagina={pagina} acceso={acceso} />
    case "cuentas":
      return <ColaCuentas pagina={pagina} />
    case "documentos":
      return <ColaDocumentos pagina={pagina} />
    case "solicitudes":
      return <ColaSolicitudes />
    case "anunciantes":
      return <ColaAnunciantes pagina={pagina} />
  }
}

/**
 * La cola elegida en la URL, con su encabezado, su esqueleto mientras carga
 * y su error aislado. Lo que el rol no puede ver no se consulta.
 */
export function ColaActiva({
  cola,
  pagina,
  acceso,
}: {
  cola: Cola
  pagina: number
  acceso: AccesoColas
}) {
  const { titulo, descripcion } = COLAS_VERIFICACION[cola]
  const idTitulo = `cola-${cola}`
  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 id={idTitulo} className="text-lg font-semibold">
          {titulo}
        </h2>
        <p className="text-sm text-muted-foreground">{descripcion}</p>
      </div>
      {tieneAccesoCola(cola, acceso) ? (
        <LimiteErrorTabla recurso={`la cola de ${enFrase(titulo)}`}>
          <Suspense
            key={`${cola}-${pagina}`}
            fallback={
              cola === "solicitudes" ? (
                <EsqueletoColaSolicitudes />
              ) : (
                <EsqueletoCola
                  etiqueta={`Cargando la cola de ${enFrase(titulo)}…`}
                />
              )
            }
          >
            <Contenido cola={cola} pagina={pagina} acceso={acceso} />
          </Suspense>
        </LimiteErrorTabla>
      ) : (
        <SinAcceso cola={cola} acceso={acceso} />
      )}
    </section>
  )
}
