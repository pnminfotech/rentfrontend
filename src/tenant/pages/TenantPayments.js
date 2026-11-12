// src/tenant/pages/TenantPayments.js
import { useEffect, useMemo, useState } from "react";
import { API, tenantHttp } from "../tenantApi";
import { useLocation } from "react-router-dom";
import { FaReceipt } from "react-icons/fa";
import "./TenantPayments.css";

/* ----------------------- Constants & utils ----------------------- */
const MONTHS = [
  { n: 1,  label: "Jan" }, { n: 2,  label: "Feb" }, { n: 3,  label: "Mar" },
  { n: 4,  label: "Apr" }, { n: 5,  label: "May" }, { n: 6,  label: "Jun" },
  { n: 7,  label: "Jul" }, { n: 8,  label: "Aug" }, { n: 9,  label: "Sep" },
  { n: 10, label: "Oct" }, { n: 11, label: "Nov" }, { n: 12, label: "Dec" },
];

const toNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const moneyINR = (v = 0) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const resolveReceiptUrl = (url) => {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const origin = String(API).replace(/\/api\/?$/i, "");
  return `${origin}${value.startsWith("/") ? value : `/${value}`}`;
};
function Money({ v = 0 }) { return <>{moneyINR(v)}</>; }
const fmtMonthYear = (m, y) =>
  (!m || !y ? "—" : `${MONTHS.find(x => x.n === Number(m))?.label || m} ${y}`);

// "Sep-25" -> { y: 2025, m: 8 }
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

