import React, { useMemo, useState } from "react";
import "./TenantRent.css";

const Money = ({ value = 0 }) => <>₹{Number(value || 0).toLocaleString("en-IN")}</>;

export default function TenantRent({ rents, joiningDate }) {
  const currentYear = rents?.currentYear || new Date().getFullYear();
  const tenantStartDate = joiningDate ? new Date(joiningDate) : null;
  const tenantStartYear = tenantStartDate && !Number.isNaN(tenantStartDate.getTime()) ? tenantStartDate.getFullYear() : null;
  const availableYears = useMemo(() => {
    const years = new Set();
    const firstYear = tenantStartYear ?? Number(currentYear);
    for (let year = firstYear; year <= Number(currentYear); year += 1) years.add(year);
    (rents?.rents || []).forEach((entry) => {
      if (!entry?.date) return;
      const date = new Date(entry.date);
      if (!Number.isNaN(date.getTime())) years.add(date.getFullYear());
    });
    return [...years].sort((a, b) => b - a);
  }, [currentYear, rents?.rents, tenantStartYear]);
  const [selectedYear, setSelectedYear] = useState(null);
  const year = availableYears.includes(selectedYear) ? selectedYear : Number(currentYear);
  const now = new Date();
  const firstMonth = tenantStartYear === year ? tenantStartDate.getMonth() : 0;
  const months = Array.from({ length: 12 - firstMonth }, (_, offset) => {
    const index = firstMonth + offset;
    const firstOfMonth = new Date(year, index, 1);
    const record = rents?.rents?.find((entry) => {
      if (!entry?.date) return false;
      const date = new Date(entry.date);
      return date.getMonth() === index && date.getFullYear() === year;
    });
    const status = record ? "paid" : firstOfMonth > now ? "upcoming" : "pending";
    return {
      key: index,
      month: firstOfMonth.toLocaleString("en", { month: "long" }),
      date: record ? new Date(record.date).toLocaleDateString("en-GB") : "—",
      mode: record ? record.paymentMode || "Cash" : "—",
      amount: record ? <Money value={record.rentAmount} /> : "—",
      status,
      statusLabel: status === "paid" ? "Paid" : status === "upcoming" ? "Upcoming" : "Pending",
    };
  });
  const counts = months.reduce((total, month) => {
    total[month.status] += 1;
    return total;
  }, { paid: 0, pending: 0, upcoming: 0 });

  return (
    <main className="tenant-rent-page">
      <section className="tenant-rent-heading">
        <div>
          <span className="tenant-rent-eyebrow">RENT</span>
          <h1>Rent history</h1>
          <p>See your rent status by month for {year}.</p>
        </div>
        <label className="tenant-rent-year-select">
          <span>Year</span>
          <select value={year} onChange={(event) => setSelectedYear(Number(event.target.value))} aria-label="Select rent year">
            {availableYears.map((optionYear) => <option key={optionYear} value={optionYear}>{optionYear}</option>)}
          </select>
        </label>
      </section>

      <section className="tenant-rent-summary" aria-label="Yearly rent summary">
        <article className="tenant-rent-summary-card tenant-rent-summary-paid">
          <span>Paid months</span><strong>{counts.paid}</strong>
        </article>
        <article className="tenant-rent-summary-card tenant-rent-summary-pending">
          <span>Pending months</span><strong>{counts.pending}</strong>
        </article>
        <article className="tenant-rent-summary-card tenant-rent-summary-upcoming">
          <span>Upcoming months</span><strong>{counts.upcoming}</strong>
        </article>
      </section>

      <section className="tenant-rent-card">
        <header className="tenant-rent-card-header">
          <div><h2>Monthly rent</h2><p>Paid, pending, and upcoming months</p></div>
          <span className="tenant-rent-year-badge">{year}</span>
        </header>
        <div className="tenant-rent-table-wrap">
          <table className="tenant-rent-table">
            <thead><tr><th scope="col">Month</th><th scope="col">Date</th><th scope="col">Mode</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.key}>
                  <td data-label="Month"><strong>{month.month}</strong></td>
                  <td data-label="Date">{month.date}</td>
                  <td data-label="Mode">{month.mode}</td>
                  <td data-label="Amount" className="tenant-rent-amount">{month.amount}</td>
                  <td data-label="Status"><span className={`tenant-rent-status tenant-rent-status-${month.status}`}>{month.statusLabel}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
