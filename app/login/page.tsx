"use client";
import { useState } from "react";
import Nav from "@/components/Nav";
import { browserClient } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"" | "busy" | "sent" | "err">("");
  const [msg, setMsg] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const { error } = await browserClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setState("err"); setMsg(error.message); } else setState("sent");
  }

  return (
    <div className="wrap">
      <Nav right={<span />} />
      <div className="center">
        <div className="card" style={{ width: "100%", maxWidth: 420 }}>
          <h3 style={{ fontSize: 26 }}>Save your plan</h3>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>We’ll email you a sign-in link. No password needed.</p>
          {state === "sent" ? (
            <p className="ok">Check {email} for your sign-in link.</p>
          ) : (
            <form onSubmit={send} style={{ display: "grid", gap: 10 }}>
              <input type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
              <button className="btn btn-primary" disabled={state === "busy"}>{state === "busy" ? "Sending…" : "Email me a link"}</button>
              {state === "err" && <p className="err">{msg}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
