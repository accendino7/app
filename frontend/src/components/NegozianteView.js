import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { Html5Qrcode } from "html5-qrcode";
import { Flame, Camera, CameraOff, CheckCircle2, XCircle, MapPin, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { redeemCoupon } from "@/api";

export default function NegozianteView({ refreshNotifications }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { ok, message, coupon }
  const [log, setLog] = useState([]);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);

  const fireConfetti = () => {
    confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 }, colors: ["#F59E0B", "#EA580C", "#10B981"] });
  };

  const doRedeem = async (rawCode) => {
    const c = (rawCode || "").trim();
    if (!c) {
      toast.error("Inserisci o scansiona un codice");
      return;
    }
    setLoading(true);
    try {
      const res = await redeemCoupon(c);
      setResult({ ok: true, coupon: res.coupon });
      setLog((l) => [{ code: res.coupon.code, locale: res.coupon.locale, ts: Date.now(), ok: true }, ...l].slice(0, 8));
      toast.success(`Coupon ${res.coupon.code} bruciato!`);
      fireConfetti();
      refreshNotifications();
    } catch (e) {
      const msg = e.response?.data?.detail || "Errore durante la convalida";
      setResult({ ok: false, message: msg });
      setLog((l) => [{ code: c.toUpperCase(), ts: Date.now(), ok: false, message: msg }, ...l].slice(0, 8));
      toast.error(msg);
    } finally {
      setLoading(false);
      setCode("");
    }
  };

  const startScan = async () => {
    setScanning(true);
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode("qr-reader");
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            stopScan();
            doRedeem(decoded);
          },
          () => {}
        );
      } catch (e) {
        toast.error("Impossibile avviare la fotocamera. Usa l'inserimento manuale.");
        setScanning(false);
      }
    }, 100);
  };

  const stopScan = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch (e) {}
    setScanning(false);
  };

  useEffect(() => () => { stopScan(); }, []);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="fade-up text-center">
        <p className="text-[11px] uppercase tracking-[0.25em] text-[#F59E0B] font-semibold">Terminale Negoziante</p>
        <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight mt-1">Spara il Coupon</h1>
        <p className="text-[#94A3B8] mt-1 text-sm">Scansiona il QR o inserisci il codice del vincitore.</p>
      </div>

      <div className="fade-up rounded-3xl bg-[#141619] border border-white/10 p-6 space-y-4">
        {scanning ? (
          <div className="space-y-3">
            <div id="qr-reader" className="rounded-2xl overflow-hidden bg-black" />
            <Button onClick={stopScan} variant="outline" className="w-full border-white/15 bg-transparent hover:bg-white/5 text-white">
              <CameraOff className="w-4 h-4 mr-2" /> Ferma scanner
            </Button>
          </div>
        ) : (
          <Button data-testid="start-scan-btn" onClick={startScan}
            className="w-full h-14 bg-black/40 border border-white/10 hover:border-[#F59E0B]/50 text-white text-base">
            <Camera className="w-5 h-5 mr-2 text-[#F59E0B]" /> Scansiona QR Code
          </Button>
        )}

        <div className="flex items-center gap-3 text-[#64748B] text-xs">
          <div className="h-px flex-1 bg-white/10" /> oppure <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="space-y-3">
          <Input
            data-testid="scanner-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && doRedeem(code)}
            placeholder="SFIDA-XXXXX"
            className="h-16 text-center font-mono text-2xl tracking-[0.2em] bg-black/40 border-white/10 uppercase placeholder:text-[#334155]"
          />
          <Button
            data-testid="shoot-coupon-btn"
            onClick={() => doRedeem(code)}
            disabled={loading}
            className="w-full h-14 text-lg font-bold bg-gradient-to-r from-[#F59E0B] to-[#EA580C] text-black hover:opacity-90 disabled:opacity-50"
          >
            <Flame className="w-5 h-5 mr-2" /> {loading ? "Convalida..." : "SPARA COUPON"}
          </Button>
        </div>
      </div>

      {result && (
        <div
          data-testid="redeem-result"
          className={`fade-up rounded-3xl border p-6 ${
            result.ok ? "bg-[#10B981]/10 border-[#10B981]/40" : "bg-[#EF4444]/10 border-[#EF4444]/40"
          }`}
        >
          {result.ok ? (
            <div className="text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto text-[#10B981]" />
              <p className="font-display text-2xl font-black mt-2 text-[#10B981]">VALIDO · BRUCIATO</p>
              <p className="font-mono text-lg mt-1">{result.coupon.code}</p>
              <div className="flex justify-center flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-[#94A3B8]">
                <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {result.coupon.locale}</span>
                <span className="flex items-center gap-1.5"><Gift className="w-4 h-4" /> {result.coupon.premio}</span>
              </div>
              <p className="text-sm mt-2 text-[#94A3B8]">Vincitore: {result.coupon.winner_name}</p>
            </div>
          ) : (
            <div className="text-center">
              <XCircle className="w-12 h-12 mx-auto text-[#EF4444]" />
              <p className="font-display text-2xl font-black mt-2 text-[#EF4444]">NON VALIDO</p>
              <p className="text-sm mt-1 text-[#94A3B8]">{result.message}</p>
            </div>
          )}
        </div>
      )}

      {log.length > 0 && (
        <div className="fade-up">
          <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">Ultimi coupon di oggi</h3>
          <div className="space-y-2">
            {log.map((l, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#141619] border border-white/5 text-sm">
                <span className="font-mono">{l.code}</span>
                <span className={l.ok ? "text-[#10B981]" : "text-[#EF4444]"}>
                  {l.ok ? l.locale : l.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
