import "server-only"

import { crearClienteServidor } from "@/lib/supabase/server"

import { componerDetalle } from "./detalle-servidor"
import { puntosCalor } from "./puntos-servidor"
import { geoMetricas } from "./rpc-geo"
import { centrosSinPoligono } from "./sin-poligono"
import type { ProveedorMetricasGeo, RespuestaMapaGeo } from "./tipos"

/**
 * Proveedor de producción. Todo se lee con el cliente del USUARIO: las RPC
 * `geo_metricas` y `detalle_zona_geo` son `security invoker` (validan
 * `analitica.mapa` y, para los accesos, `accesos.ver`) y las tablas de los
 * puntos del modo calor aplican su RLS. La ruta ya autorizó con el DAL; la BD
 * vuelve a hacerlo.
 */
export function crearProveedorSupabase(): ProveedorMetricasGeo {
  return {
    async mapa(consulta): Promise<RespuestaMapaGeo> {
      const supabase = await crearClienteServidor()
      const filas = await geoMetricas(supabase, consulta)
      return {
        consulta,
        filas,
        sinPoligono: centrosSinPoligono(consulta.nivel, filas),
        origen: "base-de-datos",
      }
    },

    async puntos(consulta) {
      return puntosCalor(await crearClienteServidor(), consulta)
    },

    async detalle(consulta) {
      return componerDetalle(await crearClienteServidor(), consulta)
    },
  }
}
