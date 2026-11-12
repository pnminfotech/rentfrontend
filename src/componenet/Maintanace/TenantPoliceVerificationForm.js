import React, { useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { API_ORIGIN } from "../../api";
import { getDocHref } from "../../utils/getDocHref";
import "./TenantPoliceVerificationForm.css";

const blank = "____________________________________________";
const valueOrBlank = (value) => String(value ?? "").trim() || blank;

function formatDate(value) {
  if (!value) return blank;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? valueOrBlank(value)
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getAge(value) {
  if (!value) return blank;
  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) return blank;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? String(age) : blank;
}

function joinedAddress(tenant) {
  return [tenant?.address, tenant?.houseNo, tenant?.city, tenant?.state, tenant?.pincode, tenant?.nearbyPlace]
    .filter(Boolean)
    .join(", ");
}

function getPhotoUrl(photo) {
  if (!photo) return "";
  const href = getDocHref({ ...photo, url: photo.url || photo.fileUrl || photo.filePath || photo.path });
  return href === "#" ? "" : href;
}

function FormRow({ number, labelMr, labelEn, children, className = "" }) {
  return (
    <div className={`pvr-row ${className}`}>
      <div className="pvr-row-number">{number || ""}</div>
      <div className="pvr-row-label"><strong>{labelMr}</strong>{labelEn && <span>{labelEn}</span>}</div>
      <div className="pvr-row-value">{children || blank}</div>
    </div>
  );
}

export default function TenantPoliceVerificationForm({ tenant }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const documents = Array.isArray(tenant?.documents) ? tenant.documents : [];
  const photo = documents.find((doc) => /tenant\s*photo|photograph|selfie/i.test(String(doc?.relation || "")));
  const photoUrl = getPhotoUrl(photo);
  const family = Array.isArray(tenant?.otherFamilyMembers) ? tenant.otherFamilyMembers : [];
  const references = [
    { name: tenant?.relative1Name, address: tenant?.relativeAddress1, phone: tenant?.relative1Phone },
    { name: tenant?.relative2Name, address: tenant?.relativeAddress2, phone: tenant?.relative2Phone },
  ];
  const propertyLabel = tenant?.propertyType === "shop" || tenant?.trackerType === "shop" ? "Shop" : "Room";

  const downloadPdf = async () => {
    if (downloading) return;
    const source = document.querySelector(".pvr-root .pvr-print-root");
    if (!source) return;

    setDownloading(true);
    setDownloadError("");
    const exportHost = document.createElement("div");
    exportHost.className = "pvr-pdf-export-host";
    exportHost.appendChild(source.cloneNode(true));
    document.body.appendChild(exportHost);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const pages = Array.from(exportHost.querySelectorAll(".pvr-page"));
      await Promise.all(pages.flatMap((page) => Array.from(page.querySelectorAll("img")).map(async (image) => {
        if (image.complete && image.naturalWidth > 0) return;
        await new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
          window.setTimeout(resolve, 2500);
        });
      })));
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      let hasPdfPage = false;
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        const overflowRatio = page.scrollHeight > page.clientHeight ? page.clientHeight / page.scrollHeight : 1;
        if (overflowRatio < 1) page.style.zoom = String(overflowRatio);
        const canvas = await html2canvas(pages[index], {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          logging: false,
          backgroundColor: "#ffffff",
          windowWidth: pages[index].scrollWidth,
          windowHeight: pages[index].scrollHeight,
        });
        if (!canvas.width || !canvas.height) throw new Error("The form page could not be rendered.");
        const ratio = Math.min(pdfWidth / canvas.width, pdfHeight / canvas.height);
        const imageWidth = canvas.width * ratio;
        const imageHeight = canvas.height * ratio;
        if (hasPdfPage) pdf.addPage();
        const pageImage = canvas.toDataURL("image/jpeg", 0.96);
        if (!pageImage || pageImage === "data:,") throw new Error("The form page could not be encoded.");
        pdf.addImage(pageImage, "JPEG", (pdfWidth - imageWidth) / 2, 0, imageWidth, imageHeight, undefined, "FAST");
        hasPdfPage = true;
      }

      const documentPages = await Promise.all(documents.map(async (doc, index) => {
        const href = getPhotoUrl(doc);
        if (!href) return null;
        try {
          const isBackendFile = href.startsWith(`${API_ORIGIN}/`);
          const token = isBackendFile ? window.localStorage.getItem("authToken") : "";
          const response = await fetch(href, {
            mode: "cors",
            ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const isImage = blob.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/i.test(String(doc.fileName || href));
          if (!isImage) return null;
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          return { dataUrl };
        } catch (error) {
          console.warn(`Unable to include tenant document ${index + 1} (${doc.fileName || doc.relation || "document"}) in PDF:`, error);
          return null;
        }
      }));

      const failedDocumentCount = documents.length - documentPages.filter(Boolean).length;

      for (const doc of documentPages.filter(Boolean)) {
        const image = new Image();
        image.src = doc.dataUrl;
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
        });

        const pageMargin = 10;
        const titleHeight = 0;
        const availableWidth = pdfWidth - pageMargin * 2;
        const availableHeight = pdfHeight - pageMargin * 2 - titleHeight;
        const scale = Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight);
        const imageWidth = image.naturalWidth * scale;
        const imageHeight = image.naturalHeight * scale;
        const imageCanvas = document.createElement("canvas");
        imageCanvas.width = image.naturalWidth;
        imageCanvas.height = image.naturalHeight;
        imageCanvas.getContext("2d").drawImage(image, 0, 0);
        pdf.addPage();
        pdf.addImage(imageCanvas.toDataURL("image/jpeg", 0.96), "JPEG", (pdfWidth - imageWidth) / 2, pageMargin + titleHeight, imageWidth, imageHeight, undefined, "FAST");
        hasPdfPage = true;
      }

      if (!hasPdfPage) throw new Error("No PDF pages were generated.");
      if (failedDocumentCount > 0) {
        setDownloadError(`${failedDocumentCount} of ${documents.length} uploaded document(s) could not be added. Check that the files are image documents and accessible, then try again.`);
      }
      const safeName = String(tenant?.name || "Tenant").replace(/[\\/:*?"<>|]+/g, "_").trim();
      pdf.save(`Tenant_Verification_${safeName || tenant?.srNo || "Form"}.pdf`);
    } catch (error) {
      console.error("Police verification PDF download failed:", error);
      setDownloadError("PDF download failed. Please try again or use Print / Save PDF.");
    } finally {
      exportHost.remove();
      setDownloading(false);
    }
  };

  return (
    <div className="pvr-root">
      <div className="pvr-toolbar">
        <div><strong>Tenant Verification Form</strong><span>{tenant?.name || "Tenant"}</span></div>
        <div className="pvr-toolbar-actions">
          {/* <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => window.print()}>Print</button> */}
          <button type="button" className="btn btn-primary btn-sm" disabled={downloading} onClick={downloadPdf}>{downloading ? "Preparing PDF…" : "Download PDF"}</button>
        </div>
      </div>
      {downloadError && <div className="alert alert-danger py-2 mb-3" role="alert">{downloadError}</div>}

      <div className="pvr-print-root">
        <section className="pvr-page">
          <header className="pvr-heading">
            <div className="pvr-form-caption">प्रपत्र - १ <span>FORM - 1</span></div>
            <h1>भाडेकरू माहितीचा फॉर्म</h1>
            <h2>TENANT INFORMATION FORM</h2>
            <div className="pvr-station-row"><span>पोलीस स्टेशन / Police Station: ______________________</span><span>फॉर्म क्र. / Form No.: {valueOrBlank(tenant?.srNo)}</span></div>
          </header>

          <div className="pvr-photo-row">
            <div className="pvr-photo-box"><span>घर मालकाचा फोटो<br />PROPERTY OWNER PHOTO</span></div>
            <div className="pvr-photo-box">{photoUrl ? <img src={photoUrl} alt="Tenant" /> : <span>भाडेकरूचा फोटो<br />TENANT PHOTO</span>}</div>
          </div>

          <div className="pvr-table">
            <FormRow number="१." labelMr="घर मालकाचे संपूर्ण नाव, वय व पत्ता (राज्यासह) मोबाईल नं. सह" labelEn="Name, age, address and mobile no. of owner">
              {valueOrBlank(tenant?.ownerName || tenant?.propertyOwnerName)} · Age: {valueOrBlank(tenant?.ownerAge)} · {valueOrBlank(tenant?.ownerAddress)} · Mobile: {valueOrBlank(tenant?.ownerPhone)}
            </FormRow>
            <FormRow number="२." labelMr="भाडेकरूचे संपूर्ण नाव, वय व पत्ता (राज्यासह) मोबाईल नं. सह" labelEn="Name, age, address and mobile no. of tenant">
              {valueOrBlank(tenant?.name)} · Age: {getAge(tenant?.dob)} · {valueOrBlank(joinedAddress(tenant))} · Mobile: {valueOrBlank(tenant?.phoneNo)}
              <div className="pvr-id-lines">Passport No.: {valueOrBlank(tenant?.passportNo)}<br />PAN Card No.: {valueOrBlank(tenant?.panCardNo)}<br />Aadhaar Card No.: {valueOrBlank(tenant?.aadhaarCardNo)}</div>
            </FormRow>
            <FormRow number="३." labelMr="भाडेकरू यापूर्वी राहत असलेला पत्ता" labelEn="Previous address of tenant">{valueOrBlank(tenant?.previousAddress)}</FormRow>
            <FormRow number="४." labelMr="भाडेकरूचा कायमचा पत्ता" labelEn="Permanent address of tenant">{valueOrBlank(tenant?.permanentAddress || joinedAddress(tenant))}</FormRow>
            <FormRow number="५." labelMr="परिवारातील सदस्यांची संख्या" labelEn="Number of family members" className="pvr-family-row">
              <div className="pvr-family-counts">
                <span><b>पुरुष / Male</b>{valueOrBlank(tenant?.familyMale)}</span>
                <span><b>स्त्रिया / Female</b>{valueOrBlank(tenant?.familyFemale)}</span>
                <span><b>लहान मुले / Children</b>{valueOrBlank(tenant?.familyChildren)}</span>
              </div>
              <div className="pvr-family-total">Total: {valueOrBlank(tenant?.familyMembers)}</div>
              {family.length > 0 && <div className="pvr-family-list">{family.map((member, index) => <div key={`family-${index}`}>{index + 1}. {valueOrBlank(member.name)} · Age: {valueOrBlank(member.age)} · {valueOrBlank(member.occupation)} · Mobile: {valueOrBlank(member.phone)}</div>)}</div>}
            </FormRow>
            <FormRow number="६." labelMr="कामाचे स्वरूप" labelEn="Nature of work">{valueOrBlank(tenant?.natureOfWork)}</FormRow>
          </div>
          <footer className="pvr-page-footer">Tenant verification record · {tenant?.name || ""}</footer>
        </section>

        <section className="pvr-page pvr-page-two">
          <header className="pvr-heading pvr-continuation-heading">
            <div className="pvr-form-caption">प्रपत्र - २ <span>FORM - 2</span></div>
            <h1>भाडेकरू माहितीचा फॉर्म</h1>
            <h2>TENANT INFORMATION FORM · CONTINUED</h2>
            <div className="pvr-station-row"><span>भाडेकरू / Tenant: {valueOrBlank(tenant?.name)}</span><span>फॉर्म क्र. / Form No.: {valueOrBlank(tenant?.srNo)}</span></div>
          </header>

          <div className="pvr-table">
            <FormRow number="७." labelMr="कार्यालयाचे संपूर्ण नाव, पत्ता व मोबाईल नं." labelEn="Office name, address and telephone / mobile no.">
              {valueOrBlank(tenant?.officeName)} · {valueOrBlank(tenant?.officeAddress || tenant?.companyAddress)} · Mobile: {valueOrBlank(tenant?.officeMobileNo)}
            </FormRow>
            <FormRow number="८." labelMr="भाडेकरूस ओळखणाऱ्या दोन व्यक्तींचे संपूर्ण नाव, पत्ता व मोबाईल नं." labelEn="References: names, addresses and mobile numbers">
              {references.map((reference, index) => <div className="pvr-reference" key={`reference-${index}`}><b>Reference {index + 1}</b> · {valueOrBlank(reference.name)} · {valueOrBlank(reference.address)} · Mobile: {valueOrBlank(reference.phone)}</div>)}
            </FormRow>
            <FormRow number="९." labelMr="एजंटचे संपूर्ण नाव, पत्ता व मोबाईल नं." labelEn="Name of agent, address and mobile no.">
              {valueOrBlank(tenant?.agentName)} · {valueOrBlank(tenant?.agentAddress)} · Mobile: {valueOrBlank(tenant?.agentPhone)}
            </FormRow>
            <FormRow number="१०." labelMr="करार केल्याचा दिनांक व कराराचा कालावधी" labelEn="Date and period of agreement">
              Date: {formatDate(tenant?.agreementStartDate || tenant?.joiningDate)} · Period: {valueOrBlank(tenant?.agreementPeriod)}
            </FormRow>
            <FormRow number="११." labelMr="करार संपण्याचा दिनांक" labelEn="Date of maturity of agreement">
              {formatDate(tenant?.agreementEndDate || tenant?.agreementMaturityDate)}
            </FormRow>
          </div>

          <div className="pvr-admission-details">
            <h3>Admission details</h3>
            <div className="pvr-admission-grid">
              <div><b>Property / Unit</b><span>{propertyLabel}: {valueOrBlank(tenant?.roomNo)} · {valueOrBlank(tenant?.category)} · Wing: {valueOrBlank(tenant?.wingName)} · Floor: {valueOrBlank(tenant?.floorNo)}</span></div>
              <div><b>Dates</b><span>Joined: {formatDate(tenant?.joiningDate)} · DOB: {formatDate(tenant?.dob)} · College / company: {formatDate(tenant?.dateOfJoiningCollege)}</span></div>
              <div><b>Rent and deposit</b><span>Rent: {valueOrBlank(tenant?.rentAmount ?? tenant?.baseRent)} · Deposit: {valueOrBlank(tenant?.depositAmount)}</span></div>
              <div><b>Company / college</b><span>{valueOrBlank(tenant?.companyAddress)}</span></div>
              {(tenant?.propertyType === "shop" || tenant?.trackerType === "shop") && <div><b>Shop details</b><span>{valueOrBlank(tenant?.shopName)} · {valueOrBlank(tenant?.shopBusiness)}</span></div>}
            </div>
          </div>

          <div className="pvr-signatures"><div>घर मालकाची सही<br /><span>Signature of Owner</span><i /></div><div>भाडेकरूची सही<br /><span>Signature of Tenant</span><i /></div></div>
          <div className="pvr-declaration"><strong>घोषणा / Declaration:</strong> वरील भरून दिलेली माहिती खरी आहे. चुकीची माहिती आढळल्यास कायदेशीर कार्यवाहीस पात्र राहीन.<br />I declare that the information provided above is true and correct. I shall be liable for legal action if any information is incorrect.</div>
          <div className="pvr-note">टीप / Note: This information is collected for police records and must not be used for any other purpose.</div>
          <footer className="pvr-page-footer">Tenant verification record · {tenant?.name || ""}</footer>
        </section>
      </div>
    </div>
  );
}
