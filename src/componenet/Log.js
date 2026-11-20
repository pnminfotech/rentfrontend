import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { FaEnvelope, FaPhoneAlt } from "react-icons/fa";
import logo from "../image/mutkehostel.png";
import bgImage from "../image/hostelbg.png";
import "../stylecss/LoginRegister.css";
import { getAppBootstrap, requestSaasLoginEmailCode, requestSaasLoginPhoneCode, resendSaasLoginEmailCode, resendSaasLoginPhoneCode, resetSaasLoginSecurityPin, setupSaasLoginSecurityPin, verifySaasLoginEmailCode, verifySaasLoginPhoneCode, verifySaasLoginSecurityPin } from "../saasApi";
import { getPostLoginPath } from "../utils/saasNavigation";
// import { API, setToken } from "../tenant/tenantApi";
// Single API base
// const API = (process.env.REACT_APP_API_BASE || "  http://localhost:8000/api").replace(/\/+$/, "");
// const setTenantToken = (t) => localStorage.setItem("tenantToken", t);
import { API, setToken } from "../tenant/tenantApi";
// (Optional) helper to keep only digits
const digitsOnly = (s) => String(s || "").replace(/\D/g, "");
const getSecondsUntil = (timestamp) => Math.max(0, Math.ceil((new Date(timestamp).getTime() - Date.now()) / 1000));

