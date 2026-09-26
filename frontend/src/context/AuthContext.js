import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { login as apiLogin, getMe, setToken, getToken } from "@/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          setUser(await getMe());
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
    setUser(res.user);
    return res.user;
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, checking, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
