// src/tenant/pages/TenantHome.js
import React, { useMemo, useState } from "react";
import {
  FaRupeeSign,
  FaCheckCircle,
  FaExclamationTriangle,
  FaReceipt,
  FaFileAlt,
  FaBell,
  FaCalendarAlt,
  FaBullhorn,
} from "react-icons/fa";
import { Link } from "react-router-dom";
// import axios from "axios";
// import { API, authHeader } from "../tenantApi";
/* ----------------------------- Utils ---------------------------------- */
const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toNum = (v) => {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const formatINR = (v = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(toNumber(v));

const Money = ({ v = 0 }) => <>{formatINR(v)}</>;

const fmtDate = (d) => {
  try {
    if (!d) return "";
    const t = new Date(d);
    if (isNaN(t.getTime())) return "";
    return t.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "";
  }
};

const monthName = (m) =>
  new Date(2000, m, 1).toLocaleString("en-IN", { month: "short" });

/* ---------- Month helpers (mirror admin/NewComponant) ------------------ */
// "Sep-25"  -> { y: 2025, m: 8 }
const parseMonthKey = (key) => {
  if (!key || typeof key !== "string") return null;
  const [mon, yy] = key.split("-");
  if (!mon || !yy) return null;
  const m = new Date(`${mon} 1, 20${yy}`).getMonth();
  const y = Number(`20${yy}`);
  if (!Number.isFinite(m) || !Number.isFinite(y)) return null;
  return { y, m };
};

// Prefer record.month; fallback to record.date
const getYMFromRecord = (r) => {
  if (!r) return null;
  if (r.month) {
    const pm = parseMonthKey(r.month);
    if (pm) return pm;
  }
  if (r.date) {
    const d = new Date(r.date);
    if (!isNaN(d)) return { y: d.getFullYear(), m: d.getMonth() };
  }
  return null;
};

const monthIndexToYM = (ym) => {
  if (!Number.isFinite(ym)) return null;
  return { y: Math.floor(ym / 12), m: ym % 12 };
};

const getFirstBillYM = (tenant) => {
  if (!tenant?.joiningDate) return null;

  if (tenant?.firstRentMonth) {
    const pm = parseMonthKey(tenant.firstRentMonth);
    if (pm) return pm.y * 12 + pm.m;
  }

  const joinDate = new Date(tenant.joiningDate);
  if (isNaN(joinDate)) return null;

  const isAdvance = tenant?.firstRentStatus === "ADVANCE_PAID";
  return joinDate.getFullYear() * 12 + joinDate.getMonth() + (isAdvance ? 0 : 1);
};

/* ---------- Due calc EXACTLY like admin/NewComponant ------------------- */
const getDueMonthsAdminAligned = ({ joiningDate, rents }) => {
  if (!joiningDate) return [];

  const now = new Date();
  const currentYear = now.getFullYear();
  const startOfYear = new Date(currentYear, 0, 1);

  const joinDate = new Date(joiningDate);
  // start billing from the month AFTER joining
  const rentStart = new Date(joinDate.getFullYear(), joinDate.getMonth() + 1, 1);

  // pick whichever is later: Jan 1 of current year OR rentStart
  const startDate = rentStart > startOfYear ? rentStart : startOfYear;

  // Map of "m-y" for months that have any positive payment
  const paidMonths = new Set(
    (Array.isArray(rents) ? rents : [])
      .filter((r) => toNumber(r?.rentAmount) > 0)
      .map(getYMFromRecord)
      .filter(Boolean)
      .map(({ m, y }) => `${m}-${y}`)
  );

  // Last paid record (to get the amount multiplier)
  const lastPaid = (Array.isArray(rents) ? rents : [])
    .filter((r) => r?.date && toNumber(r?.rentAmount) > 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

  const rentAmount = lastPaid ? toNumber(lastPaid.rentAmount) : 0;
  if (rentAmount <= 0) return [];

  const dueMonths = [];
  const cursor = new Date(startDate);

  while (cursor <= now && cursor.getFullYear() === currentYear) {
    const key = `${cursor.getMonth()}-${cursor.getFullYear()}`;
    if (!paidMonths.has(key)) {
      dueMonths.push({
        month: cursor.getMonth() + 1,
        year: cursor.getFullYear(),
        amount: rentAmount,
        label: `${monthName(cursor.getMonth())} ${cursor.getFullYear()}`,
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return dueMonths;
};

/* --------------------------- Component -------------------------------- */
export default function TenantHome({
  me = {},
  rents = {},
  ann = [],
  refresh = () => {},
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [showDueMonths, setShowDueMonths] = useState(false);
  const announcements = Array.isArray(ann) ? ann.slice(0, 3) : [];

  const colors = {
    primary: "#1e3a8a",
    success: "#16a34a",
    danger: "#dc2626",
    warning: "#f59e0b",
    lightBg: "#f4f7fb",
    textMuted: "#718096",
  };

  const styles = {
    card: {
      background: "#ffffff",
      border: "1px solid #e5eaf2",
      borderRadius: 14,
      boxShadow: "0 5px 20px rgba(16,42,99,.045)",
      padding: 20,
      marginBottom: 16,
      transition: "all 0.2s ease-in-out",
    },
    row: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
      gap: 16,
    },
    ghostBtn: {
      padding: "8px 12px",
      border: `1px solid ${colors.primary}30`,
      borderRadius: 9,
      background: "#fff",
      cursor: "pointer",
      color: colors.primary,
      fontWeight: 700,
    },
    subtle: { color: colors.textMuted },
    pill: {
      display: "inline-block",
      padding: "4px 10px",
      fontSize: 12,
      borderRadius: 999,
      background: colors.lightBg,
      color: "#374151",
      marginLeft: 8,
    },
    kpiNumber: { fontWeight: 700, fontSize: 22 },
    kpiLabel: { fontSize: 13, color: colors.textMuted },
    cta: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "12px 14px",
      border: `1px solid ${colors.primary}20`,
      borderRadius: 10,
      cursor: "pointer",
      background: "#fff",
      fontWeight: 600,
      color: colors.primary,
      transition: "all 0.2s ease-in-out",
    },
    ctaHover: { background: "#e2e8f0" },
  };

  // ---- Safe reads -------------------------------------------------------
  const hostel = me?.hostel && typeof me.hostel === "object" ? me.hostel : {};
  const roomNo = me?.roomNo ?? hostel?.roomNo ?? "—";
  const bedNo = me?.bedNo ?? hostel?.bedNo ?? "—";
  const deposit = me?.deposit ?? me?.depositAmount ?? 0;

  // Normalize rents list from props
  const rentList = Array.isArray(rents?.rents) ? rents.rents : [];

  // Last paid record (used as a final fallback + UI)
  const lastPaidRec = useMemo(() => {
    return [...rentList]
      .filter((r) => r && (r.date || r.month) && toNumber(r.rentAmount) > 0)
      .sort((a, b) => {
        const ad = getYMFromRecord(a);
        const bd = getYMFromRecord(b);
        const aKey = ad ? ad.y * 12 + ad.m : 0;
        const bKey = bd ? bd.y * 12 + bd.m : 0;
        return bKey - aKey;
      })[0];
  }, [rentList]);

  // ===== Base rent priority (match TenantPayments)
  const baseRent = useMemo(() => {
    if (toNum(rents?.baseRent)) return toNum(rents.baseRent);
    if (toNum(me?.baseRent)) return toNum(me.baseRent);
    if (toNum(me?.hostel?.baseRent)) return toNum(me.hostel.baseRent);
    if (toNum(lastPaidRec?.rentAmount)) return toNum(lastPaidRec.rentAmount);
    const fromRents =
      rentList
        .map(
          (r) =>
            toNum(r?.expectedRent) ||
            toNum(r?.baseRent) ||
            toNum(r?.price)
        )
        .find((x) => x > 0) || 0;
    return fromRents;
  }, [rents?.baseRent, me?.baseRent, me?.hostel?.baseRent, lastPaidRec, rentList]);

  // ===== IMPORTANT: Use the EXACT same due calc as admin =====
  const dueMonths = useMemo(
    () => {
      if (Array.isArray(rents?.dueMonths)) {
        return rents.dueMonths
          .map((entry) => {
            const parsed = parseMonthKey(entry?.month);
            const amount = toNum(entry?.outstanding);
            if (!parsed || amount <= 0) return null;
            return {
              month: parsed.m + 1,
              year: parsed.y,
              amount,
              expected: toNum(entry?.expected),
              paid: toNum(entry?.paid),
              label: `${monthName(parsed.m)} ${parsed.y}`,
            };
          })
          .filter(Boolean);
      }

      return getDueMonthsAdminAligned({
        joiningDate: me?.joiningDate,
        rents: rentList,
      });
    },
    [rents?.dueMonths, me?.joiningDate, rentList]
  );
  const computedDue = useMemo(
    () => dueMonths.reduce((sum, month) => sum + month.amount, 0),
    [dueMonths]
  );

  const now = new Date();

  const firstBillYM = useMemo(
    () => getFirstBillYM(me),
    [me?.joiningDate, me?.firstRentMonth, me?.firstRentStatus]
  );

  const currentMonthPaid = useMemo(() => {
    const currentYM = now.getFullYear() * 12 + now.getMonth();
    if (firstBillYM != null && currentYM < firstBillYM) return false;

    if (!rentList.length) return false;
    const m = now.getMonth();
    const y = now.getFullYear();
    return rentList.some((r) => {
      const ym = getYMFromRecord(r);
      return ym && ym.m === m && ym.y === y && toNumber(r.rentAmount) > 0;
    });
  }, [rentList, firstBillYM]);

  const currentMonthState = useMemo(() => {
    const currentYM = now.getFullYear() * 12 + now.getMonth();

    if (firstBillYM != null && currentYM < firstBillYM) {
      return { label: "Not due yet", color: colors.primary, nextDueYM: firstBillYM };
    }

    if (currentMonthPaid) {
      return { label: "Paid", color: colors.success, nextDueYM: currentYM + 1 };
    }

    return { label: "Pending", color: colors.warning, nextDueYM: currentYM };
  }, [currentMonthPaid, firstBillYM]);

  const monthsPaidThisYear = useMemo(() => {
    const y = now.getFullYear();
    const set = new Set(
      rentList
        .filter((r) => toNumber(r?.rentAmount) > 0)
        .map(getYMFromRecord)
        .filter((v) => v && v.y === y)
        .map(({ m }) => m)
    );
    return set.size;
  }, [rentList]);

  const nextDueLabel = useMemo(() => {
    const next = monthIndexToYM(currentMonthState.nextDueYM);
    if (!next) return `${monthName(now.getMonth())} ${now.getFullYear()}`;
    return `${monthName(next.m)} ${next.y}`;
  }, [currentMonthState.nextDueYM]);

  const latestPayments = useMemo(() => rentList.flatMap((rent) => {
    const payments = Array.isArray(rent?.payments) && rent.payments.length
      ? rent.payments
      : [rent];
    const rentMonth = getYMFromRecord(rent);

    return payments
      .map((payment, index) => {
        const amount = toNumber(payment?.amount ?? payment?.rentAmount ?? rent?.rentAmount);
        const date = payment?.date || rent?.date;
        const paymentMonth = rentMonth || getYMFromRecord({ date });
        if (amount <= 0 || !paymentMonth) return null;

        return {
          key: payment?._id || `${rent?._id || rent?.month || "rent"}-${index}`,
          year: paymentMonth.y,
          month: paymentMonth.m,
          amount,
          date,
          dateSort: date ? new Date(date).getTime() || 0 : 0,
        };
      })
      .filter(Boolean);
  }).sort((a, b) => (b.year - a.year) || (b.month - a.month) || (b.dateSort - a.dateSort)), [rentList]);

  // Hard refresh handler (works even if `refresh` prop is a no-op)
  const handleRefresh = async () => {
    if (typeof refresh !== "function" || refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } catch (error) {
      console.error("Unable to refresh tenant dashboard:", error?.message || error);
    } finally {
      setRefreshing(false);
    }
  };

  /* ----------------------------- UI ----------------------------------- */
  return (
    <div className="tenant-home-overview">
      {/* Header / Welcome */}
      <div
        className="tenant-home-hero"
        style={{
          ...styles.card,
          background: "linear-gradient(135deg,#fff9e6,#f8faff 72%)",
          border: "1px solid #e4eaf3",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <div>
            <h5 style={{ margin: 0, color: "#1e293b" }}>
              Hello, {me?.name || "Tenant"}
            </h5>
            <div style={styles.subtle}>
              {me?.propertyType === "shop" ? "Shop" : "Room"} {roomNo}{me?.propertyType === "bed" && bedNo !== "—" ? ` / Bed ${bedNo}` : ""}
            </div>
          </div>
          <div style={{ fontSize: 12, color: colors.textMuted }}>
            <button
              style={{
                ...styles.ghostBtn,
                borderColor: colors.primary,
                color: colors.primary,
              }}
              disabled={refreshing}
              onClick={handleRefresh}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

      </div>

      <section className={`tenant-home-due-summary${computedDue > 0 ? " has-due" : " is-clear"}`}>
        <div className="tenant-home-due-copy">
          <span className="tenant-home-due-icon">{computedDue > 0 ? <FaExclamationTriangle /> : <FaCheckCircle />}</span>
          <div>
            <strong>{computedDue > 0 ? "Rent due" : "No rent due"}</strong>
            <b><Money v={computedDue} /></b>
            <small>{computedDue > 0 ? `${dueMonths.length} unpaid month${dueMonths.length === 1 ? "" : "s"}` : "Your rent is up to date."}</small>
          </div>
        </div>
        <Link
          className="tenant-home-due-action"
          to="/tenant/payments"
          state={dueMonths[0] ? { dueMonth: dueMonths[0].month, dueYear: dueMonths[0].year, dueAmount: dueMonths[0].amount, totalDue: computedDue, baseRent } : undefined}
        >
          {computedDue > 0 ? "Pay rent" : "View payments"}
        </Link>
      </section>

      {/* Useful rent summary */}
      <div className="tenant-home-kpis" style={styles.row}>
        {/* Base Rent */}
        <div className="tenant-home-kpi tenant-home-kpi-rent" style={styles.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}><FaRupeeSign color="#3975bb" />Monthly rent</div>
          <div style={styles.kpiNumber}>
            <Money v={baseRent} />
          </div>
        </div>

        {/* Deposit */}
        <div className="tenant-home-kpi tenant-home-kpi-deposit" style={styles.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}><FaFileAlt color="#6d5ac3" />Deposit paid</div>
          <div style={styles.kpiNumber}>
            <Money v={deposit} />
          </div>
        </div>

        {/* Current Month */}
        <div className="tenant-home-kpi tenant-home-kpi-month" style={styles.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}><FaCalendarAlt color="#bd870e" />This month</div>
          <div
            style={{
              ...styles.kpiNumber,
              color: currentMonthState.color,
            }}
          >
            {currentMonthState.label === "Not due yet" ? "Not due" : currentMonthState.label}
          </div>
        </div>

        {/* Last Payment */}
        <div className="tenant-home-kpi tenant-home-kpi-payment" style={styles.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}><FaCheckCircle color="#299565" />Last payment</div>
          <div style={styles.kpiNumber}>
            {lastPaidRec ? <Money v={toNumber(lastPaidRec.rentAmount)} /> : "—"}
          </div>
          <div style={styles.kpiLabel}>
            {lastPaidRec?.date
              ? fmtDate(lastPaidRec.date)
              : "No payments yet"}
          </div>
        </div>

        {/* Year Progress (commented out by you)
        <div style={styles.card}>
          <div style={{ fontWeight: 600 }}>
            {new Date().getFullYear()} Rent Progress
          </div>
          <div style={styles.kpiNumber}>
            {monthsPaidThisYear} / {now.getMonth() + 1} months
          </div>
          <div style={styles.kpiLabel}>Paid this year</div>
          <div className="progress mt-2" aria-label="Yearly rent progress">
            <div
              className="progress-bar"
              role="progressbar"
              style={{
                width: `${Math.min(
                  100,
                  (monthsPaidThisYear / (now.getMonth() + 1 || 1)) * 100
                ).toFixed(0)}%`,
              }}
            />
          </div>
        </div>
        */}
      </div>

      {showDueMonths && (
        <div
          className="tenant-dues-backdrop"
          role="presentation"
          onClick={() => setShowDueMonths(false)}
        >
          <section
            className="tenant-dues-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tenant-due-months-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="tenant-dues-header">
              <div>
                <h5 id="tenant-due-months-title">Outstanding dues</h5>
                <p>Month-wise rent balance</p>
              </div>
              <button
                type="button"
                className="tenant-dues-close"
                aria-label="Close dues"
                onClick={() => setShowDueMonths(false)}
              >
                ×
              </button>
            </div>
            <div className="tenant-dues-body">
              <div className="table-responsive tenant-dues-table-wrap">
                <table className="table table-sm align-middle tenant-dues-table">
                  <thead>
                    <tr><th>Month</th><th className="text-end">Due</th><th className="text-end">Action</th></tr>
                  </thead>
                  <tbody>
                    {dueMonths.map((month) => (
                      <tr key={`${month.year}-${month.month}`}>
                        <td>{month.label}</td>
                        <td className="text-end fw-semibold">{formatINR(month.amount)}</td>
                        <td className="text-end">
                          <Link
                            to="/tenant/payments"
                            state={{
                              totalDue: computedDue,
                              baseRent,
                              dueMonth: month.month,
                              dueYear: month.year,
                              dueAmount: month.amount,
                            }}
                            className="btn btn-sm btn-primary tenant-dues-pay"
                          >
                            Pay / Report
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total outstanding</th>
                      <th className="text-end">{formatINR(computedDue)}</th>
                      <th />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Recent Payments */}
      <div className="tenant-home-panel" style={styles.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <h5 className="tenant-home-section-title" style={{ margin: 0 }}>
            <span className="tenant-home-section-icon"><FaReceipt /></span>
            Latest payments
          </h5>
          <Link to="/tenant/payments" className="btn btn-sm btn-outline-primary">
            View all
          </Link>
        </div>

        {latestPayments.length ? (
          <div className="table-responsive mt-2 tenant-home-payments-wrap">
            <table className="table table-sm align-middle mb-0 tenant-home-payments-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {latestPayments.map((payment) => (
                  <tr key={payment.key}>
                    <td data-label="Month"><span className="tenant-payment-mobile-label">Month</span>{monthName(payment.month)} {payment.year}</td>
                    <td>
                      <span className="tenant-payment-mobile-label">Amount</span>
                      <Money v={payment.amount} />
                    </td>
                    <td data-label="Date">
                      <span className="tenant-payment-mobile-label">Date</span>{fmtDate(payment.date) || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ ...styles.subtle, marginTop: 6 }}>
            No payments found yet.
          </div>
        )}
      </div>

      {/* Announcements are temporarily hidden; restore this section when the feature is ready.
      <section className="tenant-home-panel" style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h5 className="tenant-home-section-title" style={{ margin: 0 }}>
              <span className="tenant-home-section-icon"><FaBullhorn /></span>
              Property announcements
            </h5>
            <div style={{ ...styles.subtle, fontSize: 12, marginTop: 4 }}>Updates from your property administrator</div>
          </div>
          <Link to="/tenant/announcements" className="btn btn-sm btn-outline-primary">View all</Link>
        </div>
        {announcements.length ? (
          <div className="tenant-home-announcements">
            {announcements.map((item, index) => {
              const dateValue = item?.createdAt || item?.date || item?.publishedAt;
              const date = dateValue ? new Date(dateValue) : null;
              return (
                <article key={item?._id || item?.id || index}>
                  <span className="tenant-home-announcement-icon"><FaBell /></span>
                  <div>
                    <strong>{item?.title || item?.subject || "Property update"}</strong>
                    <p>{item?.message || item?.body || item?.content || "No details provided."}</p>
                  </div>
                  {date && !Number.isNaN(date.getTime()) && <time>{date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</time>}
                </article>
              );
            })}
          </div>
        ) : <p className="tenant-home-announcements-empty">No new notices at the moment.</p>}
      </section>
      */}
    </div>
  );
}
