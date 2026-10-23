import "server-only"

import { FileText, Megaphone } from "lucide-react"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import {
  type PestanaFicha,
  PestanasFicha,
} from "@/features/operacion/components/pestanas-ficha"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { serializarFecha } from "@/lib/fechas"

import {
  obtenerMiCampana,
  ofertasDeMiCampana,
  situacionEmpresa,
} from "../queries"
import {
  accionesCampana,
  puedeCrearOfertas,
  puedeEditarCampana,
} from "../reglas"
import { AccionesCampana } from "./acciones-campana"
import { AvisoEmpresa } from "./aviso-empresa"
import { CabeceraCampana } from "./cabecera-campana"
import { DatosCampana } from "./datos-campana"
import { IndicadoresCampana } from "./indicadores-campana"
import { OfertasCampana } from "./ofertas-campana"

/**
 * Ficha de una campaña propia (ANU-003, ANU-014): cabecera con su estado y
 * las acciones que permite la máquina de estados, resumen de presupuesto y
 * vigencia, y las pestañas «Ofertas» (por defecto; `?pestana=ofertas` también
 * la abre) y «Datos». La página ya autorizó con el DAL; la RLS decide qué se
 * ve (una campaña de otra empresa no existe para esta sesión).
 */
export async function FichaMiCampana({
  usuario,
  anuncianteId,
  campanaId,
}: {
  usuario: UsuarioSesion
  anuncianteId: string
  campanaId: string
}) {
  const [campana, empresa, ofertas] = await Promise.all([
    obtenerMiCampana(anuncianteId, campanaId),
    situacionEmpresa(anuncianteId),
    ofertasDeMiCampana(campanaId),
  ])
  if (!campana) notFound()

  const ahora = new Date()
  const hoy = serializarFecha(ahora)
  const estadoEmpresa = empresa?.estado ?? "PENDIENTE"
  const acciones = accionesCampana({
    estado: campana.estado,
    tipoActor: usuario.rol.tipo,
    permisos: usuario.permisos,
    estadoEmpresa,
  })
  const puedeEditar = puedeEditarCampana(campana.estado, usuario.permisos)
  const puedeCrear = puedeCrearOfertas(campana.estado, usuario.permisos)

  const pestanas: PestanaFicha[] = [
    {
      clave: "ofertas",
      titulo: "Ofertas",
      icono: <Megaphone aria-hidden />,
      contador: ofertas.length,
      contenido: (
        <OfertasCampana
          campana={campana}
          ofertas={ofertas}
          puedeCrear={puedeCrear}
          ahora={ahora}
        />
      ),
    },
    {
      clave: "datos",
      titulo: "Datos",
      icono: <FileText aria-hidden />,
      contenido: <DatosCampana campana={campana} puedeEditar={puedeEditar} />,
    },
  ]

  return (
    <ContenedorPagina>
      <CabeceraCampana
        campana={campana}
        hoy={hoy}
        acciones={
          <AccionesCampana
            campana={{
              id: campana.id,
              nombre: campana.nombre,
              estado: campana.estado,
            }}
            acciones={acciones}
            puedeEditar={puedeEditar}
          />
        }
        aviso={
          empresa && campana.estado !== "FINALIZADA" ? (
            <AvisoEmpresa situacion={empresa} />
          ) : null
        }
      />
      <IndicadoresCampana campana={campana} hoy={hoy} />
      <PestanasFicha pestanas={pestanas} />
    </ContenedorPagina>
  )
}
