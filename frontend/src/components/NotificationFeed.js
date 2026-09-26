import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CheckCheck, BellRing, Flame } from "lucide-react";
import { markAllRead } from "@/api";

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "adesso";
  if (m < 60) return `${m} min fa`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h fa`;
  return `${Math.floor(h / 24)} g fa`;
}

export default function NotificationFeed({ open, onClose, notifications, refreshNotifications }) {
  const handleReadAll = async () => {
    await markAllRead();
    refreshNotifications();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="bg-[#141619] border-l border-white/10 text-[#F8FAFC] w-full sm:max-w-md">
        <SheetHeader className="border-b border-white/10 pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-[#F8FAFC] font-display">
              <BellRing className="w-5 h-5 text-[#F59E0B]" />
              Notifiche Riscatti
            </SheetTitle>
            {notifications.some((n) => !n.read) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReadAll}
                className="text-xs text-[#94A3B8] hover:text-white"
                data-testid="mark-all-read-btn"
              >
                <CheckCheck className="w-4 h-4 mr-1" /> Segna letti
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-3 overflow-y-auto max-h-[calc(100vh-120px)] pr-1">
          {notifications.length === 0 && (
            <div className="text-center py-16 text-[#64748B]">
              <BellRing className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nessuna notifica. I riscatti dei coupon appariranno qui in tempo reale.</p>
            </div>
          )}
          {notifications.map((n) => (
            <div
              key={n.id}
              data-testid="notification-item"
              className={`p-3.5 rounded-xl border transition-colors ${
                n.read
                  ? "bg-black/20 border-white/5"
                  : "bg-[#1B1E22] border-[#F59E0B]/30"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#10B981]/15 flex items-center justify-center shrink-0">
                  <Flame className="w-4.5 h-4.5 text-[#10B981]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">
                    Coupon <span className="font-mono text-[#F59E0B]">{n.code}</span> riscattato
                  </p>
                  <p className="text-xs text-[#94A3B8] mt-0.5">
                    {n.locale} · {n.winner_name}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-1.5">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
