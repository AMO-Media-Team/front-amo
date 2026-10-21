// ─────────────────────────────────────────────────────────────────────────────
// ARCHIVO GENERADO — no editar a mano.
// Origen: Supabase generate_typescript_types (proyecto zygfqfvqwfvhbirmjojp, esquema public),
// última migración aplicada: 20261005233015_configuracion_claves_publicas (12a–12c solo tocan `private`
// y triggers, y la de integración solo datos: el contenido no cambia desde 20261005171106_roles_guardar_permisos).
// Regenerar con `pnpm db:types` (scripts/db/generar-tipos.ts; requiere `supabase login`).
// ─────────────────────────────────────────────────────────────────────────────
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accesos: {
        Row: {
          aal: string | null
          ciudad: string | null
          created_at: string
          departamento_codigo: string | null
          dispositivo: string | null
          email_hash: string | null
          es_demo: boolean
          es_sospechoso: boolean
          evento: Database["public"]["Enums"]["acceso_evento"]
          id: number
          ip: unknown
          lat: number | null
          lon: number | null
          motivo_sospecha: string | null
          municipio_codigo: string | null
          navegador: string | null
          pais_iso2: string | null
          session_id: string | null
          sistema_operativo: string | null
          user_agent: string | null
          usuario_id: string | null
        }
        Insert: {
          aal?: string | null
          ciudad?: string | null
          created_at?: string
          departamento_codigo?: string | null
          dispositivo?: string | null
          email_hash?: string | null
          es_demo?: boolean
          es_sospechoso?: boolean
          evento: Database["public"]["Enums"]["acceso_evento"]
          id?: never
          ip?: unknown
          lat?: number | null
          lon?: number | null
          motivo_sospecha?: string | null
          municipio_codigo?: string | null
          navegador?: string | null
          pais_iso2?: string | null
          session_id?: string | null
          sistema_operativo?: string | null
          user_agent?: string | null
          usuario_id?: string | null
        }
        Update: {
          aal?: string | null
          ciudad?: string | null
          created_at?: string
          departamento_codigo?: string | null
          dispositivo?: string | null
          email_hash?: string | null
          es_demo?: boolean
          es_sospechoso?: boolean
          evento?: Database["public"]["Enums"]["acceso_evento"]
          id?: never
          ip?: unknown
          lat?: number | null
          lon?: number | null
          motivo_sospecha?: string | null
          municipio_codigo?: string | null
          navegador?: string | null
          pais_iso2?: string | null
          session_id?: string | null
          sistema_operativo?: string | null
          user_agent?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accesos_departamento_codigo_fkey"
            columns: ["departamento_codigo"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "accesos_municipio_codigo_fkey"
            columns: ["municipio_codigo"]
            isOneToOne: false
            referencedRelation: "municipios"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "accesos_pais_iso2_fkey"
            columns: ["pais_iso2"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["iso2"]
          },
          {
            foreignKeyName: "accesos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aceptaciones_terminos: {
        Row: {
          aceptada_at: string
          email_sha256: string
          id: number
          ip: unknown
          perfil_id: string
          termino_version_id: string
          user_agent: string | null
        }
        Insert: {
          aceptada_at?: string
          email_sha256: string
          id?: never
          ip?: unknown
          perfil_id: string
          termino_version_id: string
          user_agent?: string | null
        }
        Update: {
          aceptada_at?: string
          email_sha256?: string
          id?: never
          ip?: unknown
          perfil_id?: string
          termino_version_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aceptaciones_terminos_termino_version_id_fkey"
            columns: ["termino_version_id"]
            isOneToOne: false
            referencedRelation: "terminos_versiones"
            referencedColumns: ["id"]
          },
        ]
      }
      anunciantes: {
        Row: {
          ciudad_extranjera: string | null
          created_at: string
          datos_facturacion: Json
          deleted_at: string | null
          digito_verificacion: string | null
          es_demo: boolean
          estado_verificacion: Database["public"]["Enums"]["anunciante_estado"]
          id: string
          identificacion_extranjera: string | null
          logo_path: string | null
          motivo_estado: string | null
          municipio_codigo: string | null
          nit: string | null
          nombre_comercial: string
          nombre_normalizado: string | null
          pais_iso2: string
          razon_social: string
          rechazado_at: string | null
          sector_id: string
          suspendido_at: string | null
          updated_at: string
          verificado_at: string | null
          verificado_por: string | null
        }
        Insert: {
          ciudad_extranjera?: string | null
          created_at?: string
          datos_facturacion?: Json
          deleted_at?: string | null
          digito_verificacion?: string | null
          es_demo?: boolean
          estado_verificacion?: Database["public"]["Enums"]["anunciante_estado"]
          id?: string
          identificacion_extranjera?: string | null
          logo_path?: string | null
          motivo_estado?: string | null
          municipio_codigo?: string | null
          nit?: string | null
          nombre_comercial: string
          nombre_normalizado?: string | null
          pais_iso2?: string
          razon_social: string
          rechazado_at?: string | null
          sector_id: string
          suspendido_at?: string | null
          updated_at?: string
          verificado_at?: string | null
          verificado_por?: string | null
        }
        Update: {
          ciudad_extranjera?: string | null
          created_at?: string
          datos_facturacion?: Json
          deleted_at?: string | null
          digito_verificacion?: string | null
          es_demo?: boolean
          estado_verificacion?: Database["public"]["Enums"]["anunciante_estado"]
          id?: string
          identificacion_extranjera?: string | null
          logo_path?: string | null
          motivo_estado?: string | null
          municipio_codigo?: string | null
          nit?: string | null
          nombre_comercial?: string
          nombre_normalizado?: string | null
          pais_iso2?: string
          razon_social?: string
          rechazado_at?: string | null
          sector_id?: string
          suspendido_at?: string | null
          updated_at?: string
          verificado_at?: string | null
          verificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anunciantes_municipio_codigo_fkey"
            columns: ["municipio_codigo"]
            isOneToOne: false
            referencedRelation: "municipios"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "anunciantes_pais_iso2_fkey"
            columns: ["pais_iso2"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["iso2"]
          },
          {
            foreignKeyName: "anunciantes_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anunciantes_verificado_por_fkey"
            columns: ["verificado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      anunciantes_privado: {
        Row: {
          anunciante_id: string
          contacto_celular: string | null
          contacto_email: string | null
          contacto_nombre: string | null
          created_at: string
          direccion: string | null
          updated_at: string
        }
        Insert: {
          anunciante_id: string
          contacto_celular?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          created_at?: string
          direccion?: string | null
          updated_at?: string
        }
        Update: {
          anunciante_id?: string
          contacto_celular?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          created_at?: string
          direccion?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anunciantes_privado_anunciante_id_fkey"
            columns: ["anunciante_id"]
            isOneToOne: true
            referencedRelation: "anunciantes"
            referencedColumns: ["id"]
          },
        ]
      }
      asignacion_montos: {
        Row: {
          asignacion_id: string
          comision_excepcion_id: string | null
          comision_origen: Database["public"]["Enums"]["comision_origen"]
          created_at: string
          medio_id: string
          monto_bruto: number
          monto_comision: number
          monto_medio: number | null
          monto_neto: number | null
          monto_retenciones: number | null
          porcentaje_comision: number
          retenciones_aplicadas: Json | null
          updated_at: string
        }
        Insert: {
          asignacion_id: string
          comision_excepcion_id?: string | null
          comision_origen: Database["public"]["Enums"]["comision_origen"]
          created_at?: string
          medio_id: string
          monto_bruto: number
          monto_comision: number
          monto_medio?: number | null
          monto_neto?: number | null
          monto_retenciones?: number | null
          porcentaje_comision: number
          retenciones_aplicadas?: Json | null
          updated_at?: string
        }
        Update: {
          asignacion_id?: string
          comision_excepcion_id?: string | null
          comision_origen?: Database["public"]["Enums"]["comision_origen"]
          created_at?: string
          medio_id?: string
          monto_bruto?: number
          monto_comision?: number
          monto_medio?: number | null
          monto_neto?: number | null
          monto_retenciones?: number | null
          porcentaje_comision?: number
          retenciones_aplicadas?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asignacion_montos_asignacion_id_fkey"
            columns: ["asignacion_id"]
            isOneToOne: true
            referencedRelation: "asignaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignacion_montos_comision_excepcion_id_fkey"
            columns: ["comision_excepcion_id"]
            isOneToOne: false
            referencedRelation: "comisiones_excepcion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignacion_montos_medio_id_fkey"
            columns: ["medio_id"]
            isOneToOne: false
            referencedRelation: "medios"
            referencedColumns: ["id"]
          },
        ]
      }
      asignaciones: {
        Row: {
          aceptada_at: string | null
          anunciante_id: string
          campana_id: string
          cancelada_at: string | null
          causa_cancelacion:
            | Database["public"]["Enums"]["cancelacion_causa"]
            | null
          clave_idempotencia: string | null
          contenido_descargado_at: string | null
          created_at: string
          creativo_descargado_id: string | null
          cuenta_social_id: string | null
          en_disputa_at: string | null
          es_demo: boolean
          estado: Database["public"]["Enums"]["asignacion_estado"]
          estado_previo_disputa:
            | Database["public"]["Enums"]["asignacion_estado"]
            | null
          evidencia_validada_at: string | null
          factura_id: string | null
          fecha_limite_publicacion: string | null
          franja_clave: string | null
          franja_id: string | null
          id: string
          liquidacion_id: string | null
          liquidada_at: string | null
          medio_id: string
          metricas_atrasadas_at: string | null
          metricas_cargadas_at: string | null
          monto_bruto: number | null
          motivo: string | null
          multiplicador_calidad_aplicado: number | null
          multiplicador_exclusividad_aplicado: number | null
          multiplicador_geografico_aplicado: number | null
          oferta_id: string
          pagada_at: string | null
          plataforma: Database["public"]["Enums"]["plataforma"]
          publicaciones: number | null
          publicada_at: string | null
          rechazada_at: string | null
          seguidores_al_aceptar: number | null
          slot: number
          tarifa_base_aplicada: number | null
          tarifa_id: string | null
          updated_at: string
          vencida_at: string | null
          verificada_at: string | null
        }
        Insert: {
          aceptada_at?: string | null
          anunciante_id: string
          campana_id: string
          cancelada_at?: string | null
          causa_cancelacion?:
            | Database["public"]["Enums"]["cancelacion_causa"]
            | null
          clave_idempotencia?: string | null
          contenido_descargado_at?: string | null
          created_at?: string
          creativo_descargado_id?: string | null
          cuenta_social_id?: string | null
          en_disputa_at?: string | null
          es_demo?: boolean
          estado: Database["public"]["Enums"]["asignacion_estado"]
          estado_previo_disputa?:
            | Database["public"]["Enums"]["asignacion_estado"]
            | null
          evidencia_validada_at?: string | null
          factura_id?: string | null
          fecha_limite_publicacion?: string | null
          franja_clave?: string | null
          franja_id?: string | null
          id?: string
          liquidacion_id?: string | null
          liquidada_at?: string | null
          medio_id: string
          metricas_atrasadas_at?: string | null
          metricas_cargadas_at?: string | null
          monto_bruto?: number | null
          motivo?: string | null
          multiplicador_calidad_aplicado?: number | null
          multiplicador_exclusividad_aplicado?: number | null
          multiplicador_geografico_aplicado?: number | null
          oferta_id: string
          pagada_at?: string | null
          plataforma: Database["public"]["Enums"]["plataforma"]
          publicaciones?: number | null
          publicada_at?: string | null
          rechazada_at?: string | null
          seguidores_al_aceptar?: number | null
          slot?: number
          tarifa_base_aplicada?: number | null
          tarifa_id?: string | null
          updated_at?: string
          vencida_at?: string | null
          verificada_at?: string | null
        }
        Update: {
          aceptada_at?: string | null
          anunciante_id?: string
          campana_id?: string
          cancelada_at?: string | null
          causa_cancelacion?:
            | Database["public"]["Enums"]["cancelacion_causa"]
            | null
          clave_idempotencia?: string | null
          contenido_descargado_at?: string | null
          created_at?: string
          creativo_descargado_id?: string | null
          cuenta_social_id?: string | null
          en_disputa_at?: string | null
          es_demo?: boolean
          estado?: Database["public"]["Enums"]["asignacion_estado"]
          estado_previo_disputa?:
            | Database["public"]["Enums"]["asignacion_estado"]
            | null
          evidencia_validada_at?: string | null
          factura_id?: string | null
          fecha_limite_publicacion?: string | null
          franja_clave?: string | null
          franja_id?: string | null
          id?: string
          liquidacion_id?: string | null
          liquidada_at?: string | null
          medio_id?: string
          metricas_atrasadas_at?: string | null
          metricas_cargadas_at?: string | null
          monto_bruto?: number | null
          motivo?: string | null
          multiplicador_calidad_aplicado?: number | null
          multiplicador_exclusividad_aplicado?: number | null
          multiplicador_geografico_aplicado?: number | null
          oferta_id?: string
          pagada_at?: string | null
          plataforma?: Database["public"]["Enums"]["plataforma"]
          publicaciones?: number | null
          publicada_at?: string | null
          rechazada_at?: string | null
          seguidores_al_aceptar?: number | null
          slot?: number
          tarifa_base_aplicada?: number | null
          tarifa_id?: string | null
          updated_at?: string
          vencida_at?: string | null
          verificada_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asignaciones_anunciante_id_fkey"
            columns: ["anunciante_id"]
            isOneToOne: false
            referencedRelation: "anunciantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campanas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_creativo_descargado_id_fkey"
            columns: ["creativo_descargado_id"]
            isOneToOne: false
            referencedRelation: "creativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_cuenta_social_id_fkey"
            columns: ["cuenta_social_id"]
            isOneToOne: false
            referencedRelation: "cuentas_sociales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_franja_id_fkey"
            columns: ["franja_id"]
            isOneToOne: false
            referencedRelation: "franjas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_medio_id_fkey"
            columns: ["medio_id"]
            isOneToOne: false
            referencedRelation: "medios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_oferta_id_fkey"
            columns: ["oferta_id"]
            isOneToOne: false
            referencedRelation: "ofertas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asignaciones_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "tarifas"
            referencedColumns: ["id"]
          },
        ]
      }
      bitacora: {
        Row: {
          accion: string
          actor_email: string | null
          actor_id: string | null
          actor_rol: string | null
          cambios: Json | null
          ciudad: string | null
          created_at: string
          entidad: string
          entidad_id: string | null
          es_demo: boolean
          estado_anterior: string | null
          estado_nuevo: string | null
          id: number
          ip: unknown
          metadatos: Json
          motivo: string | null
          origen: Database["public"]["Enums"]["bitacora_origen"]
          pais_iso2: string | null
          user_agent: string | null
        }
        Insert: {
          accion: string
          actor_email?: string | null
          actor_id?: string | null
          actor_rol?: string | null
          cambios?: Json | null
          ciudad?: string | null
          created_at?: string
          entidad: string
          entidad_id?: string | null
          es_demo?: boolean
          estado_anterior?: string | null
          estado_nuevo?: string | null
          id?: never
          ip?: unknown
          metadatos?: Json
          motivo?: string | null
          origen: Database["public"]["Enums"]["bitacora_origen"]
          pais_iso2?: string | null
          user_agent?: string | null
        }
        Update: {
          accion?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_rol?: string | null
          cambios?: Json | null
          ciudad?: string | null
          created_at?: string
          entidad?: string
          entidad_id?: string | null
          es_demo?: boolean
          estado_anterior?: string | null
          estado_nuevo?: string | null
          id?: never
          ip?: unknown
          metadatos?: Json
          motivo?: string | null
          origen?: Database["public"]["Enums"]["bitacora_origen"]
          pais_iso2?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bitacora_pais_iso2_fkey"
            columns: ["pais_iso2"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["iso2"]
          },
        ]
      }
      campanas: {
        Row: {
          activada_at: string | null
          anunciante_id: string
          cancelada_at: string | null
          creada_por: string | null
          created_at: string
          deleted_at: string | null
          es_demo: boolean
          estado: Database["public"]["Enums"]["campana_estado"]
          fecha_fin: string
          fecha_inicio: string
          finalizada_at: string | null
          id: string
          marca: string
          nombre: string
          objetivo: string | null
          presupuesto_comprometido: number
          presupuesto_total: number
          updated_at: string
        }
        Insert: {
          activada_at?: string | null
          anunciante_id: string
          cancelada_at?: string | null
          creada_por?: string | null
          created_at?: string
          deleted_at?: string | null
          es_demo?: boolean
          estado?: Database["public"]["Enums"]["campana_estado"]
          fecha_fin: string
          fecha_inicio: string
          finalizada_at?: string | null
          id?: string
          marca: string
          nombre: string
          objetivo?: string | null
          presupuesto_comprometido?: number
          presupuesto_total: number
          updated_at?: string
        }
        Update: {
          activada_at?: string | null
          anunciante_id?: string
          cancelada_at?: string | null
          creada_por?: string | null
          created_at?: string
          deleted_at?: string | null
          es_demo?: boolean
          estado?: Database["public"]["Enums"]["campana_estado"]
          fecha_fin?: string
          fecha_inicio?: string
          finalizada_at?: string | null
          id?: string
          marca?: string
          nombre?: string
          objetivo?: string | null
          presupuesto_comprometido?: number
          presupuesto_total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanas_anunciante_id_fkey"
            columns: ["anunciante_id"]
            isOneToOne: false
            referencedRelation: "anunciantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanas_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          activo: boolean
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          id: string
          nombre: string
          nombre_normalizado: string | null
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          id?: string
          nombre: string
          nombre_normalizado?: string | null
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          id?: string
          nombre?: string
          nombre_normalizado?: string | null
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      comisiones_excepcion: {
        Row: {
          anunciante_id: string | null
          campana_id: string | null
          creada_por: string | null
          created_at: string
          id: string
          motivo: string
          porcentaje: number
          updated_at: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          anunciante_id?: string | null
          campana_id?: string | null
          creada_por?: string | null
          created_at?: string
          id?: string
          motivo: string
          porcentaje: number
          updated_at?: string
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          anunciante_id?: string | null
          campana_id?: string | null
          creada_por?: string | null
          created_at?: string
          id?: string
          motivo?: string
          porcentaje?: number
          updated_at?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comisiones_excepcion_anunciante_id_fkey"
            columns: ["anunciante_id"]
            isOneToOne: false
            referencedRelation: "anunciantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comisiones_excepcion_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campanas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comisiones_excepcion_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion: {
        Row: {
          actualizado_por: string | null
          clave: string
          created_at: string
          descripcion: string
          es_publica: boolean
          maximo: number | null
          minimo: number | null
          modulo: string
          opciones: string[] | null
          pendiente_validacion: boolean
          tipo: Database["public"]["Enums"]["config_tipo"]
          unidad: string | null
          updated_at: string
          valor: Json
        }
        Insert: {
          actualizado_por?: string | null
          clave: string
          created_at?: string
          descripcion: string
          es_publica?: boolean
          maximo?: number | null
          minimo?: number | null
          modulo: string
          opciones?: string[] | null
          pendiente_validacion?: boolean
          tipo: Database["public"]["Enums"]["config_tipo"]
          unidad?: string | null
          updated_at?: string
          valor: Json
        }
        Update: {
          actualizado_por?: string | null
          clave?: string
          created_at?: string
          descripcion?: string
          es_publica?: boolean
          maximo?: number | null
          minimo?: number | null
          modulo?: string
          opciones?: string[] | null
          pendiente_validacion?: boolean
          tipo?: Database["public"]["Enums"]["config_tipo"]
          unidad?: string | null
          updated_at?: string
          valor?: Json
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creativo_archivos: {
        Row: {
          alto: number | null
          ancho: number | null
          archivo_path: string
          created_at: string
          creativo_id: string
          duracion_segundos: number | null
          id: string
          mime: string
          orden: number
          sha256: string | null
          tamano_bytes: number
        }
        Insert: {
          alto?: number | null
          ancho?: number | null
          archivo_path: string
          created_at?: string
          creativo_id: string
          duracion_segundos?: number | null
          id?: string
          mime: string
          orden?: number
          sha256?: string | null
          tamano_bytes: number
        }
        Update: {
          alto?: number | null
          ancho?: number | null
          archivo_path?: string
          created_at?: string
          creativo_id?: string
          duracion_segundos?: number | null
          id?: string
          mime?: string
          orden?: number
          sha256?: string | null
          tamano_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "creativo_archivos_creativo_id_fkey"
            columns: ["creativo_id"]
            isOneToOne: false
            referencedRelation: "creativos"
            referencedColumns: ["id"]
          },
        ]
      }
      creativos: {
        Row: {
          copy_sugerido: string | null
          creado_por: string | null
          created_at: string
          enlace_destino: string | null
          hashtags: string[]
          id: string
          menciones: string[]
          oferta_id: string
          reemplaza_a: string | null
          tipo: Database["public"]["Enums"]["creativo_tipo"]
          updated_at: string
          version: number
          vigente: boolean
        }
        Insert: {
          copy_sugerido?: string | null
          creado_por?: string | null
          created_at?: string
          enlace_destino?: string | null
          hashtags?: string[]
          id?: string
          menciones?: string[]
          oferta_id: string
          reemplaza_a?: string | null
          tipo: Database["public"]["Enums"]["creativo_tipo"]
          updated_at?: string
          version?: number
          vigente?: boolean
        }
        Update: {
          copy_sugerido?: string | null
          creado_por?: string | null
          created_at?: string
          enlace_destino?: string | null
          hashtags?: string[]
          id?: string
          menciones?: string[]
          oferta_id?: string
          reemplaza_a?: string | null
          tipo?: Database["public"]["Enums"]["creativo_tipo"]
          updated_at?: string
          version?: number
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "creativos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creativos_oferta_id_fkey"
            columns: ["oferta_id"]
            isOneToOne: false
            referencedRelation: "ofertas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creativos_reemplaza_a_fkey"
            columns: ["reemplaza_a"]
            isOneToOne: false
            referencedRelation: "creativos"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_sociales: {
        Row: {
          alcance_mediano: number | null
          created_at: string
          deleted_at: string | null
          fecha_ultima_verificacion: string | null
          franja_id: string | null
          handle: string
          id: string
          indice_calidad: number | null
          medio_id: string
          metodo_verificacion:
            | Database["public"]["Enums"]["metodo_verificacion"]
            | null
          multiplicador_calculado_at: string | null
          multiplicador_calidad: number
          multiplicador_proximo: number | null
          multiplicador_proximo_desde: string | null
          plataforma: Database["public"]["Enums"]["plataforma"]
          publicaciones_verificadas_count: number
          seguidores_verificados: number | null
          tarifa_referencia: number | null
          updated_at: string
          url: string
          verificada: boolean
        }
        Insert: {
          alcance_mediano?: number | null
          created_at?: string
          deleted_at?: string | null
          fecha_ultima_verificacion?: string | null
          franja_id?: string | null
          handle: string
          id?: string
          indice_calidad?: number | null
          medio_id: string
          metodo_verificacion?:
            | Database["public"]["Enums"]["metodo_verificacion"]
            | null
          multiplicador_calculado_at?: string | null
          multiplicador_calidad?: number
          multiplicador_proximo?: number | null
          multiplicador_proximo_desde?: string | null
          plataforma: Database["public"]["Enums"]["plataforma"]
          publicaciones_verificadas_count?: number
          seguidores_verificados?: number | null
          tarifa_referencia?: number | null
          updated_at?: string
          url: string
          verificada?: boolean
        }
        Update: {
          alcance_mediano?: number | null
          created_at?: string
          deleted_at?: string | null
          fecha_ultima_verificacion?: string | null
          franja_id?: string | null
          handle?: string
          id?: string
          indice_calidad?: number | null
          medio_id?: string
          metodo_verificacion?:
            | Database["public"]["Enums"]["metodo_verificacion"]
            | null
          multiplicador_calculado_at?: string | null
          multiplicador_calidad?: number
          multiplicador_proximo?: number | null
          multiplicador_proximo_desde?: string | null
          plataforma?: Database["public"]["Enums"]["plataforma"]
          publicaciones_verificadas_count?: number
          seguidores_verificados?: number | null
          tarifa_referencia?: number | null
          updated_at?: string
          url?: string
          verificada?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_sociales_franja_id_fkey"
            columns: ["franja_id"]
            isOneToOne: false
            referencedRelation: "franjas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_sociales_medio_id_fkey"
            columns: ["medio_id"]
            isOneToOne: false
            referencedRelation: "medios"
            referencedColumns: ["id"]
          },
        ]
      }
      departamentos: {
        Row: {
          activo: boolean
          alias: string[]
          bbox: number[] | null
          capital_codigo: string | null
          codigo: string
          iso_3166_2: string
          lat: number | null
          lon: number | null
          nombre: string
          nombre_corto: string
          nombre_normalizado: string
          poblacion: number | null
          region: string
        }
        Insert: {
          activo?: boolean
          alias?: string[]
          bbox?: number[] | null
          capital_codigo?: string | null
          codigo: string
          iso_3166_2: string
          lat?: number | null
          lon?: number | null
          nombre: string
          nombre_corto: string
          nombre_normalizado: string
          poblacion?: number | null
          region: string
        }
        Update: {
          activo?: boolean
          alias?: string[]
          bbox?: number[] | null
          capital_codigo?: string | null
          codigo?: string
          iso_3166_2?: string
          lat?: number | null
          lon?: number | null
          nombre?: string
          nombre_corto?: string
          nombre_normalizado?: string
          poblacion?: number | null
          region?: string
        }
        Relationships: [
          {
            foreignKeyName: "departamentos_capital_codigo_fkey"
            columns: ["capital_codigo"]
            isOneToOne: false
            referencedRelation: "municipios"
            referencedColumns: ["codigo"]
          },
        ]
      }
      descargas_contenido: {
        Row: {
          asignacion_id: string
          creativo_id: string
          descargado_at: string
          id: number
        }
        Insert: {
          asignacion_id: string
          creativo_id: string
          descargado_at?: string
          id?: never
        }
        Update: {
          asignacion_id?: string
          creativo_id?: string
          descargado_at?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "descargas_contenido_asignacion_id_fkey"
            columns: ["asignacion_id"]
            isOneToOne: false
            referencedRelation: "asignaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descargas_contenido_creativo_id_fkey"
            columns: ["creativo_id"]
            isOneToOne: false
            referencedRelation: "creativos"
            referencedColumns: ["id"]
          },
        ]
      }
      dispersiones: {
        Row: {
          archivo_path: string
          cantidad_liquidaciones: number
          created_at: string
          es_demo: boolean
          generada_por: string | null
          id: string
          monto_total: number
        }
        Insert: {
          archivo_path: string
          cantidad_liquidaciones: number
          created_at?: string
          es_demo?: boolean
          generada_por?: string | null
          id?: string
          monto_total: number
        }
        Update: {
          archivo_path?: string
          cantidad_liquidaciones?: number
          created_at?: string
          es_demo?: boolean
          generada_por?: string | null
          id?: string
          monto_total?: number
        }
        Relationships: []
      }
      disputa_mensajes: {
        Row: {
          adjunto_path: string | null
          autor_id: string
          created_at: string
          disputa_id: string
          id: number
          interno: boolean
          mensaje: string
        }
        Insert: {
          adjunto_path?: string | null
          autor_id?: string
          created_at?: string
          disputa_id: string
          id?: never
          interno?: boolean
          mensaje: string
        }
        Update: {
          adjunto_path?: string | null
          autor_id?: string
          created_at?: string
          disputa_id?: string
          id?: never
          interno?: boolean
          mensaje?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputa_mensajes_disputa_id_fkey"
            columns: ["disputa_id"]
            isOneToOne: false
            referencedRelation: "disputas"
            referencedColumns: ["id"]
          },
        ]
      }
      disputas: {
        Row: {
          abierta_por: string
          asignacion_id: string
          created_at: string
          descripcion: string
          estado: Database["public"]["Enums"]["disputa_estado"]
          estado_asignacion_origen: Database["public"]["Enums"]["asignacion_estado"]
          estado_asignacion_resultante:
            | Database["public"]["Enums"]["asignacion_estado"]
            | null
          fecha_resolucion: string | null
          id: string
          motivo: Database["public"]["Enums"]["disputa_motivo"]
          parte: Database["public"]["Enums"]["disputa_parte"]
          resolucion: string | null
          resuelta_por: string | null
          updated_at: string
        }
        Insert: {
          abierta_por: string
          asignacion_id: string
          created_at?: string
          descripcion: string
          estado?: Database["public"]["Enums"]["disputa_estado"]
          estado_asignacion_origen: Database["public"]["Enums"]["asignacion_estado"]
          estado_asignacion_resultante?:
            | Database["public"]["Enums"]["asignacion_estado"]
            | null
          fecha_resolucion?: string | null
          id?: string
          motivo: Database["public"]["Enums"]["disputa_motivo"]
          parte: Database["public"]["Enums"]["disputa_parte"]
          resolucion?: string | null
          resuelta_por?: string | null
          updated_at?: string
        }
        Update: {
          abierta_por?: string
          asignacion_id?: string
          created_at?: string
          descripcion?: string
          estado?: Database["public"]["Enums"]["disputa_estado"]
          estado_asignacion_origen?: Database["public"]["Enums"]["asignacion_estado"]
          estado_asignacion_resultante?:
            | Database["public"]["Enums"]["asignacion_estado"]
            | null
          fecha_resolucion?: string | null
          id?: string
          motivo?: Database["public"]["Enums"]["disputa_motivo"]
          parte?: Database["public"]["Enums"]["disputa_parte"]
          resolucion?: string | null
          resuelta_por?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputas_asignacion_id_fkey"
            columns: ["asignacion_id"]
            isOneToOne: false
            referencedRelation: "asignaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputas_resuelta_por_fkey"
            columns: ["resuelta_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_anunciante: {
        Row: {
          anunciante_id: string
          archivo_path: string
          created_at: string
          estado_validacion: Database["public"]["Enums"]["documento_estado"]
          fecha_vencimiento: string | null
          id: string
          observaciones: string | null
          subido_por: string | null
          tipo: Database["public"]["Enums"]["documento_anunciante_tipo"]
          updated_at: string
          validado_at: string | null
          validado_por: string | null
        }
        Insert: {
          anunciante_id: string
          archivo_path: string
          created_at?: string
          estado_validacion?: Database["public"]["Enums"]["documento_estado"]
          fecha_vencimiento?: string | null
          id?: string
          observaciones?: string | null
          subido_por?: string | null
          tipo: Database["public"]["Enums"]["documento_anunciante_tipo"]
          updated_at?: string
          validado_at?: string | null
          validado_por?: string | null
        }
        Update: {
          anunciante_id?: string
          archivo_path?: string
          created_at?: string
          estado_validacion?: Database["public"]["Enums"]["documento_estado"]
          fecha_vencimiento?: string | null
          id?: string
          observaciones?: string | null
          subido_por?: string | null
          tipo?: Database["public"]["Enums"]["documento_anunciante_tipo"]
          updated_at?: string
          validado_at?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_anunciante_anunciante_id_fkey"
            columns: ["anunciante_id"]
            isOneToOne: false
            referencedRelation: "anunciantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_anunciante_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_anunciante_validado_por_fkey"
            columns: ["validado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_medio: {
        Row: {
          archivo_path: string
          created_at: string
          estado_validacion: Database["public"]["Enums"]["documento_estado"]
          fecha_vencimiento: string | null
          id: string
          medio_id: string
          observaciones: string | null
          subido_por: string | null
          tipo: Database["public"]["Enums"]["documento_medio_tipo"]
          updated_at: string
          validado_at: string | null
          validado_por: string | null
        }
        Insert: {
          archivo_path: string
          created_at?: string
          estado_validacion?: Database["public"]["Enums"]["documento_estado"]
          fecha_vencimiento?: string | null
          id?: string
          medio_id: string
          observaciones?: string | null
          subido_por?: string | null
          tipo: Database["public"]["Enums"]["documento_medio_tipo"]
          updated_at?: string
          validado_at?: string | null
          validado_por?: string | null
        }
        Update: {
          archivo_path?: string
          created_at?: string
          estado_validacion?: Database["public"]["Enums"]["documento_estado"]
          fecha_vencimiento?: string | null
          id?: string
          medio_id?: string
          observaciones?: string | null
          subido_por?: string | null
          tipo?: Database["public"]["Enums"]["documento_medio_tipo"]
          updated_at?: string
          validado_at?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_medio_medio_id_fkey"
            columns: ["medio_id"]
            isOneToOne: false
            referencedRelation: "medios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_medio_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_medio_validado_por_fkey"
            columns: ["validado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_soporte: {
        Row: {
          anulado_at: string | null
          archivo_path: string | null
          consecutivo: number | null
          created_at: string
          cuds: string | null
          emitido_at: string | null
          estado: Database["public"]["Enums"]["documento_soporte_estado"]
          fecha_emision: string | null
          id: string
          liquidacion_id: string
          numero: string | null
          prefijo: string | null
          resolucion_id: string | null
          updated_at: string
          valor_total: number
        }
        Insert: {
          anulado_at?: string | null
          archivo_path?: string | null
          consecutivo?: number | null
          created_at?: string
          cuds?: string | null
          emitido_at?: string | null
          estado?: Database["public"]["Enums"]["documento_soporte_estado"]
          fecha_emision?: string | null
          id?: string
          liquidacion_id: string
          numero?: string | null
          prefijo?: string | null
          resolucion_id?: string | null
          updated_at?: string
          valor_total: number
        }
        Update: {
          anulado_at?: string | null
          archivo_path?: string | null
          consecutivo?: number | null
          created_at?: string
          cuds?: string | null
          emitido_at?: string | null
          estado?: Database["public"]["Enums"]["documento_soporte_estado"]
          fecha_emision?: string | null
          id?: string
          liquidacion_id?: string
          numero?: string | null
          prefijo?: string | null
          resolucion_id?: string | null
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "documentos_soporte_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_soporte_resolucion_id_fkey"
            columns: ["resolucion_id"]
            isOneToOne: false
            referencedRelation: "resoluciones_dian"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas: {
        Row: {
          anulada_at: string | null
          anunciante_id: string
          archivo_path: string | null
          campana_id: string | null
          consecutivo: number | null
          created_at: string
          cufe: string | null
          emitida_at: string | null
          es_demo: boolean
          estado: Database["public"]["Enums"]["factura_estado"]
          fecha_emision: string | null
          fecha_vencimiento: string | null
          id: string
          iva: number
          numero: string | null
          pagada_at: string | null
          pagado: number
          periodo_desde: string | null
          periodo_hasta: string | null
          prefijo: string | null
          resolucion_id: string | null
          saldo: number | null
          subtotal: number
          total: number | null
          updated_at: string
          vencida_at: string | null
        }
        Insert: {
          anulada_at?: string | null
          anunciante_id: string
          archivo_path?: string | null
          campana_id?: string | null
          consecutivo?: number | null
          created_at?: string
          cufe?: string | null
          emitida_at?: string | null
          es_demo?: boolean
          estado?: Database["public"]["Enums"]["factura_estado"]
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          id?: string
          iva?: number
          numero?: string | null
          pagada_at?: string | null
          pagado?: number
          periodo_desde?: string | null
          periodo_hasta?: string | null
          prefijo?: string | null
          resolucion_id?: string | null
          saldo?: number | null
          subtotal?: number
          total?: number | null
          updated_at?: string
          vencida_at?: string | null
        }
        Update: {
          anulada_at?: string | null
          anunciante_id?: string
          archivo_path?: string | null
          campana_id?: string | null
          consecutivo?: number | null
          created_at?: string
          cufe?: string | null
          emitida_at?: string | null
          es_demo?: boolean
          estado?: Database["public"]["Enums"]["factura_estado"]
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          id?: string
          iva?: number
          numero?: string | null
          pagada_at?: string | null
          pagado?: number
          periodo_desde?: string | null
          periodo_hasta?: string | null
          prefijo?: string | null
          resolucion_id?: string | null
          saldo?: number | null
          subtotal?: number
          total?: number | null
          updated_at?: string
          vencida_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facturas_anunciante_id_fkey"
            columns: ["anunciante_id"]
            isOneToOne: false
            referencedRelation: "anunciantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campanas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_resolucion_id_fkey"
            columns: ["resolucion_id"]
            isOneToOne: false
            referencedRelation: "resoluciones_dian"
            referencedColumns: ["id"]
          },
        ]
      }
      formatos: {
        Row: {
          activo: boolean
          clave: string
          created_at: string
          id: string
          nombre: string
          orden: number
          plataforma: Database["public"]["Enums"]["plataforma"]
          requisitos: Json
          updated_at: string
        }
        Insert: {
          activo?: boolean
          clave: string
          created_at?: string
          id?: string
          nombre: string
          orden?: number
          plataforma: Database["public"]["Enums"]["plataforma"]
          requisitos?: Json
          updated_at?: string
        }
        Update: {
          activo?: boolean
          clave?: string
          created_at?: string
          id?: string
          nombre?: string
          orden?: number
          plataforma?: Database["public"]["Enums"]["plataforma"]
          requisitos?: Json
          updated_at?: string
        }
        Relationships: []
      }
      franjas: {
        Row: {
          activa: boolean
          clave: string
          created_at: string
          id: string
          nombre: string
          orden: number
          seguidores_max: number | null
          seguidores_min: number
          updated_at: string
        }
        Insert: {
          activa?: boolean
          clave: string
          created_at?: string
          id?: string
          nombre: string
          orden: number
          seguidores_max?: number | null
          seguidores_min: number
          updated_at?: string
        }
        Update: {
          activa?: boolean
          clave?: string
          created_at?: string
          id?: string
          nombre?: string
          orden?: number
          seguidores_max?: number | null
          seguidores_min?: number
          updated_at?: string
        }
        Relationships: []
      }
      liquidaciones: {
        Row: {
          alerta_seg_social: boolean
          anulada_at: string | null
          aprobada_at: string | null
          aprobada_por: string | null
          cantidad_asignaciones: number
          creada_por: string | null
          created_at: string
          dispersion_id: string | null
          es_demo: boolean
          estado: Database["public"]["Enums"]["liquidacion_estado"]
          factura_medio_path: string | null
          fecha_pago: string | null
          id: string
          medio_id: string
          monto_bruto: number
          monto_comision: number
          monto_medio: number
          monto_neto: number
          monto_retenciones: number
          numero_factura_medio: string | null
          pagada_at: string | null
          periodo_fin: string
          periodo_inicio: string
          referencia_pago: string | null
          requiere_documento_soporte: boolean
          soporte_pago_path: string | null
          updated_at: string
        }
        Insert: {
          alerta_seg_social?: boolean
          anulada_at?: string | null
          aprobada_at?: string | null
          aprobada_por?: string | null
          cantidad_asignaciones?: number
          creada_por?: string | null
          created_at?: string
          dispersion_id?: string | null
          es_demo?: boolean
          estado?: Database["public"]["Enums"]["liquidacion_estado"]
          factura_medio_path?: string | null
          fecha_pago?: string | null
          id?: string
          medio_id: string
          monto_bruto?: number
          monto_comision?: number
          monto_medio?: number
          monto_neto?: number
          monto_retenciones?: number
          numero_factura_medio?: string | null
          pagada_at?: string | null
          periodo_fin: string
          periodo_inicio: string
          referencia_pago?: string | null
          requiere_documento_soporte: boolean
          soporte_pago_path?: string | null
          updated_at?: string
        }
        Update: {
          alerta_seg_social?: boolean
          anulada_at?: string | null
          aprobada_at?: string | null
          aprobada_por?: string | null
          cantidad_asignaciones?: number
          creada_por?: string | null
          created_at?: string
          dispersion_id?: string | null
          es_demo?: boolean
          estado?: Database["public"]["Enums"]["liquidacion_estado"]
          factura_medio_path?: string | null
          fecha_pago?: string | null
          id?: string
          medio_id?: string
          monto_bruto?: number
          monto_comision?: number
          monto_medio?: number
          monto_neto?: number
          monto_retenciones?: number
          numero_factura_medio?: string | null
          pagada_at?: string | null
          periodo_fin?: string
          periodo_inicio?: string
          referencia_pago?: string | null
          requiere_documento_soporte?: boolean
          soporte_pago_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquidaciones_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_dispersion_id_fkey"
            columns: ["dispersion_id"]
            isOneToOne: false
            referencedRelation: "dispersiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_medio_id_fkey"
            columns: ["medio_id"]
            isOneToOne: false
            referencedRelation: "medios"
            referencedColumns: ["id"]
          },
        ]
      }
      medio_audiencia_paises: {
        Row: {
          actualizado_at: string
          fuente: Database["public"]["Enums"]["audiencia_fuente"]
          medio_id: string
          pais_iso2: string
          porcentaje: number
        }
        Insert: {
          actualizado_at?: string
          fuente?: Database["public"]["Enums"]["audiencia_fuente"]
          medio_id: string
          pais_iso2: string
          porcentaje: number
        }
        Update: {
          actualizado_at?: string
          fuente?: Database["public"]["Enums"]["audiencia_fuente"]
          medio_id?: string
          pais_iso2?: string
          porcentaje?: number
        }
        Relationships: [
          {
            foreignKeyName: "medio_audiencia_paises_medio_id_fkey"
            columns: ["medio_id"]
            isOneToOne: false
            referencedRelation: "medios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medio_audiencia_paises_pais_iso2_fkey"
            columns: ["pais_iso2"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["iso2"]
          },
        ]
      }
      medio_categorias: {
        Row: {
          categoria_id: string
          created_at: string
          medio_id: string
        }
        Insert: {
          categoria_id: string
          created_at?: string
          medio_id: string
        }
        Update: {
          categoria_id?: string
          created_at?: string
          medio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medio_categorias_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medio_categorias_medio_id_fkey"
            columns: ["medio_id"]
            isOneToOne: false
            referencedRelation: "medios"
            referencedColumns: ["id"]
          },
        ]
      }
      medio_pertinencia_geografica: {
        Row: {
          clasificado_at: string
          clasificado_por: string | null
          medio_id: string
          multiplicador: number
          municipio_codigo: string
          notas: string | null
        }
        Insert: {
          clasificado_at?: string
          clasificado_por?: string | null
          medio_id: string
          multiplicador?: number
          municipio_codigo: string
          notas?: string | null
        }
        Update: {
          clasificado_at?: string
          clasificado_por?: string | null
          medio_id?: string
          multiplicador?: number
          municipio_codigo?: string
          notas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medio_pertinencia_geografica_clasificado_por_fkey"
            columns: ["clasificado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medio_pertinencia_geografica_medio_id_fkey"
            columns: ["medio_id"]
            isOneToOne: false
            referencedRelation: "medios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medio_pertinencia_geografica_municipio_codigo_fkey"
            columns: ["municipio_codigo"]
            isOneToOne: false
            referencedRelation: "municipios"
            referencedColumns: ["codigo"]
          },
        ]
      }
      medios: {
        Row: {
          calificacion_promedio: number | null
          created_at: string
          deleted_at: string | null
          departamento_codigo: string | null
          descripcion_audiencia: string | null
          es_demo: boolean
          estado: Database["public"]["Enums"]["medio_estado"]
          id: string
          lat: number | null
          lon: number | null
          motivo_estado: string | null
          municipio_codigo: string
          n_cumplimiento: number
          nivel_verificacion: number
          nombre: string
          nombre_normalizado: string | null
          publicaciones_verificadas: number
          rechazado_at: string | null
          suspendido_at: string | null
          tasa_cumplimiento: number | null
          tipo: Database["public"]["Enums"]["medio_tipo"]
          updated_at: string
          verificado_at: string | null
          verificado_por: string | null
        }
        Insert: {
          calificacion_promedio?: number | null
          created_at?: string
          deleted_at?: string | null
          departamento_codigo?: string | null
          descripcion_audiencia?: string | null
          es_demo?: boolean
          estado?: Database["public"]["Enums"]["medio_estado"]
          id?: string
          lat?: number | null
          lon?: number | null
          motivo_estado?: string | null
          municipio_codigo: string
          n_cumplimiento?: number
          nivel_verificacion?: number
          nombre: string
          nombre_normalizado?: string | null
          publicaciones_verificadas?: number
          rechazado_at?: string | null
          suspendido_at?: string | null
          tasa_cumplimiento?: number | null
          tipo: Database["public"]["Enums"]["medio_tipo"]
          updated_at?: string
          verificado_at?: string | null
          verificado_por?: string | null
        }
        Update: {
          calificacion_promedio?: number | null
          created_at?: string
          deleted_at?: string | null
          departamento_codigo?: string | null
          descripcion_audiencia?: string | null
          es_demo?: boolean
          estado?: Database["public"]["Enums"]["medio_estado"]
          id?: string
          lat?: number | null
          lon?: number | null
          motivo_estado?: string | null
          municipio_codigo?: string
          n_cumplimiento?: number
          nivel_verificacion?: number
          nombre?: string
          nombre_normalizado?: string | null
          publicaciones_verificadas?: number
          rechazado_at?: string | null
          suspendido_at?: string | null
          tasa_cumplimiento?: number | null
          tipo?: Database["public"]["Enums"]["medio_tipo"]
          updated_at?: string
          verificado_at?: string | null
          verificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medios_departamento_codigo_fkey"
            columns: ["departamento_codigo"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "medios_municipio_codigo_fkey"
            columns: ["municipio_codigo"]
            isOneToOne: false
            referencedRelation: "municipios"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "medios_verificado_por_fkey"
            columns: ["verificado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      medios_privado: {
        Row: {
          celular: string | null
          created_at: string
          datos_pago_cifrados: string | null
          datos_pago_resumen: string | null
          direccion: string | null
          email_contacto: string | null
          es_declarante: boolean
          medio_id: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"] | null
          numero_documento_cifrado: string | null
          numero_documento_hash: string | null
          numero_documento_resumen: string | null
          obligado_facturar: boolean
          responsable_iva: boolean
          tipo_documento:
            | Database["public"]["Enums"]["documento_identidad_tipo"]
            | null
          titular_nombre: string | null
          updated_at: string
        }
        Insert: {
          celular?: string | null
          created_at?: string
          datos_pago_cifrados?: string | null
          datos_pago_resumen?: string | null
          direccion?: string | null
          email_contacto?: string | null
          es_declarante?: boolean
          medio_id: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"] | null
          numero_documento_cifrado?: string | null
          numero_documento_hash?: string | null
          numero_documento_resumen?: string | null
          obligado_facturar?: boolean
          responsable_iva?: boolean
          tipo_documento?:
            | Database["public"]["Enums"]["documento_identidad_tipo"]
            | null
          titular_nombre?: string | null
          updated_at?: string
        }
        Update: {
          celular?: string | null
          created_at?: string
          datos_pago_cifrados?: string | null
          datos_pago_resumen?: string | null
          direccion?: string | null
          email_contacto?: string | null
          es_declarante?: boolean
          medio_id?: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"] | null
          numero_documento_cifrado?: string | null
          numero_documento_hash?: string | null
          numero_documento_resumen?: string | null
          obligado_facturar?: boolean
          responsable_iva?: boolean
          tipo_documento?:
            | Database["public"]["Enums"]["documento_identidad_tipo"]
            | null
          titular_nombre?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medios_privado_medio_id_fkey"
            columns: ["medio_id"]
            isOneToOne: true
            referencedRelation: "medios"
            referencedColumns: ["id"]
          },
        ]
      }
      metricas: {
        Row: {
          alcance: number | null
          alcance_norm: number | null
          alerta_desviacion: boolean
          alerta_multiplo: boolean
          anunciante_id: string
          asignacion_id: string
          captura_path: string
          clics_enlace: number | null
          comentarios: number | null
          compartidos: number | null
          corte: Database["public"]["Enums"]["corte_metrica"]
          created_at: string
          detalle_alertas: Json
          espectadores_unicos: number | null
          estado_validacion: Database["public"]["Enums"]["validacion_estado"]
          fecha_corte: string
          fuente: Database["public"]["Enums"]["metrica_fuente"]
          guardados: number | null
          id: string
          impresiones: number | null
          impresiones_norm: number | null
          interacciones: number | null
          me_gusta: number | null
          medio_id: string
          miniatura_path: string | null
          observaciones: string | null
          periodo_desde: string | null
          periodo_hasta: string | null
          plataforma: Database["public"]["Enums"]["plataforma"]
          porcentaje_reproduccion_completa: number | null
          publicacion_id: string
          reproducciones: number | null
          tiempo_promedio_visualizacion_s: number | null
          updated_at: string
          validada_at: string | null
          validada_por: string | null
          visitas_perfil: number | null
        }
        Insert: {
          alcance?: number | null
          alcance_norm?: number | null
          alerta_desviacion?: boolean
          alerta_multiplo?: boolean
          anunciante_id: string
          asignacion_id: string
          captura_path: string
          clics_enlace?: number | null
          comentarios?: number | null
          compartidos?: number | null
          corte: Database["public"]["Enums"]["corte_metrica"]
          created_at?: string
          detalle_alertas?: Json
          espectadores_unicos?: number | null
          estado_validacion?: Database["public"]["Enums"]["validacion_estado"]
          fecha_corte: string
          fuente?: Database["public"]["Enums"]["metrica_fuente"]
          guardados?: number | null
          id?: string
          impresiones?: number | null
          impresiones_norm?: number | null
          interacciones?: number | null
          me_gusta?: number | null
          medio_id: string
          miniatura_path?: string | null
          observaciones?: string | null
          periodo_desde?: string | null
          periodo_hasta?: string | null
          plataforma: Database["public"]["Enums"]["plataforma"]
          porcentaje_reproduccion_completa?: number | null
          publicacion_id: string
          reproducciones?: number | null
          tiempo_promedio_visualizacion_s?: number | null
          updated_at?: string
          validada_at?: string | null
          validada_por?: string | null
          visitas_perfil?: number | null
        }
        Update: {
          alcance?: number | null
          alcance_norm?: number | null
          alerta_desviacion?: boolean
          alerta_multiplo?: boolean
          anunciante_id?: string
          asignacion_id?: string
          captura_path?: string
          clics_enlace?: number | null
          comentarios?: number | null
          compartidos?: number | null
          corte?: Database["public"]["Enums"]["corte_metrica"]
          created_at?: string
          detalle_alertas?: Json
          espectadores_unicos?: number | null
          estado_validacion?: Database["public"]["Enums"]["validacion_estado"]
          fecha_corte?: string
          fuente?: Database["public"]["Enums"]["metrica_fuente"]
          guardados?: number | null
          id?: string
          impresiones?: number | null
          impresiones_norm?: number | null
          interacciones?: number | null
          me_gusta?: number | null
          medio_id?: string
          miniatura_path?: string | null
          observaciones?: string | null
          periodo_desde?: string | null
          periodo_hasta?: string | null
          plataforma?: Database["public"]["Enums"]["plataforma"]
          porcentaje_reproduccion_completa?: number | null
          publicacion_id?: string
          reproducciones?: number | null
          tiempo_promedio_visualizacion_s?: number | null
          updated_at?: string
          validada_at?: string | null
          validada_por?: string | null
          visitas_perfil?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metricas_asignacion_id_fkey"
            columns: ["asignacion_id"]
            isOneToOne: false
            referencedRelation: "asignaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metricas_publicacion_id_fkey"
            columns: ["publicacion_id"]
            isOneToOne: false
            referencedRelation: "publicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      municipios: {
        Row: {
          activo: boolean
          bbox: number[] | null
          codigo: string
          codigo_geometria: string
          departamento_codigo: string
          es_capital: boolean
          lat: number | null
          lon: number | null
          nombre: string
          nombre_normalizado: string
          tipo: string
        }
        Insert: {
          activo?: boolean
          bbox?: number[] | null
          codigo: string
          codigo_geometria: string
          departamento_codigo: string
          es_capital?: boolean
          lat?: number | null
          lon?: number | null
          nombre: string
          nombre_normalizado: string
          tipo: string
        }
        Update: {
          activo?: boolean
          bbox?: number[] | null
          codigo?: string
          codigo_geometria?: string
          departamento_codigo?: string
          es_capital?: boolean
          lat?: number | null
          lon?: number | null
          nombre?: string
          nombre_normalizado?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "municipios_codigo_geometria_fkey"
            columns: ["codigo_geometria"]
            isOneToOne: false
            referencedRelation: "municipios"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "municipios_departamento_codigo_fkey"
            columns: ["departamento_codigo"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["codigo"]
          },
        ]
      }
      niveles_verificacion: {
        Row: {
          created_at: string
          documentos_requeridos: Database["public"]["Enums"]["documento_medio_tipo"][]
          nivel: number
          nombre: string
          pendiente_validacion: boolean
          porcentaje_alerta: number
          porcentaje_bloqueo: number
          requisitos: string[]
          tope_anual: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          documentos_requeridos: Database["public"]["Enums"]["documento_medio_tipo"][]
          nivel: number
          nombre: string
          pendiente_validacion?: boolean
          porcentaje_alerta?: number
          porcentaje_bloqueo?: number
          requisitos: string[]
          tope_anual?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          documentos_requeridos?: Database["public"]["Enums"]["documento_medio_tipo"][]
          nivel?: number
          nombre?: string
          pendiente_validacion?: boolean
          porcentaje_alerta?: number
          porcentaje_bloqueo?: number
          requisitos?: string[]
          tope_anual?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      notificaciones: {
        Row: {
          canal: Database["public"]["Enums"]["notificacion_canal"]
          created_at: string
          entidad: string | null
          entidad_id: string | null
          enviada_email_at: string | null
          es_demo: boolean
          id: number
          leida: boolean
          leida_at: string | null
          mensaje: string
          prioridad: number
          tipo: string
          titulo: string
          url: string | null
          usuario_id: string
        }
        Insert: {
          canal?: Database["public"]["Enums"]["notificacion_canal"]
          created_at?: string
          entidad?: string | null
          entidad_id?: string | null
          enviada_email_at?: string | null
          es_demo?: boolean
          id?: never
          leida?: boolean
          leida_at?: string | null
          mensaje: string
          prioridad?: number
          tipo: string
          titulo: string
          url?: string | null
          usuario_id: string
        }
        Update: {
          canal?: Database["public"]["Enums"]["notificacion_canal"]
          created_at?: string
          entidad?: string | null
          entidad_id?: string | null
          enviada_email_at?: string | null
          es_demo?: boolean
          id?: never
          leida?: boolean
          leida_at?: string | null
          mensaje?: string
          prioridad?: number
          tipo?: string
          titulo?: string
          url?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oferta_cupos: {
        Row: {
          created_at: string
          cupos_ocupados: number
          cupos_totales: number
          franja_id: string
          oferta_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cupos_ocupados?: number
          cupos_totales: number
          franja_id: string
          oferta_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cupos_ocupados?: number
          cupos_totales?: number
          franja_id?: string
          oferta_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oferta_cupos_franja_id_fkey"
            columns: ["franja_id"]
            isOneToOne: false
            referencedRelation: "franjas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oferta_cupos_oferta_id_fkey"
            columns: ["oferta_id"]
            isOneToOne: false
            referencedRelation: "ofertas"
            referencedColumns: ["id"]
          },
        ]
      }
      oferta_vistas: {
        Row: {
          id: number
          medio_id: string
          oferta_id: string
          primera_vista_at: string
          ultima_vista_at: string
          veces: number
        }
        Insert: {
          id?: never
          medio_id: string
          oferta_id: string
          primera_vista_at?: string
          ultima_vista_at?: string
          veces?: number
        }
        Update: {
          id?: never
          medio_id?: string
          oferta_id?: string
          primera_vista_at?: string
          ultima_vista_at?: string
          veces?: number
        }
        Relationships: [
          {
            foreignKeyName: "oferta_vistas_medio_id_fkey"
            columns: ["medio_id"]
            isOneToOne: false
            referencedRelation: "medios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oferta_vistas_oferta_id_fkey"
            columns: ["oferta_id"]
            isOneToOne: false
            referencedRelation: "ofertas"
            referencedColumns: ["id"]
          },
        ]
      }
      ofertas: {
        Row: {
          anunciante_id: string
          campana_id: string
          cancelada_at: string | null
          categorias_objetivo: string[]
          cerrada_at: string | null
          comentario_moderacion: string | null
          cortes_requeridos: Database["public"]["Enums"]["corte_metrica"][]
          creada_por: string | null
          created_at: string
          cupos_completos_at: string | null
          cupos_ocupados: number
          cupos_totales: number
          deleted_at: string | null
          departamentos_objetivo: string[]
          devuelta_at: string | null
          en_ejecucion_at: string | null
          enviada_at: string | null
          estado: Database["public"]["Enums"]["oferta_estado"]
          exclusividad_dias: number | null
          fecha_limite_aceptacion: string
          formato_id: string
          id: string
          instrucciones: string | null
          llena_at: string | null
          medios_excluidos: string[]
          moderada_por: string | null
          municipios_objetivo: string[]
          permanencia_minima_dias: number
          permite_multiples_cupos: boolean
          plataforma: Database["public"]["Enums"]["plataforma"]
          presupuesto_comprometido: number
          presupuesto_maximo: number
          publicaciones_por_medio: number
          publicada_at: string | null
          restricciones: string | null
          seguidores_minimos: number | null
          titulo: string
          tope_porcentaje_por_medio: number
          updated_at: string
          vencida_at: string | null
          ventana_fin: string
          ventana_inicio: string
        }
        Insert: {
          anunciante_id: string
          campana_id: string
          cancelada_at?: string | null
          categorias_objetivo?: string[]
          cerrada_at?: string | null
          comentario_moderacion?: string | null
          cortes_requeridos: Database["public"]["Enums"]["corte_metrica"][]
          creada_por?: string | null
          created_at?: string
          cupos_completos_at?: string | null
          cupos_ocupados?: number
          cupos_totales?: number
          deleted_at?: string | null
          departamentos_objetivo?: string[]
          devuelta_at?: string | null
          en_ejecucion_at?: string | null
          enviada_at?: string | null
          estado?: Database["public"]["Enums"]["oferta_estado"]
          exclusividad_dias?: number | null
          fecha_limite_aceptacion: string
          formato_id: string
          id?: string
          instrucciones?: string | null
          llena_at?: string | null
          medios_excluidos?: string[]
          moderada_por?: string | null
          municipios_objetivo?: string[]
          permanencia_minima_dias?: number
          permite_multiples_cupos?: boolean
          plataforma: Database["public"]["Enums"]["plataforma"]
          presupuesto_comprometido?: number
          presupuesto_maximo: number
          publicaciones_por_medio?: number
          publicada_at?: string | null
          restricciones?: string | null
          seguidores_minimos?: number | null
          titulo: string
          tope_porcentaje_por_medio: number
          updated_at?: string
          vencida_at?: string | null
          ventana_fin: string
          ventana_inicio: string
        }
        Update: {
          anunciante_id?: string
          campana_id?: string
          cancelada_at?: string | null
          categorias_objetivo?: string[]
          cerrada_at?: string | null
          comentario_moderacion?: string | null
          cortes_requeridos?: Database["public"]["Enums"]["corte_metrica"][]
          creada_por?: string | null
          created_at?: string
          cupos_completos_at?: string | null
          cupos_ocupados?: number
          cupos_totales?: number
          deleted_at?: string | null
          departamentos_objetivo?: string[]
          devuelta_at?: string | null
          en_ejecucion_at?: string | null
          enviada_at?: string | null
          estado?: Database["public"]["Enums"]["oferta_estado"]
          exclusividad_dias?: number | null
          fecha_limite_aceptacion?: string
          formato_id?: string
          id?: string
          instrucciones?: string | null
          llena_at?: string | null
          medios_excluidos?: string[]
          moderada_por?: string | null
          municipios_objetivo?: string[]
          permanencia_minima_dias?: number
          permite_multiples_cupos?: boolean
          plataforma?: Database["public"]["Enums"]["plataforma"]
          presupuesto_comprometido?: number
          presupuesto_maximo?: number
          publicaciones_por_medio?: number
          publicada_at?: string | null
          restricciones?: string | null
          seguidores_minimos?: number | null
          titulo?: string
          tope_porcentaje_por_medio?: number
          updated_at?: string
          vencida_at?: string | null
          ventana_fin?: string
          ventana_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "ofertas_anunciante_id_fkey"
            columns: ["anunciante_id"]
            isOneToOne: false
            referencedRelation: "anunciantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campanas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_formato_fkey"
            columns: ["formato_id", "plataforma"]
            isOneToOne: false
            referencedRelation: "formatos"
            referencedColumns: ["id", "plataforma"]
          },
          {
            foreignKeyName: "ofertas_moderada_por_fkey"
            columns: ["moderada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_anunciante: {
        Row: {
          anunciante_id: string
          created_at: string
          es_demo: boolean
          factura_id: string
          fecha_pago: string
          id: string
          medio_pago: string
          monto: number
          referencia: string | null
          registrado_por: string | null
          soporte_path: string | null
        }
        Insert: {
          anunciante_id: string
          created_at?: string
          es_demo?: boolean
          factura_id: string
          fecha_pago: string
          id?: string
          medio_pago: string
          monto: number
          referencia?: string | null
          registrado_por?: string | null
          soporte_path?: string | null
        }
        Update: {
          anunciante_id?: string
          created_at?: string
          es_demo?: boolean
          factura_id?: string
          fecha_pago?: string
          id?: string
          medio_pago?: string
          monto?: number
          referencia?: string | null
          registrado_por?: string | null
          soporte_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_anunciante_anunciante_id_fkey"
            columns: ["anunciante_id"]
            isOneToOne: false
            referencedRelation: "anunciantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_anunciante_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
        ]
      }
      paises: {
        Row: {
          alias: string[]
          con_geometria: boolean
          continente: string
          iso2: string
          iso3: string
          lat: number | null
          lon: number | null
          nombre: string
          nombre_normalizado: string
          numerico: string | null
          subregion: string | null
        }
        Insert: {
          alias?: string[]
          con_geometria?: boolean
          continente: string
          iso2: string
          iso3: string
          lat?: number | null
          lon?: number | null
          nombre: string
          nombre_normalizado: string
          numerico?: string | null
          subregion?: string | null
        }
        Update: {
          alias?: string[]
          con_geometria?: boolean
          continente?: string
          iso2?: string
          iso3?: string
          lat?: number | null
          lon?: number | null
          nombre?: string
          nombre_normalizado?: string
          numerico?: string | null
          subregion?: string | null
        }
        Relationships: []
      }
      parametros_tributarios: {
        Row: {
          anio: number
          created_at: string
          pendiente_validacion: boolean
          smlmv: number
          umbral_seg_social_smlmv: number | null
          updated_at: string
          uvt: number
        }
        Insert: {
          anio: number
          created_at?: string
          pendiente_validacion?: boolean
          smlmv: number
          umbral_seg_social_smlmv?: number | null
          updated_at?: string
          uvt: number
        }
        Update: {
          anio?: number
          created_at?: string
          pendiente_validacion?: boolean
          smlmv?: number
          umbral_seg_social_smlmv?: number | null
          updated_at?: string
          uvt?: number
        }
        Relationships: []
      }
      perfiles: {
        Row: {
          activado_at: string | null
          anunciante_id: string | null
          avatar_path: string | null
          celular: string | null
          created_at: string
          debe_cambiar_password: boolean
          deleted_at: string | null
          desactivado_at: string | null
          email: string
          es_demo: boolean
          estado: Database["public"]["Enums"]["perfil_estado"]
          id: string
          invitado_por: string | null
          medio_id: string | null
          motivo_estado: string | null
          nombre: string | null
          preferencias: Json
          rol_id: string | null
          suspendido_at: string | null
          ultimo_acceso_at: string | null
          updated_at: string
        }
        Insert: {
          activado_at?: string | null
          anunciante_id?: string | null
          avatar_path?: string | null
          celular?: string | null
          created_at?: string
          debe_cambiar_password?: boolean
          deleted_at?: string | null
          desactivado_at?: string | null
          email: string
          es_demo?: boolean
          estado?: Database["public"]["Enums"]["perfil_estado"]
          id: string
          invitado_por?: string | null
          medio_id?: string | null
          motivo_estado?: string | null
          nombre?: string | null
          preferencias?: Json
          rol_id?: string | null
          suspendido_at?: string | null
          ultimo_acceso_at?: string | null
          updated_at?: string
        }
        Update: {
          activado_at?: string | null
          anunciante_id?: string | null
          avatar_path?: string | null
          celular?: string | null
          created_at?: string
          debe_cambiar_password?: boolean
          deleted_at?: string | null
          desactivado_at?: string | null
          email?: string
          es_demo?: boolean
          estado?: Database["public"]["Enums"]["perfil_estado"]
          id?: string
          invitado_por?: string | null
          medio_id?: string | null
          motivo_estado?: string | null
          nombre?: string | null
          preferencias?: Json
          rol_id?: string | null
          suspendido_at?: string | null
          ultimo_acceso_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfiles_anunciante_id_fkey"
            columns: ["anunciante_id"]
            isOneToOne: false
            referencedRelation: "anunciantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfiles_invitado_por_fkey"
            columns: ["invitado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfiles_medio_id_fkey"
            columns: ["medio_id"]
            isOneToOne: false
            referencedRelation: "medios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfiles_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles_privado: {
        Row: {
          created_at: string
          direccion: string | null
          fecha_nacimiento: string | null
          notas_internas: string | null
          numero_documento_cifrado: string | null
          numero_documento_hash: string | null
          numero_documento_resumen: string | null
          perfil_id: string
          tipo_documento:
            | Database["public"]["Enums"]["documento_identidad_tipo"]
            | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          direccion?: string | null
          fecha_nacimiento?: string | null
          notas_internas?: string | null
          numero_documento_cifrado?: string | null
          numero_documento_hash?: string | null
          numero_documento_resumen?: string | null
          perfil_id: string
          tipo_documento?:
            | Database["public"]["Enums"]["documento_identidad_tipo"]
            | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          direccion?: string | null
          fecha_nacimiento?: string | null
          notas_internas?: string | null
          numero_documento_cifrado?: string | null
          numero_documento_hash?: string | null
          numero_documento_resumen?: string | null
          perfil_id?: string
          tipo_documento?:
            | Database["public"]["Enums"]["documento_identidad_tipo"]
            | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfiles_privado_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: true
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permisos: {
        Row: {
          clave: string
          descripcion: string
          es_sensible: boolean
          modulo: string
          orden: number
        }
        Insert: {
          clave: string
          descripcion: string
          es_sensible?: boolean
          modulo: string
          orden?: number
        }
        Update: {
          clave?: string
          descripcion?: string
          es_sensible?: boolean
          modulo?: string
          orden?: number
        }
        Relationships: []
      }
      plantillas_notificacion: {
        Row: {
          activa: boolean
          asunto: string | null
          canal: Database["public"]["Enums"]["notificacion_canal"]
          clave: string
          created_at: string
          cuerpo: string
          nombre: string
          updated_at: string
          variables: string[]
        }
        Insert: {
          activa?: boolean
          asunto?: string | null
          canal: Database["public"]["Enums"]["notificacion_canal"]
          clave: string
          created_at?: string
          cuerpo: string
          nombre: string
          updated_at?: string
          variables?: string[]
        }
        Update: {
          activa?: boolean
          asunto?: string | null
          canal?: Database["public"]["Enums"]["notificacion_canal"]
          clave?: string
          created_at?: string
          cuerpo?: string
          nombre?: string
          updated_at?: string
          variables?: string[]
        }
        Relationships: []
      }
      publicaciones: {
        Row: {
          anunciante_id: string
          asignacion_id: string
          captura_path: string
          created_at: string
          estado_validacion: Database["public"]["Enums"]["validacion_estado"]
          etiqueta_publicidad_confirmada: boolean
          etiqueta_verificada: boolean
          fecha_publicacion: string
          id: string
          medio_id: string
          miniatura_path: string | null
          numero: number
          observaciones: string | null
          permanencia_hasta: string
          permanencia_verificada_at: string | null
          plataforma: Database["public"]["Enums"]["plataforma"]
          retirada_detectada_at: string | null
          updated_at: string
          url_post: string
          validada_at: string | null
          validada_por: string | null
        }
        Insert: {
          anunciante_id: string
          asignacion_id: string
          captura_path: string
          created_at?: string
          estado_validacion?: Database["public"]["Enums"]["validacion_estado"]
          etiqueta_publicidad_confirmada?: boolean
          etiqueta_verificada?: boolean
          fecha_publicacion: string
          id?: string
          medio_id: string
          miniatura_path?: string | null
          numero?: number
          observaciones?: string | null
          permanencia_hasta: string
          permanencia_verificada_at?: string | null
          plataforma: Database["public"]["Enums"]["plataforma"]
          retirada_detectada_at?: string | null
          updated_at?: string
          url_post: string
          validada_at?: string | null
          validada_por?: string | null
        }
        Update: {
          anunciante_id?: string
          asignacion_id?: string
          captura_path?: string
          created_at?: string
          estado_validacion?: Database["public"]["Enums"]["validacion_estado"]
          etiqueta_publicidad_confirmada?: boolean
          etiqueta_verificada?: boolean
          fecha_publicacion?: string
          id?: string
          medio_id?: string
          miniatura_path?: string | null
          numero?: number
          observaciones?: string | null
          permanencia_hasta?: string
          permanencia_verificada_at?: string | null
          plataforma?: Database["public"]["Enums"]["plataforma"]
          retirada_detectada_at?: string | null
          updated_at?: string
          url_post?: string
          validada_at?: string | null
          validada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publicaciones_asignacion_id_fkey"
            columns: ["asignacion_id"]
            isOneToOne: false
            referencedRelation: "asignaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publicaciones_validada_por_fkey"
            columns: ["validada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resoluciones_dian: {
        Row: {
          activa: boolean
          consecutivo_actual: number
          created_at: string
          fecha_resolucion: string
          id: string
          numero_resolucion: string
          prefijo: string
          rango_desde: number
          rango_hasta: number
          tipo: Database["public"]["Enums"]["documento_electronico_tipo"]
          updated_at: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          activa?: boolean
          consecutivo_actual: number
          created_at?: string
          fecha_resolucion: string
          id?: string
          numero_resolucion: string
          prefijo: string
          rango_desde: number
          rango_hasta: number
          tipo: Database["public"]["Enums"]["documento_electronico_tipo"]
          updated_at?: string
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          activa?: boolean
          consecutivo_actual?: number
          created_at?: string
          fecha_resolucion?: string
          id?: string
          numero_resolucion?: string
          prefijo?: string
          rango_desde?: number
          rango_hasta?: number
          tipo?: Database["public"]["Enums"]["documento_electronico_tipo"]
          updated_at?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: []
      }
      reteica_municipal: {
        Row: {
          base_minima_uvt: number
          created_at: string
          id: string
          municipio_codigo: string
          pendiente_validacion: boolean
          tarifa_por_mil: number
          updated_at: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          base_minima_uvt?: number
          created_at?: string
          id?: string
          municipio_codigo: string
          pendiente_validacion?: boolean
          tarifa_por_mil: number
          updated_at?: string
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          base_minima_uvt?: number
          created_at?: string
          id?: string
          municipio_codigo?: string
          pendiente_validacion?: boolean
          tarifa_por_mil?: number
          updated_at?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reteica_municipal_municipio_codigo_fkey"
            columns: ["municipio_codigo"]
            isOneToOne: false
            referencedRelation: "municipios"
            referencedColumns: ["codigo"]
          },
        ]
      }
      retenciones_config: {
        Row: {
          aplica_declarante: boolean
          base_minima_uvt: number
          concepto: string
          created_at: string
          id: string
          pendiente_validacion: boolean
          tarifa: number
          tipo: Database["public"]["Enums"]["retencion_tipo"]
          updated_at: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          aplica_declarante: boolean
          base_minima_uvt?: number
          concepto: string
          created_at?: string
          id?: string
          pendiente_validacion?: boolean
          tarifa: number
          tipo: Database["public"]["Enums"]["retencion_tipo"]
          updated_at?: string
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          aplica_declarante?: boolean
          base_minima_uvt?: number
          concepto?: string
          created_at?: string
          id?: string
          pendiente_validacion?: boolean
          tarifa?: number
          tipo?: Database["public"]["Enums"]["retencion_tipo"]
          updated_at?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: []
      }
      rol_permisos: {
        Row: {
          created_at: string
          otorgado_por: string | null
          permiso_clave: string
          rol_id: string
        }
        Insert: {
          created_at?: string
          otorgado_por?: string | null
          permiso_clave: string
          rol_id: string
        }
        Update: {
          created_at?: string
          otorgado_por?: string | null
          permiso_clave?: string
          rol_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rol_permisos_otorgado_por_fkey"
            columns: ["otorgado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rol_permisos_permiso_clave_fkey"
            columns: ["permiso_clave"]
            isOneToOne: false
            referencedRelation: "permisos"
            referencedColumns: ["clave"]
          },
          {
            foreignKeyName: "rol_permisos_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          clave: string
          color: string
          created_at: string
          descripcion: string | null
          es_sistema: boolean
          id: string
          nombre: string
          requiere_mfa: boolean
          tipo: Database["public"]["Enums"]["rol_tipo"]
          updated_at: string
        }
        Insert: {
          clave: string
          color?: string
          created_at?: string
          descripcion?: string | null
          es_sistema?: boolean
          id?: string
          nombre: string
          requiere_mfa?: boolean
          tipo: Database["public"]["Enums"]["rol_tipo"]
          updated_at?: string
        }
        Update: {
          clave?: string
          color?: string
          created_at?: string
          descripcion?: string | null
          es_sistema?: boolean
          id?: string
          nombre?: string
          requiere_mfa?: boolean
          tipo?: Database["public"]["Enums"]["rol_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      sectores: {
        Row: {
          activo: boolean
          created_at: string
          deleted_at: string | null
          descripcion: string | null
          id: string
          nombre: string
          nombre_normalizado: string | null
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          id?: string
          nombre: string
          nombre_normalizado?: string | null
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          deleted_at?: string | null
          descripcion?: string | null
          id?: string
          nombre?: string
          nombre_normalizado?: string | null
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      tarifas: {
        Row: {
          creada_por: string | null
          created_at: string
          formato_id: string
          franja_id: string
          id: string
          pendiente_validacion: boolean
          plataforma: Database["public"]["Enums"]["plataforma"]
          valor_base: number
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          creada_por?: string | null
          created_at?: string
          formato_id: string
          franja_id: string
          id?: string
          pendiente_validacion?: boolean
          plataforma: Database["public"]["Enums"]["plataforma"]
          valor_base: number
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          creada_por?: string | null
          created_at?: string
          formato_id?: string
          franja_id?: string
          id?: string
          pendiente_validacion?: boolean
          plataforma?: Database["public"]["Enums"]["plataforma"]
          valor_base?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarifas_formato_plataforma_fkey"
            columns: ["formato_id", "plataforma"]
            isOneToOne: false
            referencedRelation: "formatos"
            referencedColumns: ["id", "plataforma"]
          },
          {
            foreignKeyName: "tarifas_franja_id_fkey"
            columns: ["franja_id"]
            isOneToOne: false
            referencedRelation: "franjas"
            referencedColumns: ["id"]
          },
        ]
      }
      terminos_versiones: {
        Row: {
          contenido_md: string
          creada_por: string | null
          created_at: string
          hash_sha256: string | null
          id: string
          publicada: boolean
          tipo: Database["public"]["Enums"]["terminos_tipo"]
          updated_at: string
          version: string
          vigente_desde: string | null
        }
        Insert: {
          contenido_md: string
          creada_por?: string | null
          created_at?: string
          hash_sha256?: string | null
          id?: string
          publicada?: boolean
          tipo: Database["public"]["Enums"]["terminos_tipo"]
          updated_at?: string
          version: string
          vigente_desde?: string | null
        }
        Update: {
          contenido_md?: string
          creada_por?: string | null
          created_at?: string
          hash_sha256?: string | null
          id?: string
          publicada?: boolean
          tipo?: Database["public"]["Enums"]["terminos_tipo"]
          updated_at?: string
          version?: string
          vigente_desde?: string | null
        }
        Relationships: []
      }
      verificaciones_cuenta: {
        Row: {
          captura_path: string | null
          codigo_expira_at: string | null
          codigo_hash: string | null
          created_at: string
          cuenta_social_id: string
          estado_validacion: Database["public"]["Enums"]["validacion_estado"]
          id: string
          medio_id: string
          metodo: Database["public"]["Enums"]["metodo_verificacion"]
          observaciones: string | null
          seguidores_reportados: number
          seguidores_verificados: number | null
          updated_at: string
          validada_at: string | null
          validada_por: string | null
        }
        Insert: {
          captura_path?: string | null
          codigo_expira_at?: string | null
          codigo_hash?: string | null
          created_at?: string
          cuenta_social_id: string
          estado_validacion?: Database["public"]["Enums"]["validacion_estado"]
          id?: string
          medio_id: string
          metodo: Database["public"]["Enums"]["metodo_verificacion"]
          observaciones?: string | null
          seguidores_reportados: number
          seguidores_verificados?: number | null
          updated_at?: string
          validada_at?: string | null
          validada_por?: string | null
        }
        Update: {
          captura_path?: string | null
          codigo_expira_at?: string | null
          codigo_hash?: string | null
          created_at?: string
          cuenta_social_id?: string
          estado_validacion?: Database["public"]["Enums"]["validacion_estado"]
          id?: string
          medio_id?: string
          metodo?: Database["public"]["Enums"]["metodo_verificacion"]
          observaciones?: string | null
          seguidores_reportados?: number
          seguidores_verificados?: number | null
          updated_at?: string
          validada_at?: string | null
          validada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verificaciones_cuenta_cuenta_social_id_fkey"
            columns: ["cuenta_social_id"]
            isOneToOne: false
            referencedRelation: "cuentas_sociales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verificaciones_cuenta_medio_id_fkey"
            columns: ["medio_id"]
            isOneToOne: false
            referencedRelation: "medios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verificaciones_cuenta_validada_por_fkey"
            columns: ["validada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abrir_disputa_srv: {
        Args: {
          p_actor_id: string
          p_asignacion_id: string
          p_descripcion: string
          p_motivo: Database["public"]["Enums"]["disputa_motivo"]
          p_session_id: string
        }
        Returns: string
      }
      activar_perfil_srv: { Args: { p_usuario_id: string }; Returns: undefined }
      actividad_heatmap: {
        Args: { p_desde: string; p_fuente?: string; p_hasta: string }
        Returns: {
          cantidad: number
          dia_semana: number
          hora: number
        }[]
      }
      anunciantes_publico: {
        Args: { p_ids?: string[] }
        Returns: {
          id: string
          logo_path: string
          nombre_comercial: string
          sector_id: string
        }[]
      }
      autorizar_gestion_usuario_srv: {
        Args: {
          p_accion: string
          p_actor_id: string
          p_objetivo: string
          p_session_id: string
        }
        Returns: undefined
      }
      cancelar_tarifa_programada: {
        Args: { p_tarifa_id: string }
        Returns: undefined
      }
      cerrar_sesiones_usuario_srv: {
        Args: {
          p_actor_id: string
          p_excepto_session?: string
          p_motivo?: string
          p_session_id: string
          p_usuario_id: string
        }
        Returns: number
      }
      cotizar_oferta: {
        Args: { p_cuenta_social_id: string; p_oferta_id: string }
        Returns: {
          comision_excepcion_id: string
          comision_origen: Database["public"]["Enums"]["comision_origen"]
          franja_clave: string
          franja_id: string
          monto_bruto: number
          monto_comision: number
          monto_medio: number
          multiplicador_calidad: number
          multiplicador_exclusividad: number
          multiplicador_geografico: number
          porcentaje_comision: number
          publicaciones: number
          seguidores: number
          tarifa_base: number
          tarifa_id: string
        }[]
      }
      desempeno_anunciante: {
        Args: {
          p_campana_id?: string
          p_desde: string
          p_dimension: string
          p_hasta: string
        }
        Returns: {
          alcance: number
          asignaciones: number
          clave: string
          clics: number
          costo_por_alcance: number
          costo_por_interaccion: number
          cpm_efectivo: number
          engagement: number
          gmv: number
          impresiones: number
          interacciones: number
          n: number
          nombre: string
          reproducciones: number
        }[]
      }
      detalle_zona_geo: {
        Args: {
          p_codigo: string
          p_desde: string
          p_hasta: string
          p_nivel: string
        }
        Returns: {
          clave: string
          detalle: string
          n: number
          nombre: string
          orden: number
          periodo: string
          seccion: string
          unidad: string
          valor: number
          valor_anterior: number
          valor_por_100k: number
          variacion: number
        }[]
      }
      editar_privado_srv: {
        Args: {
          p_actor_id: string
          p_cambios: Json
          p_id: string
          p_session_id: string
          p_tabla: string
        }
        Returns: undefined
      }
      eliminar_usuario_srv: {
        Args: {
          p_actor_id: string
          p_motivo?: string
          p_session_id: string
          p_usuario_id: string
        }
        Returns: undefined
      }
      embudo_asignaciones: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          cantidad: number
          etapa: string
          orden: number
          porcentaje_anterior: number
          porcentaje_inicio: number
        }[]
      }
      emitir_documento_soporte_srv: {
        Args: {
          p_actor_id: string
          p_liquidacion_id: string
          p_session_id: string
        }
        Returns: string
      }
      emitir_factura_srv: {
        Args: { p_actor_id: string; p_factura_id: string; p_session_id: string }
        Returns: Json
      }
      estimar_oferta: {
        Args: {
          p_categorias: string[]
          p_cupos: Json
          p_departamentos: string[]
          p_exclusividad_dias?: number
          p_formato_id: string
          p_municipios: string[]
          p_seguidores_minimos: number
        }
        Returns: {
          alcance_mediano_estimado: number
          franja_id: string
          inversion_estimada: number
          medios_elegibles: number
          precio_mediano: number
        }[]
      }
      generar_liquidacion_srv: {
        Args: {
          p_actor_id: string
          p_medio_id: string
          p_periodo_fin: string
          p_periodo_inicio: string
          p_session_id: string
        }
        Returns: string
      }
      geo_metricas: {
        Args: {
          p_departamento?: string
          p_desde: string
          p_hasta: string
          p_metrica: string
          p_nivel: string
        }
        Returns: {
          codigo: string
          codigo_geometria: string
          n: number
          nombre: string
          poblacion: number
          valor: number
          valor_por_100k: number
        }[]
      }
      guardar_permisos_rol_srv: {
        Args: {
          p_actor_id: string
          p_agregar: string[]
          p_quitar: string[]
          p_rol_id: string
          p_session_id: string
        }
        Returns: {
          agregados: number
          quitados: number
        }[]
      }
      kpis_admin: {
        Args: {
          p_desde: string
          p_desde_ant?: string
          p_hasta: string
          p_hasta_ant?: string
        }
        Returns: Database["public"]["CompositeTypes"]["kpi_fila"][]
        SetofOptions: {
          from: "*"
          to: "kpi_fila"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      kpis_anunciante: {
        Args: {
          p_desde: string
          p_desde_ant?: string
          p_hasta: string
          p_hasta_ant?: string
        }
        Returns: Database["public"]["CompositeTypes"]["kpi_fila"][]
        SetofOptions: {
          from: "*"
          to: "kpi_fila"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      kpis_medio: {
        Args: {
          p_desde: string
          p_desde_ant?: string
          p_hasta: string
          p_hasta_ant?: string
        }
        Returns: Database["public"]["CompositeTypes"]["kpi_fila"][]
        SetofOptions: {
          from: "*"
          to: "kpi_fila"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      listar_usuarios: {
        Args: {
          p_busqueda?: string
          p_descendente?: boolean
          p_desplazamiento?: number
          p_estados?: Database["public"]["Enums"]["perfil_estado"][]
          p_limite?: number
          p_mfa?: boolean
          p_orden?: string
          p_roles?: string[]
          p_tipos?: Database["public"]["Enums"]["rol_tipo"][]
        }
        Returns: {
          avatar_path: string
          created_at: string
          email: string
          estado: Database["public"]["Enums"]["perfil_estado"]
          id: string
          invitado_at: string
          mfa_activo: boolean
          nombre: string
          rol_clave: string
          rol_color: string
          rol_id: string
          rol_nombre: string
          rol_tipo: Database["public"]["Enums"]["rol_tipo"]
          total: number
          ultimo_acceso_at: string
        }[]
      }
      login_bloqueado_srv: {
        Args: { p_email: string; p_ip: unknown }
        Returns: {
          bloqueado: boolean
          reintentar_en_s: number
        }[]
      }
      marcar_notificaciones_leidas: {
        Args: { p_ids?: number[]; p_leida?: boolean }
        Returns: number
      }
      medios_en_riesgo: {
        Args: { p_limite?: number }
        Returns: {
          asignaciones_abiertas: number
          departamento: string
          gmv_90d: number
          medio_id: string
          nombre: string
          ultima_aceptacion_at: string
          ultima_actividad_at: string
        }[]
      }
      medios_publico: {
        Args: { p_ids?: string[] }
        Returns: {
          cuentas: Json
          departamento_codigo: string
          id: string
          municipio_codigo: string
          n_cumplimiento: number
          nivel_verificacion: number
          nombre: string
          publicaciones_verificadas: number
          tasa_cumplimiento: number
          tipo: Database["public"]["Enums"]["medio_tipo"]
        }[]
      }
      metricas_accesos: {
        Args: {
          p_desde: string
          p_desde_ant?: string
          p_hasta: string
          p_hasta_ant?: string
        }
        Returns: Database["public"]["CompositeTypes"]["kpi_fila"][]
        SetofOptions: {
          from: "*"
          to: "kpi_fila"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mezcla_plataformas: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          alcance: number
          asignaciones: number
          cpm_efectivo: number
          formato_clave: string
          formato_nombre: string
          gmv: number
          participacion_gmv: number
          plataforma: Database["public"]["Enums"]["plataforma"]
        }[]
      }
      mi_actividad: {
        Args: { p_antes_id?: number; p_limite?: number }
        Returns: {
          accion: string
          ciudad: string
          created_at: string
          entidad: string
          entidad_id: string
          id: number
          ip: unknown
          pais_iso2: string
          user_agent: string
        }[]
      }
      miembros_organizacion: {
        Args: never
        Returns: {
          avatar_path: string
          email: string
          estado: Database["public"]["Enums"]["perfil_estado"]
          id: string
          nombre: string
          rol_clave: string
          ultimo_acceso_at: string
        }[]
      }
      mis_asignaciones_medio: {
        Args: {
          p_antes_id?: string
          p_estados?: Database["public"]["Enums"]["asignacion_estado"][]
          p_limite?: number
        }
        Returns: {
          aceptada_at: string
          anunciante_id: string
          campana_id: string
          cancelada_at: string
          causa_cancelacion: Database["public"]["Enums"]["cancelacion_causa"]
          contenido_descargado_at: string
          created_at: string
          creativo_descargado_id: string
          cuenta_social_id: string
          en_disputa_at: string
          estado: Database["public"]["Enums"]["asignacion_estado"]
          estado_previo_disputa: Database["public"]["Enums"]["asignacion_estado"]
          evidencia_validada_at: string
          fecha_limite_publicacion: string
          franja_clave: string
          franja_id: string
          id: string
          liquidacion_id: string
          liquidada_at: string
          metricas_atrasadas_at: string
          metricas_cargadas_at: string
          monto_bruto: number
          monto_comision: number
          monto_medio: number
          monto_neto: number
          monto_retenciones: number
          motivo: string
          multiplicador_calidad_aplicado: number
          multiplicador_exclusividad_aplicado: number
          multiplicador_geografico_aplicado: number
          oferta_id: string
          pagada_at: string
          plataforma: Database["public"]["Enums"]["plataforma"]
          porcentaje_comision: number
          publicaciones: number
          publicada_at: string
          rechazada_at: string
          retenciones_aplicadas: Json
          seguidores_al_aceptar: number
          slot: number
          tarifa_base_aplicada: number
          updated_at: string
          vencida_at: string
          verificada_at: string
        }[]
      }
      mis_notificaciones: {
        Args: {
          p_antes_id?: number
          p_limite?: number
          p_solo_no_leidas?: boolean
        }
        Returns: {
          created_at: string
          entidad: string
          entidad_id: string
          id: number
          leida: boolean
          leida_at: string
          mensaje: string
          prioridad: number
          tipo: string
          titulo: string
          url: string
        }[]
      }
      mis_sesiones: {
        Args: never
        Returns: {
          aal: string
          creada_at: string
          es_actual: boolean
          id: string
          ip: string
          refrescada_at: string
          ultima_actividad_at: string
          user_agent: string
        }[]
      }
      notificaciones_no_leidas: { Args: never; Returns: number }
      ofertas_para_medio: {
        Args: { p_oferta_id?: string }
        Returns: {
          anunciante_id: string
          anunciante_nombre: string
          cortes_requeridos: Database["public"]["Enums"]["corte_metrica"][]
          cupos_restantes_mi_franja: Json
          estado: Database["public"]["Enums"]["oferta_estado"]
          exclusividad_dias: number
          fecha_limite_aceptacion: string
          formato_id: string
          id: string
          instrucciones: string
          marca: string
          permanencia_minima_dias: number
          permite_multiples_cupos: boolean
          plataforma: Database["public"]["Enums"]["plataforma"]
          publicaciones_por_medio: number
          restricciones: string
          sector_id: string
          titulo: string
          ventana_fin: string
          ventana_inicio: string
        }[]
      }
      preparar_dispersion_srv: {
        Args: {
          p_actor_id: string
          p_archivo_path: string
          p_liquidacion_ids: string[]
          p_session_id: string
        }
        Returns: {
          datos_pago_cifrados: string
          liquidacion_id: string
          medio_id: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          monto_neto: number
          numero_documento_cifrado: string
          tipo_documento: Database["public"]["Enums"]["documento_identidad_tipo"]
          titular_nombre: string
        }[]
      }
      programar_tarifa: {
        Args: {
          p_desde: string
          p_formato_id: string
          p_franja_id: string
          p_valor: number
        }
        Returns: string
      }
      proximas_acciones_medio: {
        Args: { p_limite?: number }
        Returns: {
          accion: string
          asignacion_id: string
          oferta_titulo: string
          vence_at: string
        }[]
      }
      rechazar_oferta_srv: {
        Args: {
          p_actor_id: string
          p_motivo?: string
          p_oferta_id: string
          p_session_id: string
        }
        Returns: string
      }
      registrar_acceso_srv: {
        Args: {
          p_aal: string
          p_ciudad: string
          p_dispositivo: string
          p_email: string
          p_evento: Database["public"]["Enums"]["acceso_evento"]
          p_ip: unknown
          p_lat: number
          p_lon: number
          p_navegador: string
          p_pais: string
          p_region: string
          p_session_id: string
          p_so: string
          p_ua: string
          p_usuario_id: string
        }
        Returns: {
          es_sospechoso: boolean
          id: number
          motivo: string
        }[]
      }
      registrar_descarga_srv: {
        Args: {
          p_actor_id: string
          p_asignacion_id: string
          p_session_id: string
        }
        Returns: Json
      }
      registrar_evento_srv: {
        Args: {
          p_accion: string
          p_actor_id: string
          p_ciudad: string
          p_entidad: string
          p_entidad_id: string
          p_ip: unknown
          p_metadatos: Json
          p_motivo?: string
          p_pais: string
          p_ua: string
        }
        Returns: number
      }
      registrar_evidencia_srv: {
        Args: {
          p_actor_id: string
          p_asignacion_id: string
          p_captura_path: string
          p_etiqueta_confirmada: boolean
          p_fecha_publicacion: string
          p_miniatura_path: string
          p_numero: number
          p_session_id: string
          p_url: string
        }
        Returns: string
      }
      registrar_intento_login_srv: {
        Args: { p_email: string; p_exito: boolean; p_ip: unknown }
        Returns: undefined
      }
      registrar_pago_anunciante_srv: {
        Args: {
          p_actor_id: string
          p_factura_id: string
          p_fecha: string
          p_medio_pago: string
          p_monto: number
          p_referencia: string
          p_session_id: string
          p_soporte_path: string
        }
        Returns: string
      }
      registrar_pago_liquidacion_srv: {
        Args: {
          p_actor_id: string
          p_fecha: string
          p_liquidacion_id: string
          p_referencia: string
          p_session_id: string
          p_soporte_path: string
        }
        Returns: Json
      }
      registrar_vista_oferta: {
        Args: { p_oferta_id: string }
        Returns: undefined
      }
      reporte_cartera: {
        Args: { p_corte: string }
        Returns: {
          anunciante: string
          anunciante_id: string
          facturado: number
          facturas_vencidas: number
          pagado: number
          saldo: number
          saldo_0_30: number
          saldo_31_60: number
          saldo_61_90: number
          saldo_90_mas: number
        }[]
      }
      reporte_cobertura_territorial: {
        Args: { p_departamento?: string; p_desde: string; p_hasta: string }
        Returns: {
          alcance: number
          asignaciones: number
          departamento: string
          departamento_codigo: string
          gmv: number
          medios: number
          medios_activos: number
          medios_por_100k: number
          municipio: string
          municipio_codigo: string
          poblacion: number
        }[]
      }
      reporte_cumplimiento_medios: {
        Args: { p_departamento?: string; p_desde: string; p_hasta: string }
        Returns: {
          alertas_metricas: number
          canceladas: number
          comprometidas: number
          cumplidas: number
          departamento: string
          en_disputa: number
          medio: string
          medio_id: string
          multiplicador_promedio: number
          municipio: string
          nivel: number
          tasa_cumplimiento: number
          vencidas: number
        }[]
      }
      reporte_desempeno_campanas: {
        Args: { p_anunciante_id?: string; p_desde: string; p_hasta: string }
        Returns: {
          alcance: number
          anunciante: string
          campana: string
          campana_id: string
          clics: number
          costo_por_alcance: number
          costo_por_interaccion: number
          cpm_efectivo: number
          cupos: number
          cupos_ocupados: number
          engagement: number
          gmv_comprometido: number
          gmv_verificado: number
          impresiones: number
          interacciones: number
          n_verificadas: number
          ofertas: number
          reproducciones: number
          tasa_cumplimiento: number
          tasa_llenado: number
        }[]
      }
      reporte_finanzas: {
        Args: { p_agrupacion: string; p_desde: string; p_hasta: string }
        Returns: {
          cartera: number
          comision: number
          facturado: number
          gmv_comprometido: number
          gmv_verificado: number
          grupo: string
          grupo_id: string
          pagado_medios: number
          recaudado: number
          take_rate: number
        }[]
      }
      reporte_resumen_ejecutivo: {
        Args: {
          p_desde: string
          p_desde_ant?: string
          p_hasta: string
          p_hasta_ant?: string
        }
        Returns: Database["public"]["CompositeTypes"]["kpi_fila"][]
        SetofOptions: {
          from: "*"
          to: "kpi_fila"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reporte_usuarios_accesos: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          accesos_exitosos: number
          accesos_fallidos: number
          email: string
          estado: Database["public"]["Enums"]["perfil_estado"]
          mfa_activo: boolean
          nombre: string
          paises_distintos: number
          rol: string
          sospechosos: number
          ultimo_acceso_at: string
          usuario_id: string
        }[]
      }
      reservar_cupo_srv: {
        Args: {
          p_actor_id: string
          p_clave_idempotencia?: string
          p_cuenta_social_id: string
          p_medio_id: string
          p_oferta_id: string
          p_session_id: string
        }
        Returns: {
          asignacion_id: string
          cupos_restantes_franja: number
          franja_clave: string
          monto_bruto: number
          monto_medio: number
        }[]
      }
      resumen_usuarios: {
        Args: never
        Returns: {
          activos: number
          activos_con_mfa: number
          desactivados: number
          invitados: number
          suspendidos: number
          total: number
        }[]
      }
      revelar_privado_srv: {
        Args: {
          p_actor_id: string
          p_campos: string[]
          p_id: string
          p_session_id: string
          p_tabla: string
        }
        Returns: Json
      }
      roles_asignables: {
        Args: never
        Returns: {
          clave: string
          color: string
          descripcion: string
          id: string
          nombre: string
          requiere_mfa: boolean
          tipo: Database["public"]["Enums"]["rol_tipo"]
        }[]
      }
      salud_medios: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          cantidad: number
          gmv_en_juego: number
          porcentaje: number
          segmento: string
        }[]
      }
      seguridad_usuario: {
        Args: { p_usuario_id: string }
        Returns: {
          bloqueado_hasta: string
          email_confirmado_at: string
          invitado_at: string
          mfa_activado_at: string
          mfa_factores: number
          mfa_ultimo_uso_at: string
          sesiones_activas: number
          ultimo_ingreso_at: string
        }[]
      }
      serie_ganancias_medio: {
        Args: { p_desde: string; p_granularidad: string; p_hasta: string }
        Returns: {
          asignaciones: number
          ganado: number
          pagado: number
          periodo: string
        }[]
      }
      serie_gmv: {
        Args: { p_desde: string; p_granularidad: string; p_hasta: string }
        Returns: {
          asignaciones_aceptadas: number
          comision: number
          gmv_comprometido: number
          gmv_verificado: number
          negocios: number
          periodo: string
        }[]
      }
      sesiones_usuario: {
        Args: { p_usuario_id: string }
        Returns: {
          aal: string
          creada_at: string
          id: string
          ip: unknown
          refrescada_at: string
          ultima_actividad_at: string
          user_agent: string
        }[]
      }
      suspender_usuario_srv: {
        Args: {
          p_actor_id: string
          p_motivo: string
          p_session_id: string
          p_usuario_id: string
        }
        Returns: undefined
      }
      tocar_sesion_srv: {
        Args: { p_session_id: string; p_usuario_id: string }
        Returns: string
      }
      top_zonas: {
        Args: {
          p_desde: string
          p_hasta: string
          p_limite?: number
          p_metrica: string
          p_nivel: string
        }
        Returns: {
          codigo: string
          nombre: string
          participacion: number
          rank: number
          valor: number
          valor_anterior: number
          variacion: number
        }[]
      }
      transicionar_srv: {
        Args: {
          p_actor_id: string
          p_datos?: Json
          p_entidad: string
          p_hacia: string
          p_id: string
          p_motivo?: string
          p_session_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      acceso_evento:
        | "LOGIN_EXITOSO"
        | "LOGIN_FALLIDO"
        | "LOGIN_BLOQUEADO"
        | "MFA_EXITOSO"
        | "MFA_FALLIDO"
        | "CIERRE_SESION"
        | "SESION_EXPIRADA"
        | "SESION_REVOCADA"
        | "USUARIO_SUSPENDIDO"
        | "RECUPERACION_SOLICITADA"
        | "CONTRASENA_CAMBIADA"
      anunciante_estado: "PENDIENTE" | "VERIFICADO" | "RECHAZADO" | "SUSPENDIDO"
      asignacion_estado:
        | "ACEPTADA"
        | "CONTENIDO_ENTREGADO"
        | "PUBLICADA"
        | "EVIDENCIA_VALIDADA"
        | "METRICAS_CARGADAS"
        | "VERIFICADA"
        | "LIQUIDADA"
        | "PAGADA"
        | "RECHAZADA"
        | "VENCIDA_SIN_PUBLICAR"
        | "EN_DISPUTA"
        | "CANCELADA"
      audiencia_fuente: "DECLARADA" | "VERIFICADA_MANUAL" | "API"
      auditoria_tratamiento: "OMITIR" | "HASH" | "ENMASCARAR"
      bitacora_origen: "APP" | "DB" | "API_DIRECTA" | "DEMO"
      campana_estado: "BORRADOR" | "ACTIVA" | "FINALIZADA" | "CANCELADA"
      cancelacion_causa:
        | "ADMINISTRATIVA"
        | "ACUERDO"
        | "INCUMPLIMIENTO_MEDIO"
        | "FRAUDE"
      comision_origen: "GLOBAL" | "EXCEPCION_ANUNCIANTE" | "EXCEPCION_CAMPANA"
      config_tipo:
        | "ENTERO"
        | "DECIMAL"
        | "PORCENTAJE"
        | "BOOLEANO"
        | "TEXTO"
        | "LISTA_TEXTO"
        | "MAPA_DECIMAL"
      corte_metrica: "H24" | "H72" | "D7" | "PERSONALIZADO"
      creativo_tipo: "IMAGEN" | "VIDEO" | "CARRUSEL"
      disputa_estado: "ABIERTA" | "EN_REVISION" | "RESUELTA" | "DESCARTADA"
      disputa_motivo:
        | "INCUMPLIMIENTO"
        | "METRICAS"
        | "CONTENIDO"
        | "PERMANENCIA"
        | "PAGO"
        | "OTRO"
      disputa_parte: "ANUNCIANTE" | "MEDIO" | "ADMIN"
      documento_anunciante_tipo:
        | "RUT"
        | "CAMARA_COMERCIO"
        | "CERT_BANCARIA"
        | "OTRO"
      documento_electronico_tipo: "FACTURA_VENTA" | "DOCUMENTO_SOPORTE"
      documento_estado: "PENDIENTE" | "APROBADO" | "RECHAZADO" | "VENCIDO"
      documento_identidad_tipo: "CC" | "CE" | "PPT" | "PASAPORTE" | "NIT"
      documento_medio_tipo:
        | "CEDULA_FRENTE"
        | "CEDULA_REVERSO"
        | "PRUEBA_VIDA"
        | "RUT"
        | "RUT_SOCIEDAD"
        | "CAMARA_COMERCIO"
        | "CERT_BANCARIA"
        | "CERT_BILLETERA"
        | "SEG_SOCIAL"
      documento_soporte_estado: "BORRADOR" | "EMITIDO" | "ANULADO"
      factura_estado:
        | "BORRADOR"
        | "EMITIDA"
        | "PAGADA_PARCIAL"
        | "PAGADA"
        | "VENCIDA"
        | "ANULADA"
      liquidacion_estado: "BORRADOR" | "APROBADA" | "PAGADA" | "ANULADA"
      medio_estado: "PENDIENTE" | "VERIFICADO" | "RECHAZADO" | "SUSPENDIDO"
      medio_tipo:
        | "PAGINA_NOTICIAS"
        | "CREADOR"
        | "EMISORA"
        | "PERIODICO"
        | "CANAL_TV"
        | "COMUNITARIO"
        | "OTRO"
      metodo_pago: "BANCARIO" | "BILLETERA"
      metodo_verificacion: "MANUAL" | "CODIGO_HISTORIA" | "API"
      metrica_fuente: "MANUAL" | "API"
      notificacion_canal: "APP" | "EMAIL" | "WHATSAPP" | "PUSH"
      oferta_estado:
        | "BORRADOR"
        | "EN_REVISION"
        | "DEVUELTA"
        | "PUBLICADA"
        | "CUPOS_COMPLETOS"
        | "EN_EJECUCION"
        | "VENCIDA"
        | "CERRADA"
        | "CANCELADA"
      perfil_estado: "INVITADO" | "ACTIVO" | "SUSPENDIDO" | "DESACTIVADO"
      plataforma: "FACEBOOK" | "INSTAGRAM" | "TIKTOK"
      retencion_tipo: "RETEFUENTE" | "RETEICA" | "RETEIVA"
      rol_tipo: "ADMIN" | "ANUNCIANTE" | "MEDIO"
      terminos_tipo:
        | "TERMINOS_MEDIO"
        | "TERMINOS_ANUNCIANTE"
        | "POLITICA_DATOS"
        | "CONDICIONES_COMERCIALES"
      transicion_actor: "ADMIN" | "ANUNCIANTE" | "MEDIO" | "SISTEMA"
      validacion_estado: "PENDIENTE" | "APROBADA" | "RECHAZADA"
    }
    CompositeTypes: {
      kpi_fila: {
        kpi: string | null
        valor: number | null
        valor_anterior: number | null
        variacion: number | null
        n: number | null
        unidad: string | null
        serie: number[] | null
        n_anterior: number | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      acceso_evento: [
        "LOGIN_EXITOSO",
        "LOGIN_FALLIDO",
        "LOGIN_BLOQUEADO",
        "MFA_EXITOSO",
        "MFA_FALLIDO",
        "CIERRE_SESION",
        "SESION_EXPIRADA",
        "SESION_REVOCADA",
        "USUARIO_SUSPENDIDO",
        "RECUPERACION_SOLICITADA",
        "CONTRASENA_CAMBIADA",
      ],
      anunciante_estado: ["PENDIENTE", "VERIFICADO", "RECHAZADO", "SUSPENDIDO"],
      asignacion_estado: [
        "ACEPTADA",
        "CONTENIDO_ENTREGADO",
        "PUBLICADA",
        "EVIDENCIA_VALIDADA",
        "METRICAS_CARGADAS",
        "VERIFICADA",
        "LIQUIDADA",
        "PAGADA",
        "RECHAZADA",
        "VENCIDA_SIN_PUBLICAR",
        "EN_DISPUTA",
        "CANCELADA",
      ],
      audiencia_fuente: ["DECLARADA", "VERIFICADA_MANUAL", "API"],
      auditoria_tratamiento: ["OMITIR", "HASH", "ENMASCARAR"],
      bitacora_origen: ["APP", "DB", "API_DIRECTA", "DEMO"],
      campana_estado: ["BORRADOR", "ACTIVA", "FINALIZADA", "CANCELADA"],
      cancelacion_causa: [
        "ADMINISTRATIVA",
        "ACUERDO",
        "INCUMPLIMIENTO_MEDIO",
        "FRAUDE",
      ],
      comision_origen: ["GLOBAL", "EXCEPCION_ANUNCIANTE", "EXCEPCION_CAMPANA"],
      config_tipo: [
        "ENTERO",
        "DECIMAL",
        "PORCENTAJE",
        "BOOLEANO",
        "TEXTO",
        "LISTA_TEXTO",
        "MAPA_DECIMAL",
      ],
      corte_metrica: ["H24", "H72", "D7", "PERSONALIZADO"],
      creativo_tipo: ["IMAGEN", "VIDEO", "CARRUSEL"],
      disputa_estado: ["ABIERTA", "EN_REVISION", "RESUELTA", "DESCARTADA"],
      disputa_motivo: [
        "INCUMPLIMIENTO",
        "METRICAS",
        "CONTENIDO",
        "PERMANENCIA",
        "PAGO",
        "OTRO",
      ],
      disputa_parte: ["ANUNCIANTE", "MEDIO", "ADMIN"],
      documento_anunciante_tipo: [
        "RUT",
        "CAMARA_COMERCIO",
        "CERT_BANCARIA",
        "OTRO",
      ],
      documento_electronico_tipo: ["FACTURA_VENTA", "DOCUMENTO_SOPORTE"],
      documento_estado: ["PENDIENTE", "APROBADO", "RECHAZADO", "VENCIDO"],
      documento_identidad_tipo: ["CC", "CE", "PPT", "PASAPORTE", "NIT"],
      documento_medio_tipo: [
        "CEDULA_FRENTE",
        "CEDULA_REVERSO",
        "PRUEBA_VIDA",
        "RUT",
        "RUT_SOCIEDAD",
        "CAMARA_COMERCIO",
        "CERT_BANCARIA",
        "CERT_BILLETERA",
        "SEG_SOCIAL",
      ],
      documento_soporte_estado: ["BORRADOR", "EMITIDO", "ANULADO"],
      factura_estado: [
        "BORRADOR",
        "EMITIDA",
        "PAGADA_PARCIAL",
        "PAGADA",
        "VENCIDA",
        "ANULADA",
      ],
      liquidacion_estado: ["BORRADOR", "APROBADA", "PAGADA", "ANULADA"],
      medio_estado: ["PENDIENTE", "VERIFICADO", "RECHAZADO", "SUSPENDIDO"],
      medio_tipo: [
        "PAGINA_NOTICIAS",
        "CREADOR",
        "EMISORA",
        "PERIODICO",
        "CANAL_TV",
        "COMUNITARIO",
        "OTRO",
      ],
      metodo_pago: ["BANCARIO", "BILLETERA"],
      metodo_verificacion: ["MANUAL", "CODIGO_HISTORIA", "API"],
      metrica_fuente: ["MANUAL", "API"],
      notificacion_canal: ["APP", "EMAIL", "WHATSAPP", "PUSH"],
      oferta_estado: [
        "BORRADOR",
        "EN_REVISION",
        "DEVUELTA",
        "PUBLICADA",
        "CUPOS_COMPLETOS",
        "EN_EJECUCION",
        "VENCIDA",
        "CERRADA",
        "CANCELADA",
      ],
      perfil_estado: ["INVITADO", "ACTIVO", "SUSPENDIDO", "DESACTIVADO"],
      plataforma: ["FACEBOOK", "INSTAGRAM", "TIKTOK"],
      retencion_tipo: ["RETEFUENTE", "RETEICA", "RETEIVA"],
      rol_tipo: ["ADMIN", "ANUNCIANTE", "MEDIO"],
      terminos_tipo: [
        "TERMINOS_MEDIO",
        "TERMINOS_ANUNCIANTE",
        "POLITICA_DATOS",
        "CONDICIONES_COMERCIALES",
      ],
      transicion_actor: ["ADMIN", "ANUNCIANTE", "MEDIO", "SISTEMA"],
      validacion_estado: ["PENDIENTE", "APROBADA", "RECHAZADA"],
    },
  },
} as const
