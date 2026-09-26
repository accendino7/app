import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";

export default function AdminLogin() {
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
      const u = await signIn(email.trim(), password);
      if (u.role !== "admin") {
        setError("Questo account non è un amministratore.");
        return;
      }
      toast.success(`Benvenuto, ${u.name}`);
    } catch (err) {
      const msg = err.response?.data?.detail || "Accesso non riuscito";
      setError(typeof msg === "string" ? msg : "Accesso non riuscito");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto">
      <div className="fade-up text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#8B5CF6] to-[#EA580C] flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="w-7 h-7 text-black" />
        </div>
        <h1 className="font-display text-3xl font-black tracking-tight">Accesso Admin</h1>
        <p className="text-[#94A3B8] mt-1 text-sm">Area riservata: crea sfide e gestisci i negozianti.</p>
      </div>
      <form onSubmit={submit} className="fade-up rounded-3xl bg-[#141619] border border-white/10 p-6 space-y-4">
        <div>
          <Label className="text-xs text-[#94A3B8] mb-1.5 block">Email</Label>
          <Input data-testid="admin-email-input" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="admin@sfida.it"
            className="bg-black/40 border-white/10" />
        </div>
        <div>
          <Label className="text-xs text-[#94A3B8] mb-1.5 block">Password</Label>
          <Input data-testid="admin-password-input" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
            className="bg-black/40 border-white/10" />
        </div>
        {error && <p data-testid="admin-login-error" className="text-sm text-[#EF4444] -mt-1">{error}</p>}
        <Button data-testid="admin-login-submit-btn" type="submit" disabled={loading}
          className="w-full h-12 font-bold bg-gradient-to-r from-[#F59E0B] to-[#EA580C] text-black hover:opacity-90 disabled:opacity-50">
          <Lock className="w-4 h-4 mr-2" /> {loading ? "Accesso..." : "Entra"}
        </Button>
      </form>
    </div>
  );
}
