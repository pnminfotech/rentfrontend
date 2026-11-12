import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FiBell, FiCalendar, FiCreditCard, FiFileText, FiHelpCircle,
  FiHome, FiLogOut, FiMenu, FiUser, FiX, FiDollarSign,
} from "react-icons/fi";
import { clearToken, API, tenantHttp } from "../tenantApi";
import "./TenantShell.css";

const navigation = [
  { label: "Home", path: "/tenant/home", icon: FiHome },
  { label: "Pay Rent", path: "/tenant/payments", icon: FiCreditCard },
  { label: "Rent History", path: "/tenant/rent", icon: FiDollarSign },
  { label: "My Documents", path: "/tenant/documents", icon: FiFileText },
  // Announcements are temporarily hidden; restore this entry when the feature is ready.
  // { label: "Announcements", path: "/tenant/announcements", icon: FiBell },
  { label: "Move-out Request", path: "/tenant/leave", icon: FiCalendar },
  { label: "Late Entry", path: "/tenant/attendance", icon: FiCalendar },
  // Temporarily hidden; restore these entries when the features are ready.
  // { label: "eKYC", path: "/tenant/ekyc", icon: FiUser },
  // { label: "Police verification", path: "/tenant/police-verification", icon: FiShield },
  { label: "Help & Support", path: "/tenant/support", icon: FiHelpCircle },
];

function fullImageUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${API}${url}`;
}

export default function TenantShell({ me, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paymentNotifications, setPaymentNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const activeItem = navigation.find((item) => location.pathname === item.path) || navigation[0];
  const avatar = fullImageUrl(me?.avatarUrl);
  const initials = String(me?.name || "Tenant").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  useEffect(() => {
    setMenuOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    const loadPaymentNotifications = async () => {
      try {
        const { data } = await tenantHttp.get("/tenant/payments/my");
        if (!active) return;
        const finalReviews = (Array.isArray(data) ? data : [])
          .filter((payment) => ["confirmed", "rejected"].includes(payment?.status) && !payment?.tenantReadAt)
          .sort((a, b) => new Date(b.reviewedAt || b.updatedAt || b.createdAt) - new Date(a.reviewedAt || a.updatedAt || a.createdAt));
        setPaymentNotifications(finalReviews);
      } catch {
        if (active) setPaymentNotifications([]);
      }
    };

    loadPaymentNotifications();
    const intervalId = window.setInterval(loadPaymentNotifications, 30000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const logout = () => {
    clearToken();
    onLogout?.();
    navigate("/login", { replace: true });
  };

  const unreadPaymentNotifications = paymentNotifications.filter((payment) => !payment.tenantReadAt);
  const markAllPaymentNotificationsRead = async () => {
    if (markingAllRead || unreadPaymentNotifications.length === 0) return;
    setMarkingAllRead(true);
    try {
      await tenantHttp.patch("/tenant/payments/read-all");
      setPaymentNotifications([]);
    } catch (error) {
      console.error("Could not mark payment notifications as read:", error?.response?.data?.message || error.message);
    } finally {
      setMarkingAllRead(false);
    }
  };
  const openPaymentNotification = async (payment) => {
    setNotificationsOpen(false);
    if (!payment.tenantReadAt) {
      try {
        await tenantHttp.patch(`/tenant/payments/${payment._id}/read`);
        const readAt = new Date().toISOString();
        setPaymentNotifications((current) => current.map((item) =>
          item._id === payment._id ? { ...item, tenantReadAt: readAt } : item
        ).filter((item) => !item.tenantReadAt));
      } catch {
        // Keep the notification visible if marking it read fails.
      }
    }
    navigate("/tenant/payments");
  };

  const paymentMonthLabel = (payment) => {
    if (!payment?.month || !payment?.year) return "Payment report";
    return new Date(Number(payment.year), Number(payment.month) - 1, 1)
      .toLocaleString("en-IN", { month: "long", year: "numeric" });
  };

  return (
    <div className="tenant-portal">
      {menuOpen && <button className="tenant-sidebar-overlay" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}

      <aside className={`tenant-sidebar${menuOpen ? " is-open" : ""}`} aria-label="Tenant navigation">
        <div className="tenant-brand">
          <span className="tenant-brand-mark"><FiHome /></span>
          <span><strong>Rent Manager</strong><small>Tenant portal</small></span>
          <button className="tenant-sidebar-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}><FiX /></button>
        </div>

        <button className="tenant-profile-tile" onClick={() => navigate("/tenant/profile")}>
          <span className="tenant-avatar">
            {avatar ? <img src={avatar} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
            <span>{initials}</span>
          </span>
          <span className="tenant-profile-copy">
            <strong>{me?.name || "Tenant"}</strong>
            <small>{me?.roomNo ? `Room ${me.roomNo}` : me?.propertyType === "shop" ? "Commercial unit" : "Tenant account"}{me?.bedNo ? ` · Bed ${me.bedNo}` : ""}</small>
          </span>
          <FiUser className="tenant-profile-arrow" />
        </button>

        <div className="tenant-nav-heading">MENU</div>
        <nav className="tenant-nav">
          {navigation.map(({ label, path, icon: Icon }) => (
            <NavLink key={path} to={path} end={path === "/tenant/home"} className={({ isActive }) => `tenant-nav-link${isActive ? " is-active" : ""}`}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="tenant-sidebar-footer">
          <div className="tenant-help-card"><span className="tenant-help-icon"><FiHelpCircle /></span><span><strong>Need assistance?</strong><small>Our team can help you.</small></span><button aria-label="Open support" onClick={() => navigate("/tenant/support")}>›</button></div>
          <button className="tenant-logout" onClick={logout}><FiLogOut /><span>Sign out</span></button>
          <small className="tenant-sidebar-version">Secure tenant access</small>
        </div>
      </aside>

      <main className="tenant-main">
        <header className="tenant-topbar">
          <button className="tenant-menu-trigger" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><FiMenu /></button>
          <div className="tenant-page-heading"><span>Tenant portal</span><strong>{activeItem.label}</strong></div>
          <div className="tenant-notifications-wrap">
            <button
              type="button"
              className="tenant-notification-trigger"
              aria-label={`Payment notifications${unreadPaymentNotifications.length ? `, ${unreadPaymentNotifications.length} unread` : ""}`}
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <FiBell />
              {unreadPaymentNotifications.length > 0 && (
                <span className="tenant-notification-count">
                  {unreadPaymentNotifications.length > 9 ? "9+" : unreadPaymentNotifications.length}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <section className="tenant-notifications-menu" aria-label="Payment notifications">
                <div className="tenant-notifications-menu-header">
                  <strong>Payment updates</strong>
                  <div className="tenant-notifications-header-actions">
                    {unreadPaymentNotifications.length > 0 && <span>{unreadPaymentNotifications.length} new</span>}
                    <button
                      type="button"
                      className="tenant-notifications-read-all"
                      onClick={markAllPaymentNotificationsRead}
                      disabled={markingAllRead || unreadPaymentNotifications.length === 0}
                    >
                      {markingAllRead ? "Marking…" : "Read all"}
                    </button>
                  </div>
                </div>
                {paymentNotifications.length ? (
                  <div className="tenant-notifications-list">
                    {paymentNotifications.slice(0, 8).map((payment) => {
                      const rejected = payment.status === "rejected";
                      const message = payment.reviewMessage || (rejected
                        ? "Your payment report was rejected. Review the details and submit it again."
                        : "Your payment report was approved.");
                      return (
                        <button
                          type="button"
                          key={payment._id}
                          className={`tenant-payment-notification${payment.tenantReadAt ? " is-read" : " is-unread"}${rejected ? " is-rejected" : " is-approved"}`}
                          onClick={() => openPaymentNotification(payment)}
                        >
                          <span className="tenant-payment-notification-status">{rejected ? "Rejected" : "Approved"}</span>
                          <strong>{paymentMonthLabel(payment)} · ₹{Number(payment.amount || 0).toLocaleString("en-IN")}</strong>
                          <span>{message}</span>
                          <small>{new Date(payment.reviewedAt || payment.updatedAt || payment.createdAt).toLocaleString("en-IN")}</small>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="tenant-notifications-empty">No payment updates yet.</p>
                )}
                <button
                  type="button"
                  className="tenant-notifications-view-all"
                  onClick={() => { setNotificationsOpen(false); navigate("/tenant/payments"); }}
                >
                  View payment reports
                </button>
              </section>
            )}
          </div>
          <button className="tenant-topbar-user" onClick={() => navigate("/tenant/profile")} aria-label="Open profile">
            <span className="tenant-topbar-avatar">{initials}</span><span><strong>{me?.name || "Tenant"}</strong><small>My account</small></span><FiUser />
          </button>
        </header>
        <div className="tenant-content"><Outlet /></div>
      </main>
    </div>
  );
}
