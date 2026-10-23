import {
  BadgeCheck,
  ChartColumnBig,
  FileImage,
  LockKeyhole,
  TriangleAlert,
} from "lucide-react"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { contar } from "@/features/operacion/formato"
import { EsqueletoCola } from "@/features/verificacion/components/esqueletos"

import {
  type AccesoValidacion,
  type ColaValidacion,
  COLAS,
  ID_TITULO_COLA,
  rutaCola,
  tieneAccesoCola,
} from "../colas"
import {
  colaEvidencias,
  colaMetricas,
  colaVerificacion,
  contadoresValidacion,
  plazoRecargaHoras,
} from "../queries"
import { FiltroAlertas } from "./filtro-alertas"
import { ListaPorVerificar } from "./lista-por-verificar"
import { PaginacionValidacion } from "./paginacion-validacion"
import { RevisorEvidencias } from "./revisor-evidencias"
import { RevisorMetricas } from "./revisor-metricas"

function Resumen({ children }: { children: string }) {
  return <p className="text-sm text-pretty text-muted-foreground">{children}</p>
}

async function ColaEvidencias({ pagina }: { pagina: number }) {
  const [cola, plazo] = await Promise.all([
    colaEvidencias(pagina),
    plazoRecargaHoras(),
  ])
  if (cola.filas.length === 0) {
    return (
      <EstadoVacio
        icono={FileImage}
        titulo={COLAS.evidencias.vacia}
        descripcion={COLAS.evidencias.ayudaVacia}
      />
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <Resumen>
        {`${contar(cola.total, "evidencia espera", "evidencias esperan")} tu revisión. Al aprobar o rechazar una se abre la siguiente, para atender la cola de corrido.`}
      </Resumen>
      <RevisorEvidencias evidencias={cola.filas} plazoRecargaHoras={plazo} />
      <PaginacionValidacion
        cola="evidencias"
        pagina={cola.pagina}
        total={cola.total}
      />
    </div>
  )
}

async function ColaMetricas({
  pagina,
  soloAlertas,
}: {
  pagina: number
  soloAlertas: boolean
}) {
  const cola = await colaMetricas(pagina, soloAlertas)
  if (cola.filas.length === 0) {
    return soloAlertas ? (
      <EstadoVacio
        icono={TriangleAlert}
        titulo="Ninguna métrica pendiente tiene alerta"
        descripcion="Las métricas con desviación frente al histórico o alcance excesivo, también las que la tuvieron antes de que el medio las corrigiera, aparecerán aquí primero."
      >
        <EnlaceBoton href={rutaCola("metricas")} variant="outline">
          Ver todas las métricas
        </EnlaceBoton>
      </EstadoVacio>
    ) : (
      <EstadoVacio
        icono={ChartColumnBig}
        titulo={COLAS.metricas.vacia}
        descripcion={COLAS.metricas.ayudaVacia}
      />
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <Resumen>
        {`${contar(cola.total, soloAlertas ? "métrica con alerta espera" : "métrica espera", soloAlertas ? "métricas con alerta esperan" : "métricas esperan")} tu revisión. Al aprobar o rechazar una se abre la siguiente.`}
      </Resumen>
      <RevisorMetricas metricas={cola.filas} />
      <PaginacionValidacion
        cola="metricas"
        pagina={cola.pagina}
        total={cola.total}
        soloAlertas={soloAlertas}
      />
    </div>
  )
}

async function ColaVerificacion({
  pagina,
  acceso,
}: {
  pagina: number
  acceso: AccesoValidacion
}) {
  const cola = await colaVerificacion(pagina)
  if (cola.filas.length === 0) {
    return (
      <EstadoVacio
        icono={BadgeCheck}
        titulo={COLAS.verificar.vacia}
        descripcion={COLAS.verificar.ayudaVacia}
      />
    )
  }
  const listas = cola.filas.filter((fila) => fila.lista).length
  return (
    <div className="flex flex-col gap-4">
      <Resumen>
        {listas > 0
          ? `${contar(listas, "asignación está lista", "asignaciones están listas")} para verificar en esta página; las demás dicen qué les falta.`
          : "Ninguna de esta página está lista todavía: cada una dice qué le falta."}
      </Resumen>
      <ListaPorVerificar
        filas={cola.filas}
        constanciaManual={acceso.administrar}
      />
      <PaginacionValidacion
        cola="verificar"
        pagina={cola.pagina}
        total={cola.total}
      />
    </div>
  )
}

/** El filtro «Solo con alertas» con el número de métricas con alerta. */
async function FiltroConConteo({ acceso }: { acceso: AccesoValidacion }) {
  const contadores = await contadoresValidacion(acceso)
  return <FiltroAlertas conAlerta={contadores.metricasConAlerta} />
}

function Contenido({
  cola,
  pagina,
  soloAlertas,
  acceso,
}: {
  cola: ColaValidacion
  pagina: number
  soloAlertas: boolean
  acceso: AccesoValidacion
}) {
  switch (cola) {
    case "evidencias":
      return <ColaEvidencias pagina={pagina} />
    case "metricas":
      return <ColaMetricas pagina={pagina} soloAlertas={soloAlertas} />
    case "verificar":
      return <ColaVerificacion pagina={pagina} acceso={acceso} />
  }
}

function SinAcceso({
  cola,
  acceso,
}: {
  cola: ColaValidacion
  acceso: AccesoValidacion
}) {
  const otra: ColaValidacion | null =
    cola === "evidencias"
      ? acceso.metricas
        ? "metricas"
        : null
      : acceso.evidencias
        ? "evidencias"
        : null
  return (
    <EstadoVacio
      icono={LockKeyhole}
      titulo={`Sin acceso a la cola de ${COLAS[cola].titulo.toLocaleLowerCase("es-CO")}`}
      descripcion={
        cola === "evidencias"
          ? "Revisarla exige el permiso de validar evidencias."
          : "Revisarla exige el permiso de validar métricas."
      }
    >
      {otra ? (
        <EnlaceBoton href={rutaCola(otra)} variant="outline">
          Ir a la cola de {COLAS[otra].titulo.toLocaleLowerCase("es-CO")}
        </EnlaceBoton>
      ) : null}
    </EstadoVacio>
  )
}

/**
 * La cola elegida en la URL, con su encabezado (destino del foco cuando la
 * hoja de revisión se cierra sin elemento al que volver), su esqueleto
 * mientras carga y su error aislado. Lo que el rol no puede ver no se
 * consulta.
 */
export function ColaValidacionActiva({
  cola,
  pagina,
  soloAlertas,
  acceso,
}: {
  cola: ColaValidacion
  pagina: number
  soloAlertas: boolean
  acceso: AccesoValidacion
}) {
  const { titulo, descripcion } = COLAS[cola]
  const permitida = tieneAccesoCola(cola, acceso)
  const recurso = `la cola de ${titulo.toLocaleLowerCase("es-CO")}`
  return (
    <section aria-labelledby={ID_TITULO_COLA} className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2
          id={ID_TITULO_COLA}
          tabIndex={-1}
          className="text-lg font-semibold outline-none focus-visible:anillo-foco"
        >
          {titulo}
        </h2>
        <p className="text-sm text-muted-foreground">{descripcion}</p>
      </div>
      {cola === "metricas" && permitida ? (
        <LimiteErrorTabla recurso="el filtro de alertas">
          <Suspense fallback={<FiltroAlertas conAlerta={null} />}>
            <FiltroConConteo acceso={acceso} />
          </Suspense>
        </LimiteErrorTabla>
      ) : null}
      {permitida ? (
        <LimiteErrorTabla recurso={recurso}>
          <Suspense
            key={`${cola}-${pagina}-${soloAlertas}`}
            fallback={<EsqueletoCola etiqueta={`Cargando ${recurso}…`} />}
          >
            <Contenido
              cola={cola}
              pagina={pagina}
              soloAlertas={soloAlertas}
              acceso={acceso}
            />
          </Suspense>
        </LimiteErrorTabla>
      ) : (
        <SinAcceso cola={cola} acceso={acceso} />
      )}
    </section>
  )
}
