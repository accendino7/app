import { QRCodeCanvas } from "qrcode.react";
import { useCountdown, pad } from "@/hooks/useCountdown";
import { MapPin, Gift, Clock } from "lucide-react";

const STATUS_STYLES = {
  attivo: { label: "ATTIVO", cls: "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/40" },
  riscattato: { label: "RISCATTATO", cls: "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/40" },
  scaduto: { label: "SCADUTO", cls: "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/40" },
  in_attesa: { label: "IN ATTESA", cls: "bg-[#8B5CF6]/15 text-[#8B5CF6] border-[#8B5CF6]/40" },
  rifiutato: { label: "RIFIUTATO", cls: "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/40" },
};

function CountdownBlock({ value, unit }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-mono font-bold text-2xl sm:text-3xl tabular-nums">{pad(value)}</span>
      <span className="text-[9px] uppercase tracking-widest text-[#64748B] mt-1">{unit}</span>
    </div>
  );
}

export default function CouponTicket({ coupon, showQR = true }) {
  const { expired, days, hours, minutes, seconds } = useCountdown(coupon.expires_at);
  const status = coupon.status;
  const st = STATUS_STYLES[status] || STATUS_STYLES.attivo;
  const isActive = status === "attivo";

  return (
    <div className="fade-up rounded-3xl overflow-hidden bg-[#141619] border border-white/10 shadow-2xl shadow-black/40 max-w-md w-full mx-auto">
      {coupon.cover_image && (
        <div className="relative h-36 overflow-hidden">
          <img src={coupon.cover_image} alt={coupon.locale} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#141619] via-[#141619]/30 to-transparent" />
          <span
            data-testid="coupon-status-badge"
            className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider border ${st.cls}`}
          >
            {st.label}
          </span>
        </div>
      )}

      <div className="p-5 sm:p-6">
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#F59E0B] font-semibold">
          {coupon.sfida_titolo}
        </p>
        <h3 className="font-display text-2xl font-extrabold mt-1 leading-tight">{coupon.premio}</h3>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-sm text-[#94A3B8]">
          <span className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-[#EA580C]" /> {coupon.locale}
          </span>
          <span className="flex items-center gap-1.5">
            <Gift className="w-4 h-4 text-[#EA580C]" /> {coupon.winner_name}
          </span>
        </div>
      </div>

      <div className="ticket-notch border-t-2 border-dashed border-white/10 mx-5" />

      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-[#64748B] mb-3">
          <Clock className="w-3.5 h-3.5" />
          {isActive ? "Scade tra"
            : status === "in_attesa" ? "In attesa di approvazione"
            : status === "rifiutato" ? "Richiesta rifiutata"
            : status === "scaduto" || expired ? "Tempo scaduto" : "Coupon riscattato"}
        </div>

        {isActive && !expired ? (
          <div
            data-testid="ticket-countdown-timer"
            className="flex items-center justify-between px-2 py-3 rounded-2xl bg-black/40 border border-white/5"
          >
            <CountdownBlock value={days} unit="giorni" />
            <span className="text-[#334155] text-2xl font-mono">:</span>
            <CountdownBlock value={hours} unit="ore" />
            <span className="text-[#334155] text-2xl font-mono">:</span>
            <CountdownBlock value={minutes} unit="min" />
            <span className="text-[#334155] text-2xl font-mono">:</span>
            <CountdownBlock value={seconds} unit="sec" />
          </div>
        ) : (
          <div className={`px-4 py-3 rounded-2xl border text-center font-semibold ${st.cls}`}>
            {status === "riscattato" ? "Premio ritirato con successo"
              : status === "in_attesa" ? "In attesa dell'approvazione dell'admin"
              : status === "rifiutato" ? "Richiesta non approvata"
              : "Questo coupon non e piu valido"}
          </div>
        )}

        {showQR && (
          <div className="mt-5 flex flex-col items-center">
            <div className={`p-3 rounded-2xl bg-white ${!isActive ? "opacity-40 grayscale" : ""}`}>
              <QRCodeCanvas value={coupon.code} size={148} level="H" includeMargin={false} />
            </div>
            <p className="font-mono text-lg font-bold tracking-[0.15em] mt-3 text-[#F59E0B]">{coupon.code}</p>
            <p className="text-[11px] text-[#64748B] mt-1 text-center max-w-[240px]">
              Mostra questo codice alla cassa del locale entro la scadenza
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
