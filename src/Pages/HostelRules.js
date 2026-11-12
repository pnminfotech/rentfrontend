import React, { useEffect, useState } from "react";
import { FiArrowLeft, FiBookOpen, FiSave } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { getHostelRules, saveHostelRules } from "../saasApi";
import "./HostelRules.css";

export default function HostelRules() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "Hostel Rules & Regulations", content: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const ruleCount = form.content.split("\n").filter((rule) => rule.trim()).length;

  useEffect(() => {
    let active = true;
    getHostelRules()
      .then((data) => { if (active) setForm({ title: data.title || "Hostel Rules & Regulations", content: data.content || "" }); })
      .catch((err) => { if (active) setError(err.response?.data?.message || "Unable to load hostel rules."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!form.content.trim()) return setError("Add at least one hostel rule before saving.");
    setSaving(true); setError(""); setMessage("");
    try {
      const saved = await saveHostelRules(form);
      setForm({ title: saved.title, content: saved.content });
      setMessage("Rules saved. They will appear on the rules page of each tenant admission form.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save hostel rules.");
    } finally { setSaving(false); }
  }

  return <main className="hostel-rules-page">
    <header className="hostel-rules-header">
      <button type="button" className="hostel-rules-back" onClick={() => navigate("/admin")}><FiArrowLeft /> <span>Back</span></button>
      <div className="hostel-rules-heading"><span className="hostel-rules-eyebrow">HOSTEL MANAGEMENT</span><h1><FiBookOpen /> Hostel rules</h1><p>Set the rules that are included with every tenant admission form.</p></div>
    </header>
    {loading ? <div className="hostel-rules-loading"><span className="spinner-border spinner-border-sm" role="status" /> Loading rules…</div> : <form className="hostel-rules-card" onSubmit={submit}>
      <div className="hostel-rules-card-heading"><div className="hostel-rules-card-icon"><FiBookOpen /></div><div><h2>Admission form rules</h2><p>These rules will appear after the tenant information form.</p></div></div>
      <label className="hostel-rules-field">Rules page title<input maxLength="120" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Hostel Rules & Regulations" /></label>
      <label className="hostel-rules-field">Rules<textarea rows="11" maxLength="12000" value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} placeholder={"Enter one rule per line.\nFor example: Visitors are allowed only during visiting hours."} /></label>
      <div className="hostel-rules-help"><span>Each non-empty line becomes one numbered rule on the admission form.</span><span>{ruleCount} {ruleCount === 1 ? "rule" : "rules"}</span></div>
      {error && <p className="hostel-rules-error" role="alert">{error}</p>}
      {message && <p className="hostel-rules-success" role="status">{message}</p>}
      <div className="hostel-rules-actions"><button type="button" className="hostel-rules-back" onClick={() => navigate("/admin")}>Cancel</button><button type="submit" className="hostel-rules-save" disabled={saving}><FiSave /> {saving ? "Saving…" : "Save rules"}</button></div>
    </form>}
  </main>;
}
