import { useState, useEffect, useCallback, useRef } from "react";
import "@/App.css";
import { Toaster, toast } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import HeaderNav from "@/components/HeaderNav";
import AdminView from "@/components/AdminView";
import NegozianteView from "@/components/NegozianteView";
import ClienteView from "@/components/ClienteView";
import { getNotifications } from "@/api";
import { playBeep } from "@/lib/sound";

function AppInner() {
  const params = new URLSearchParams(window.location.search);
  const couponParam = params.get("coupon");

  const [role, setRole] = useState(couponParam ? "cliente" : "admin");
  const [notifications, setNotifications] = useState([]);
  const seenCountRef = useRef(null);
  const roleRef = useRef(role);
  roleRef.current = role;

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await getNotifications();
      setNotifications(data);
      if (seenCountRef.current === null) {
        // baseline on first real fetch — do not alert
        seenCountRef.current = data.length;
      } else if (data.length > seenCountRef.current) {
        const latest = data[0];
        if (roleRef.current === "admin" && latest) {
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
      console.error(e);
    }
  }, []);

  useEffect(() => {
    refreshNotifications();
    const t = setInterval(refreshNotifications, 3000);
    return () => clearInterval(t);
  }, [refreshNotifications]);

  return (
    <div className="App grain min-h-screen bg-[#0C0D0E] text-[#F8FAFC]">
      <Toaster position="top-center" theme="dark" richColors />
      <HeaderNav
        role={role}
        setRole={setRole}
        notifications={notifications}
        refreshNotifications={refreshNotifications}
      />
      <main className="relative z-[2] max-w-6xl mx-auto px-4 sm:px-6 pb-24 pt-6">
        {role === "admin" && (
          <AdminView notifications={notifications} refreshNotifications={refreshNotifications} />
        )}
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
