import "server-only"

/**
 * Archivos del documento soporte que genera el servidor (LIQ-004): el PDF y el archivo genérico para el
 * proveedor tecnológico. No es una acción (no lleva `"use server"`): la llaman `emitirDocumentoSoporte`,
 * `generarArchivosDocumentoSoporte` y `registrarCuds` después de autorizar con el DAL.
 *
 * 1. `datos_documento_soporte` con la sesión (exige `liquidaciones.ver`).
 * 2. `revelar_privado_srv('medios_privado', …)` con el actor (exige `datos_sensibles.ver` y deja
 *    `REVELAR_DATO` en la bitácora) y el número de documento se descifra aquí: solo viaja dentro de los
 *    archivos, nunca en la respuesta ni en los logs.
 * 3. PDF (jsPDF) y JSON `AMO-DS-1`, subidos como servicio a `soportes/documento_soporte/{id}/` (cada vez
 *    un objeto nuevo: nunca se sobrescribe).
 * 4. `adjuntar_archivos_documento_soporte_srv` comprueba que existan y los guarda en la fila.
 */
import { descifrarNumeroDocumento } from "@/features/mi-medio/cifrado-pago"
import type { ContextoActor } from "@/lib/auth/contexto-actor"
import { ErrorCifrado } from "@/lib/cifrado"
import { MENSAJE_INESPERADO } from "@/lib/errores-bd"
import { construirDocumentoSoportePdf } from "@/lib/export/documento-soporte-pdf"
import { LOGO_DOCUMENTOS } from "@/lib/export/logo-documentos.generated"
import { exito, fallo, type ResultadoAccion } from "@/lib/result"
import { carpetaSoporte, nuevaRuta } from "@/lib/storage/rutas"
import { subirComoServicio } from "@/lib/storage/subidas-servidor"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"

import {
  CAMPOS_VENDEDOR,
  componerModelo,
  DocumentoNoEmitido,
  esquemaDatosDocumentoSoporte,
  esquemaVendedorRevelado,
  type VendedorDocumento,
} from "./datos"
import { interpretarErrorDocumento, MENSAJES_DOCUMENTO } from "./errores"
import {
  archivoProveedorDocumentoSoporte,
  datosPdfDocumentoSoporte,
  MIME_ARCHIVO_PROVEEDOR,
  serializarArchivoProveedor,
} from "./salidas"

/** Log de servidor sin datos personales: operación y código. */
export function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[documento-soporte] ${operacion} falló (${codigo})`)
}

export interface ArchivosGenerados {
  /** Número del documento («DS1234»), para el aviso de la interfaz. */
  numero: string
}

function falloBd(
  operacion: string,
  error: Parameters<typeof interpretarErrorDocumento>[0]
) {
  const interpretado = interpretarErrorDocumento(error, "generar")
  if (!interpretado.esperado) informar(operacion, error)
  return fallo(interpretado.mensaje)
}

/** Titular, documento y dirección del medio, con el número ya en claro. */
async function vendedorDescifrado(
  contexto: ContextoActor,
  medioId: string
): Promise<ResultadoAccion<VendedorDocumento>> {
  const { data, error } = await contexto.admin.rpc(
    "revelar_privado_srv",
    argumentosRpc<"revelar_privado_srv">({
      p_tabla: "medios_privado",
      p_id: medioId,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
      p_campos: [...CAMPOS_VENDEDOR],
    })
  )
  if (error) return falloBd("revelar los datos del vendedor", error)
  const lectura = esquemaVendedorRevelado.safeParse(data)
  if (!lectura.success) {
    informar("leer los datos del vendedor", lectura.error)
    return fallo(MENSAJES_DOCUMENTO.datosIlegibles)
  }
  const revelado = lectura.data
  let numeroDocumento: string | null = null
  if (revelado?.numero_documento_cifrado) {
    try {
      numeroDocumento = descifrarNumeroDocumento(
        medioId,
        revelado.numero_documento_cifrado
      )
    } catch (causa) {
      informar("descifrar el documento del vendedor", causa)
      return fallo(
        causa instanceof ErrorCifrado
          ? MENSAJES_DOCUMENTO.documentoIlegible
          : MENSAJE_INESPERADO
      )
    }
  }
  return exito({
    titular: revelado?.titular_nombre ?? null,
    tipoDocumento: revelado?.tipo_documento ?? null,
    numeroDocumento,
    direccion: revelado?.direccion ?? null,
  })
}

/**
 * Genera y guarda los dos archivos de un documento EMITIDO. Idempotente en efecto: cada llamada sube
 * objetos nuevos y la fila apunta a los últimos (la bitácora guarda cada cambio).
 */
export async function generarArchivosDocumento(
  contexto: ContextoActor,
  documentoId: string,
  ahora: Date = new Date()
): Promise<ResultadoAccion<ArchivosGenerados>> {
  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase.rpc("datos_documento_soporte", {
      p_documento_id: documentoId,
    })
    if (error) return falloBd("leer los datos del documento", error)
    if (data === null) return fallo(MENSAJES_DOCUMENTO.noEncontrado)
    const lectura = esquemaDatosDocumentoSoporte.safeParse(data)
    if (!lectura.success) {
      informar("validar los datos del documento", lectura.error)
      return fallo(MENSAJES_DOCUMENTO.datosIlegibles)
    }

    const vendedor = await vendedorDescifrado(contexto, lectura.data.medio.id)
    if (!vendedor.ok) return vendedor
    const modelo = componerModelo(lectura.data, vendedor.datos)

    const pdf = await construirDocumentoSoportePdf(
      datosPdfDocumentoSoporte(modelo, ahora),
      LOGO_DOCUMENTOS
    )
    const json = serializarArchivoProveedor(
      archivoProveedorDocumentoSoporte(modelo, ahora)
    )

    const carpeta = carpetaSoporte("documento_soporte", documentoId)
    const [subidaPdf, subidaJson] = await Promise.all([
      subirComoServicio({
        cliente: contexto.admin,
        destino: nuevaRuta(carpeta, "application/pdf"),
        contenido: new Uint8Array(pdf.output("arraybuffer")),
        tipo: "application/pdf",
      }),
      subirComoServicio({
        cliente: contexto.admin,
        destino: nuevaRuta(carpeta, MIME_ARCHIVO_PROVEEDOR),
        contenido: json,
        tipo: MIME_ARCHIVO_PROVEEDOR,
      }),
    ])
    if (!subidaPdf.ok) return subidaPdf
    if (!subidaJson.ok) return subidaJson

    const { error: errorAdjuntar } = await contexto.admin.rpc(
      "adjuntar_archivos_documento_soporte_srv",
      argumentosRpc<"adjuntar_archivos_documento_soporte_srv">({
        p_documento_id: documentoId,
        p_pdf_path: subidaPdf.datos.ruta,
        p_archivo_proveedor_path: subidaJson.datos.ruta,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    if (errorAdjuntar) return falloBd("adjuntar los archivos", errorAdjuntar)
    return exito({ numero: modelo.documento.numero })
  } catch (error) {
    if (error instanceof DocumentoNoEmitido) {
      return fallo(MENSAJES_DOCUMENTO.documentoNoEmitido)
    }
    informar("generar los archivos del documento", error)
    return fallo(MENSAJE_INESPERADO)
  }
}
