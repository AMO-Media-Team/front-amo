import { TriangleAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { obtenerDepartamento, obtenerMunicipio } from "@/lib/geo/catalogo"

import { CLAVE_MUNICIPIO_PLATAFORMA, fichaDe } from "../parametros"
import { datosTributario, listarParametros } from "../queries"
import type { ParametrosAnio, Parametro } from "../tipos"
import { hoyBogota } from "../vigencias"
import { GruposParametros } from "./grupos-parametros"
import { ParametrosAnios } from "./tributario-anios"
import { ResolucionesDian } from "./tributario-resoluciones"
import { ReteicaMunicipios, Retenciones } from "./tributario-retenciones"

/** "Bogotá, D.C. · Bogotá" para cada código DIVIPOLA dado. */
function nombresMunicipios(
  codigos: readonly unknown[]
): Record<string, string> {
  const nombres: Record<string, string> = {}
  for (const codigo of codigos) {
    if (typeof codigo !== "string") continue
    const municipio = obtenerMunicipio(codigo)
    if (!municipio) continue
    const departamento = obtenerDepartamento(municipio.departamentoCodigo)
    nombres[codigo] = departamento
      ? `${municipio.nombre} · ${departamento.nombreCorto}`
      : municipio.nombre
  }
  return nombres
}

/** UVT del año en curso (o del más reciente registrado). */
function uvtVigente(anios: readonly ParametrosAnio[]): number | null {
  const actual = Number(hoyBogota().slice(0, 4))
  return (anios.find((a) => a.anio === actual) ?? anios[0])?.uvt ?? null
}

function contextoMunicipio(parametros: readonly Parametro[]) {
  const actual = parametros.find(
    (p) => p.clave === CLAVE_MUNICIPIO_PLATAFORMA
  )?.valor
  const defecto = fichaDe(CLAVE_MUNICIPIO_PLATAFORMA)?.defecto
  return { etiquetas: nombresMunicipios([actual, defecto]) }
}

/** Aviso permanente: las cifras tributarias son sugeridas hasta que el contador las confirme. */
function AvisoContador() {
  return (
    <Alert className="border-warning/40 bg-warning/8">
      <TriangleAlert className="text-warning" aria-hidden />
      <AlertTitle>Pendiente de validación con el contador</AlertTitle>
      <AlertDescription>
        Las tarifas, bases y reglas de esta sección son sugeridas para la
        operación inicial. Confírmalas con el contador antes de facturar o
        liquidar; las cifras marcadas «Por validar» aún no se han revisado.
      </AlertDescription>
    </Alert>
  )
}

/** Tributario: parámetros anuales, retenciones, ReteICA, numeración DIAN y reglas de cálculo. */
export async function SeccionTributario() {
  const [tributario, parametros] = await Promise.all([
    datosTributario(),
    listarParametros(),
  ])
  const uvt = uvtVigente(tributario.anios)
  return (
    <>
      <AvisoContador />
      <ParametrosAnios anios={tributario.anios} />
      <Retenciones retenciones={tributario.retenciones} uvt={uvt} />
      <ReteicaMunicipios reteica={tributario.reteica} uvt={uvt} />
      <GruposParametros
        parametros={parametros}
        seccion="tributario"
        contextos={{
          [CLAVE_MUNICIPIO_PLATAFORMA]: contextoMunicipio(parametros),
        }}
      />
      <ResolucionesDian resoluciones={tributario.resoluciones} />
    </>
  )
}
