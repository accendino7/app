import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { login as apiLogin, getMe, setToken, getToken } from "@/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [negoziante, setNegoziante] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          setNegoziante(await getMe());
        } catch {
          setToken(null);
        }
      }
      setChecking(false);
    })();
  }, []);

  const signIn = useCallback(async (email, password) => {
    const res = await apiLogin({ email, password });
    setToken(res.token);
    setNegoziante(res.negoziante);
    return res.negoziante;
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setNegoziante(null);
  }, []);

  return (
    <AuthContext.Provider value={{ negoziante, checking, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
