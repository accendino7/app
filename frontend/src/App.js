import { useState, useEffect, useCallback } from "react";
import "@/App.css";
import { Toaster } from "sonner";
import HeaderNav from "@/components/HeaderNav";
import AdminView from "@/components/AdminView";
import NegozianteView from "@/components/NegozianteView";
import ClienteView from "@/components/ClienteView";
import { getNotifications } from "@/api";

function App() {
  const [role, setRole] = useState("admin");
  const [notifications, setNotifications] = useState([]);

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    refreshNotifications();
    const t = setInterval(refreshNotifications, 5000);
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
        {role === "negoziante" && (
          <NegozianteView refreshNotifications={refreshNotifications} />
        )}
        {role === "cliente" && <ClienteView />}
      </main>
    </div>
  );
}

export default App;