// safest numeric
const toNum = (v) => {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/* ---------- Admin-aligned due calc (same rules as TenantHome) ---------- */
const calcDueAdminAligned = ({ joiningDate, rents }) => {
  if (!joiningDate) return 0;

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
  if (rentAmount <= 0) return 0;

  let dueCount = 0;
  const cursor = new Date(startDate);

  while (cursor <= now && cursor.getFullYear() === currentYear) {
    const key = `${cursor.getMonth()}-${cursor.getFullYear()}`;
    if (!paidMonths.has(key)) dueCount++;
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return rentAmount * dueCount;
};

/* ------------------------------ Component ------------------------------ */
export default function TenantPayments({ me: meProp, rents: rentsProp, refresh }) {
  const location = useLocation();
  const totalDueFromHome = location.state?.totalDue;
  const baseRentFromHome = location.state?.baseRent;
  const dueMonthFromHome = Number(location.state?.dueMonth);
  const dueYearFromHome = Number(location.state?.dueYear);
  const dueAmountFromHome = Number(location.state?.dueAmount);

  const [me, setMe] = useState(meProp || null);
  const [rents, setRents] = useState(rentsProp || null);
  const [myPays, setMyPays] = useState([]);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  // rooms for deriving base rent like admin page
  const [rooms, setRooms] = useState(null);

  // Amount defaults to last paid amount or base rent
  const now = new Date();
  const [amount, setAmount] = useState(() =>
    Number.isFinite(dueAmountFromHome) && dueAmountFromHome > 0
      ? String(dueAmountFromHome)
      : "500"
  );
  const [utr, setUTR] = useState("");
  const [note, setNote] = useState("");

  // Month/year the payment is for
  const [selMonth, setSelMonth] = useState(
    Number.isInteger(dueMonthFromHome) && dueMonthFromHome >= 1 && dueMonthFromHome <= 12
      ? dueMonthFromHome
      : now.getMonth() + 1
  ); // 1..12
  const [selYear, setSelYear]   = useState(
    Number.isInteger(dueYearFromHome) && dueYearFromHome > 0
      ? dueYearFromHome
      : now.getFullYear()
  );

  // SINGLE static QR (no query params so it won't re-generate)
  const [qrUrl] = useState(`${API}/tenant/upi-qr`);

  const card = {
    background: "#fff",
    borderRadius: 14,
    boxShadow: "0 8px 30px rgba(16,24,40,.06)",
    padding: 16,
    marginBottom: 16,
  };

  const needFetch = !me || !rents;

  useEffect(() => { if (meProp) setMe(meProp); }, [meProp]);
  useEffect(() => { if (rentsProp) setRents(rentsProp); }, [rentsProp]);

  const fetchPayments = async () => {
    try {
      const { data } = await tenantHttp.get(`/tenant/payments/my`);
      setMyPays(data || []);
    } catch {
      setMyPays([]);
    }
  };

  const fetchOwn = async () => {
    const [a, b] = await Promise.all([
      tenantHttp.get(`/tenant/me`),
      tenantHttp.get(`/tenant/rents`),
    ]);
    setMe(a.data);
    setRents(b.data);
  };

  // fetch payments + me/rents
  useEffect(() => {
    const go = async () => {
      await fetchPayments();
      if (needFetch) {
        await fetchOwn();
      }
    };
    go().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------- Paid/Unpaid month detection -------------------- */
  const rentList = Array.isArray(rents?.rents) ? rents.rents : [];
  const rentReceipts = useMemo(() => rentList.flatMap((rent) => {
    const payments = Array.isArray(rent?.payments) && rent.payments.length ? rent.payments : [rent];
    return payments
      .filter((payment) => toNumber(payment?.amount ?? payment?.rentAmount ?? rent?.rentAmount) > 0)
      .map((payment, index) => ({
        rent,
        payment,
        index,
        amount: toNumber(payment?.amount ?? payment?.rentAmount ?? rent?.rentAmount),
        date: payment?.date || rent?.date,
        key: payment?._id || `${rent?._id || rent?.month || "rent"}-${index}`,
      }));
  }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)), [rentList]);
  const selectedUploadedReceiptUrl = resolveReceiptUrl(selectedReceipt?.payment?.receiptUrl || selectedReceipt?.rent?.receiptUrl);

  const shareReceipt = async () => {
    if (!selectedReceipt) return;
    const text = [
      "Rent payment receipt",
      `Tenant: ${me?.name || "-"}`,
      `Rent month: ${selectedReceipt.rent?.month || "-"}`,
      `Unit: ${me?.roomNo || me?.roomId?.roomNo || "-"}`,
      `Amount: Rs. ${selectedReceipt.amount.toLocaleString("en-IN")}`,
      `Payment mode: ${selectedReceipt.payment?.paymentMode || "Cash"}`,
      `Date: ${selectedReceipt.date ? new Date(selectedReceipt.date).toLocaleDateString("en-IN") : "-"}`,
      selectedReceipt.payment?.utr ? `Reference: ${selectedReceipt.payment.utr}` : "",
    ].filter(Boolean).join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: "Rent payment receipt", text, url: window.location.href });
        return;
      }
      if (navigator.clipboard) await navigator.clipboard.writeText(text);
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const fileUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = `receipt-${selectedReceipt.rent?.month || "payment"}.txt`;
      link.click();
      URL.revokeObjectURL(fileUrl);
    } catch (error) {
      if (error?.name !== "AbortError") alert("Unable to share receipt.");
    }
  };

  useEffect(() => {
    if (!selectedReceipt) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSelectedReceipt(null);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedReceipt]);

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

  // fetch rooms only when we still cannot derive the base rent locally
  useEffect(() => {
    if (toNum(me?.baseRent) || toNum(lastPaidRec?.rentAmount)) {
      return;
    }

    tenantHttp
      .get(`/rooms`)
      .then((res) => setRooms(res.data || []))
      .catch(() => setRooms(null));
  }, [me?.baseRent, lastPaidRec?.rentAmount]);

  // total due: prefer value passed from TenantHome; fallback to local calc
  const totalDue = useMemo(() => {
    if (typeof totalDueFromHome === "number" && !Number.isNaN(totalDueFromHome)) {
      return totalDueFromHome;
    }
    if (typeof rents?.totalDue === "number" && Number.isFinite(rents.totalDue)) {
      return rents.totalDue;
    }
    return calcDueAdminAligned({ joiningDate: me?.joiningDate, rents: rentList });
  }, [totalDueFromHome, rents?.totalDue, me?.joiningDate, rentList]);

  // derive base rent from (router state) → rooms → me.baseRent → lastPaid
  const displayBaseRent = useMemo(() => {
    if (typeof baseRentFromHome === "number" && !Number.isNaN(baseRentFromHome)) {
      return baseRentFromHome;
    }
    if (rooms && me?.roomNo != null && me?.bedNo != null) {
      const room = (rooms || []).find(r => String(r.roomNo) === String(me.roomNo));
      const bed  = room?.beds?.find(b => String(b.bedNo) === String(me.bedNo));
      const fromRooms =
        toNum(bed?.price) ||
        toNum(bed?.baseRent) ||
        toNum(bed?.monthlyRent);
      if (fromRooms) return fromRooms;
    }
    if (toNum(me?.baseRent)) return toNum(me.baseRent);
    if (toNum(lastPaidRec?.rentAmount)) return toNum(lastPaidRec.rentAmount);
    return 0;
  }, [baseRentFromHome, rooms, me?.roomNo, me?.bedNo, me?.baseRent, lastPaidRec]);

  // amount defaulting uses displayBaseRent
  useEffect(() => {
    const pick = toNumber(lastPaidRec?.rentAmount) || displayBaseRent || 0;
    if (pick && (!amount || toNumber(amount) === 0)) {
      setAmount(String(pick));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayBaseRent, lastPaidRec]);

  // Map of "m-y" for months paid (any positive amount)
  const paidSet = useMemo(() => {
    const s = new Set();
    rentList
      .filter((r) => toNumber(r?.rentAmount) > 0)
      .map(getYMFromRecord)
      .filter(Boolean)
      .forEach(({ m, y }) => s.add(`${m}-${y}`));
    return s;
  }, [rentList]);

  // Current-year unpaid months starting from the month **after joining**
  const pendingMonths = useMemo(() => {
    if (Array.isArray(rents?.dueMonths)) {
      return rents.dueMonths
        .map((entry) => {
          const parsed = parseMonthKey(entry?.month);
          const dueAmount = toNumber(entry?.outstanding);
          if (!parsed || dueAmount <= 0) return null;
          return { m: parsed.m + 1, y: parsed.y, amount: dueAmount };
        })
        .filter(Boolean);
    }
    if (!me?.joiningDate) return [];
    const today = new Date();
    const currentYear = today.getFullYear();

    const join = new Date(me.joiningDate);
    const rentStart = new Date(join.getFullYear(), join.getMonth() + 1, 1);
    const startOfYear = new Date(currentYear, 0, 1);
    const start = rentStart > startOfYear ? rentStart : startOfYear;

    const out = [];
    const cursor = new Date(start);
    while (cursor <= today && cursor.getFullYear() === currentYear) {
      const key = `${cursor.getMonth()}-${cursor.getFullYear()}`;
      if (!paidSet.has(key)) {
        out.push({ m: cursor.getMonth() + 1, y: cursor.getFullYear() }); // 1..12
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }, [rents?.dueMonths, me?.joiningDate, paidSet]);

  // Prefill selectors to earliest unpaid (else current)
  const firstBillYM = useMemo(
    () => getFirstBillYM(me),
    [me?.joiningDate, me?.firstRentMonth, me?.firstRentStatus]
  );

  useEffect(() => {
    const currentYM = now.getFullYear() * 12 + now.getMonth();

    if (
      Number.isInteger(dueMonthFromHome) && dueMonthFromHome >= 1 && dueMonthFromHome <= 12 &&
      Number.isInteger(dueYearFromHome) && dueYearFromHome > 0
    ) {
      setSelMonth(dueMonthFromHome);
      setSelYear(dueYearFromHome);
      if (Number.isFinite(dueAmountFromHome) && dueAmountFromHome > 0) {
        setAmount(String(dueAmountFromHome));
      }
      return;
    }

    if (pendingMonths.length) {
      setSelMonth(pendingMonths[0].m);
      setSelYear(pendingMonths[0].y);
      if (pendingMonths[0].amount > 0) setAmount(String(pendingMonths[0].amount));
    } else if (firstBillYM != null && currentYM < firstBillYM) {
      const ym = monthIndexToYM(firstBillYM);
      if (ym) {
        setSelMonth(ym.m + 1);
        setSelYear(ym.y);
      }
    } else {
      setSelMonth(now.getMonth() + 1);
      setSelYear(now.getFullYear());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMonths, firstBillYM, dueMonthFromHome, dueYearFromHome, dueAmountFromHome, location.key]);

  const currentMonthPaid = useMemo(() => {
    const currentYM = now.getFullYear() * 12 + now.getMonth();
    if (firstBillYM != null && currentYM < firstBillYM) return false;

    const m = now.getMonth();
    const y = now.getFullYear();
    return paidSet.has(`${m}-${y}`);
  }, [paidSet, firstBillYM]);

  const currentMonthState = useMemo(() => {
    const currentYM = now.getFullYear() * 12 + now.getMonth();

    if (firstBillYM != null && currentYM < firstBillYM) {
      return { label: "Not due yet", color: "#2563eb", nextDueYM: firstBillYM };
    }

    if (currentMonthPaid) {
      return {
        label: "Paid",
        color: "#16a34a",
        nextDueYM: currentYM + 1,
      };
    }

    return {
      label: "Pending",
      color: "#f59e0b",
      nextDueYM: currentYM,
    };
  }, [currentMonthPaid, firstBillYM]);

  // Include every year that still has an outstanding billing cycle.
  const years = useMemo(() => {
    const y0 = now.getFullYear();
    return Array.from(
      new Set([y0, y0 - 1, y0 - 2, ...pendingMonths.map((month) => month.y)])
    ).sort((a, b) => b - a);
  }, [pendingMonths]);

  /* ---------------------------- Actions -------------------------------- */
  const reportPayment = async () => {
    const amt = toNumber(amount);
    if (!amt) return alert("Enter amount");
    if (!selMonth || !selYear) return alert("Select month & year");

    const selectedYM = Number(selYear) * 12 + (Number(selMonth) - 1);
    if (firstBillYM != null && selectedYM < firstBillYM) {
      const first = monthIndexToYM(firstBillYM);
      const label = first ? fmtMonthYear(first.m + 1, first.y) : "the first bill month";
      return alert(`Billing for this tenant starts from ${label}. Please choose that month or later.`);
    }

    try {
      await tenantHttp.post(`/tenant/payments/report`, {
        amount: amt,
        month: Number(selMonth),
        year: Number(selYear),
        utr,
        note: note || `Rent for ${fmtMonthYear(selMonth, selYear)}`,
      });

      setUTR("");
      setNote("");

      if (typeof refresh === "function") await refresh();
      await Promise.all([
        fetchPayments(),
        needFetch ? fetchOwn() : Promise.resolve(),
      ]);

      alert(`Thanks! Payment reported for ${fmtMonthYear(selMonth, selYear)}. Admin will review & approve.`);
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to report payment");
    }
  };

  /* ------------------------------ UI ----------------------------------- */
  return (
    <main className="tpay">
      {/* Responsive styles */}
      <style>{`
        .tpay .kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .tpay .two-col {
          display: grid;
          grid-template-columns: 1.1fr .9fr;
          gap: 12px;
          margin-top: 12px;
        }
        .tpay .qr-img {
          width: 100%;
          max-width: 220px;
          height: auto;
          background: #fff;
          border-radius: 12px;
          border: 1px solid #eee;
        }
        .tpay .btn-chip {
          padding: 6px 10px;
          border-radius: 999px;
          cursor: pointer;
          background: #f1f5f9;
          border: 1px solid #dbe3f5;
        }
        .tpay .btn-chip--active {
          background: rgba(37,99,235,.08);
          border: 2px solid #2563eb;
        }
        .tpay .actions-inline {
          display: flex;
          gap: 12px;
          align-items: flex-end;
          flex-wrap: wrap;
        }
        .tpay .input {
          padding: 10px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          width: 100%;
          box-sizing: border-box;
        }

        /* Tablet */
        @media (max-width: 1200px) {
          .tpay .kpi-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .tpay .two-col {
            grid-template-columns: minmax(0, 1fr);
          }
          .tpay .two-col > section {
            width: 100%;
          }
        }

        /* Mobile */
        @media (max-width: 640px) {
          .tpay .kpi-grid {
            grid-template-columns: 1fr;
          }
          .tpay .two-col {
            grid-template-columns: 1fr;
          }
          .tpay .actions-inline > * {
            width: 100%;
          }
          .tpay .table-wrap {
            font-size: 13px;
          }
        }
      `}</style>

      <style>{`
        .tenant-rent-receipts { display: grid; gap: 9px; }
        .tenant-rent-receipt-row { display: grid; grid-template-columns: minmax(0,1fr) minmax(100px,.5fr) auto; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid #e4e9f5; border-radius: 12px; background: #fbfcff; }
        .tenant-rent-receipt-row strong { color: #172f68; }
        .tenant-rent-receipt-row small { display: block; margin-top: 3px; color: #7180a0; }
        .tenant-rent-receipt-open { padding: 8px 12px; border: 1px solid #cbd8f5; border-radius: 9px; color: #244bc3; background: #fff; font-weight: 700; cursor: pointer; }
        .tenant-receipt-backdrop { position:fixed; inset:0; z-index:1200; display:grid; place-items:center; padding:18px; background:rgba(0,0,0,.5); }
        .tenant-receipt-modal { width:min(500px,100%); max-height:92vh; overflow:auto; border:0; border-radius:16px; color:#17202a; background:#fbf7ef; box-shadow:0 18px 55px rgba(15,23,42,.25); }
        .tenant-receipt-modal-head { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:18px 22px; border-bottom:1px solid #e7ded1; background:#fbf7ef; }
        .tenant-receipt-modal-head h4 { margin:0; color:#17202a; font-weight:700; }
        .tenant-receipt-close { border:0; color:#244f70; background:transparent; font-size:28px; line-height:1; cursor:pointer; }
        .tenant-receipt-modal-body { padding:22px; background:#fbf7ef; }
        .tenant-receipt-card { padding:22px; border:1px solid #d6e7ef; border-radius:12px; color:#173c5d; background:#eaf5fb; }
        .tenant-receipt-brand { color:#17202a; font-size:23px; font-weight:700; }
        .tenant-receipt-type { margin-top:4px; padding-bottom:14px; border-bottom:2px solid #2c5d80; color:#2c5d80; font-weight:600; }
        .tenant-receipt-meta { display:flex; justify-content:space-between; gap:12px; margin-top:16px; padding:12px; color:#647789; background:#f7fbfd; font-size:12px; }
        .tenant-receipt-amount { margin:22px 0; color:#244f70; font-size:30px; font-weight:800; }
        .tenant-receipt-detail { display:flex; justify-content:space-between; gap:16px; min-height:44px; padding:11px 0; border-bottom:1px solid rgba(36,79,112,.18); }
        .tenant-receipt-detail span { color:#647789; }
        .tenant-receipt-detail strong { color:#173c5d; text-align:right; word-break:break-word; }
        .tenant-receipt-original { color:#2c5d80; font-weight:700; text-decoration:underline; }
        .tenant-receipt-footer { margin-top:22px; color:#647789; font-size:11px; text-align:center; }
        .tenant-receipt-actions { display:flex; gap:10px; padding:0 22px 22px; background:#fbf7ef; }
        .tenant-receipt-actions button { flex:1; min-height:46px; border-radius:8px; font-weight:700; cursor:pointer; }
        .tenant-receipt-print { border:1px solid #2c5d80; color:#2c5d80; background:#fffdf9; }
        .tenant-receipt-share { border:1px solid #2c5d80; color:#244f70; background:#dceef7; }
        .tenant-receipt-close-action { border:0; color:#fff; background:#2c5d80; }
        @media (max-width:640px) { .tenant-rent-receipt-row { grid-template-columns:minmax(0,1fr) auto; } .tenant-rent-receipt-row .receipt-row-amount { grid-column:1; } .tenant-rent-receipt-row .tenant-rent-receipt-open { grid-column:2; grid-row:1 / span 2; } .tenant-receipt-backdrop { padding:10px; } .tenant-receipt-modal { max-height:94dvh; } .tenant-receipt-modal-body { padding:16px; } .tenant-receipt-card { padding:18px; } .tenant-receipt-meta { flex-direction:column; } .tenant-receipt-actions { padding:0 16px 16px; } }
        @media print { body * { visibility:hidden !important; } #tenant-payment-receipt, #tenant-payment-receipt * { visibility:visible !important; } #tenant-payment-receipt { position:absolute !important; inset:0 !important; width:100% !important; max-height:none !important; overflow:visible !important; box-shadow:none !important; } .tenant-receipt-actions, .tenant-receipt-modal-head { display:none !important; } .tenant-receipt-backdrop { position:absolute !important; inset:0 !important; padding:0 !important; background:#fff !important; } .tenant-receipt-modal-body { padding:0 !important; background:#fff !important; } .tenant-receipt-card { border:0 !important; } }
      `}</style>

      <div className="tpay-page-heading"><h1 className="tpay-title">Pay rent</h1><p>Choose a month, pay by UPI, then report your payment.</p></div>

      {/* Top summary */}
      <div className="kpi-grid">
        <div className="tpay-kpi" style={card}>
          <div style={{ color: "#6b7280", fontSize: 12 }}>Room / Bed</div>
          <div style={{ fontWeight: 700 }}>{me?.roomNo || "—"} / {me?.bedNo || "—"}</div>
        </div>

        <div className="tpay-kpi" style={card}>
          <div style={{ color: "#6b7280", fontSize: 12 }}>Base Rent</div>
          <div style={{ fontWeight: 700 }}>
            <Money v={displayBaseRent} />
          </div>
        </div>

        <div className="tpay-kpi" style={card}>
          <div style={{ color: "#6b7280", fontSize: 12 }}>Total Due</div>
          <div style={{ fontWeight: 700 }}>
            <Money v={totalDue} />
          </div>
        </div>

        <div className="tpay-kpi" style={card}>
          <div style={{ color: "#6b7280", fontSize: 12 }}>Current Month</div>
          <div style={{ fontWeight: 700, color: currentMonthState.color }}>
            {currentMonthState.label}
          </div>
        </div>
      </div>

      {/* Pending months quick-pick */}
      <section className="tpay-panel tpay-outstanding" style={card}>
        <div className="tpay-section-title">Outstanding months</div>
        {pendingMonths.length ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {pendingMonths.map(({ m, y }) => {
              const active = selMonth === m && selYear === y;
              return (
                <button
                  key={`${m}-${y}`}
                  onClick={() => {
                    setSelMonth(m);
                    setSelYear(y);
                    const pending = pendingMonths.find((item) => item.m === m && item.y === y);
                    if (pending?.amount > 0) setAmount(String(pending.amount));
                  }}
                  className={`btn-chip ${active ? "btn-chip--active" : ""}`}
                  title={`Select ${fmtMonthYear(m, y)}`}
                >
                  <span style={{ color: "#0b1220" }}>{fmtMonthYear(m, y)}</span>
                </button>
              );
            })}
          </div>
        ) : currentMonthState.label === "Not due yet" ? (
          <div style={{ color: "#6b7280" }}>
            Billing has not started yet for this tenant. The first payable month is already selected below.
          </div>
        ) : (
          <div style={{ color: "#6b7280" }}>No pending months for this year 🎉</div>
        )}
      </section>

      {/* Pay / Static QR + Month-Year */}
      <div className="two-col">
        <section className="tpay-panel tpay-upi" style={card}>
          <div className="tpay-section-title">Pay via UPI</div>

          <div className="actions-inline upi-payment-fields">
            <div className="upi-payment-field">
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Amount (₹)</div>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500"
                className="input"
                style={{ width: 180 }}
              />
            </div>

            <div className="upi-payment-field">
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Month</div>
              <select
                value={selMonth}
                onChange={(e) => setSelMonth(Number(e.target.value))}
                className="input"
                style={{ width: 140 }}
              >
                {MONTHS.map(m => <option key={m.n} value={m.n}>{m.label}</option>)}
              </select>
            </div>
            <div className="upi-payment-field">
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Year</div>
              <select
                value={selYear}
                onChange={(e) => setSelYear(Number(e.target.value))}
                className="input"
                style={{ width: 120 }}
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="upi-qr-section">
            <div className="upi-qr-preview">
            <img
              src={rents?.paymentQrUrl || qrUrl}
              alt={rents?.paymentQrUrl ? "Rent payment QR provided by property administrator" : "UPI payment QR"}
              className="qr-img"
            />
            </div>
            <div className="upi-qr-instructions">
              <strong>Pay securely with your UPI app</strong>
              <p>This QR code is static. Scan it, then enter the payment details below:</p>
              <div><span>Amount</span><b>{moneyINR(amount || 0)}</b></div>
              <div><span>Payment note</span><b>Hostel Rent {fmtMonthYear(selMonth, selYear)}</b></div>
              <small>After paying, submit the UTR / reference in the Report Payment form.</small>
            </div>
          </div>
        </section>

        <section className="tpay-panel tpay-report" style={card}>
          <div className="tpay-section-title">Report payment</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            After paying via UPI, select the month/year, paste your UTR / Reference ID and a short note.
          </div>

          {/* Amount */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Amount (₹)</div>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500"
              className="input"
            />
          </div>

          {/* Month & Year */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Month</div>
              <select value={selMonth} onChange={(e) => setSelMonth(Number(e.target.value))} className="input">
                {MONTHS.map(m => <option key={m.n} value={m.n}>{m.label}</option>)}
              </select>
            </div>
            <div style={{ width: 160 }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Year</div>
              <select value={selYear} onChange={(e) => setSelYear(Number(e.target.value))} className="input">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* UTR / Note */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>UTR / Ref</div>
            <input
              value={utr}
              onChange={(e) => setUTR(e.target.value)}
              placeholder="e.g., 2309XXXXXXXX"
              className="input"
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Note (optional)</div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={`Rent for ${fmtMonthYear(selMonth, selYear)}`}
              className="input"
            />
          </div>

          <button
            onClick={reportPayment}
            style={{ padding: "10px 14px", background: "#16a34a", color: "#fff", borderRadius: 10, border: 0, fontWeight: 700, cursor: "pointer", width: "100%" }}
          >
            Report Payment
          </button>
        </section>
      </div>

      {/* Receipts for payments recorded by the property administrator */}
      <section className="tpay-panel tpay-receipts" style={card}>
        <div className="tpay-section-title">Rent receipts</div>
        {rentReceipts.length ? (
          <div className="tenant-rent-receipts">
            {rentReceipts.map((entry) => (
              <div className="tenant-rent-receipt-row" key={entry.key}>
                <div><strong>{entry.rent?.month || "Rent payment"}</strong><small>{entry.date ? new Date(entry.date).toLocaleString("en-IN") : "Date not recorded"}</small></div>
                <div className="receipt-row-amount"><strong>{moneyINR(entry.amount)}</strong><small>{entry.payment?.paymentMode || "Payment"}</small></div>
                <button type="button" className="tenant-rent-receipt-open" onClick={() => setSelectedReceipt(entry)}>View receipt</button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "#6b7280", fontSize: 13 }}>Receipts will appear here after your rent payment is recorded.</div>
        )}
      </section>

      {/* My payment reports */}
      <section className="tpay-panel tpay-reports" style={card}>
        <div className="tpay-section-title">My payment reports</div>
        {myPays?.length ? (
          <div className="table-wrap" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#6b7280" }}>
                  <th style={{ padding: 8 }}>Reported At</th>
                  <th style={{ padding: 8 }}>For Month</th>
                  <th style={{ padding: 8 }}>Amount</th>
                  <th style={{ padding: 8 }}>UTR</th>
                  <th style={{ padding: 8 }}>Note</th>
                  <th style={{ padding: 8 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...myPays]
                  .sort((a, b) => {
                    const ay = Number(a.year || 0), by = Number(b.year || 0);
                    if (ay !== by) return by - ay;
                    const am = Number(a.month || 0), bm = Number(b.month || 0);
                    if (am !== bm) return bm - am;
                    return new Date(b.createdAt) - new Date(a.createdAt);
                  })
                  .map((p) => (
                  <tr key={p._id} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td data-label="Reported at" style={{ padding: 8 }}>{new Date(p.createdAt).toLocaleString()}</td>
                    <td data-label="For month" style={{ padding: 8 }}>{fmtMonthYear(p.month, p.year)}</td>
                    <td data-label="Amount" style={{ padding: 8 }}><Money v={p.amount} /></td>
                    <td data-label="UTR" style={{ padding: 8 }}>{p.utr || "—"}</td>
                    <td data-label="Note" style={{ padding: 8 }}>{p.note || "—"}</td>
                    <td data-label="Status" style={{ padding: 8, fontWeight: 700 }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 12,
                          background:
                            p.status === "confirmed" ? "rgba(22,163,74,.1)"
                            : p.status === "rejected" ? "rgba(239,68,68,.1)"
                            : "rgba(245,158,11,.1)",
                          color:
                            p.status === "confirmed" ? "#166534"
                            : p.status === "rejected" ? "#991b1b"
                            : "#92400e",
                        }}
                      >
                        {p.status}
                      </span>
                      {p.status === "rejected" && (
                        <div className="tenant-payment-review-message">
                          {p.reviewMessage || "This payment report was rejected. Please review the amount, month, and UTR, then submit the payment report again."}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ color: "#6b7280" }}>No payments yet.</div>
        )}
      </section>

      {selectedReceipt && (
        <div className="tenant-receipt-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedReceipt(null); }}>
          <section id="tenant-payment-receipt" className="tenant-receipt-modal" role="dialog" aria-modal="true" aria-labelledby="tenant-receipt-title">
            <header className="tenant-receipt-modal-head">
              <h4 id="tenant-receipt-title"><FaReceipt className="me-2" />Payment receipt</h4>
              <button type="button" className="tenant-receipt-close" onClick={() => setSelectedReceipt(null)} aria-label="Close receipt">×</button>
            </header>
            <div className="tenant-receipt-modal-body">
              <div className="tenant-receipt-card">
                <div className="tenant-receipt-brand">{me?.category || "Rent Management"}</div>
                <div className="tenant-receipt-type">Rent payment receipt</div>
                <div className="tenant-receipt-meta">
                  <span>Receipt: R-{String(me?.srNo || "0").padStart(4, "0")}-{String(selectedReceipt.rent?._id || selectedReceipt.rent?.month || "payment").slice(-6).toUpperCase()}-{selectedReceipt.index + 1}</span>
                  <span>Date: {selectedReceipt.date ? new Date(selectedReceipt.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
                </div>
                <div className="tenant-receipt-amount">Rs. {selectedReceipt.amount.toLocaleString("en-IN")}</div>
                {[
                  ["Received from", me?.name || "Tenant"],
                  ["Rent month", selectedReceipt.rent?.month || "—"],
                  ["Unit", me?.propertyType === "shop" ? `Shop ${me?.roomNo || "—"}` : `Room ${me?.roomNo || "—"}${me?.bedNo ? ` / Bed ${me.bedNo}` : ""}`],
                  ["Payment mode", selectedReceipt.payment?.paymentMode || "Cash"],
                  ["Reference", selectedReceipt.payment?.utr],
                  ["Note", selectedReceipt.payment?.note || selectedReceipt.rent?.note],
                ].filter(([, value]) => value).map(([label, value]) => (
                  <div className="tenant-receipt-detail" key={label}><span>{label}</span><strong>{value}</strong></div>
                ))}
                {selectedUploadedReceiptUrl && <div className="tenant-receipt-detail"><span>Original receipt</span><a className="tenant-receipt-original" href={selectedUploadedReceiptUrl} target="_blank" rel="noreferrer">View uploaded file</a></div>}
                <div className="tenant-receipt-footer">Computer-generated receipt. No signature is required.</div>
              </div>
            </div>
            <footer className="tenant-receipt-actions">
              <button type="button" className="tenant-receipt-print" onClick={() => window.print()}>🖨 &nbsp; Print</button>
              <button type="button" className="tenant-receipt-share" onClick={shareReceipt}>↗ &nbsp; Share</button>
              <button type="button" className="tenant-receipt-close-action" onClick={() => setSelectedReceipt(null)}>Close</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
