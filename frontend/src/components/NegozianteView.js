import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { Html5Qrcode } from "html5-qrcode";
import { Flame, Camera, CameraOff, CheckCircle2, XCircle, MapPin, Gift, LogOut, Store, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { negozianteRedeem, getMyCoupons } from "@/api";

function LoginForm() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const neg = await signIn(email.trim(), password);
      toast.success(`Benvenuto, ${neg.name}`);
    } catch (err) {
      const msg = err.response?.data?.detail || "Accesso non riuscito";
      setError(typeof msg === "string" ? msg : "Accesso non riuscito");
      toast.error(typeof msg === "string" ? msg : "Accesso non riuscito");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto">
      <div className="fade-up text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#F59E0B] to-[#EA580C] flex items-center justify-center mx-auto mb-4">
          <Store className="w-7 h-7 text-black" />
        </div>
        <h1 className="font-display text-3xl font-black tracking-tight">Accesso Negoziante</h1>
        <p className="text-[#94A3B8] mt-1 text-sm">Entra per sparare i coupon del tuo locale.</p>
      </div>
      <form onSubmit={submit} className="fade-up rounded-3xl bg-[#141619] border border-white/10 p-6 space-y-4">
        <div>
          <Label className="text-xs text-[#94A3B8] mb-1.5 block">Email</Label>
          <Input data-testid="login-email-input" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="navigli@sfida.it"
            className="bg-black/40 border-white/10" />
        </div>
        <div>
          <Label className="text-xs text-[#94A3B8] mb-1.5 block">Password</Label>
          <Input data-testid="login-password-input" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
            className="bg-black/40 border-white/10" />
        </div>
        {error && (
          <p data-testid="login-error" className="text-sm text-[#EF4444] -mt-1">{error}</p>
        )}
        <Button data-testid="login-submit-btn" type="submit" disabled={loading}
          className="w-full h-12 font-bold bg-gradient-to-r from-[#F59E0B] to-[#EA580C] text-black hover:opacity-90 disabled:opacity-50">
          <Lock className="w-4 h-4 mr-2" /> {loading ? "Accesso..." : "Entra"}
        </Button>
        <p className="text-[11px] text-[#64748B] text-center">
          Gli account negoziante vengono creati dall'Admin.
        </p>
      </form>
    </div>
  );
}

function ScannerTerminal({ refreshNotifications }) {
  const { negoziante, signOut } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [myCoupons, setMyCoupons] = useState([]);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);

  const loadCoupons = useCallback(async () => {
    try {
      setMyCoupons(await getMyCoupons());
    } catch (e) {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

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
      const res = await negozianteRedeem(c);
      setResult({ ok: true, coupon: res.coupon });
      toast.success(`Coupon ${res.coupon.code} bruciato!`);
      fireConfetti();
      refreshNotifications();
      loadCoupons();
    } catch (e) {
      const msg = e.response?.data?.detail || "Errore durante la convalida";
      setResult({ ok: false, message: msg });
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
      <div className="fade-up flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-[#F59E0B] font-semibold">Terminale Negoziante</p>
          <h1 className="font-display text-2xl sm:text-3xl font-black tracking-tight mt-0.5">Spara il Coupon</h1>
          <p className="text-[#94A3B8] mt-1 text-sm flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-[#EA580C]" /> {negoziante.locale}
          </p>
        </div>
        <Button data-testid="logout-btn" onClick={signOut} variant="outline"
          className="border-white/15 bg-transparent hover:bg-white/5 text-white shrink-0">
          <LogOut className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Esci</span>
        </Button>
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

      <div className="fade-up">
        <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">Coupon del tuo locale ({myCoupons.length})</h3>
        <div className="space-y-2">
          {myCoupons.length === 0 && <p className="text-[#64748B] text-sm">Nessun coupon per questo locale.</p>}
          {myCoupons.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#141619] border border-white/5 text-sm">
              <div>
                <span className="font-mono">{c.code}</span>
                <span className="text-[#64748B] ml-2">{c.winner_name}</span>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                c.status === "attivo" ? "text-[#F59E0B] bg-[#F59E0B]/10"
                  : c.status === "riscattato" ? "text-[#10B981] bg-[#10B981]/10"
                  : "text-[#EF4444] bg-[#EF4444]/10"
              }`}>{c.status.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function NegozianteView({ refreshNotifications }) {
  const { negoziante, checking } = useAuth();
  if (checking) {
    return <div className="text-center py-20 text-[#64748B]">Caricamento...</div>;
  }
  return negoziante ? <ScannerTerminal refreshNotifications={refreshNotifications} /> : <LoginForm />;
}
