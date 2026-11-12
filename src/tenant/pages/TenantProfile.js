import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { FiFileText } from "react-icons/fi";
import { API, authHeader } from "../tenantApi";
import "./TenantProfile.css";
import TenantDocs from "./TenantDocs";

/* ========= Brand (refined + accessible) ========= */
const colors = {
  pageBg: "#f7f8fc",
  text: "#0f172a",
  sub: "#64748b",
  line: "#e6e9f2",
  card: "#ffffff",
  // accents
  primary: "#6d5dfc",        // indigo-violet
  primarySoft: "rgba(109,93,252,.12)",
  success: "#10b981",        // emerald
  warning: "#f59e0b",        // amber
  danger: "#ef4444",         // red
  brand2: "#22c55e",         // green accent for chips
};

const shadow = "0 16px 40px rgba(15,23,42,.08)";

const styles = {
  page: {
    minHeight: "100vh",
    padding: "28px 16px",
    background: `
      radial-gradient(1200px 600px at 100% -10%, rgba(109,93,252,.12), transparent 60%),
      radial-gradient(900px 500px at -10% 0%, rgba(34,197,94,.10), transparent 55%),
      ${colors.pageBg}
    `,
    color: colors.text,
    fontFamily: `Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`,
  },
  container: { maxWidth: 1000, margin: "0 auto" },

  /* Top banner */
  banner: {
    background: `linear-gradient(110deg, ${colors.card}, #fbfcff)`,
    borderRadius: 20,
    border: `1px solid ${colors.line}`,
    boxShadow: shadow,
    padding: 18,
    display: "flex",
    gap: 16,
    alignItems: "center",
    marginBottom: 18,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 14,
    objectFit: "cover",
    border: `1px solid ${colors.line}`,
    background: "#fff",
  },
  headingWrap: { flex: 1, minWidth: 0 },
  title: { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: 0.2 },
  sub: { marginTop: 6, fontSize: 13, color: colors.sub },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    borderRadius: 999,
    background: "#fff",
    border: `1px solid ${colors.line}`,
  },
  chipStrong: {
    background: colors.primarySoft,
    border: `1px solid ${colors.primary}`,
    color: colors.primary,
  },

  /* Toolbar */
  toolbar: { display: "flex", gap: 10 },
  btn: {
    padding: "10px 14px",
    borderRadius: 10,
    border: `1px solid ${colors.line}`,
    background: "#fff",
    color: colors.text,
    cursor: "pointer",
    fontWeight: 600,
  },
  btnPri: {
    padding: "10px 14px",
    borderRadius: 10,
    border: 0,
    background: colors.primary,
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
    boxShadow: "0 10px 24px rgba(109,93,252,.35)",
  },

  /* Stat chips */
  statWrap: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(120px, 1fr))",
    gap: 10,
    minWidth: 320,
  },
  stat: {
    background: "#fff",
    border: `1px solid ${colors.line}`,
    borderRadius: 12,
    padding: 12,
  },
  statLabel: { fontSize: 12, color: colors.sub },
  statValue: { fontSize: 17, fontWeight: 800 },

  /* Section card */
  card: {
    background: colors.card,
    borderRadius: 16,
    border: `1px solid ${colors.line}`,
    boxShadow: shadow,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { margin: "0 0 12px 0", fontSize: 15, fontWeight: 700, letterSpacing: 0.2 },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
  },

  label: { fontSize: 12, color: colors.sub, marginBottom: 6 },
  read: {
    width: "100%",
    padding: "11px 12px",
    border: `1px dashed ${colors.line}`,
    borderRadius: 12,
    background: "#fafbff",
    color: colors.text,
  },
  input: {
    width: "100%",
    padding: "11px 12px",
    border: `1px solid ${colors.line}`,
    borderRadius: 12,
    outline: "none",
    fontSize: 14,
  },

  /* Docs */
  docGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 },
  docCard: {
    border: `1px solid ${colors.line}`,
    borderRadius: 12,
    overflow: "hidden",
    background: "#fff",
    color: colors.text,
    textDecoration: "none",
  },
  docImg: { width: "100%", height: 120, objectFit: "cover", display: "block", background: "#f3f4f7" },
  docMeta: { padding: 8, fontSize: 12.5 },
  docName: { fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },

  toast: {
    position: "fixed",
    right: 16,
    bottom: 16,
    background: "#111827",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: 10,
    zIndex: 50,
    fontSize: 14,
  },
};

