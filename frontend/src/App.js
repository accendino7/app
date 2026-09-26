import { useState, useEffect, useCallback, useRef } from "react";
import "@/App.css";
import { Toaster, toast } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import HeaderNav from "@/components/HeaderNav";
import AdminView from "@/components/AdminView";
import AdminLogin from "@/components/AdminLogin";
import NegozianteView from "@/components/NegozianteView";
import ClienteView from "@/components/ClienteView";
import { getNotifications, getToken } from "@/api";
import { playBeep } from "@/lib/sound";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function AppInner() {
  const params = new URLSearchParams(window.location.search);
  const couponParam = params.get("coupon");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [role, setRole] = useState(couponParam ? "cliente" : "admin");
  const [notifications, setNotifications] = useState([]);
  const seenCountRef = useRef(null);

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await getNotifications();
      setNotifications(data);
      if (seenCountRef.current === null) {
        seenCountRef.current = data.length;
      } else if (data.length > seenCountRef.current) {
        const latest = data[0];
        if (latest) {
          playBeep();
          toast.success(`Coupon ${latest.code} riscattato`, {
            description: `${latest.locale} · ${latest.winner_name}`,
          });
        }
        seenCountRef.current = data.length;
      } else {
        seenCountRef.current = data.length;
      }
    } catch (e) {
      /* not admin / not authed */
    }
  }, []);

  // Polling + WebSocket only for a logged-in admin
  useEffect(() => {
    if (!isAdmin) {
      setNotifications([]);
      seenCountRef.current = null;
      return;
    }
    refreshNotifications();
    const poll = setInterval(refreshNotifications, 15000);

    let ws;
    try {
      const wsUrl = `${BACKEND_URL.replace(/^http/, "ws")}/api/ws/notifications?token=${getToken()}`;
      ws = new WebSocket(wsUrl);
      ws.onmessage = () => refreshNotifications();
    } catch (e) {
      /* ws unavailable, polling still covers it */
    }

    return () => {
      clearInterval(poll);
      if (ws) ws.close();
    };
  }, [isAdmin, refreshNotifications]);

  return (
    <div className="App grain min-h-screen bg-[#0C0D0E] text-[#F8FAFC]">
      <Toaster position="top-center" theme="dark" richColors />
      <HeaderNav
        role={role}
        setRole={setRole}
        user={user}
        notifications={notifications}
        refreshNotifications={refreshNotifications}
      />
      <main className="relative z-[2] max-w-6xl mx-auto px-4 sm:px-6 pb-24 pt-6">
        {role === "admin" &&
          (isAdmin ? (
            <AdminView notifications={notifications} refreshNotifications={refreshNotifications} />
          ) : (
            <AdminLogin />
          ))}
        {role === "negoziante" && <NegozianteView refreshNotifications={refreshNotifications} />}
        {role === "cliente" && <ClienteView initialCode={couponParam} />}
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

export default App;
