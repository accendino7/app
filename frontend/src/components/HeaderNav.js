import { useState } from "react";
import { Bell, ShieldCheck, Store, Ticket, Flame, LogOut } from "lucide-react";
import NotificationFeed from "@/components/NotificationFeed";
import { useAuth } from "@/context/AuthContext";

const ROLES = [
  { id: "admin", label: "Admin", icon: ShieldCheck, testid: "role-toggle-admin" },
  { id: "negoziante", label: "Negoziante", icon: Store, testid: "role-toggle-shop" },
  { id: "cliente", label: "Vincitore", icon: Ticket, testid: "role-toggle-client" },
];

export default function HeaderNav({ role, setRole, user, notifications, refreshNotifications }) {
  const [feedOpen, setFeedOpen] = useState(false);
  const { signOut } = useAuth();
  const isAdmin = user?.role === "admin";
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#F59E0B] to-[#EA580C] flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Flame className="w-5 h-5 text-black" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <p className="font-display font-extrabold text-[15px] tracking-tight">La Sfida dei Locali</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#64748B] hidden sm:block">winter edition</p>
          </div>
        </div>

        <nav className="flex items-center gap-1 p-1 rounded-full bg-black/40 border border-white/10">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const active = role === r.id;
            return (
              <button
                key={r.id}
                data-testid={r.testid}
                onClick={() => setRole(r.id)}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 ${
                  active
                    ? "bg-gradient-to-r from-[#F59E0B] to-[#EA580C] text-black shadow-md"
                    : "text-[#94A3B8] hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{r.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <button
              data-testid="notifications-trigger-btn"
              onClick={() => setFeedOpen(true)}
              className="relative w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center hover:border-[#F59E0B]/40 transition-colors"
            >
              <Bell className="w-5 h-5 text-[#F8FAFC]" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center pulse-glow">
                  {unread}
                </span>
              )}
            </button>
          )}
          {user && (
            <button
              data-testid="header-logout-btn"
              onClick={signOut}
              title="Esci"
              className="w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center hover:border-[#EF4444]/40 text-[#94A3B8] hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <NotificationFeed
        open={feedOpen}
        onClose={() => setFeedOpen(false)}
        notifications={notifications}
        refreshNotifications={refreshNotifications}
      />
    </header>
  );
}
