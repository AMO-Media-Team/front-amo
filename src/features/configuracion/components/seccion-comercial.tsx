import { listarExcepciones, listarParametros } from "../queries"
import { ExcepcionesComision } from "./excepciones-comision"
import { GruposParametros } from "./grupos-parametros"
import { RepartoComision } from "./reparto-comision"

const CLAVE_COMISION = "comision.porcentaje_global"

/**
 * Comercial: comisión global (con su reparto de ejemplo), comisiones de
 * excepción y reglas de ofertas y disputas.
 */
export async function SeccionComercial() {
  const [parametros, excepciones] = await Promise.all([
    listarParametros(),
    listarExcepciones(),
  ])
  const global = parametros.find((p) => p.clave === CLAVE_COMISION)?.valor
  const comisionGlobal = typeof global === "number" ? global : null

  return (
    <>
      <GruposParametros
        parametros={parametros}
        seccion="comercial"
        soloGrupos={["comision"]}
        pie={{
          comision:
            comisionGlobal !== null ? (
              <div className="border-t bg-muted/20 px-4 py-4 sm:px-5">
                <RepartoComision
                  porcentaje={comisionGlobal}
                  className="max-w-md"
                />
              </div>
            ) : null,
        }}
      />
      <ExcepcionesComision
        excepciones={excepciones}
        comisionGlobal={comisionGlobal}
      />
      <GruposParametros
        parametros={parametros}
        seccion="comercial"
        excluirGrupos={["comision"]}
      />
    </>
  )
}
