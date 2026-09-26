import { useState, useEffect } from "react";
import { getCoupons } from "@/api";
import CouponTicket from "@/components/CouponTicket";
import { Ticket } from "lucide-react";

export default function ClienteView({ initialCode }) {
  const [coupons, setCoupons] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    getCoupons().then((data) => {
      setCoupons(data);
      if (initialCode && data.some((c) => c.code === initialCode)) {
        setSelected(initialCode);
      } else {
        const active = data.find((c) => c.status === "attivo") || data[0];
        setSelected(active?.code || null);
      }
    });
  }, [initialCode]);

  const current = coupons.find((c) => c.code === selected);

  return (
    <div className="space-y-6">
      <div className="fade-up text-center">
        <p className="text-[11px] uppercase tracking-[0.25em] text-[#F59E0B] font-semibold">La Tua Tessera</p>
        <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight mt-1">Coupon Vincitore</h1>
        <p className="text-[#94A3B8] mt-1 text-sm">Mostra il QR code prima della scadenza</p>
      </div>

      {coupons.length > 1 && (
        <div className="fade-up flex gap-2 overflow-x-auto pb-2 justify-start sm:justify-center">
          {coupons.map((c) => (
            <button
              key={c.id}
              data-testid={`client-coupon-tab-${c.code}`}
              onClick={() => setSelected(c.code)}
              className={`shrink-0 px-3.5 py-2 rounded-full text-xs font-mono font-semibold border transition-all ${
                selected === c.code
                  ? "bg-[#F59E0B] text-black border-[#F59E0B]"
                  : "bg-black/40 text-[#94A3B8] border-white/10 hover:border-white/25"
              }`}
            >
              {c.code}
            </button>
          ))}
        </div>
      )}

      {current ? (
        <CouponTicket coupon={current} showQR />
      ) : (
        <div className="text-center py-16 text-[#64748B]">
          <Ticket className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Nessun coupon disponibile al momento.</p>
        </div>
      )}
    </div>
  );
}
