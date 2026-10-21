import {
  QueryClient,
  defaultShouldDehydrateQuery,
  isServer,
} from "@tanstack/react-query"

function crearQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Con SSR, un staleTime > 0 evita volver a pedir en el cliente lo recién hidratado.
        staleTime: 60_000,
      },
      dehydrate: {
        // Permite transmitir consultas aún pendientes desde Server Components.
        shouldDehydrateQuery: (consulta) =>
          defaultShouldDehydrateQuery(consulta) ||
          consulta.state.status === "pending",
      },
    },
  })
}

let clienteNavegador: QueryClient | undefined

/**
 * En el servidor, un cliente por solicitud (sin fugas entre usuarios); en el
 * navegador, uno solo para no perder la caché si React suspende el primer render.
 */
export function getQueryClient(): QueryClient {
  if (isServer) return crearQueryClient()
  clienteNavegador ??= crearQueryClient()
  return clienteNavegador
}
