import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { api, ApiError, setGestionToken } from './api';

interface GestionContextValue {
  desbloqueado: boolean;
  /** Intenta desbloquear con un código; devuelve el mensaje de error o null si fue bien. */
  desbloquear: (codigo: string) => Promise<string | null>;
  /** Ya viene desbloqueado (p. ej. tras configurar el código por primera vez). */
  marcarDesbloqueado: (token: string) => void;
  bloquear: () => void;
}

const GestionContext = createContext<GestionContextValue | null>(null);

export function GestionProvider({ children }: { children: ReactNode }) {
  const [desbloqueado, setDesbloqueado] = useState(false);

  const marcarDesbloqueado = useCallback((token: string) => {
    setGestionToken(token);
    setDesbloqueado(true);
  }, []);

  const desbloquear = useCallback(
    async (codigo: string): Promise<string | null> => {
      try {
        const { token } = await api.post<{ token: string }>('/gestion/verificar', { codigo });
        marcarDesbloqueado(token);
        return null;
      } catch (e) {
        return e instanceof ApiError ? e.message : 'No se pudo verificar el código';
      }
    },
    [marcarDesbloqueado],
  );

  const bloquear = useCallback(() => {
    setGestionToken(null);
    setDesbloqueado(false);
  }, []);

  return <GestionContext.Provider value={{ desbloqueado, desbloquear, marcarDesbloqueado, bloquear }}>{children}</GestionContext.Provider>;
}

export function useGestion() {
  const ctx = useContext(GestionContext);
  if (!ctx) throw new Error('useGestion debe usarse dentro de <GestionProvider>');
  return ctx;
}
