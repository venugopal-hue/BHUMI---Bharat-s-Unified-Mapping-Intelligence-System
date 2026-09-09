"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  User,
  UserPlus,
} from "lucide-react";

import { BhumiMark } from "@/components/gov/BhumiMark";
import { GovFooter } from "@/components/gov/GovFooter";
import { useAuth } from "@/lib/auth";

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-xs font-semibold text-muted">{children}</p>;
}

function InputIcon({ icon: Icon }: { icon: React.ElementType }) {
  return <Icon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, error, loading, user, mfaRequired } = useAuth();
  const [tab, setTab] = useState<"login" | "register">("login");

  /* Login fields */
  const [username, setUsername]   = useState("");
  const [password, setPassword]   = useState("");
  const [mfaCode, setMfaCode]     = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<ReCAPTCHA>(null);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaToken && !mfaRequired) return;
    const ok = await login(username, password, mfaCode || undefined);
    if (ok) {
      router.push("/dashboard");
    } else if (!mfaRequired) {
      captchaRef.current?.reset();
      setCaptchaToken(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[rgb(var(--bhumi-bg))]">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">

          {/* ── Left — identity panel ── */}
          <section className="hidden flex-col justify-center lg:flex">
            <div className="flex items-center gap-3">
              <BhumiMark size={52} />
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-[rgb(var(--bhumi-text))]">BHUMI</h1>
                <p className="text-sm text-[rgb(var(--bhumi-muted))]">Bharat&apos;s Unified Mapping &amp; Intelligence System</p>
              </div>
            </div>

            <p className="mt-6 max-w-md text-sm leading-relaxed text-[rgb(var(--bhumi-muted))]">
              AI-driven digitization and validation of land records across India. Every extracted field carries
              a confidence score — uncertain fields go to a verifier before reaching the register.
            </p>

            <dl className="mt-8 grid max-w-md grid-cols-2 gap-x-6 gap-y-5">
              {[["12", "Indian languages read"], ["24", "Fields per record"], ["60+", "Validation rules"], ["100%", "Actions audit-chained"]].map(([v, l]) => (
                <div key={l}>
                  <dt className="text-2xl font-bold tabular-nums text-[rgb(var(--bhumi-primary))]">{v}</dt>
                  <dd className="mt-0.5 text-xs text-[rgb(var(--bhumi-muted))]">{l}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 rounded-xl border border-[rgb(var(--bhumi-border))] bg-[rgb(var(--bhumi-surface))] p-3.5">
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-[rgb(var(--bhumi-muted))]">
                New officers
              </p>
              <p className="text-xs leading-relaxed text-[rgb(var(--bhumi-muted))]">
                Access is provisioned by your department&apos;s system administrator. Contact them to obtain your
                employee code and initial credentials.
              </p>
            </div>
          </section>

          {/* ── Right — form card ── */}
          <section className="flex flex-col rounded-2xl border border-[rgb(var(--bhumi-border))] bg-[rgb(var(--bhumi-surface))] shadow-lg" style={{ height: "min(600px, calc(100vh - 140px))" }}>

            {/* Mobile logo */}
            <div className="flex items-center gap-3 border-b border-[rgb(var(--bhumi-border))] p-5 lg:hidden">
              <BhumiMark size={36} />
              <div>
                <p className="text-base font-bold text-[rgb(var(--bhumi-text))]">BHUMI</p>
                <p className="text-2xs text-[rgb(var(--bhumi-muted))]">Bharat&apos;s Unified Mapping &amp; Intelligence System</p>
              </div>
            </div>

            {/* Tab switcher */}
            <div className="flex border-b border-[rgb(var(--bhumi-border))]">
              {(["login", "register"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors
                    ${tab === t
                      ? "border-b-2 border-[rgb(var(--bhumi-primary))] text-[rgb(var(--bhumi-primary))]"
                      : "text-[rgb(var(--bhumi-muted))] hover:text-[rgb(var(--bhumi-text))]"}`}
                >
                  {t === "login" ? <><KeyRound size={14} /> Sign In</> : <><UserPlus size={14} /> Access Request</>}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-8">

              {/* ── Error banner ── */}
              {error && (
                <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-[rgb(var(--bhumi-danger)/0.3)] bg-[rgb(var(--bhumi-danger-soft))] p-3">
                  <AlertCircle size={15} className="mt-0.5 shrink-0 text-[rgb(var(--bhumi-danger))]" aria-hidden />
                  <p className="text-xs leading-relaxed text-[rgb(var(--bhumi-danger))]">{error}</p>
                </div>
              )}

              {/* ══════════ LOGIN TAB ══════════ */}
              {tab === "login" && (
                <>
                  <h2 className="mb-1 text-2xl font-bold text-[rgb(var(--bhumi-text))]">Officer Sign In</h2>
                  <p className="mb-8 text-sm text-[rgb(var(--bhumi-muted))]">Use the credentials issued by your department.</p>

                  <form onSubmit={handleLogin} className="space-y-6">
                    {!mfaRequired ? (
                      <>
                        <div>
                          <Label>Employee code / Username</Label>
                          <div className="relative mt-1">
                            <InputIcon icon={User} />
                            <input
                              id="username"
                              type="text"
                              className="input w-full pl-9"
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                              autoComplete="username"
                              placeholder="e.g. MH-RD-0042"
                              required
                              autoFocus
                            />
                          </div>
                        </div>

                        <div>
                          <Label>Password</Label>
                          <div className="relative mt-1">
                            <InputIcon icon={Lock} />
                            <input id="password" type={showPass ? "text" : "password"} className="input w-full pl-9 pr-10"
                              value={password} onChange={(e) => setPassword(e.target.value)}
                              autoComplete="current-password" required />
                            <button type="button" onClick={() => setShowPass(!showPass)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                              aria-label={showPass ? "Hide password" : "Show password"}>
                              {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>

                        <div className="flex justify-center">
                          <ReCAPTCHA
                            ref={captchaRef}
                            sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
                            onChange={(token) => setCaptchaToken(token)}
                            onExpired={() => setCaptchaToken(null)}
                          />
                        </div>

                        <button type="submit" className="btn-primary w-full py-3 text-sm" disabled={loading || !captchaToken}>
                          {loading
                            ? <><Loader2 size={15} className="animate-spin" /> Signing in…</>
                            : <>Sign In <ArrowRight size={15} /></>}
                        </button>
                      </>
                    ) : (
                      /* MFA step */
                      <>
                        <div className="rounded-lg border border-[rgb(var(--bhumi-border))] bg-[rgb(var(--bhumi-surface-2))] p-4 text-center">
                          <ShieldCheck size={28} className="mx-auto mb-2 text-[rgb(var(--bhumi-primary))]" />
                          <p className="text-sm font-semibold text-[rgb(var(--bhumi-text))]">Two-factor authentication required</p>
                          <p className="mt-1 text-xs text-[rgb(var(--bhumi-muted))]">Enter the 6-digit code from your authenticator app.</p>
                        </div>

                        <div>
                          <Label>Authenticator code</Label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            className="input w-full text-center text-xl tracking-widest"
                            value={mfaCode}
                            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                            autoFocus
                            required
                          />
                        </div>

                        <button type="submit" className="btn-primary w-full py-3 text-sm" disabled={loading || mfaCode.length !== 6}>
                          {loading
                            ? <><Loader2 size={15} className="animate-spin" /> Verifying…</>
                            : <>Verify &amp; Sign In <ArrowRight size={15} /></>}
                        </button>

                        <button
                          type="button"
                          onClick={() => { setMfaCode(""); }}
                          className="w-full text-xs text-[rgb(var(--bhumi-muted))] hover:text-[rgb(var(--bhumi-text))] underline"
                        >
                          Back to sign in
                        </button>
                      </>
                    )}
                  </form>

                  <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-[rgb(var(--bhumi-border))] bg-[rgb(var(--bhumi-surface-2))] p-3">
                    <ShieldAlert size={14} className="mt-0.5 shrink-0 text-[rgb(var(--bhumi-muted))]" aria-hidden />
                    <p className="text-2xs leading-relaxed text-[rgb(var(--bhumi-muted))]">
                      Restricted to authorised Government of India personnel. Unauthorised access is an offence under the IT Act 2000. All sessions are logged and audited.
                    </p>
                  </div>
                </>
              )}

              {/* ══════════ ACCESS REQUEST TAB ══════════ */}
              {tab === "register" && (
                <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-[rgb(var(--bhumi-primary))]/10 flex items-center justify-center mb-5">
                    <Mail size={24} className="text-[rgb(var(--bhumi-primary))]" />
                  </div>
                  <h2 className="mb-2 text-xl font-bold text-[rgb(var(--bhumi-text))]">Need Access?</h2>
                  <p className="mb-6 max-w-xs text-sm leading-relaxed text-[rgb(var(--bhumi-muted))]">
                    BHUMI accounts are provisioned by system administrators. To request access, contact your
                    department&apos;s nodal officer or write to the BHUMI platform team.
                  </p>
                  <div className="w-full max-w-xs space-y-3 text-left rounded-xl border border-[rgb(var(--bhumi-border))] bg-[rgb(var(--bhumi-surface-2))] p-4">
                    <p className="text-xs font-semibold text-[rgb(var(--bhumi-text))]">What to include in your request:</p>
                    {["Full name and employee / officer code", "Department and jurisdiction (state / district)", "Designation and required access level", "Government email address (.gov.in)"].map((item) => (
                      <div key={item} className="flex items-start gap-2">
                        <span className="mt-0.5 text-[rgb(var(--bhumi-primary))]">·</span>
                        <p className="text-xs text-[rgb(var(--bhumi-muted))]">{item}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-[rgb(var(--bhumi-border))] bg-[rgb(var(--bhumi-surface-2))] p-3 w-full max-w-xs text-left">
                    <ShieldAlert size={14} className="mt-0.5 shrink-0 text-[rgb(var(--bhumi-muted))]" />
                    <p className="text-2xs leading-relaxed text-[rgb(var(--bhumi-muted))]">
                      Access is subject to approval and background verification as per MeitY guidelines.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <GovFooter compact />
    </div>
  );
}
