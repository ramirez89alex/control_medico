import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Rol } from '@powerdent/shared';
import { api, refrescarSesion, setAccessToken } from './api';

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  clinicaId: string;
}

interface AuthContextValue {
  usuario: Usuario | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const datos = await refrescarSesion();
        if (datos) setUsuario(datos.usuario as Usuario);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const data = await api.post<{ accessToken: string; usuario: Usuario }>('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    setUsuario(data.usuario);
  }

  async function logout() {
    await api.post('/auth/logout');
    setAccessToken(null);
    setUsuario(null);
  }

  return <AuthContext.Provider value={{ usuario, cargando, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
