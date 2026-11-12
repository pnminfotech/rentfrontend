import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowRight, FiLayers, FiUser, FiHome, FiGrid, FiShield } from "react-icons/fi";
import { FaStore } from "react-icons/fa";
import { TbBed } from "react-icons/tb";
import { getAppBootstrap, saveBusinessProfile, savePropertyTypes } from "../saasApi";
import { getPostLoginPath } from "../utils/saasNavigation";
import "./PropertyTypes.css";
import propertyBuildings from "./property-buildings.png";
import propertyPhoto from "../image/property.png";

export const PROPERTY_TYPES = [
  { value: "bed", label: "Hostel", description: "Manage rooms and beds", Icon: TbBed },
  { value: "room", label: "Residential Room", description: "Manage residential rooms and flats", Icon: FiHome },
  { value: "shop", label: "Commercial Shop", description: "Manage commercial shops", Icon: FaStore },
];

export function PropertyTypePicker({
  initialTypes = [],
  initialCanteenEnabled = false,
  showCanteenOption = true,
  onTypesChange,
  onBeforeSave,
  onSaved,
}) {
  const [types, setTypes] = useState(initialTypes);
  const [canteenEnabled, setCanteenEnabled] = useState(initialCanteenEnabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => setTypes(initialTypes), [initialTypes]);
  useEffect(() => setCanteenEnabled(initialCanteenEnabled), [initialCanteenEnabled]);

  const updateTypes = (nextTypes) => {
    setTypes(nextTypes);
    setMessage("");
    if (!nextTypes.includes("bed")) setCanteenEnabled(false);
    onTypesChange?.(nextTypes);
  };

  const save = async () => {
    if (saving) return;
    if (!types.length) {
      setMessage("Please select at least one property type.");
      return;
    }
    try {
      setSaving(true);
      setMessage("");
      await onBeforeSave?.();
      await savePropertyTypes(types, canteenEnabled && types.includes("bed"));
      if (onSaved) await onSaved();
      else setMessage("Property types saved successfully.");
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || "Unable to save property types.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="property-type-picker">
      <div className="property-type-choices" role="group" aria-label="Property types">
        {PROPERTY_TYPES.map(({ value, label, description, Icon }) => (
          <label className={`property-type-choice ${types.includes(value) ? "is-selected" : ""}`} key={value}>
            <input
              type="checkbox"
              checked={types.includes(value)}
              onChange={(event) => updateTypes(event.target.checked ? [...types, value] : types.filter((item) => item !== value))}
            />
            <span className={`property-type-icon property-type-icon-${value}`} aria-hidden="true"><Icon /></span>
            <span className="property-type-copy"><strong>{label}</strong><small>{description}</small></span>
          </label>
        ))}
      </div>
      {showCanteenOption && types.includes("bed") && (
        <label className="property-type-canteen-choice">
          <input type="checkbox" checked={canteenEnabled} onChange={(event) => setCanteenEnabled(event.target.checked)} />
          <span><strong>Enable hostel canteen</strong><small>Manage meals and attendance for hostel tenants.</small></span>
        </label>
      )}
      {message && <p role="alert" className="property-type-message">{message}</p>}
      <button type="button" className="property-type-save" disabled={saving} onClick={save}>
        <span>{saving ? "Saving..." : "Save Property Types"}</span>
        {!saving && <FiArrowRight aria-hidden="true" />}
      </button>
    </div>
  );
}

function PropertyIllustration() {
  return (
    <img
      className="property-types-art"
      src={propertyBuildings}
      alt="Illustration of a hostel, apartment building and shop"
    />
  );
}

export default function PropertyTypes() {
  const navigate = useNavigate();
  const [bootstrap, setBootstrap] = useState(null);
  const [businessProfile, setBusinessProfile] = useState({ businessName: "", ownerName: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getAppBootstrap()
      .then((data) => {
        if (!active) return;
        if (!data.access?.needsPropertySelection) {
          navigate(getPostLoginPath(data), { replace: true });
          return;
        }
        setBootstrap(data);
        setBusinessProfile({
          businessName: data.organization?.name === "New Business" ? "" : data.organization?.name || "",
          ownerName: data.organization?.ownerName === "Owner" ? "" : data.organization?.ownerName || data.user?.name || "",
        });
      })
      .catch(() => { if (active) setError("Unable to load property types. Please try again."); });
    return () => { active = false; };
  }, [navigate]);

  return (
    <main className="property-types-page">
      <section className="property-types-card">
        <header className="property-types-intro">
          <div className="property-types-intro-copy">
            <h1>Choose Your<br />Property Types</h1>
            <span className="property-types-accent" />
            <p>Tell us about your business and choose the property types you manage. You can edit these details later in your profile.</p>
          </div>
          <PropertyIllustration />
        </header>
        <aside className="property-types-desktop-intro">
          <span className="property-types-desktop-brand-icon"><FiHome /></span>
          <h1>Choose Your<br /><span>Property Types</span></h1>
          <span className="property-types-desktop-accent" />
          <p>Tell us about your business and choose the property types you manage. You can add these details later in your profile.</p>
          <img className="property-types-desktop-photo" src={propertyPhoto} alt="Modern residential property" />
          <div className="property-types-safe-note"><span><FiShield /></span><div><strong>Your information is safe with us</strong><small>We keep your data secure and private.</small></div></div>
        </aside>
        <div className="property-types-form-column">
          {error && <p role="alert" className="property-type-message">{error}</p>}
          {bootstrap && (
            <>
            <div className="property-type-profile-fields">
              <label>
                <span className="property-type-field-label"><FaStore />Business / Hostel Name</span>
                <span className="property-type-input-wrap"><FiGrid aria-hidden="true" /><input type="text" maxLength={120} autoComplete="organization" value={businessProfile.businessName} onChange={(event) => setBusinessProfile((current) => ({ ...current, businessName: event.target.value }))} placeholder="Enter your business name" required /></span>
              </label>
              <label>
                <span className="property-type-field-label"><FiUser />Your Name (Admin / Owner)</span>
                <span className="property-type-input-wrap"><FiUser aria-hidden="true" /><input type="text" maxLength={120} autoComplete="name" value={businessProfile.ownerName} onChange={(event) => setBusinessProfile((current) => ({ ...current, ownerName: event.target.value }))} placeholder="Enter your name" required /></span>
              </label>
            </div>
            <section className="property-types-selection">
              <div className="property-types-selection-heading">
                <span><FiLayers /></span>
                <div><h2>Select Property Types</h2><p>Choose one or more property types you want to manage.</p></div>
              </div>
              <PropertyTypePicker
                showCanteenOption={false}
                initialTypes={bootstrap.organization?.selectedPropertyTypes || []}
                initialCanteenEnabled={Boolean(bootstrap.organization?.features?.canteenEnabled)}
                onBeforeSave={() => {
                  if (!businessProfile.businessName.trim() || !businessProfile.ownerName.trim()) {
                    throw new Error("Enter both your business name and your name.");
                  }
                  return saveBusinessProfile({ businessName: businessProfile.businessName.trim(), ownerName: businessProfile.ownerName.trim() });
                }}
                onSaved={() => navigate("/admin", { replace: true })}
              />
            </section>
          </>
          )}
        </div>
      </section>
    </main>
  );
}