/* Helpers */
const fmtDate = (val) => {
  if (!val) return "—";
  const d = new Date(val);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-IN", { dateStyle: "medium" });
};
const toDateInputValue = (val) => {
  if (!val) return "";
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const fullUrl = (url) => (!url ? "" : /^https?:\/\//i.test(url) ? url : `${API}${url}`);

/* Load Poppins font (no CSS file needed) */
function useGoogleFont() {
  useEffect(() => {
    const id = "poppins-font-link";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);
}

function EditableRow({ label, type = "text", value, onChange }) {
  return (
    <div>
      <div style={styles.label}>{label}</div>
      <input className="tenant-profile-input" type={type} value={value ?? ""} onChange={onChange} />
    </div>
  );
}

export default function TenantMyForm({ onChanged }) {
  useGoogleFont();

  const [me, setMe] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [draft, setDraft] = useState({});
  const [documentsOpen, setDocumentsOpen] = useState(false);

  const avatarSrc = useMemo(() => {
    return (
      fullUrl(me?.avatarUrl) ||
      `https://api.dicebear.com/7.x/initials/svg?radius=12&fontFamily=Poppins&seed=${encodeURIComponent(
        me?.name || "Tenant"
      )}`
    );
  }, [me]);

  /* Load tenant */
  useEffect(() => {
    let alive = true;
    (async () => {
      setErr("");
      try {
        const r = await axios.get(`${API}/tenant/me`, { headers: authHeader() });
        if (!alive) return;
        const data = r.data || {};
        if (data.relativeAddress && !data.relativeAddress1) data.relativeAddress1 = data.relativeAddress;
        setMe(data);
      } catch {
        if (!alive) return;
        setErr("Failed to load your details.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const refreshProfile = async () => {
    const r = await axios.get(`${API}/tenant/me`, { headers: authHeader() });
    setMe(r.data || {});
    if (onChanged) await onChanged();
  };

  const startEditing = () => {
    setErr("");
    setDraft({
      name: me.name || "",
      dob: toDateInputValue(me.dob),
      address: me.address || "",
      companyAddress: me.companyAddress || "",
      emergencyContact: me.emergencyContact || "",
    });
    setEditing(true);
  };

  const saveProfile = async () => {
    setSaving(true);
    setErr("");
    setOk("");
    try {
      await axios.put(`${API}/tenant/profile`, {
        name: draft.name,
        dob: draft.dob || null,
        address: draft.address,
        companyAddress: draft.companyAddress,
        emergencyContact: draft.emergencyContact,
      }, { headers: authHeader() });
      await refreshProfile();
      setEditing(false);
      setOk("Profile saved successfully.");
    } catch (error) {
      setErr(error?.response?.data?.message || "Unable to save your profile.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!ok) return undefined;
    const timeout = setTimeout(() => setOk(""), 2500);
    return () => clearTimeout(timeout);
  }, [ok]);

  useEffect(() => {
    if (!documentsOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setDocumentsOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [documentsOpen]);

  if (!me) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={{ ...styles.card, textAlign: "center" }}>Loading…</div>
        </div>
      </div>
    );
    }

  /* little atoms */
  const ReadRow = ({ label, children }) => (
    <div>
      <div style={styles.label}>{label}</div>
      <div className="tenant-profile-value" style={styles.read}>{children ?? "—"}</div>
    </div>
  );
  const DetailGrid = ({ rows }) => (
    <div style={styles.grid}>
      {rows.map(({ label, value }) => (
        <ReadRow key={label} label={label}>
          {value == null || value === "" ? "—" : value}
        </ReadRow>
      ))}
    </div>
  );
  const Stat = ({ label, value, tone = "neutral" }) => {
    const chipTone =
      tone === "success"
        ? { borderColor: "#d1fae5", background: "#ecfdf5" }
        : tone === "warn"
        ? { borderColor: "#fef3c7", background: "#fffbeb" }
        : { borderColor: colors.line, background: "#fafbff" };
    return (
      <div style={{ ...styles.stat, ...chipTone }}>
        <div style={styles.statLabel}>{label}</div>
        <div style={styles.statValue}>{value ?? "—"}</div>
      </div>
    );
  };

  const docs = Array.isArray(me.documents) ? me.documents : [];
  const propertyType = String(me.propertyType || (me.bedNo === "ROOM-1" ? "room" : me.bedNo === "SHOP-1" ? "shop" : "bed")).toLowerCase();
  const propertyTypeLabel = propertyType === "room" ? "Residential room" : propertyType === "shop" ? "Shop" : "Hostel bed";
  const formatMoney = (value) => value == null || value === "" ? "—" : `₹${Number(value || 0).toLocaleString("en-IN")}`;
  const propertyRows = [
    { label: "Tenant / serial number", value: me.srNo },
    { label: "Property type", value: propertyTypeLabel },
    { label: propertyType === "shop" ? "Shop number" : propertyType === "room" ? "Room / flat number" : "Room number", value: me.roomNo },
    ...(propertyType === "bed" ? [{ label: "Bed number", value: me.bedNo }] : []),
    { label: "Building / category", value: me.category },
    { label: "Wing", value: me.wingName },
    { label: "Floor", value: me.floorNo },
    ...(propertyType === "shop" ? [
      { label: "Shop name", value: me.shopName },
      { label: "Shop business", value: me.shopBusiness },
    ] : []),
    { label: "Joining date", value: fmtDate(me.joiningDate) },
    { label: "Initial rent status", value: me.firstRentStatus === "ADVANCE_PAID" ? "Paid in advance" : me.firstRentStatus === "NOT_PAID" ? "Not paid at joining" : me.firstRentStatus },
    { label: "First rent month", value: me.firstRentMonth },
    { label: "Base rent", value: formatMoney(me.baseRent ?? me.rentAmount) },
    { label: "Security deposit", value: formatMoney(me.depositAmount) },
  ];
  const addressRows = [
    { label: "Local address", value: me.address },
    { label: "House / flat number", value: me.houseNo },
    { label: "Nearby place", value: me.nearbyPlace },
    { label: "City", value: me.city },
    { label: "State", value: me.state },
    { label: "Pincode", value: me.pincode },
    { label: "Previous address", value: me.previousAddress },
    { label: "Relative address", value: me.relativeAddress1 || me.relativeAddress },
  ];
  const householdRows = [
    { label: "Family members", value: me.familyMembers },
    { label: "Male", value: me.familyMale ?? 0 },
    { label: "Female", value: me.familyFemale ?? 0 },
    { label: "Children", value: me.familyChildren ?? 0 },
    { label: "Passport number", value: me.passportNo },
    { label: "PAN number", value: me.panCardNo },
    { label: "Aadhaar number", value: me.aadhaarCardNo },
  ];
  const workRows = [
    { label: "Nature of work", value: me.natureOfWork },
    { label: propertyType === "shop" ? "Business address" : "Company / college address", value: me.companyAddress || me.officeAddress },
    { label: "Office name", value: me.officeName },
    { label: "Office mobile", value: me.officeMobileNo },
    { label: "Date of joining college / company", value: fmtDate(me.dateOfJoiningCollege) },
  ];
  const canteenRows = [
    { label: "Canteen", value: me.hasCanteen ? "Enrolled" : "Not enrolled" },
    { label: "Plan", value: String(me.canteenPlanType || "—").replace(/_/g, " ") },
    { label: "Start date", value: fmtDate(me.canteenStartDate) },
    { label: "Monthly amount", value: formatMoney(me.canteenMonthlyAmount) },
    { label: "Included meals", value: Array.isArray(me.canteenIncludedMeals) && me.canteenIncludedMeals.length ? me.canteenIncludedMeals.join(", ") : "—" },
    { label: "Meal prices", value: me.canteenMealPrices ? [
      me.canteenMealPrices.breakfast ? `Breakfast ${formatMoney(me.canteenMealPrices.breakfast)}` : null,
      me.canteenMealPrices.lunch ? `Lunch ${formatMoney(me.canteenMealPrices.lunch)}` : null,
      me.canteenMealPrices.dinner ? `Dinner ${formatMoney(me.canteenMealPrices.dinner)}` : null,
    ].filter(Boolean).join(" · ") || "—" : "—" },
  ];

  return (
    <div className="tenant-profile-page" style={styles.page}>
      <div className="tenant-profile-container" style={styles.container}>
        <div className="tenant-profile-page-heading">
          <div>
            <span>ACCOUNT SETTINGS</span>
            <h1>Profile</h1>
            <p>Update personal details; property and tenancy information stays read-only.</p>
          </div>
          <div className="tenant-profile-breadcrumb"><span>Tenant portal</span><b>›</b><strong>Profile</strong></div>
        </div>
        {/* Banner: Avatar + identity + stats + actions */}
        <div className={`tenant-profile-banner${editing ? " is-editing" : ""}`} style={styles.banner}>
          <div className="tenant-profile-avatar" aria-hidden="true">
            {String(me.name || "Tenant").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
            <img src={avatarSrc} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
          </div>
          <div className="tenant-profile-heading-wrap" style={styles.headingWrap} >
            <h2 className="tenant-profile-name" style={styles.title}>{me.name || "—"}</h2>
            <div className="tenant-profile-sub" style={styles.sub}>
              {propertyType === "shop" ? `Shop ${me.roomNo || "—"}` : propertyType === "room" ? `Room ${me.roomNo || "—"}` : `Room ${me.roomNo || "—"} · Bed ${me.bedNo || "—"}`}
            </div>
            <div className="tenant-profile-chip-row" style={styles.chipRow} >
              <span className="tenant-profile-chip" style={styles.chip}>📞 {me.phoneNo || "—"}</span>
              {/* <span style={{ ...styles.chip, ...styles.chipStrong }}>SR NO: {me.srNo ?? "—"}</span> */}
              {me?.ekyc?.status && (
                <span className="tenant-profile-chip" style={{ ...styles.chip, borderColor: colors.brand2, color: colors.brand2 }}>
                  ✅ eKYC: {String(me.ekyc.status).toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <div className="tenant-profile-toolbar">
            {editing ? (
              <>
                <button type="button" className="tenant-profile-cancel" onClick={() => { setEditing(false); setErr(""); }}>Cancel</button>
                <button type="button" className="tenant-profile-save" onClick={saveProfile} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
              </>
            ) : (
              <button type="button" className="tenant-profile-edit" onClick={startEditing}>Edit profile</button>
            )}
          </div>

          {/* <div style={styles.statWrap}>
            <Stat label="Joining" value={fmtDate(me.joiningDate)} />
            <Stat label="Base Rent (₹)" value={me.baseRent} tone="warn" />
            <Stat label="Deposit (₹)" value={me.depositAmount} tone="success" />
          </div> */}

        </div>

        <div className="tenant-profile-summary">
          <div className="tenant-profile-summary-card tenant-profile-summary-unit">
            <span>Property type</span><strong>{propertyTypeLabel}</strong><small>{me.category || "Your property"}</small>
          </div>
          <div className="tenant-profile-summary-card tenant-profile-summary-rent">
            <span>Monthly rent</span><strong>₹{Number(me.baseRent ?? me.rentAmount ?? 0).toLocaleString("en-IN")}</strong><small>As per your tenancy record</small>
          </div>
          <div className="tenant-profile-summary-card tenant-profile-summary-deposit">
            <span>Security deposit</span><strong>₹{Number(me.depositAmount || 0).toLocaleString("en-IN")}</strong><small>Recorded deposit</small>
          </div>
          <div className="tenant-profile-summary-card tenant-profile-summary-date">
            <span>Joined</span><strong>{fmtDate(me.joiningDate)}</strong><small>{propertyType === "shop" ? `Shop ${me.roomNo || "—"}` : `Room ${me.roomNo || "—"}${propertyType === "bed" ? ` · Bed ${me.bedNo || "—"}` : ""}`}</small>
          </div>
          <button type="button" className="tenant-profile-summary-card tenant-profile-summary-docs" onClick={() => setDocumentsOpen(true)} aria-haspopup="dialog">
            <span className="tenant-profile-docs-label"><FiFileText aria-hidden="true" /> Documents</span><strong>{docs.length}</strong><small>View or update documents</small>
          </button>
        </div>

        {err && (
          <div className="tenant-profile-message" style={{ ...styles.card, borderColor: colors.danger, background: "#fff7f7", color: "#991b1b" }}>
            {err}
          </div>
        )}
        {ok && <div className="tenant-profile-success">{ok}</div>}
        {/* Account */}
        <div className="tenant-profile-card" style={styles.card}>
          <div style={styles.sectionTitle}>Account</div>
          <div style={styles.grid}>
            {editing ? <EditableRow label="Full Name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /> : <ReadRow label="Full Name">{me.name}</ReadRow>}
            <ReadRow label="Phone">{me.phoneNo}</ReadRow>
            {editing ? <EditableRow label="Date of Birth" type="date" value={draft.dob} onChange={(event) => setDraft((current) => ({ ...current, dob: event.target.value }))} /> : <ReadRow label="Date of Birth">{fmtDate(me.dob)}</ReadRow>}
          </div>
        </div>

        {/* Stay */}
        <div className="tenant-profile-card" style={styles.card}>
          <div style={styles.sectionTitle}>Property & Stay Details</div>
          <DetailGrid rows={propertyRows} />
        </div>

        {/* Address */}
        <div className="tenant-profile-card" style={styles.card}>
          <div style={styles.sectionTitle}>Addresses</div>
          <div style={styles.grid}>
            {editing ? <EditableRow label="Current Address" value={draft.address} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} /> : <ReadRow label="Current Address">{me.address}</ReadRow>}
            <ReadRow label="Relative Address">{me.relativeAddress1 || me.relativeAddress}</ReadRow>
            {editing ? <EditableRow label="Company / College" value={draft.companyAddress} onChange={(event) => setDraft((current) => ({ ...current, companyAddress: event.target.value }))} /> : <ReadRow label="Company / College">{me.companyAddress}</ReadRow>}
            <ReadRow label="Date of Joining College/Office">{fmtDate(me.dateOfJoiningCollege)}</ReadRow>
          </div>
        </div>

        <div className="tenant-profile-card" style={styles.card}>
          <div style={styles.sectionTitle}>Additional Address Details</div>
          <DetailGrid rows={addressRows.slice(1, 7)} />
        </div>

        {propertyType === "room" && (
          <>
            <div className="tenant-profile-card" style={styles.card}>
              <div style={styles.sectionTitle}>Household & Identity Details</div>
              <DetailGrid rows={householdRows} />
              {(Array.isArray(me.otherFamilyMembers) ? me.otherFamilyMembers : []).length > 0 && (
                <div style={{ ...styles.grid, marginTop: 12 }}>
                  {me.otherFamilyMembers.map((member, index) => (
                    <ReadRow key={`family-${index}`} label={`Family member ${index + 1}`}>
                      {[member.name, member.age ? `Age ${member.age}` : "", member.occupation, member.phone]
                        .filter(Boolean).join(" · ") || "—"}
                    </ReadRow>
                  ))}
                </div>
              )}
            </div>
            <div className="tenant-profile-card" style={styles.card}>
              <div style={styles.sectionTitle}>Work & Office Details</div>
              <DetailGrid rows={workRows} />
            </div>
          </>
        )}

        {propertyType === "bed" && (
          <>
            <div className="tenant-profile-card" style={styles.card}>
              <div style={styles.sectionTitle}>College / Work Details</div>
              <DetailGrid rows={workRows} />
            </div>
            <div className="tenant-profile-card" style={styles.card}>
              <div style={styles.sectionTitle}>Canteen Details</div>
              <DetailGrid rows={canteenRows} />
            </div>
          </>
        )}

        {propertyType === "shop" && (
          <div className="tenant-profile-card" style={styles.card}>
            <div style={styles.sectionTitle}>Business Details</div>
            <DetailGrid rows={[
              { label: "Shop name", value: me.shopName },
              { label: "Business / activity", value: me.shopBusiness },
              { label: "Business address", value: me.companyAddress },
              { label: "Date of joining", value: fmtDate(me.dateOfJoiningCollege) },
            ]} />
          </div>
        )}

        {/* Relatives / Emergency */}
        <div className="tenant-profile-card" style={styles.card}>
          <div style={styles.sectionTitle}>Relatives & Emergency</div>
          <div style={styles.grid}>
            <ReadRow label="Relative 1: Relation">{me.relative1Relation}</ReadRow>
            <ReadRow label="Relative 1: Name">{me.relative1Name}</ReadRow>
            <ReadRow label="Relative 1: Phone">{me.relative1Phone}</ReadRow>
            <ReadRow label="Relative 2: Relation">{me.relative2Relation}</ReadRow>
            <ReadRow label="Relative 2: Name">{me.relative2Name}</ReadRow>
            <ReadRow label="Relative 2: Phone">{me.relative2Phone}</ReadRow>
            {editing ? <EditableRow label="Emergency Contact" value={draft.emergencyContact} onChange={(event) => setDraft((current) => ({ ...current, emergencyContact: event.target.value }))} /> : <ReadRow label="Emergency Contact">{me.emergencyContact}</ReadRow>}
            <ReadRow label="Emergency Relation">{me.emergencyRelation}</ReadRow>
          </div>
        </div>

        {/* eKYC section is hidden for now and can be restored when the feature is enabled. */}

        {documentsOpen && (
          <div className="tenant-profile-documents-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDocumentsOpen(false); }}>
            <section className="tenant-profile-documents-modal" role="dialog" aria-modal="true" aria-labelledby="tenant-documents-title">
              <header className="tenant-profile-documents-modal-header">
                <div><span>PROFILE FILES</span><h2 id="tenant-documents-title">Tenant documents</h2><p>{docs.length} file{docs.length === 1 ? "" : "s"} saved to your profile</p></div>
                <button type="button" onClick={() => setDocumentsOpen(false)} aria-label="Close documents">×</button>
              </header>
              <div className="tenant-profile-documents-modal-body">
                <TenantDocs me={me} onChanged={refreshProfile} embedded />
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
