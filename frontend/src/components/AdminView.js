import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Trophy, Zap, CheckCircle2, XCircle, TrendingUp, Mail, Save, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getSfide, createSfida, getCoupons, createCoupon, getStats, getSettings, updateSettings,
} from "@/api";
import CouponTicket from "@/components/CouponTicket";

const STAT_CARDS = [
  { key: "attivi", label: "Attivi", icon: Zap, color: "#F59E0B" },
  { key: "riscattati", label: "Riscattati", icon: CheckCircle2, color: "#10B981" },
  { key: "scaduti", label: "Scaduti", icon: XCircle, color: "#EF4444" },
  { key: "conversione", label: "Conversione %", icon: TrendingUp, color: "#8B5CF6" },
];

export default function AdminView({ refreshNotifications }) {
  const [sfide, setSfide] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [stats, setStats] = useState({});
  const [settings, setSettings] = useState({ notification_email: "" });

  const [sfidaForm, setSfidaForm] = useState({ titolo: "", locale: "", premio: "", expiry_hours: 96 });
  const [sfidaOpen, setSfidaOpen] = useState(false);
  const [couponForm, setCouponForm] = useState({ sfida_id: "", winner_name: "", winner_email: "" });
  const [couponOpen, setCouponOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [s, c, st, se] = await Promise.all([getSfide(), getCoupons(), getStats(), getSettings()]);
    setSfide(s);
    setCoupons(c);
    setStats(st);
    setSettings(se);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submitSfida = async () => {
    if (!sfidaForm.titolo || !sfidaForm.locale || !sfidaForm.premio) {
      toast.error("Compila tutti i campi della sfida");
      return;
    }
    await createSfida({ ...sfidaForm, expiry_hours: Number(sfidaForm.expiry_hours) || 96 });
    toast.success("Sfida creata!");
    setSfidaOpen(false);
    setSfidaForm({ titolo: "", locale: "", premio: "", expiry_hours: 96 });
    refresh();
  };

  const submitCoupon = async () => {
    if (!couponForm.sfida_id || !couponForm.winner_name) {
      toast.error("Seleziona la sfida e inserisci il vincitore");
      return;
    }
    const created = await createCoupon(couponForm);
    toast.success(`Coupon ${created.code} assegnato a ${created.winner_name}`);
    setCouponOpen(false);
    setCouponForm({ sfida_id: "", winner_name: "", winner_email: "" });
    refresh();
  };

  const saveEmail = async () => {
    await updateSettings({ notification_email: settings.notification_email });
    toast.success("Email notifiche aggiornata");
  };

  return (
    <div className="space-y-8">
      <div className="fade-up flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-[#F59E0B] font-semibold">Dashboard Admin</p>
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight mt-1">
            Gestisci le sfide
          </h1>
          <p className="text-[#94A3B8] mt-1 text-sm">Crea sfide, genera coupon a tempo e assegna i vincitori.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={sfidaOpen} onOpenChange={setSfidaOpen}>
            <DialogTrigger asChild>
              <Button data-testid="create-challenge-btn" variant="outline" className="border-white/15 bg-transparent hover:bg-white/5 text-white">
                <Plus className="w-4 h-4 mr-1.5" /> Nuova Sfida
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#141619] border-white/10 text-white">
              <DialogHeader><DialogTitle className="font-display">Crea una nuova sfida</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <Field label="Titolo sfida">
                  <Input data-testid="challenge-title-input" value={sfidaForm.titolo}
                    onChange={(e) => setSfidaForm({ ...sfidaForm, titolo: e.target.value })}
                    placeholder="Es. Aperitivo per Due" className="bg-black/40 border-white/10" />
                </Field>
                <Field label="Locale">
                  <Input data-testid="challenge-venue-input" value={sfidaForm.locale}
                    onChange={(e) => setSfidaForm({ ...sfidaForm, locale: e.target.value })}
                    placeholder="Es. Osteria del Sole" className="bg-black/40 border-white/10" />
                </Field>
                <Field label="Premio">
                  <Input value={sfidaForm.premio}
                    onChange={(e) => setSfidaForm({ ...sfidaForm, premio: e.target.value })}
                    placeholder="Es. 2 Spritz + tagliere" className="bg-black/40 border-white/10" />
                </Field>
                <Field label="Ore di validita (scadenza coupon)">
                  <Input data-testid="challenge-expiry-hours-input" type="number" value={sfidaForm.expiry_hours}
                    onChange={(e) => setSfidaForm({ ...sfidaForm, expiry_hours: e.target.value })}
                    className="bg-black/40 border-white/10" />
                </Field>
              </div>
              <DialogFooter>
                <Button data-testid="submit-challenge-btn" onClick={submitSfida}
                  className="bg-gradient-to-r from-[#F59E0B] to-[#EA580C] text-black font-semibold hover:opacity-90">
                  Crea Sfida
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={couponOpen} onOpenChange={setCouponOpen}>
            <DialogTrigger asChild>
              <Button data-testid="create-coupon-btn" className="bg-gradient-to-r from-[#F59E0B] to-[#EA580C] text-black font-semibold hover:opacity-90">
                <Trophy className="w-4 h-4 mr-1.5" /> Assegna Coupon
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#141619] border-white/10 text-white">
              <DialogHeader><DialogTitle className="font-display">Assegna coupon al vincitore</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <Field label="Sfida">
                  <Select value={couponForm.sfida_id} onValueChange={(v) => setCouponForm({ ...couponForm, sfida_id: v })}>
                    <SelectTrigger data-testid="coupon-sfida-select" className="bg-black/40 border-white/10">
                      <SelectValue placeholder="Seleziona sfida" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1B1E22] border-white/10 text-white">
                      {sfide.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.titolo} · {s.locale} ({s.expiry_hours}h)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Nome vincitore">
                  <Input data-testid="coupon-winner-name-input" value={couponForm.winner_name}
                    onChange={(e) => setCouponForm({ ...couponForm, winner_name: e.target.value })}
                    placeholder="Es. Marco Rossi" className="bg-black/40 border-white/10" />
                </Field>
                <Field label="Email vincitore (opzionale)">
                  <Input value={couponForm.winner_email}
                    onChange={(e) => setCouponForm({ ...couponForm, winner_email: e.target.value })}
                    placeholder="vincitore@email.it" className="bg-black/40 border-white/10" />
                </Field>
              </div>
              <DialogFooter>
                <Button data-testid="submit-coupon-btn" onClick={submitCoupon}
                  className="bg-gradient-to-r from-[#F59E0B] to-[#EA580C] text-black font-semibold hover:opacity-90">
                  Genera Coupon
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 fade-up">
        {STAT_CARDS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.key} className="p-4 rounded-2xl bg-[#141619] border border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#94A3B8]">{s.label}</span>
                <Icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
              <p className="font-display text-3xl font-black mt-2" style={{ color: s.color }} data-testid={`stat-${s.key}`}>
                {stats[s.key] ?? 0}
              </p>
            </div>
          );
        })}
      </div>

      <div className="fade-up p-4 rounded-2xl bg-[#141619] border border-white/10 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <Label className="text-xs text-[#94A3B8] flex items-center gap-1.5 mb-1.5">
            <Mail className="w-3.5 h-3.5" /> Email per notifiche riscatto
          </Label>
          <Input data-testid="notification-email-input" value={settings.notification_email || ""}
            onChange={(e) => setSettings({ ...settings, notification_email: e.target.value })}
            className="bg-black/40 border-white/10" />
        </div>
        <Button data-testid="save-email-btn" onClick={saveEmail} variant="outline" className="border-white/15 bg-transparent hover:bg-white/5 text-white">
          <Save className="w-4 h-4 mr-1.5" /> Salva
        </Button>
      </div>

      <div className="fade-up">
        <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
          <Ticket className="w-5 h-5 text-[#F59E0B]" /> Coupon emessi ({coupons.length})
        </h2>
        {coupons.length === 0 ? (
          <p className="text-[#64748B] text-sm">Nessun coupon ancora. Assegnane uno a un vincitore.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {coupons.map((c) => (
              <CouponTicket key={c.id} coupon={c} showQR />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs text-[#94A3B8] mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}
