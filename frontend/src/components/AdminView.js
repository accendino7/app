import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus, Trophy, Zap, CheckCircle2, XCircle, TrendingUp, Mail, Save, Ticket,
  Store, Trash2, History, Download, Inbox, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getSfide, createSfida, getCoupons, createCoupon, getStats, getSettings, updateSettings,
  getNegozianti, createNegoziante, deleteNegoziante,
  getCouponRequests, approveCoupon, rejectCoupon,
} from "@/api";
import CouponTicket from "@/components/CouponTicket";

const STAT_CARDS = [
  { key: "attivi", label: "Attivi", icon: Zap, color: "#F59E0B" },
  { key: "riscattati", label: "Riscattati", icon: CheckCircle2, color: "#10B981" },
  { key: "scaduti", label: "Scaduti", icon: XCircle, color: "#EF4444" },
  { key: "conversione", label: "Conversione %", icon: TrendingUp, color: "#8B5CF6" },
];

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs text-[#94A3B8] mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

export default function AdminView({ notifications, refreshNotifications, wsTick }) {
  const [sfide, setSfide] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [stats, setStats] = useState({});
  const [settings, setSettings] = useState({ notification_email: "" });
  const [negozianti, setNegozianti] = useState([]);
  const [requests, setRequests] = useState([]);

  const [sfidaForm, setSfidaForm] = useState({ titolo: "", locale: "", premio: "", expiry_hours: 96 });
  const [sfidaOpen, setSfidaOpen] = useState(false);
  const [couponForm, setCouponForm] = useState({ sfida_id: "", winner_name: "", winner_email: "" });
  const [couponOpen, setCouponOpen] = useState(false);
  const [negForm, setNegForm] = useState({ name: "", email: "", password: "", locale: "" });

  const [filterLocale, setFilterLocale] = useState("all");
  const [filterSfida, setFilterSfida] = useState("all");

  const refresh = useCallback(async () => {
    const [s, c, st, se, n, r] = await Promise.all([
      getSfide(), getCoupons(), getStats(), getSettings(), getNegozianti(), getCouponRequests(),
    ]);
    setSfide(s);
    setCoupons(c);
    setStats(st);
    setSettings(se);
    setNegozianti(n);
    setRequests(r);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (wsTick) refresh();
  }, [wsTick]);

  const doApprove = async (id) => {
    try {
      await approveCoupon(id);
      toast.success("Coupon approvato · countdown avviato");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Impossibile approvare");
    }
  };
  const doReject = async (id) => {
    try {
      await rejectCoupon(id);
      toast("Richiesta rifiutata");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Impossibile rifiutare");
    }
  };

  const locali = [...new Set(sfide.map((s) => s.locale))];

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
    toast.success(
      `Coupon ${created.code} assegnato a ${created.winner_name}` +
        (couponForm.winner_email ? " · email inviata" : "")
    );
    setCouponOpen(false);
    setCouponForm({ sfida_id: "", winner_name: "", winner_email: "" });
    refresh();
  };

  const saveEmail = async () => {
    await updateSettings({ notification_email: settings.notification_email });
    toast.success("Email notifiche aggiornata");
  };

  const submitNeg = async () => {
    if (!negForm.name || !negForm.email || !negForm.password || !negForm.locale) {
      toast.error("Compila tutti i campi dell'account");
      return;
    }
    try {
      await createNegoziante(negForm);
      toast.success(`Account creato per ${negForm.name}`);
      setNegForm({ name: "", email: "", password: "", locale: "" });
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore nella creazione");
    }
  };

  const removeNeg = async (id) => {
    await deleteNegoziante(id);
    toast.success("Account rimosso");
    refresh();
  };

  const filteredHistory = notifications.filter(
    (n) => (filterLocale === "all" || n.locale === filterLocale) && (filterSfida === "all" || n.sfida_titolo === filterSfida)
  );

  const exportCSV = () => {
    const header = ["Codice", "Locale", "Sfida", "Premio", "Vincitore", "Data riscatto"];
    const rows = filteredHistory.map((n) => [n.code, n.locale, n.sfida_titolo, n.premio, n.winner_name, n.created_at]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "storico_riscatti.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV esportato");
  };

  const sfideTitoli = [...new Set(notifications.map((n) => n.sfida_titolo))];
  const localiStorico = [...new Set(notifications.map((n) => n.locale))];

  return (
    <div className="space-y-8">
      <div className="fade-up flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-[#F59E0B] font-semibold">Dashboard Admin</p>
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight mt-1">Gestisci Coupon</h1>
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
              <DialogHeader>
                <DialogTitle className="font-display">Crea un nuovo coupon</DialogTitle>
                <DialogDescription className="text-[#64748B]">Definisci locale, premio e durata del coupon.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <Field label="Titolo Coupon">
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
                  <Input data-testid="challenge-prize-input" value={sfidaForm.premio}
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
                  Crea Coupon
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
              <DialogHeader>
                <DialogTitle className="font-display">Assegna coupon al vincitore</DialogTitle>
                <DialogDescription className="text-[#64748B]">Se inserisci l'email, il vincitore riceve la tessera con QR e countdown.</DialogDescription>
              </DialogHeader>
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
                <Field label="Email vincitore (opzionale — invia la tessera)">
                  <Input data-testid="coupon-winner-email-input" value={couponForm.winner_email}
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

      <Tabs defaultValue="coupon" className="fade-up">
        <TabsList className="bg-black/40 border border-white/10">
          <TabsTrigger value="coupon" data-testid="tab-coupon" className="data-[state=active]:bg-[#F59E0B] data-[state=active]:text-black">
            <Ticket className="w-4 h-4 mr-1.5" /> Coupon
          </TabsTrigger>
          <TabsTrigger value="richieste" data-testid="tab-richieste" className="data-[state=active]:bg-[#8B5CF6] data-[state=active]:text-white">
            <Inbox className="w-4 h-4 mr-1.5" /> Richieste{requests.length ? ` (${requests.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="negozianti" data-testid="tab-negozianti" className="data-[state=active]:bg-[#F59E0B] data-[state=active]:text-black">
            <Store className="w-4 h-4 mr-1.5" /> Negozianti
          </TabsTrigger>
          <TabsTrigger value="storico" data-testid="tab-storico" className="data-[state=active]:bg-[#F59E0B] data-[state=active]:text-black">
            <History className="w-4 h-4 mr-1.5" /> Storico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="coupon" className="mt-6">
          <h2 className="font-display text-xl font-bold mb-4">Coupon emessi ({coupons.length})</h2>
          {coupons.length === 0 ? (
            <p className="text-[#64748B] text-sm">Nessun coupon ancora. Assegnane uno a un vincitore.</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {coupons.map((c) => (
                <CouponTicket key={c.id} coupon={c} showQR />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="richieste" className="mt-6 space-y-3">
          <h2 className="font-display text-xl font-bold mb-1">Richieste coupon dai negozianti ({requests.length})</h2>
          <p className="text-[#64748B] text-sm mb-4">Approva o rifiuta i coupon proposti dai negozianti. All'approvazione parte il countdown.</p>
          {requests.length === 0 ? (
            <p className="text-[#64748B] text-sm">Nessuna richiesta in attesa.</p>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div key={r.id} data-testid="request-item" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#141619] border border-[#8B5CF6]/30">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[#F59E0B]">{r.code}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#8B5CF6]/15 text-[#8B5CF6] font-bold">IN ATTESA</span>
                    </div>
                    <p className="text-sm mt-1">{r.premio} · <span className="text-[#94A3B8]">{r.locale}</span></p>
                    <p className="text-xs text-[#64748B] mt-0.5">Vincitore: {r.winner_name} · richiesto da {r.requested_by} · {r.expiry_hours}h</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button data-testid={`approve-${r.code}`} onClick={() => doApprove(r.id)} className="bg-[#10B981] text-black font-semibold hover:opacity-90">
                      <Check className="w-4 h-4 mr-1" /> Approva
                    </Button>
                    <Button data-testid={`reject-${r.code}`} onClick={() => doReject(r.id)} variant="outline" className="border-[#EF4444]/40 text-[#EF4444] bg-transparent hover:bg-[#EF4444]/10">
                      <X className="w-4 h-4 mr-1" /> Rifiuta
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="negozianti" className="mt-6 space-y-6">
          <div className="p-5 rounded-2xl bg-[#141619] border border-white/10">
            <h3 className="font-display text-lg font-bold mb-4">Crea account negoziante</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nome Attività">
                <Input data-testid="neg-name-input" value={negForm.name}
                  onChange={(e) => setNegForm({ ...negForm, name: e.target.value })}
                  placeholder="Es. Marco" className="bg-black/40 border-white/10" />
              </Field>
              <Field label="Locale assegnato">
                <Select value={negForm.locale} onValueChange={(v) => setNegForm({ ...negForm, locale: v })}>
                  <SelectTrigger data-testid="neg-locale-select" className="bg-black/40 border-white/10">
                    <SelectValue placeholder="Seleziona locale" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1B1E22] border-white/10 text-white">
                    {locali.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Email">
                <Input data-testid="neg-email-input" type="email" value={negForm.email}
                  onChange={(e) => setNegForm({ ...negForm, email: e.target.value })}
                  placeholder="negoziante@locale.it" className="bg-black/40 border-white/10" />
              </Field>
              <Field label="Password">
                <Input data-testid="neg-password-input" type="text" value={negForm.password}
                  onChange={(e) => setNegForm({ ...negForm, password: e.target.value })}
                  placeholder="password" className="bg-black/40 border-white/10" />
              </Field>
            </div>
            <Button data-testid="submit-neg-btn" onClick={submitNeg}
              className="mt-4 bg-gradient-to-r from-[#F59E0B] to-[#EA580C] text-black font-semibold hover:opacity-90">
              <Plus className="w-4 h-4 mr-1.5" /> Crea account
            </Button>
          </div>

          <div className="space-y-2">
            {negozianti.map((n) => (
              <div key={n.id} data-testid="neg-item" className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#141619] border border-white/5">
                <div>
                  <p className="font-semibold text-sm">{n.name}</p>
                  <p className="text-xs text-[#94A3B8]">{n.email} · {n.locale}</p>
                </div>
                <Button data-testid={`neg-delete-${n.id}`} onClick={() => removeNeg(n.id)} variant="ghost" size="icon"
                  className="text-[#EF4444] hover:bg-[#EF4444]/10">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="storico" className="mt-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <Label className="text-xs text-[#94A3B8] mb-1.5 block">Filtra per locale</Label>
              <Select value={filterLocale} onValueChange={setFilterLocale}>
                <SelectTrigger data-testid="filter-locale-select" className="bg-black/40 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1B1E22] border-white/10 text-white">
                  <SelectItem value="all">Tutti i locali</SelectItem>
                  {localiStorico.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs text-[#94A3B8] mb-1.5 block">Filtra per sfida</Label>
              <Select value={filterSfida} onValueChange={setFilterSfida}>
                <SelectTrigger data-testid="filter-sfida-select" className="bg-black/40 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1B1E22] border-white/10 text-white">
                  <SelectItem value="all">Tutte le sfide</SelectItem>
                  {sfideTitoli.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button data-testid="export-csv-btn" onClick={exportCSV} variant="outline"
              className="border-white/15 bg-transparent hover:bg-white/5 text-white">
              <Download className="w-4 h-4 mr-1.5" /> Esporta CSV
            </Button>
          </div>

          <div className="rounded-2xl bg-[#141619] border border-white/10 overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-4 py-3 text-[11px] uppercase tracking-wider text-[#64748B] border-b border-white/10">
              <span>Codice</span><span>Locale</span><span>Vincitore</span><span>Quando</span>
            </div>
            {filteredHistory.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[#64748B]">Nessun riscatto registrato.</p>
            ) : (
              filteredHistory.map((n) => (
                <div key={n.id} data-testid="storico-row" className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-4 py-3 text-sm border-b border-white/5 last:border-0">
                  <span className="font-mono text-[#F59E0B]">{n.code}</span>
                  <span className="text-[#94A3B8] truncate">{n.locale}</span>
                  <span className="truncate">{n.winner_name}</span>
                  <span className="text-[#64748B] text-xs">{new Date(n.created_at).toLocaleString("it-IT")}</span>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
