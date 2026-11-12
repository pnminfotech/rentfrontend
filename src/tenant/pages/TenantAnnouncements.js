import { FiBell, FiCalendar } from "react-icons/fi";

function announcementDate(item) {
  const value = item?.createdAt || item?.date || item?.publishedAt;
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function TenantAnnouncements({ ann = [] }) {
  const items = Array.isArray(ann) ? ann : [];

  return (
    <section className="tenant-announcements-page">
      <div className="tenant-announcements-intro">
        <span className="tenant-announcements-icon"><FiBell /></span>
        <div>
          <h1>Announcements</h1>
          <p>Updates and important notices from your property administrator.</p>
        </div>
      </div>

      {items.length ? (
        <div className="tenant-announcements-list">
          {items.map((item, index) => (
            <article className="tenant-announcement-card" key={item?._id || item?.id || index}>
              <div className="tenant-announcement-card-top">
                <h2>{item?.title || item?.subject || "Property update"}</h2>
                {announcementDate(item) && <span><FiCalendar /> {announcementDate(item)}</span>}
              </div>
              <p>{item?.message || item?.body || item?.content || "No details provided."}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="tenant-announcements-empty">
          <span><FiBell /></span>
          <h2>You’re all caught up</h2>
          <p>There are no announcements right now. New notices from your property will appear here.</p>
        </div>
      )}
    </section>
  );
}