function OtpCodeInput({ value, onChange, disabled = false, autoComplete = false }) {
  const inputs = React.useRef([]);
  const digits = String(value || "").replace(/\D/g, "").slice(0, 6).split("");

  function updateFrom(index, input) {
    const enteredDigits = digitsOnly(input).slice(0, 6 - index).split("");
    const nextDigits = [...digits];
    if (!enteredDigits.length) {
      nextDigits[index] = "";
      onChange(nextDigits.join(""));
      return;
    }
    if (enteredDigits.length > 1) nextDigits.length = index;
    enteredDigits.forEach((digit, offset) => {
      nextDigits[index + offset] = digit;
    });
    onChange(nextDigits.join(""));
    inputs.current[Math.min(index + enteredDigits.length, 5)]?.focus();
  }

  function handleKeyDown(index, event) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      const nextDigits = [...digits];
      nextDigits[index - 1] = "";
      onChange(nextDigits.join(""));
      inputs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < 5) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
    }
  }

  function handlePaste(index, event) {
    event.preventDefault();
    updateFrom(index, event.clipboardData.getData("text"));
  }

  return (
    <div className="login-otp-inputs" role="group" aria-label="6-digit verification code">
      {Array.from({ length: 6 }, (_, index) => (
        <input
          key={index}
          ref={(element) => { inputs.current[index] = element; }}
          className="login-otp-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          aria-label={`Digit ${index + 1} of 6`}
          autoComplete={autoComplete && index === 0 ? "one-time-code" : "off"}
          value={digits[index] || ""}
          disabled={disabled}
          required={index === 0}
          onChange={(event) => updateFrom(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
        />
      ))}
    </div>
  );
}

const TENANT_OTP_STORAGE_KEY = "tenantLoginOtpPending";

function readPendingTenantOtp() {
  try {
    const pending = JSON.parse(localStorage.getItem(TENANT_OTP_STORAGE_KEY) || "null");
    return pending?.otpId && pending?.phone ? pending : null;
  } catch {
    return null;
  }
}

function formatOtpTimer(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

// ---------- Tenant inline login (OTP) ----------
export function TenantLoginInline({ onLoggedIn }) {
  const [challenge, setChallenge] = useState(readPendingTenantOtp);
  const [phone, setPhone] = useState(() => readPendingTenantOtp()?.phone || "");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!challenge?.otpId) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [challenge?.otpId]);

  useEffect(() => {
    const pending = readPendingTenantOtp();
    if (!pending) return undefined;
    let cancelled = false;
    axios.post(`${API}/tenant/auth/challenge/status`, { phone: pending.phone, otpId: pending.otpId })
      .then(({ data }) => {
        if (cancelled) return;
        const restored = { ...pending, ...data };
        setChallenge(restored);
        localStorage.setItem(TENANT_OTP_STORAGE_KEY, JSON.stringify(restored));
        setNow(Date.now());
      })
      .catch((error) => {
        if (cancelled || error?.response?.status !== 404) return;
        localStorage.removeItem(TENANT_OTP_STORAGE_KEY);
        setChallenge(null);
        setErr("Your sign-in request expired. Please request a new OTP.");
      });
    return () => { cancelled = true; };
  }, []);

  const saveChallenge = (data, phoneValue) => {
    if (!data?.otpId) return false;
    const next = { ...data, phone: phoneValue };
    setChallenge(next);
    setPhone(phoneValue);
    setOtp("");
    setNow(Date.now());
    localStorage.setItem(TENANT_OTP_STORAGE_KEY, JSON.stringify(next));
    return true;
  };

  const codeExpiresAt = challenge?.codeExpiresAt ? new Date(challenge.codeExpiresAt).getTime() : 0;
  const resendAvailableAt = challenge?.resendAvailableAt ? new Date(challenge.resendAvailableAt).getTime() : 0;
  const codeSeconds = codeExpiresAt ? Math.max(0, Math.ceil((codeExpiresAt - now) / 1000)) : 0;
  const resendSeconds = resendAvailableAt ? Math.max(0, Math.ceil((resendAvailableAt - now) / 1000)) : 0;
  const requestedPhone = challenge?.phone || "";
  const attemptsRemaining = Number(challenge?.attemptsRemaining ?? 3);
  const locked = attemptsRemaining <= 0;

  const box = {
    maxWidth: 520,
    margin: "0 auto",
    background: "#ffffff6e",
    padding: "24px 24px",
    borderRadius: 8,
  };
  const label = { fontSize: 13, color: "#1f2937", marginBottom: 6, textAlign: "left" };
  const input = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    outline: "none",
    marginBottom: 12,
    background: "#fff",
  };
  const btnPri = {
    width: "100%",
    padding: "10px 14px",
    border: 0,
    borderRadius: 8,
    background: "#1e3a8a",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  };
  const btnSec = { ...btnPri, background: "#16a34a" };
  const btnGhost = { ...btnPri, background: "transparent", color: "#1e3a8a", border: "1px solid #1e3a8a" };

  async function reqOtp() {
    setErr("");
    setDevCode("");
    setOtp("");
    const phoneValue = digitsOnly(phone).slice(-10);
    if (!/^[6-9]\d{9}$/.test(phoneValue)) {
      setErr("Enter a valid 10-digit mobile number.");
      return;
    }

    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/tenant/auth/request-otp`, { phone: phoneValue });
      if (!saveChallenge(data, phoneValue)) {
        setErr(data?.message || "If this number is registered, an OTP has been sent.");
        return;
      }
      if (data.devCode) setDevCode(String(data.devCode));
    } catch (e) {
      const data = e?.response?.data || {};
      if (data.otpId) saveChallenge(data, phoneValue);
      setErr(data.message || "Failed to request OTP");
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    if (!challenge?.otpId || resendSeconds > 0) return;
    setErr("");
    setDevCode("");
    setBusy(true);
    try {
      const endpoint = Number(challenge.resendCount || 0) >= 2
        ? "/tenant/auth/request-otp"
        : "/tenant/auth/resend-otp";
      const { data } = await axios.post(`${API}${endpoint}`, {
        phone: challenge.phone,
        otpId: challenge.otpId,
      });
      saveChallenge(data, challenge.phone);
      if (data.devCode) setDevCode(String(data.devCode));
    } catch (e) {
      const data = e?.response?.data || {};
      if (data.otpId) saveChallenge(data, challenge.phone);
      setErr(data.message || "Unable to resend the OTP.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(codeOverride) {
    setErr("");
    const outCode = String(codeOverride ?? otp ?? "").replace(/\s+/g, "");
    if (!/^\d{6}$/.test(outCode)) {
      setErr("Enter the 6-digit OTP.");
      return;
    }
    if (!challenge?.otpId || locked || codeSeconds <= 0) return;

    setBusy(true);
    try {
      const r = await axios.post(`${API}/tenant/auth/verify`, {
        phone: challenge.phone,
        otpId: challenge.otpId,
        code: outCode,
      });
      localStorage.removeItem(TENANT_OTP_STORAGE_KEY);
      setToken(r.data.token);
      // ✅ Go to /tenant/home right away
      if (onLoggedIn) {
        onLoggedIn();
      } else {
        // fallback if no callback provided; respects basename via PUBLIC_URL
        window.location.assign(`${process.env.PUBLIC_URL || ""}/tenant/home`);
      }
    } catch (e) {
      const data = e?.response?.data || {};
      if (data.attemptsRemaining !== undefined) {
        const updated = { ...challenge, ...data };
        setChallenge(updated);
        localStorage.setItem(TENANT_OTP_STORAGE_KEY, JSON.stringify(updated));
      }
      setErr(data.message || "Invalid or expired OTP.");
    } finally {
      setBusy(false);
    }
  }

  const fillDevAndVerify = () => {
    if (!devCode) return;
    setOtp(String(devCode));
    verify(String(devCode));
  };

  const useAnotherPhone = () => {
    localStorage.removeItem(TENANT_OTP_STORAGE_KEY);
    setChallenge(null);
    setPhone("");
    setOtp("");
    setDevCode("");
    setErr("");
  };

  return (
    <div style={box}>
      <h3 style={{ margin: 0, marginBottom: 16, textAlign: "center", color: "#07226c" }}>
        Tenant Login
      </h3>

      {!challenge && (
        <>
          <div style={label}>Phone</div>
          <input
            style={input}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Enter your phone number"
            inputMode="tel"
          />
          <button disabled={busy} style={btnPri} onClick={reqOtp}>
            {busy ? "Sending..." : "Send OTP"}
          </button>
          {err && <div style={{ color: "#b91c1c", marginTop: 8 }}>{err}</div>}
        </>
      )}

      {challenge && (
        <>
          <div style={label}>Enter OTP · expires in {formatOtpTimer(codeSeconds)}</div>
          <OtpCodeInput
            value={otp}
            onChange={setOtp}
            autoComplete
            disabled={busy || locked || codeSeconds <= 0}
          />
          <button disabled={busy || locked || codeSeconds <= 0} style={btnSec} onClick={() => verify()}>
            {busy ? "Verifying..." : "Verify"}
          </button>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button disabled={busy || resendSeconds > 0} style={btnGhost} onClick={resendOtp}>
              {resendSeconds > 0 ? `Resend in ${formatOtpTimer(resendSeconds)}` : Number(challenge.resendCount || 0) >= 2 ? "Request new OTP" : "Resend OTP"}
            </button>
            {!!devCode && (
              <button disabled={busy} style={btnGhost} onClick={fillDevAndVerify}>
                Use Dev OTP ({devCode})
              </button>
            )}
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
            Phone used: <b>{requestedPhone || "-"}</b> · Attempts remaining: <b>{attemptsRemaining}</b>
          </div>

          {err && <div style={{ color: "#b91c1c", marginTop: 8 }}>{err}</div>}
          <button type="button" disabled={busy} style={{ ...btnGhost, marginTop: 8 }} onClick={useAnotherPhone}>
            Use another number
          </button>
        </>
      )}
    </div>
  );
}

// =================== Main Log component ===================
const Log = ({ superadminOnly = false }) => {
  const [role, setRole] = useState("admin"); // "admin" | "tenant"
  const [loginMethod, setLoginMethod] = useState(superadminOnly ? "email" : "phone");
  const navigate = useNavigate();

  // Admin Login State
  const [loginPhone, setLoginPhone] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginChallengeId, setLoginChallengeId] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginDevCode, setLoginDevCode] = useState("");
  const [loginMaskedEmail, setLoginMaskedEmail] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [loginCodeSending, setLoginCodeSending] = useState(false);
  const [loginCodeLocked, setLoginCodeLocked] = useState(false);
  const [loginResendAvailableAt, setLoginResendAvailableAt] = useState(null);
  const [loginResendSeconds, setLoginResendSeconds] = useState(0);
  const [loginPinStage, setLoginPinStage] = useState("");
  const [loginSecurityPin, setLoginSecurityPin] = useState("");
  const [loginSecurityPinConfirm, setLoginSecurityPinConfirm] = useState("");

  useEffect(() => {
    setRole("admin");
    setLoginMethod(superadminOnly ? "email" : "phone");
    setLoginChallengeId("");
    setLoginCode("");
    setLoginDevCode("");
    setLoginCodeLocked(false);
    setLoginResendAvailableAt(null);
    setLoginResendSeconds(0);
    setLoginPinStage("");
    setLoginMessage("");
    setLoginNotice("");
  }, [superadminOnly]);

  useEffect(() => {
    if (loginMethod !== "phone" || !loginResendAvailableAt) {
      setLoginResendSeconds(0);
      return undefined;
    }

    const updateCountdown = () => setLoginResendSeconds(getSecondsUntil(loginResendAvailableAt));
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [loginChallengeId, loginMethod, loginResendAvailableAt]);

  const box1 = {
    maxWidth: 520,
    margin: "0 auto",
    background: "#ffffff6e",
    padding: "24px 24px",
    borderRadius: 8,
  };

async function handleLogin(e) {
  e.preventDefault();

  if (loginMethod === "phone" && !/^\d{10}$/.test(loginPhone)) {
    setLoginMessage("Enter a valid 10-digit mobile number.");
    return;
  }

  try {
    setLoginMessage("");
    setLoginNotice("");
    setLoginDevCode("");

    const data = loginMethod === "phone"
      ? await requestSaasLoginPhoneCode(`+91${loginPhone}`)
      : await requestSaasLoginEmailCode(loginEmail.trim());
    setLoginChallengeId(data.challengeId);
    setLoginDevCode(data.devCode ? String(data.devCode) : "");
    setLoginMaskedEmail(data.phone || data.email || (loginMethod === "phone" ? "your mobile number" : "your registered email"));
    setLoginCodeLocked(false);
    setLoginResendAvailableAt(data.resendAvailableAt || null);
    setLoginCode("");
  } catch (error) {
    console.error(
      "SaaS login failed:",
      error.response?.data || error
    );

    if (loginMethod === "phone" && error.response?.data?.resendAvailableAt) {
      setLoginResendAvailableAt(error.response.data.resendAvailableAt);
    }
    setLoginMessage(
      error.response?.data?.message ||
        (loginMethod === "phone"
          ? "Unable to send the OTP. Please check your mobile number and try again."
          : "Unable to send the verification code. Please check your email address.")
    );
  }
}

async function handleVerifyLoginCode(e) {
  e.preventDefault();
  if (!/^\d{6}$/.test(loginCode)) {
    setLoginMessage(`Enter the 6-digit code sent to your ${loginMethod === "phone" ? "mobile" : "email"}.`);
    return;
  }

  try {
    const resetPinAfterCode = loginPinStage === "reset-code";
    setLoginMessage("");
    setLoginNotice("");
    const data = loginMethod === "phone"
      ? await verifySaasLoginPhoneCode(loginChallengeId, loginCode)
      : await verifySaasLoginEmailCode(loginChallengeId, loginCode);
    if (resetPinAfterCode) {
      setLoginPinStage("reset");
      setLoginCode("");
      return;
    }
    if (data.requiresSecurityPin || data.requiresSecurityPinSetup) {
      setLoginPinStage(data.requiresSecurityPinSetup ? "setup" : "verify");
      setLoginSecurityPin("");
      setLoginSecurityPinConfirm("");
      return;
    }
    const bootstrap = await getAppBootstrap();
    navigate(getPostLoginPath(bootstrap), { replace: true });
  } catch (error) {
    const message = error.response?.data?.message || "Unable to verify the code. Please try again.";
    if (loginMethod === "phone" && error.response?.status === 429 && /incorrect otp attempts/i.test(message)) {
      setLoginCodeLocked(true);
    }
    setLoginMessage(message);
  }
}

async function handleForgotLoginSecurityPin() {
  try {
    setLoginMessage("");
    setLoginNotice("");
    setLoginDevCode("");
    const data = await resendSaasLoginEmailCode(loginChallengeId);
    setLoginMaskedEmail(data.email || loginMaskedEmail);
    setLoginCode("");
    setLoginPinStage("reset-code");
    setLoginNotice("A new OTP was sent to your registered email.");
  } catch (error) {
    setLoginMessage(error.response?.data?.message || "Unable to send a reset OTP. Please try again.");
  }
}

async function handleVerifyLoginSecurityPin(e) {
  e.preventDefault();
  if (!/^\d{4,8}$/.test(loginSecurityPin)) {
    setLoginMessage("Enter your 4 to 8 digit security PIN.");
    return;
  }
  if ((loginPinStage === "setup" || loginPinStage === "reset") && loginSecurityPin !== loginSecurityPinConfirm) {
    setLoginMessage("Security PINs do not match.");
    return;
  }
  try {
    setLoginMessage("");
    setLoginNotice("");
    if (loginPinStage === "setup") await setupSaasLoginSecurityPin(loginChallengeId, loginSecurityPin);
    else if (loginPinStage === "reset") await resetSaasLoginSecurityPin(loginChallengeId, loginSecurityPin);
    else await verifySaasLoginSecurityPin(loginChallengeId, loginSecurityPin);
    const bootstrap = await getAppBootstrap();
    navigate(getPostLoginPath(bootstrap), { replace: true });
  } catch (error) {
    setLoginMessage(error.response?.data?.message || "Unable to verify the security PIN. Please try again.");
  }
}

async function handleResendLoginCode() {
  if (loginCodeSending || (loginMethod === "phone" && loginResendSeconds > 0)) return;
  setLoginCodeSending(true);
  try {
    setLoginMessage("");
    setLoginNotice("");
    setLoginDevCode("");
      if (loginMethod === "phone") {
        const data = await resendSaasLoginPhoneCode(loginChallengeId);
        setLoginDevCode(data.devCode ? String(data.devCode) : "");
        setLoginMaskedEmail(data.phone || loginMaskedEmail);
        setLoginResendAvailableAt(data.resendAvailableAt || null);
        setLoginCodeLocked(false);
        setLoginCode("");
        setLoginNotice("A new sign-in code has been sent.");
        return;
      }
      const data = await resendSaasLoginEmailCode(loginChallengeId);
    setLoginMaskedEmail(data.email || loginMaskedEmail);
    setLoginCode("");
    setLoginNotice("A new sign-in code has been sent.");
  } catch (error) {
    const serverMessage = error.response?.data?.message || "Unable to resend the code. Please try again.";
    if (loginMethod === "phone" && error.response?.data?.resendAvailableAt) {
      setLoginResendAvailableAt(error.response.data.resendAvailableAt);
    }
    if (loginMethod === "email" && error.response?.status === 400 && /invalid|expired/i.test(serverMessage) && loginEmail.trim()) {
      try {
        const freshChallenge = await requestSaasLoginEmailCode(loginEmail.trim());
        setLoginChallengeId(freshChallenge.challengeId);
        setLoginMaskedEmail(freshChallenge.email || loginMaskedEmail);
        setLoginCode("");
        setLoginPinStage("");
        setLoginSecurityPin("");
        setLoginSecurityPinConfirm("");
        setLoginNotice("Your previous sign-in expired. A fresh code has been sent.");
        return;
      } catch (restartError) {
        setLoginMessage(restartError.response?.data?.message || serverMessage);
        return;
      }
    }
    setLoginMessage(serverMessage);
  } finally {
    setLoginCodeSending(false);
  }
}

  return (
    <div
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        minHeight: "100vh",
        padding: "40px 0",
      }}
    >
      <div className="container-fluid">
        {/* <div className="row">
          <div className="col-md-12 mt-0 d-flex">
            <img src={logo} alt="logo" style={{ height: "50px" }} />
          </div>
        </div> */}

        <div className="container">
          <center>
            <div className="auth-box" style={{ maxWidth: "800px", marginTop: "50px" }}>
              <h2
                style={{
                  color: "#07226c",
                  // fontSize: "42px",
                  marginBottom: "22px",
                  fontWeight: 800,
                }}
              >   
               Re<span style={{ color: "#ffc107" }}>nt {" "}</span>Man
                <span style={{ color: "#ffc107" }}>ager</span>
               
              </h2>

              {!superadminOnly && (
                <div className="btn-group mb-3" role="group" aria-label="Role switch">
                  <button
                    className={`btn ${role === "admin" ? "btn-primary" : "btn-outline-primary"}`}
                    onClick={() => setRole("admin")}
                  >
                    Admin
                  </button>
                  <button
                    className={`btn ${role === "tenant" ? "btn-primary" : "btn-outline-primary"}`}
                    onClick={() => setRole("tenant")}
                  >
                    Tenant
                  </button>
                </div>
              )}

              {(role === "admin" || superadminOnly) && (
                <>
                  <form onSubmit={loginPinStage === "reset-code" ? handleVerifyLoginCode : loginPinStage ? handleVerifyLoginSecurityPin : loginChallengeId ? handleVerifyLoginCode : handleLogin} className="" style={box1}>
                    <h3 style={{ color: "#1e3a8a", textAlign: "center" }}>
                      {loginPinStage === "reset-code" ? "Verify reset OTP" : loginPinStage ? "Confirm security PIN" : loginChallengeId ? `Verify ${loginMethod === "phone" ? "mobile" : "email"} OTP` : superadminOnly ? "Superadmin sign in" : "Admin sign in"}
                    </h3>
                    {superadminOnly && <p className="text-muted text-center">Sign in with the superadmin email address. Access is restricted to superadmin accounts.</p>}
                    {!loginChallengeId && !loginPinStage ? (
                      <div className="form-group text-start">
                        <label>{loginMethod === "phone" ? "Mobile number:" : "Email address:"}</label>
                        <div className="input-group">
                          {loginMethod === "phone" && (
                            <span
                              className="input-group-text"
                              aria-label="Country code +91"
                              style={{ borderLeft: "1px solid #ccc", borderRight: "none", borderRadius: "4px 0 0 4px" }}
                            >
                              +91
                            </span>
                          )}
                          <input
                            type={loginMethod === "phone" ? "tel" : "email"}
                            className="form-control"
                            placeholder={loginMethod === "phone" ? "10-digit mobile number" : "Enter your registered email"}
                            value={loginMethod === "phone" ? loginPhone : loginEmail}
                            onChange={(event) => {
                              if (loginMethod === "phone") {
                                const digits = event.target.value.replace(/\D/g, "");
                                const nationalNumber = digits.startsWith("91") && digits.length === 12
                                  ? digits.slice(2)
                                  : digits;
                                setLoginPhone(nationalNumber.slice(0, 10));
                              } else {
                                setLoginEmail(event.target.value);
                              }
                            }}
                            inputMode={loginMethod === "phone" ? "tel" : undefined}
                            autoComplete={loginMethod === "phone" ? "tel" : "email"}
                            maxLength={loginMethod === "phone" ? 10 : undefined}
                            pattern={loginMethod === "phone" ? "[0-9]{10}" : undefined}
                            required
                          />
                          <span className="input-group-text">{loginMethod === "phone" ? <FaPhoneAlt /> : <FaEnvelope aria-label="Email" />}</span>
                        </div>
                        {loginMethod === "phone" && loginResendSeconds > 0 && <p className="small text-muted mt-2">You can request another OTP in {`${String(Math.floor(loginResendSeconds / 60)).padStart(2, "0")}:${String(loginResendSeconds % 60).padStart(2, "0")}`}.</p>}
                      </div>
                    ) : loginPinStage === "reset-code" ? (
                      <>
                        <p className="text-muted">Enter the new 6-digit OTP sent to {loginMaskedEmail} before resetting your PIN.</p>
                        <label>Reset OTP:</label>
                        <OtpCodeInput value={loginCode} onChange={setLoginCode} autoComplete />
                      </>
                    ) : loginPinStage ? (
                      <>
                        <p className="text-muted">{loginPinStage === "setup" ? "Create a 4 to 8 digit PIN for future superadmin sign-ins." : loginPinStage === "reset" ? "Create a new security PIN. Your verified email OTP allows this reset." : "Enter the security PIN saved in your superadmin profile."}</p>
                        <label>Security PIN:</label>
                        <input type="password" className="form-control" value={loginSecurityPin} onChange={(e) => setLoginSecurityPin(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="off" maxLength={8} required />
                        {(loginPinStage === "setup" || loginPinStage === "reset") && <><label className="mt-2">Confirm security PIN:</label><input type="password" className="form-control" value={loginSecurityPinConfirm} onChange={(e) => setLoginSecurityPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="off" maxLength={8} required /></>}
                      </>
                    ) : (
                      <>
                        <p className="text-muted">Enter the 6-digit code sent to {loginMaskedEmail}. It expires in {loginMethod === "phone" ? "5" : "10"} minutes.</p>
                        {loginMethod === "phone" && loginResendSeconds > 0 && <p className="small text-muted mb-2">You can request another OTP in {`${String(Math.floor(loginResendSeconds / 60)).padStart(2, "0")}:${String(loginResendSeconds % 60).padStart(2, "0")}`}.</p>}
                        <label>{loginMethod === "phone" ? "Mobile verification code:" : "Email verification code:"}</label>
                        {loginMethod === "phone" && loginDevCode && <div className="alert alert-warning py-2 mt-2 mb-2" role="status">Development OTP: <strong className="ms-2 fs-5">{loginDevCode}</strong></div>}
                        <OtpCodeInput value={loginCode} onChange={setLoginCode} autoComplete disabled={loginCodeLocked} />
                      </>
                    )}

                    <button type="submit" className="back-btn btn" disabled={(loginCodeLocked && Boolean(loginChallengeId)) || (!loginChallengeId && loginMethod === "phone" && loginResendSeconds > 0)} style={{ backgroundColor: "#1e3a8a", color: "#fff" }}>
                      {loginPinStage === "setup" ? "Set PIN and sign in" : loginPinStage === "reset" ? "Reset PIN and sign in" : loginPinStage === "reset-code" ? "Verify reset OTP" : loginPinStage ? "Verify PIN" : loginChallengeId ? loginCodeLocked ? "OTP attempts used" : "Verify OTP" : loginMethod === "phone" && loginResendSeconds > 0 ? `Wait ${String(Math.floor(loginResendSeconds / 60)).padStart(2, "0")}:${String(loginResendSeconds % 60).padStart(2, "0")}` : "Send OTP"}
                    </button>
                    {loginMessage && <p className="text-danger mt-2">{loginMessage}</p>}
                    {loginNotice && <p className="text-success mt-2">{loginNotice}</p>}
                    {loginChallengeId && !loginPinStage && <div className="d-flex gap-2 mt-3">
                      <button type="button" className="btn btn-link p-0" onClick={handleResendLoginCode} disabled={loginCodeSending || (loginMethod === "phone" && loginResendSeconds > 0)}>{loginCodeSending ? "Sending..." : loginMethod === "phone" && loginResendSeconds > 0 ? `Resend OTP in ${String(Math.floor(loginResendSeconds / 60)).padStart(2, "0")}:${String(loginResendSeconds % 60).padStart(2, "0")}` : "Send a new code"}</button>
                      <button type="button" className="btn btn-link p-0" onClick={() => { setLoginChallengeId(""); setLoginCode(""); setLoginDevCode(""); setLoginCodeLocked(false); setLoginMessage(""); setLoginNotice(""); }}>Back to sign in</button>
                    </div>}
                    {loginPinStage === "verify" && <button type="button" className="btn btn-link p-0 mt-3" onClick={handleForgotLoginSecurityPin}>Forgot security PIN? Send a new OTP</button>}
                    {loginPinStage && <button type="button" className="btn btn-link p-0 mt-3" onClick={() => { setLoginChallengeId(""); setLoginCode(""); setLoginPinStage(""); setLoginSecurityPin(""); setLoginSecurityPinConfirm(""); setLoginMessage(""); setLoginNotice(""); }}>Back to sign in</button>}
                  </form>
                </>
              )}

              {/* ✅ navigate straight to /tenant/home after successful OTP */}
              {role === "tenant" && (
                <TenantLoginInline onLoggedIn={() => navigate("/tenant/home", { replace: true })} />
              )}
            </div>
          </center>
        </div>
      </div>
    </div>
  );
};

export default Log;
