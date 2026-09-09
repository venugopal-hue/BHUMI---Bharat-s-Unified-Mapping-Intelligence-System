"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Phone,
  ShieldAlert,
  ShieldCheck,
  User,
  UserPlus,
} from "lucide-react";

import { BhumiMark } from "@/components/gov/BhumiMark";
import { GovFooter } from "@/components/gov/GovFooter";
import { useAuth, PLATFORM_ROLES, GOVT_ROLES, type RegisterData, type RoleDomain } from "@/lib/auth";

/* ── Indian states for the dropdown ── */
const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
  "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
  "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
  "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
  "Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Andaman & Nicobar Islands","Chandigarh","Dadra & Nagar Haveli","Daman & Diu",
  "Delhi","Jammu & Kashmir","Ladakh","Lakshadweep","Puducherry",
];


const DEPARTMENTS = [
  "Revenue Department",
  "Department of Land Resources",
  "Survey & Settlement Department",
  "Urban Development Department",
  "Agriculture Department",
  "Forest Department",
  "Other",
];

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-xs font-semibold text-muted">{children}</p>;
}

function InputIcon({ icon: Icon }: { icon: React.ElementType }) {
  return <Icon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />;
}

function Select({ id, value, onChange, children, required }: {
  id?: string; value: string; onChange: (v: string) => void;
  children: React.ReactNode; required?: boolean;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="input w-full appearance-none pr-8"
      >
        {children}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { login, demoLogin, register, error, loading, user } = useAuth();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [registered, setRegistered] = useState(false);

  /* Login fields */
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<ReCAPTCHA>(null);

  /* Register fields */
  const [fullName, setFullName]         = useState("");
  const [empCode, setEmpCode]           = useState("");
  const [regEmail, setRegEmail]         = useState("");
  const [mobile, setMobile]             = useState("");
  const [domain, setDomain]             = useState<RoleDomain>("government");
  const [designation, setDesignation]   = useState("");
  const [department, setDepartment]     = useState("");
  const [state, setState]               = useState("");
  const [district, setDistrict]         = useState("");
  const [regPass, setRegPass]           = useState("");
  const [regPassConfirm, setRegPassConfirm] = useState("");
  const [showRegPass, setShowRegPass]   = useState(false);
  const [declaration, setDeclaration]   = useState(false);
  const [regLoading, setRegLoading]     = useState(false);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  const passwordStrength = (p: string) => {
    if (!p) return null;
    const score = [p.length >= 8, /[A-Z]/.test(p), /[0-9]/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;
    if (score <= 1) return { label: "Weak",   color: "text-danger",  bar: "w-1/4 bg-danger" };
    if (score === 2) return { label: "Fair",   color: "text-warn", bar: "w-2/4 bg-warn" };
    if (score === 3) return { label: "Good",   color: "text-success", bar: "w-3/4 bg-success" };
    return            { label: "Strong", color: "text-success", bar: "w-full bg-success" };
  };
  const strength = passwordStrength(regPass);

  const handleDemoLogin = () => {
    demoLogin();
    router.push("/dashboard");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaToken) return;
    const ok = await login(email, password);
    if (ok) router.push("/dashboard");
    else { captchaRef.current?.reset(); setCaptchaToken(null); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPass !== regPassConfirm) return;
    if (!declaration) return;
    setRegLoading(true);
    const data: RegisterData = {
      fullName, employeeCode: empCode, email: regEmail,
      mobile, designation, domain, department, state, district,
      password: regPass,
    };
    const ok = await register(data);
    setRegLoading(false);
    if (ok) setRegistered(true);
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
                <p className="text-sm text-[rgb(var(--bhumi-muted))]">Bharat's Unified Mapping &amp; Intelligence System</p>
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
                Register using the <strong>Register</strong> tab. Your application is reviewed by the system
                administrator. Approval takes 24–48 hours; you'll receive an email confirmation.
              </p>
            </div>
          </section>

          {/* ── Right — form card ── */}
          <section className="flex flex-col rounded-2xl border border-[rgb(var(--bhumi-border))] bg-[rgb(var(--bhumi-surface))] shadow-lg" style={{ height: "min(680px, calc(100vh - 140px))" }}>

            {/* Mobile logo */}
            <div className="flex items-center gap-3 border-b border-[rgb(var(--bhumi-border))] p-5 lg:hidden">
              <BhumiMark size={36} />
              <div>
                <p className="text-base font-bold text-[rgb(var(--bhumi-text))]">BHUMI</p>
                <p className="text-2xs text-[rgb(var(--bhumi-muted))]">Bharat's Unified Mapping &amp; Intelligence System</p>
              </div>
            </div>

            {/* Tab switcher */}
            <div className="flex border-b border-[rgb(var(--bhumi-border))]">
              {(["login", "register"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTab(t); setRegistered(false); }}
                  className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors
                    ${tab === t
                      ? "border-b-2 border-[rgb(var(--bhumi-primary))] text-[rgb(var(--bhumi-primary))]"
                      : "text-[rgb(var(--bhumi-muted))] hover:text-[rgb(var(--bhumi-text))]"}`}
                >
                  {t === "login" ? <><KeyRound size={14} /> Sign In</> : <><UserPlus size={14} /> Register</>}
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
                    <div>
                      <Label>Email address</Label>
                      <div className="relative mt-1">
                        <InputIcon icon={Mail} />
                        <input id="email" type="email" className="input w-full pl-9" value={email}
                          onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
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

                    {/* reCAPTCHA */}
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

                    <div className="relative my-2 flex items-center gap-2">
                      <div className="flex-1 border-t border-[rgb(var(--bhumi-border))]" />
                      <span className="text-xs text-[rgb(var(--bhumi-muted))]">or</span>
                      <div className="flex-1 border-t border-[rgb(var(--bhumi-border))]" />
                    </div>
                    <button
                      type="button"
                      onClick={handleDemoLogin}
                      className="btn-secondary w-full py-2.5 text-sm"
                    >
                      Demo Access (SIH Judges)
                    </button>
                  </form>

                  <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-[rgb(var(--bhumi-border))] bg-[rgb(var(--bhumi-surface-2))] p-3">
                    <ShieldAlert size={14} className="mt-0.5 shrink-0 text-[rgb(var(--bhumi-muted))]" aria-hidden />
                    <p className="text-2xs leading-relaxed text-[rgb(var(--bhumi-muted))]">
                      Restricted to authorised Government of India personnel. Unauthorised access is an offence under the IT Act 2000. All sessions are logged and audited.
                    </p>
                  </div>

                </>
              )}

              {/* ══════════ REGISTER TAB ══════════ */}
              {tab === "register" && (
                <>
                  {registered ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <CheckCircle2 size={56} className="mx-auto mb-5 text-[rgb(var(--bhumi-success))]" />
                      <h3 className="mb-3 text-xl font-bold text-[rgb(var(--bhumi-text))]">
                        Registration submitted
                      </h3>
                      <p className="mb-6 max-w-xs text-sm leading-relaxed text-[rgb(var(--bhumi-muted))]">
                        Your application is under review by the system administrator.
                        Estimated approval: <strong>24–48 hours</strong>. You will receive an
                        email at <strong>{regEmail}</strong> once your account is activated.
                      </p>
                      <button type="button" onClick={() => { setTab("login"); setRegistered(false); }}
                        className="btn-primary">
                        Back to Sign In
                      </button>
                    </div>
                  ) : (
                    <>
                      <h2 className="mb-0.5 text-lg font-bold text-[rgb(var(--bhumi-text))]">Create Account</h2>
                      <p className="mb-6 text-xs text-[rgb(var(--bhumi-muted))]">
                        Submit your credentials for portal clearance. Your application will be reviewed by an administrator before access is granted.
                      </p>

                      <form onSubmit={handleRegister} className="space-y-5">

                        {/* Personal */}
                        <fieldset>
                          <legend className="mb-3 text-2xs font-bold uppercase tracking-widest text-[rgb(var(--bhumi-primary))]">
                            Personal Information
                          </legend>
                          <div className="space-y-3">
                            <div>
                              <Label>Full name</Label>
                              <div className="relative">
                                <InputIcon icon={User} />
                                <input type="text" className="input w-full pl-9" placeholder="e.g. Ramesh Deshmukh"
                                  value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label>Employee / Officer code</Label>
                                <input type="text" className="input w-full" placeholder="e.g. MH-RD-0042"
                                  value={empCode} onChange={(e) => setEmpCode(e.target.value)} required />
                              </div>
                              <div>
                                <Label>Mobile number</Label>
                                <div className="relative">
                                  <InputIcon icon={Phone} />
                                  <input type="tel" className="input w-full pl-9" placeholder="+91 98765 43210"
                                    value={mobile} onChange={(e) => setMobile(e.target.value)} required />
                                </div>
                              </div>
                            </div>
                          </div>
                        </fieldset>

                        {/* Role & jurisdiction */}
                        <fieldset>
                          <legend className="mb-3 text-2xs font-bold uppercase tracking-widest text-[rgb(var(--bhumi-primary))]">
                            Role &amp; Jurisdiction
                          </legend>
                          <div className="space-y-3">
                            {/* Domain toggle */}
                            <div>
                              <Label>Account type</Label>
                              <div className="grid grid-cols-2 gap-2">
                                {(["government", "platform"] as RoleDomain[]).map((d) => (
                                  <button
                                    key={d}
                                    type="button"
                                    onClick={() => { setDomain(d); setDesignation(""); }}
                                    className={`rounded-card border px-3 py-2 text-xs font-semibold transition-colors ${
                                      domain === d
                                        ? "border-[rgb(var(--bhumi-primary))] bg-[rgb(var(--bhumi-primary))]/10 text-[rgb(var(--bhumi-primary))]"
                                        : "border-[rgb(var(--bhumi-border))] text-[rgb(var(--bhumi-muted))] hover:border-[rgb(var(--bhumi-primary))]/40"
                                    }`}
                                  >
                                    {d === "government" ? "Government Officer" : "Platform Team"}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <Label>Designation</Label>
                              <Select value={designation} onChange={setDesignation} required>
                                <option value="">Select designation…</option>
                                {(domain === "platform" ? PLATFORM_ROLES : GOVT_ROLES).map((r) => (
                                  <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                              </Select>
                              {designation && (
                                <p className="mt-1 text-2xs text-[rgb(var(--bhumi-muted))]">
                                  {[...PLATFORM_ROLES, ...GOVT_ROLES].find(r => r.value === designation)?.description}
                                </p>
                              )}
                            </div>
                            <div>
                              <Label>Department</Label>
                              <Select value={department} onChange={setDepartment} required>
                                <option value="">Select department…</option>
                                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                              </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label>State</Label>
                                <Select value={state} onChange={setState} required>
                                  <option value="">Select state…</option>
                                  {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </Select>
                              </div>
                              <div>
                                <Label>District</Label>
                                <input type="text" className="input w-full" placeholder="e.g. Nashik"
                                  value={district} onChange={(e) => setDistrict(e.target.value)} required />
                              </div>
                            </div>
                          </div>
                        </fieldset>

                        {/* Account */}
                        <fieldset>
                          <legend className="mb-3 text-2xs font-bold uppercase tracking-widest text-[rgb(var(--bhumi-primary))]">
                            Account Credentials
                          </legend>
                          <div className="space-y-3">
                            <div>
                              <Label>Government email (.gov.in)</Label>
                              <div className="relative">
                                <InputIcon icon={Mail} />
                                <input type="email" className="input w-full pl-9"
                                  placeholder="officer@maharashtra.gov.in"
                                  value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required />
                              </div>
                            </div>
                            <div>
                              <Label>Create password</Label>
                              <div className="relative">
                                <InputIcon icon={Lock} />
                                <input type={showRegPass ? "text" : "password"} className="input w-full pl-9 pr-10"
                                  value={regPass} onChange={(e) => setRegPass(e.target.value)} required />
                                <button type="button" onClick={() => setShowRegPass(!showRegPass)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                                  aria-label="Toggle password">
                                  {showRegPass ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              </div>
                              {strength && (
                                <div className="mt-1.5 space-y-1">
                                  <div className="h-1 w-full rounded-full bg-line">
                                    <div className={`h-1 rounded-full transition-all ${strength.bar}`} />
                                  </div>
                                  <p className={`text-2xs font-semibold ${strength.color}`}>{strength.label}</p>
                                </div>
                              )}
                            </div>
                            <div>
                              <Label>Confirm password</Label>
                              <div className="relative">
                                <InputIcon icon={Lock} />
                                <input type="password" className="input w-full pl-9"
                                  value={regPassConfirm} onChange={(e) => setRegPassConfirm(e.target.value)} required />
                              </div>
                              {regPassConfirm && regPass !== regPassConfirm && (
                                <p className="mt-1 text-2xs text-danger">Passwords do not match.</p>
                              )}
                            </div>
                          </div>
                        </fieldset>

                        {/* Declaration */}
                        <label className="flex cursor-pointer items-start gap-3">
                          <input type="checkbox" className="mt-0.5 accent-[rgb(var(--bhumi-primary))]"
                            checked={declaration} onChange={(e) => setDeclaration(e.target.checked)} required />
                          <span className="text-xs leading-relaxed text-[rgb(var(--bhumi-muted))]">
                            I certify that the information provided is accurate and complete. I understand that
                            BHUMI is a restricted Government of India system and that unauthorised access is an
                            offence under the IT Act 2000 and the Indian Penal Code.
                          </span>
                        </label>

                        <button type="submit"
                          className="btn-primary w-full"
                          disabled={regLoading || !declaration || regPass !== regPassConfirm}>
                          {regLoading
                            ? <><Loader2 size={15} className="animate-spin" /> Submitting…</>
                            : <>Request Access <ArrowRight size={15} /></>}
                        </button>

                        <div className="flex items-start gap-2.5 rounded-lg border border-[rgb(var(--bhumi-border))] bg-[rgb(var(--bhumi-surface-2))] p-3">
                          <ShieldAlert size={14} className="mt-0.5 shrink-0 text-[rgb(var(--bhumi-muted))]" />
                          <p className="text-2xs leading-relaxed text-[rgb(var(--bhumi-muted))]">
                            <strong className="text-[rgb(var(--bhumi-text))]">Approval required.</strong>{" "}
                            Your application is reviewed by the system administrator. You will receive an
                            official email once your account is activated (24–48 hours).
                          </p>
                        </div>
                      </form>
                    </>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </main>

      <GovFooter compact />
    </div>
  );
}

