/**
 * Variables públicas validadas. Cada `process.env.NEXT_PUBLIC_*` se lee de forma
 * estática para que Next las inserte en el bundle del navegador; un acceso
 * dinámico (`process.env[nombre]`) quedaría `undefined` en el cliente.
 */
import { validarEnvCliente } from "./env-esquema"

export const envCliente = validarEnvCliente({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  NEXT_PUBLIC_MAPBOX_STYLE: process.env.NEXT_PUBLIC_MAPBOX_STYLE,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
})
