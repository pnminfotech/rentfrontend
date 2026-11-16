import { FiBarChart2 } from "react-icons/fi";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSignOutAlt } from "@fortawesome/free-solid-svg-icons";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { clearAuthSession } from "../authStorage";
import { getAppBootstrap, getSystemDashboard } from "../saasApi";
import { api } from "../api";
import { useDashboardMenuItems } from "./dashboardMenuItems";
import { allowedUnitTypes } from "../utils/subscriptionAccess";
import {
  Bell,
  BedDouble,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  FileBarChart,
  Search,
  UserPlus,
  CreditCard,
  ArrowLeftRight,
  Wrench,
  Zap,
  AlertCircle,
  Building2,
  Layers3,
  MessageCircle,
  Mail,
  Share2,
  Utensils,
  Users,
  FileText,
} from "lucide-react";
import "./MainDashboard.css";
import hostelWelcomeImage from "../assets/hostel-welcome.png";
const COLORS = [
  "#1e3a8a",
  "#FBBF24",
  "#3B82F6",
  "#10B981",
  "#EF4444",
  "#6366F1",
];

const MainDashboard = () => {
  const navigate = useNavigate();
  const [openSubmenu, setOpenSubmenu] = useState(null);
  const [enabledUnitTypes, setEnabledUnitTypes] = useState(null);



  const [summary, setSummary] = useState({
    rent: {},
    beds: {},
    light: {},
    maintenance: {},
  });

  const [currentTime, setCurrentTime] = useState(new Date());

  const menuItems = useDashboardMenuItems();

  useEffect(() => {
    let active = true;
    getAppBootstrap()
      .then((bootstrap) => {
        if (active) setEnabledUnitTypes(new Set(allowedUnitTypes(bootstrap).map((item) => item.value)));
      })
      .catch(() => {
        if (active) setEnabledUnitTypes(new Set());
      });
    return () => { active = false; };
  }, []);

  const hasUnitType = (type) => Boolean(enabledUnitTypes?.has(type));

  const handleNavigation = (path, state) => navigate(path, state ? { state } : undefined);
  const toggleSubmenu = (label) => {
    setOpenSubmenu((current) => (current === label ? null : label));
  };

 const handleLogout = () => {
  clearAuthSession();
  navigate("/");
};

  const [showVacantModal, setShowVacantModal] = useState(false);
  const [showTotalModal, setShowTotalModal] = useState(false);
  const [vacantSummary, setVacantSummary] = useState({
    hostel: [],
    residential: [],
    shops: [],
    total: 0,
  });
  const [showFutureLeaveModal, setShowFutureLeaveModal] = useState(false);

  const [rooms, setRooms] = useState([]);
  const [commercialUnits, setCommercialUnits] = useState([]);
  const [tenantsState, setTenantsState] = useState([]);

  const [showPendingRentModal, setShowPendingRentModal] = useState(false);
  const [pendingRentList, setPendingRentList] = useState([]);

  // ------------------------ helpers ------------------------
  const toNum = (v) => {
    if (v === null || v === undefined) return 0;
    const n = Number(String(v).replace(/[,\u20B9\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const norm = (s) => String(s ?? "").trim().toLowerCase();

  const hasBed = (t) =>
    t?.bedNo !== null &&
    t?.bedNo !== undefined &&
    String(t.bedNo).trim() !== "";

  const hasRoom = (t) =>
    t?.roomNo !== null &&
    t?.roomNo !== undefined &&
    String(t.roomNo).trim() !== "";

  const normalizeRoomPropertyType = (room) => {
    const explicitType = String(room?.propertyType || room?.unitType || "")
      .trim()
      .toLowerCase();

    if (["bed", "room", "shop"].includes(explicitType)) {
      return explicitType;
    }

    const bedNos = Array.isArray(room?.beds)
      ? room.beds.map((bed) => String(bed?.bedNo || "").trim().toUpperCase())
      : [];

    if (bedNos.includes("SHOP-1")) return "shop";
    if (bedNos.includes("ROOM-1")) return "room";

    return "bed";
  };

  const getPrimaryUnitBedNo = (type) => (type === "shop" ? "SHOP-1" : "ROOM-1");

  const mapCommercialUnitToTrackerRoom = (unit) => ({
    _id: unit?._id,
    propertyType:
      String(unit?.unitType || "").trim().toLowerCase() === "shop"
        ? "shop"
        : "room",
    category: String(unit?.buildingName || unit?.category || "").trim(),
    commercialCategory: String(unit?.category || "").trim(),
    buildingName: String(unit?.buildingName || "").trim(),
    floorNo: String(unit?.floorNo || "").trim(),
    roomNo: String(unit?.unitNo || "").trim(),
    beds: [
      {
        bedNo: getPrimaryUnitBedNo(
          String(unit?.unitType || "").trim().toLowerCase() === "shop"
            ? "shop"
            : "room"
        ),
        bedCategory: "Primary",
        price: unit?.price ?? null,
      },
    ],
  });

  const getUnitIdentityKey = (unit, explicitType) => {
    const unitType = explicitType || normalizeRoomPropertyType(unit);
    const scope =
      unit?.commercialCategory || unit?.buildingName || unit?.category || "";
    return `${unitType}|${String(unit?.roomNo || unit?.unitNo || "").trim().toLowerCase()}|${String(scope).trim().toLowerCase()}`;
  };

  const findUnitForTenant = (tenant, units = []) => {
    const tenantCategory = String(tenant?.category || "").trim().toLowerCase();

    return (units || []).find((unit) => {
      const tenantRoomId = tenant?.roomId?._id || tenant?.roomId;
      if (tenantRoomId && String(unit?._id) === String(tenantRoomId)) {
        return true;
      }

      if (!tenant?.roomNo || String(unit?.roomNo) !== String(tenant.roomNo)) {
        return false;
      }

      if (!tenantCategory) return true;

      const unitCategories = [
        unit?.category,
        unit?.commercialCategory,
        unit?.buildingName,
      ]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean);

      return unitCategories.includes(tenantCategory);
    });
  };

  const isActiveTenant = (t) => {
    if (!t?.leaveDate) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const leave = new Date(t.leaveDate);
    leave.setHours(0, 0, 0, 0);
    return leave > today;
  };

  /**
   * âœ… Paid amount resolver (kept; useful if you add paidAmount later)
   * Your rent object doesn't have paidAmount; it only has rentAmount + paymentMode + date.
   */
  const getPaidAmt = (r, monthlyRent = 0) => {
    const explicit = toNum(
      r?.paidAmount ?? r?.amountPaid ?? r?.paid ?? r?.amount ?? 0
    );
    if (explicit > 0) return explicit;

    const status = norm(r?.status || r?.paymentStatus || r?.label || "");
    const hasPaymentProof =
      !!String(r?.paymentMode || "").trim() || status === "paid";

    if (hasPaymentProof) {
      return toNum(r?.rentAmount ?? monthlyRent ?? 0);
    }

    return 0;
  };

  const monthIdx = (mon) => {
    const key = String(mon || "").trim().slice(0, 3).toLowerCase();
    const arr = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const i = arr.indexOf(key);
    return i >= 0 ? i : null;
  };

  const getRentYM = (r) => {
    if (!r) return null;

    if (r.month) {
      const s = String(r.month).trim();

      if (/^\d{4}-\d{1,2}$/.test(s)) {
        const [yy, mm] = s.split("-").map(Number);
        return { y: yy, m: mm - 1 };
      }

      const parts = s.split("-");
      if (parts.length === 2) {
        const m = monthIdx(parts[0]);
        if (m !== null) {
          const yRaw = String(parts[1]).trim();
          const y = yRaw.length === 2 ? Number("20" + yRaw) : Number(yRaw);
          if (Number.isFinite(y)) return { y, m };
        }
      }
    }

    if (r.date) {
      const d = new Date(r.date);
      if (!isNaN(d)) return { y: d.getFullYear(), m: d.getMonth() };
    }

    return null;
  };

  // âœ… Monthly rent getter (baseRent -> rentAmount -> bed.price from rooms)
  const getMonthlyRent = (t, unitsArr = rooms) => {
    const direct = toNum(
      t?.baseRent ??
        t?.rentAmount ??
        t?.rent ??
        t?.expectedRent ??
        t?.defaultRent ??
        t?.monthlyRent ??
        0
    );
    if (direct > 0) return direct;

    const latestPaidRent = (Array.isArray(t?.rents) ? t.rents : [])
      .map((r) => toNum(r?.rentAmount))
      .filter((amount) => amount > 0)
      .pop();
    if (latestPaidRent > 0) return latestPaidRent;

    const room = findUnitForTenant(t, unitsArr || []);
    if (!room) return 0;

    const unitType = normalizeRoomPropertyType(room);
    const primaryBedNo = getPrimaryUnitBedNo(unitType);
    const targetBedNo =
      unitType === "bed" ? String(t?.bedNo || "").trim().toLowerCase() : primaryBedNo.toLowerCase();

    const bed = (room?.beds || []).find((b) => {
      return String(b?.bedNo || "").trim().toLowerCase() === targetBedNo;
    });

    return toNum(bed?.price || 0);
  };

  // âœ… Vacant matching KEY = roomNo + bedNo ONLY
  const bedKey = (roomNo, bedNo) => `${norm(roomNo)}|${norm(bedNo)}`;

  // Month record helpers
  const getMonthRecords = (t, Y, M) =>
    (t?.rents || []).filter((r) => {
      const ym = getRentYM(r);
      return ym && ym.y === Y && ym.m === M;
    });

  // Match the tracker logic: past/current red Due or Pending only.
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

  const formatMonYY = (y, m) => {
    const arr = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const yy = String(y).slice(-2);
    return `${arr[m]}-${yy}`;
  };

  const ymToKey = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;

  const getFirstBillYM = (tenant) => {
    if (tenant?.firstRentMonth) {
      const ym = getRentYM({ month: tenant.firstRentMonth });
      if (ym) return ym.y * 12 + ym.m;
    }

    const joiningDate = new Date(tenant?.joiningDate);
    if (isNaN(joiningDate)) return null;

    const isAdvance = tenant?.firstRentStatus === "ADVANCE_PAID";
    return (
      joiningDate.getFullYear() * 12 +
      joiningDate.getMonth() +
      (isAdvance ? 0 : 1)
    );
  };

  const getBillingMonthsUpToNow = (tenant) => {
    const firstBillYM = getFirstBillYM(tenant);
    if (firstBillYM === null) return [];

    const now = new Date();
    const lastYM = now.getFullYear() * 12 + now.getMonth();
    const months = [];

    for (let ym = firstBillYM; ym <= lastYM; ym += 1) {
      months.push({ y: Math.floor(ym / 12), m: ym % 12 });
    }

    return months;
  };

  const getDashboardMonthCell = (
    tenant,
    y,
    m,
    monthlyRent = getMonthlyRent(tenant)
  ) => {
    if (!tenant?.joiningDate) {
      return { label: "", outstanding: 0, isPast: false, beforeRentStart: true };
    }

    const joinDate = new Date(tenant.joiningDate);
    const firstBillYM = getFirstBillYM(tenant);
    if (isNaN(joinDate) || firstBillYM === null) {
      return { label: "", outstanding: 0, isPast: false, beforeRentStart: true };
    }

    const cellYM = y * 12 + m;
    if (cellYM < firstBillYM) {
      return { label: "", outstanding: 0, isPast: false, beforeRentStart: true };
    }

    const cycleIndex = cellYM - firstBillYM;
    const periodStart = new Date(joinDate);
    periodStart.setMonth(periodStart.getMonth() + cycleIndex);

    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const expected = toNum(monthlyRent);
    const paidAmount = getMonthRecords(tenant, y, m).reduce(
      (sum, rent) => sum + getPaidAmt(rent, monthlyRent),
      0
    );
    const outstanding = Math.max(0, expected - paidAmount);
    const today = new Date();
    const isAdvanceCycle = tenant?.firstRentStatus === "ADVANCE_PAID";
    const isPast = isAdvanceCycle ? today >= periodStart : today >= periodEnd;

    let label = "Upcoming";
    if (paidAmount > 0 && expected > 0 && paidAmount < expected) {
      label = "Pending";
    } else if (paidAmount >= expected && expected > 0) {
      label = "Paid";
    } else if (isPast) {
      label = "Due";
    }

    return { label, outstanding, isPast, beforeRentStart: false };
  };

  const getPendingMonths = (tenant, monthlyRent = getMonthlyRent(tenant)) =>
    getBillingMonthsUpToNow(tenant).filter(({ y, m }) => {
      const cell = getDashboardMonthCell(tenant, y, m, monthlyRent);
      const isRealDue =
        !cell.beforeRentStart &&
        cell.isPast &&
        (cell.label === "Due" || cell.label === "Pending");

      return isRealDue && Number(cell.outstanding || 0) > 0;
    });

  // ---------------------------------------------------------
  // FUTURE LEAVES
  // ---------------------------------------------------------
  const futureLeaveTenants = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (tenantsState || []).filter((t) => {
      if (!t.leaveDate) return false;

      const leaveDate = new Date(t.leaveDate);
      leaveDate.setHours(0, 0, 0, 0);

      return leaveDate > today;
    });
  }, [tenantsState]);

  const futureLeaveCount = futureLeaveTenants.length;

  const calculateRefund = (t) => {
    const deposit = Number(t.depositAmount || 0);
    const monthlyRent = Number(t.baseRent || t.rentAmount || 0);

    if (!t.leaveDate || !monthlyRent) {
      return { deposit, refundable: deposit, isNegative: false };
    }

    const leaveDate = new Date(t.leaveDate);
    const year = leaveDate.getFullYear();
    const month = leaveDate.getMonth();

    const totalDays = new Date(year, month + 1, 0).getDate();
    const occupiedDays = leaveDate.getDate();

    const perDayRent = monthlyRent / totalDays;
    const usedRent = perDayRent * occupiedDays;

    let pendingDue = 0;

    (t.rents || []).forEach((r) => {
      if (!r) return;

      let rentDate = null;

      if (r.month) {
        try {
          const [mon, yy] = r.month.split("-");
          rentDate = new Date(`${mon} 01, 20${yy}`);
        } catch {}
      }

      if (!rentDate && r.date) {
        rentDate = new Date(r.date);
      }

      if (!rentDate) return;

      if (
        rentDate.getFullYear() < year ||
        (rentDate.getFullYear() === year && rentDate.getMonth() < month)
      ) {
        pendingDue += Number(r.rentAmount || 0);
      }
    });

    const refundable = deposit - usedRent - pendingDue;

    return {
      deposit,
      refundable: Math.round(refundable * 100) / 100,
      isNegative: refundable < 0,
    };
  };

  // ---------------------------------------------------------
  // Category Report
  // ---------------------------------------------------------
  const handleDownloadCategoryReport = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isActive = (t) => {
      if (!t?.leaveDate) return true;
      const leave = new Date(t.leaveDate);
      leave.setHours(0, 0, 0, 0);
      return leave > today;
    };

    const allUnits = [...(rooms || []), ...(commercialUnits || []).map(mapCommercialUnitToTrackerRoom)];
    const sectionDefinitions = [
      { key: "bed", title: "Hostel" },
      { key: "room", title: "Residential Rooms" },
      { key: "shop", title: "Commercial Shops" },
    ];
    const headers = [
      "SR NO",
      "LOCATION",
      "TOTAL CAPACITY",
      "TOTAL Occupied",
      "VACANT BED",
      "DEPOSITE AMT",
      "BALANCE AMT (Deposit)",
      "RENT AMT",
      "BALANCE AMT (Rent)",
      "REMARK",
    ];

    const buildSectionRows = (sectionKey, title) => {
      const sectionUnits = allUnits.filter(
        (unit) => normalizeRoomPropertyType(unit) === sectionKey
      );
      const sectionTenants = (tenantsState || []).filter((tenant) => {
        if (!isActive(tenant)) return false;
        const matchedUnit = findUnitForTenant(tenant, allUnits);
        if (!matchedUnit) return false;
        return normalizeRoomPropertyType(matchedUnit) === sectionKey;
      });

      const statsMap = new Map();
      const ensureRow = (location) => {
        const key = String(location || "Uncategorized").trim() || "Uncategorized";
        if (!statsMap.has(key)) {
          statsMap.set(key, {
            location: key,
            totalCapacity: 0,
            totalOccupied: 0,
            depositAmount: 0,
            rentAmount: 0,
          });
        }
        return statsMap.get(key);
      };

      sectionUnits.forEach((unit) => {
        const location = String(unit?.category || unit?.buildingName || "").trim();
        const row = ensureRow(location);
        row.totalCapacity += sectionKey === "bed" ? (unit?.beds || []).length : 1;
      });

      sectionTenants.forEach((tenant) => {
        const location = String(tenant?.category || "").trim();
        const row = ensureRow(location);
        row.totalOccupied += 1;
        row.depositAmount += toNum(tenant?.depositAmount);
        row.rentAmount += toNum(getMonthlyRent(tenant, allUnits));
      });

      const locations = Array.from(statsMap.values()).sort((a, b) =>
        a.location.localeCompare(b.location)
      );

      const rows = locations.map((item, index) => [
        index + 1,
        item.location,
        item.totalCapacity,
        item.totalOccupied,
        Math.max(0, item.totalCapacity - item.totalOccupied),
        item.depositAmount,
        "",
        item.rentAmount,
        "",
        "",
      ]);

      const totals = locations.reduce(
        (acc, item) => {
          acc.totalCapacity += item.totalCapacity;
          acc.totalOccupied += item.totalOccupied;
          acc.vacant += Math.max(0, item.totalCapacity - item.totalOccupied);
          acc.depositAmount += item.depositAmount;
          acc.rentAmount += item.rentAmount;
          return acc;
        },
        {
          totalCapacity: 0,
          totalOccupied: 0,
          vacant: 0,
          depositAmount: 0,
          rentAmount: 0,
        }
      );

      return [
        [title],
        headers,
        ...rows,
        [
          "",
          "TOTAL",
          totals.totalCapacity,
          totals.totalOccupied,
          totals.vacant,
          totals.depositAmount,
          "",
          totals.rentAmount,
          "",
          "",
        ],
        [],
      ];
    };

    const sheetRows = sectionDefinitions.flatMap((section) =>
      buildSectionRows(section.key, section.title)
    );

    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    ws["!cols"] = [
      { wch: 7 },
      { wch: 28 },
      { wch: 16 },
      { wch: 16 },
      { wch: 12 },
      { wch: 14 },
      { wch: 20 },
      { wch: 14 },
      { wch: 18 },
      { wch: 20 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Category Report");

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Category_Report_${stamp}.xlsx`);
  };

  // ---------------------------------------------------------
  // TIME ticker
  // ---------------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ---------------------------------------------------------
  // âœ… Vacant finder
  // ---------------------------------------------------------
  const findVacantUnits = (
    hostelRoomsArg = rooms,
    commercialUnitsArg = commercialUnits,
    tenantsArg = tenantsState
  ) => {
    const hostelRooms = (hostelRoomsArg || []).filter(
      (room) => normalizeRoomPropertyType(room) === "bed"
    );
    const residentialRooms = (hostelRoomsArg || []).filter(
      (room) => normalizeRoomPropertyType(room) === "room"
    );
    const mappedCommercialUnits = (commercialUnitsArg || []).map(
      mapCommercialUnitToTrackerRoom
    );
    const allUnits = [...(hostelRoomsArg || []), ...mappedCommercialUnits];
    const shopUnits = allUnits.filter(
      (unit) => normalizeRoomPropertyType(unit) === "shop"
    );

    const occupiedHostelKeys = new Set();
    const occupiedResidentialKeys = new Set();
    const occupiedShopKeys = new Set();

    (tenantsArg || [])
      .filter(isActiveTenant)
      .filter(hasRoom)
      .forEach((tenant) => {
        const matchedUnit = findUnitForTenant(tenant, allUnits);
        if (!matchedUnit) return;

        const unitType = normalizeRoomPropertyType(matchedUnit);
        if (unitType === "bed" && hasBed(tenant)) {
          occupiedHostelKeys.add(bedKey(tenant.roomNo, tenant.bedNo));
          return;
        }

        const unitKey = getUnitIdentityKey(matchedUnit, unitType);

        if (unitType === "room") occupiedResidentialKeys.add(unitKey);
        if (unitType === "shop") occupiedShopKeys.add(unitKey);
      });

    const hostelVacants = [];
    hostelRooms.forEach((room) => {
      const roomNo = room?.roomNo;
      const seenBedsInRoom = new Set();

      (room?.beds || []).forEach((bed) => {
        const bedNo = bed?.bedNo;
        const localKey = norm(bedNo);
        if (seenBedsInRoom.has(localKey)) return;
        seenBedsInRoom.add(localKey);

        if (occupiedHostelKeys.has(bedKey(roomNo, bedNo))) return;

        hostelVacants.push({
          roomNo,
          bedNo,
          price: Number(bed?.price || 0),
          floorNo: room?.floorNo,
          category: room?.category,
        });
      });
    });

    const residentialVacants = residentialRooms
      .filter((room) => {
        const unitKey = getUnitIdentityKey(room, "room");
        return !occupiedResidentialKeys.has(unitKey);
      })
      .map((room) => ({
        roomNo: room?.roomNo,
        floorNo: room?.floorNo,
        category: room?.category,
        price: Number(room?.beds?.[0]?.price || 0),
      }));

    const shopVacants = shopUnits
      .filter((unit) => {
        const unitKey = getUnitIdentityKey(unit, "shop");
        return !occupiedShopKeys.has(unitKey);
      })
      .map((unit) => ({
        roomNo: unit?.roomNo || unit?.unitNo,
        floorNo: unit?.floorNo,
        category: unit?.buildingName || unit?.category,
        commercialCategory: unit?.commercialCategory || unit?.category,
        price: Number(unit?.price || 0),
      }));

    const sortByRoomNo = (a, b) =>
      String(a.roomNo).localeCompare(String(b.roomNo), undefined, {
        numeric: true,
      });

    hostelVacants.sort((a, b) => {
      const r = sortByRoomNo(a, b);
      if (r !== 0) return r;
      return String(a.bedNo).localeCompare(String(b.bedNo), undefined, {
        numeric: true,
      });
    });
    residentialVacants.sort(sortByRoomNo);
    shopVacants.sort(sortByRoomNo);

    setVacantSummary({
      hostel: hostelVacants,
      residential: residentialVacants,
      shops: shopVacants,
      total: hostelVacants.length + residentialVacants.length + shopVacants.length,
    });
    setShowVacantModal(true);
  };

  // ---------------------------------------------------------
  // FETCH + SUMMARY (âœ… Completed-month pending rent logic)
  // ---------------------------------------------------------
useEffect(() => {
  Promise.all([
    api.get("/"),
    api.get("/light-bill/all"),
    api.get("/other-expense/all"),
    api.get("/rooms"),
    api.get("/commercial-units"),
  ])
    .then(
      ([
        tenantsResponse,
        lightBillsResponse,
        otherExpensesResponse,
        roomsResponse,
        commercialUnitsResponse,
      ]) => {
        const tenants = Array.isArray(tenantsResponse.data)
          ? tenantsResponse.data
          : [];

        const lightBills = Array.isArray(lightBillsResponse.data)
          ? lightBillsResponse.data
          : [];

        const otherExpenses = Array.isArray(otherExpensesResponse.data)
          ? otherExpensesResponse.data
          : [];

        const rooms = Array.isArray(roomsResponse.data)
          ? roomsResponse.data
          : [];

        const commercialUnits = Array.isArray(commercialUnitsResponse.data)
          ? commercialUnitsResponse.data
          : [];
      setRooms(rooms);
      setCommercialUnits(commercialUnits);
      setTenantsState(tenants);

      const hostelRooms = (rooms || []).filter(
        (room) => normalizeRoomPropertyType(room) === "bed"
      );
      const residentialRooms = (rooms || []).filter(
        (room) => normalizeRoomPropertyType(room) === "room"
      );
      const mappedCommercialUnits = (commercialUnits || []).map(
        mapCommercialUnitToTrackerRoom
      );
      const allResidentialUnits = [
        ...residentialRooms,
        ...mappedCommercialUnits.filter(
          (unit) => normalizeRoomPropertyType(unit) === "room"
        ),
      ];
      const allShopUnits = [
        ...(rooms || []).filter(
          (room) => normalizeRoomPropertyType(room) === "shop"
        ),
        ...mappedCommercialUnits.filter(
          (unit) => normalizeRoomPropertyType(unit) === "shop"
        ),
      ];

      const totalBeds = hostelRooms.reduce(
        (sum, room) => sum + (room.beds?.length || 0),
        0
      );
      const totalResidentialRooms = new Set(
        allResidentialUnits.map((unit) => getUnitIdentityKey(unit, "room"))
      ).size;
      const totalShops = new Set(
        allShopUnits.map((unit) => getUnitIdentityKey(unit, "shop"))
      ).size;
      const totalUnits = totalBeds + totalResidentialRooms + totalShops;

      const allUnits = [...(rooms || []), ...mappedCommercialUnits];
      const occKeys = new Set();
      const occupiedResidentialKeys = new Set();
      const occupiedShopKeys = new Set();

      (tenants || [])
        .filter(isActiveTenant)
        .filter(hasRoom)
        .forEach((tenant) => {
          const matchedUnit = findUnitForTenant(tenant, allUnits);
          if (!matchedUnit) return;

          const unitType = normalizeRoomPropertyType(matchedUnit);
          if (unitType === "bed" && hasBed(tenant)) {
            occKeys.add(bedKey(tenant.roomNo, tenant.bedNo));
            return;
          }

          const unitKey = getUnitIdentityKey(matchedUnit, unitType);

          if (unitType === "room") occupiedResidentialKeys.add(unitKey);
          if (unitType === "shop") occupiedShopKeys.add(unitKey);
        });

      const occupied = occKeys.size;
      const vacant = Math.max(0, totalBeds - occupied);

      const hostelVacants = hostelRooms.reduce((sum, room) => {
        const seenBedsInRoom = new Set();
        const roomVacantCount = (room?.beds || []).reduce((bedCount, bed) => {
          const bedNo = bed?.bedNo;
          const localKey = norm(bedNo);
          if (seenBedsInRoom.has(localKey)) return bedCount;
          seenBedsInRoom.add(localKey);
          return occKeys.has(bedKey(room?.roomNo, bedNo)) ? bedCount : bedCount + 1;
        }, 0);
        return sum + roomVacantCount;
      }, 0);

      const residentialVacants = new Set(
        allResidentialUnits
          .filter((room) => {
            const unitKey = getUnitIdentityKey(room, "room");
            return !occupiedResidentialKeys.has(unitKey);
          })
          .map((room) => getUnitIdentityKey(room, "room"))
      ).size;

      const shopVacants = new Set(
        allShopUnits
          .filter((unit) => {
            const unitKey = getUnitIdentityKey(unit, "shop");
            return !occupiedShopKeys.has(unitKey);
          })
          .map((unit) => getUnitIdentityKey(unit, "shop"))
      ).size;

      setVacantSummary({
        hostel: [],
        residential: [],
        shops: [],
        total: hostelVacants + residentialVacants + shopVacants,
      });

      const deposits = (tenants || []).filter((t) => Number(t.depositAmount) > 0)
        .length;

      // Match tracker red Due/Pending rows only.
      const pendingList = (tenants || [])
        .filter(isActiveTenant)
        .map((t) => {
          const matchedUnit = findUnitForTenant(t, allUnits);
          const unitType = matchedUnit ? normalizeRoomPropertyType(matchedUnit) : "bed";
          const monthlyRent = getMonthlyRent(t, allUnits);
          const pendingMonths = getPendingMonths(t, monthlyRent);
          const dueTotal = pendingMonths.reduce((sum, month) => {
            const cell = getDashboardMonthCell(t, month.y, month.m, monthlyRent);
            return sum + Number(cell.outstanding || 0);
          }, 0);
          const displayUnit =
            unitType === "bed"
              ? `${t.roomNo || "-"} / ${t.bedNo || "-"}`
              : t.roomNo || "-";

          return {
            ...t,
            _unitType: unitType,
            _monthlyRent: monthlyRent,
            _displayUnit: displayUnit,
            _pendingMonths: pendingMonths,
            _dueTotal: dueTotal,
          };
        })
        .filter((t) => (t._pendingMonths || []).length > 0 && (t._dueTotal || 0) > 0);

      setPendingRentList(pendingList);
      const pendingRents = pendingList.length;

      // LIGHT BILL & MAINTENANCE
      const totalLight = (lightBills || []).reduce(
        (s, b) => s + Number(b.amount || 0),
        0
      );
      const paidLight = (lightBills || [])
        .filter((b) => b.status === "paid")
        .reduce((s, b) => s + Number(b.amount), 0);
      const pendingLight = totalLight - paidLight;

      const totalMaint = (otherExpenses || []).reduce(
        (s, x) => s + Number(x.mainAmount || 0),
        0
      );
      const paidMaint = (otherExpenses || [])
        .filter((x) => x.status === "paid")
        .reduce((s, x) => s + Number(x.mainAmount), 0);
      const pendingMaint = totalMaint - paidMaint;

      setSummary({
        beds: {
          total: totalBeds,
          totalUnits,
          hostelTotal: totalBeds,
          residentialTotal: totalResidentialRooms,
          shopTotal: totalShops,
          occupied,
          vacant,
          totalVacant: hostelVacants + residentialVacants + shopVacants,
          hostelVacant: hostelVacants,
          residentialVacant: residentialVacants,
          shopVacant: shopVacants,
        },
        rent: { pending: pendingRents, deposits },
        light: { paid: paidLight, pending: pendingLight },
        maintenance: { paid: paidMaint, pending: pendingMaint },
           });
    })
    .catch((error) => {
      console.error(
        "DASHBOARD DATA ERROR:",
        error.response?.data || error
      );

      setRooms([]);
      setCommercialUnits([]);
      setTenantsState([]);
    });
}, []);

  // ==== Mobile drawer (UNCHANGED) ====
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target))
        setOpen(false);
    };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const dayName = currentTime.toLocaleDateString(undefined, { weekday: "long" });
  const dateString = currentTime.toLocaleDateString();
  const timeString = currentTime.toLocaleTimeString();

  const renderCard = (label, value, bgColor, icon, onClick) => (
    <div className="col-6 col-md-4 col-lg-3 mb-2">
      <div
        className="card border-0 shadow-sm h-100"
        style={{
          backgroundColor: bgColor,
          borderRadius: "12px",
          padding: "10px 8px",
          cursor: onClick ? "pointer" : "default",
        }}
        onClick={onClick}
      >
        <div className="card-body text-center p-2">
          <div className="fs-5 mb-1">{icon}</div>
          <div
            className="small text-uppercase text-muted"
            style={{ fontSize: "0.75rem" }}
          >
            {label}
          </div>
          <div className="fw-semibold" style={{ fontSize: "1rem" }}>
            {value}
          </div>
        </div>
      </div>
    </div>
  );

  const renderVacantModalBody = () => {
    const visibleVacantTotal =
      (hasUnitType("bed") ? vacantSummary.hostel.length : 0) +
      (hasUnitType("room") ? vacantSummary.residential.length : 0) +
      (hasUnitType("shop") ? vacantSummary.shops.length : 0);
    if (visibleVacantTotal === 0) {
      return <div className="md-rent-empty"><BedDouble size={28} /><strong>No vacant units</strong><p>All visible units are currently occupied.</p></div>;
    }

    return (
      <>
        {hasUnitType("bed") ? <section className="md-rent-section">
          <div className="md-rent-section-heading"><span><BedDouble size={16} /></span><h3>
            Hostel Vacant ({vacantSummary.hostel.length})
          </h3></div>
          {vacantSummary.hostel.length === 0 ? (
            <p className="md-rent-section-empty">No hostel beds vacant.</p>
          ) : (
            <div className="md-rent-table-wrap"><table className="md-rent-table">
              <thead>
                <tr>
                  <th>Room No</th>
                  <th>Bed No</th>
                  <th>Floor No</th>
                  <th>Category</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {vacantSummary.hostel.map((bed, i) => (
                  <tr key={`hostel-${i}`}>
                    <td data-label="Room No"><strong>{bed.roomNo}</strong></td>
                    <td data-label="Bed No">{bed.bedNo}</td>
                    <td data-label="Floor No">{bed.floorNo}</td>
                    <td data-label="Category">{bed.category}</td>
                    <td data-label="Price">
                      {Number(bed.price || 0).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section> : null}

        {hasUnitType("room") ? <section className="md-rent-section">
          <div className="md-rent-section-heading"><span><Building2 size={16} /></span><h3>
            Residential Room Vacant ({vacantSummary.residential.length})
          </h3></div>
          {vacantSummary.residential.length === 0 ? (
            <p className="md-rent-section-empty">No residential rooms vacant.</p>
          ) : (
            <div className="md-rent-table-wrap"><table className="md-rent-table">
              <thead>
                <tr>
                  <th>Room No</th>
                  <th>Floor No</th>
                  <th>Building</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {vacantSummary.residential.map((room, i) => (
                  <tr key={`residential-${i}`}>
                    <td data-label="Room No"><strong>{room.roomNo}</strong></td>
                    <td data-label="Floor No">{room.floorNo}</td>
                    <td data-label="Building">{room.category}</td>
                    <td data-label="Price">
                      {Number(room.price || 0).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section> : null}

        {hasUnitType("shop") ? <section className="md-rent-section">
          <div className="md-rent-section-heading"><span><Building2 size={16} /></span><h3>
            Shop Vacant ({vacantSummary.shops.length})
          </h3></div>
          {vacantSummary.shops.length === 0 ? (
            <p className="md-rent-section-empty">No shops vacant.</p>
          ) : (
            <div className="md-rent-table-wrap"><table className="md-rent-table">
              <thead>
                <tr>
                  <th>Shop No</th>
                  <th>Floor No</th>
                  <th>Building</th>
                  <th>Category</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {vacantSummary.shops.map((shop, i) => (
                  <tr key={`shop-${i}`}>
                    <td data-label="Shop No"><strong>{shop.roomNo}</strong></td>
                    <td data-label="Floor No">{shop.floorNo}</td>
                    <td data-label="Building">{shop.category}</td>
                    <td data-label="Category">{shop.commercialCategory || "-"}</td>
                    <td data-label="Price">
                      {Number(shop.price || 0).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section> : null}
      </>
    );
  };

  const renderTotalModalBody = () => (
    <section className="md-rent-section md-total-section">
    <div className="md-rent-section-heading"><span><Layers3 size={16} /></span><h3>Property capacity</h3></div>
    <div className="md-rent-table-wrap"><table className="md-rent-table md-total-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Total Count</th>
        </tr>
      </thead>
      <tbody>
        {hasUnitType("bed") ? <tr>
          <td data-label="Type"><strong>Hostel</strong></td>
          <td data-label="Total Count">{summary.beds.hostelTotal || 0}</td>
        </tr> : null}
        {hasUnitType("room") ? <tr>
          <td data-label="Type"><strong>Residential</strong></td>
          <td data-label="Total Count">{summary.beds.residentialTotal || 0}</td>
        </tr> : null}
        {hasUnitType("shop") ? <tr>
          <td data-label="Type"><strong>Shops</strong></td>
          <td data-label="Total Count">{summary.beds.shopTotal || 0}</td>
        </tr> : null}
        <tr className="md-total-row">
          <td data-label="Type">Total</td>
          <td data-label="Total Count">
            {(hasUnitType("bed") ? summary.beds.hostelTotal || 0 : 0) +
              (hasUnitType("room") ? summary.beds.residentialTotal || 0 : 0) +
              (hasUnitType("shop") ? summary.beds.shopTotal || 0 : 0)}
          </td>
        </tr>
      </tbody>
    </table></div>
    </section>
  );

  const renderPendingRentSection = (title, items, unitLabel) => (
    <section className="md-rent-section">
      <div className="md-rent-section-heading">
        <span><CreditCard size={16} /></span>
        <h3>
        {title} ({items.length})
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="md-rent-section-empty">No pending rents.</p>
      ) : (
        <div className="md-rent-table-wrap">
        <table className="md-rent-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>{unitLabel}</th>
              <th>Phone</th>
              <th>Monthly Rent</th>
              <th>Due Month</th>
              <th>Due Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((tenant, i) => {
              const pendingMonths = tenant._pendingMonths || [];
              const pendingMonthsStr = pendingMonths
                .map((x) => formatMonYY(x.y, x.m))
                .join(", ");
              return (
                <tr key={`${title}-${tenant._id || i}`}>
                  <td data-label="Name"><strong>{tenant.name}</strong></td>
                  <td data-label={unitLabel}>{tenant._displayUnit || tenant.roomNo || "-"}</td>
                  <td data-label="Phone">{tenant.phoneNo || tenant.mobile || "-"}</td>
                  <td data-label="Monthly Rent">₹{Number(tenant._monthlyRent || 0).toLocaleString("en-IN")}</td>
                  <td data-label="Due Month">{pendingMonthsStr || "-"}</td>
                  <td data-label="Due Amount" className="md-rent-due">
                    ₹{Number(tenant._dueTotal || 0).toLocaleString("en-IN")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );

  const renderPendingRentModalBody = () => {
    const hostel = pendingRentList.filter((tenant) => tenant._unitType === "bed");
    const residential = pendingRentList.filter((tenant) => tenant._unitType === "room");
    const commercial = pendingRentList.filter((tenant) => tenant._unitType === "shop");

    const visiblePendingCount =
      (hasUnitType("bed") ? hostel.length : 0) +
      (hasUnitType("room") ? residential.length : 0) +
      (hasUnitType("shop") ? commercial.length : 0);
    if (visiblePendingCount === 0) {
      return <div className="md-rent-empty"><CreditCard size={28} /><strong>No past-due rents</strong><p>All visible rent payments are up to date.</p></div>;
    }

    return (
      <>
        {hasUnitType("bed") ? renderPendingRentSection("Hostel Pending Rents", hostel, "Room / Bed") : null}
        {hasUnitType("room") ? renderPendingRentSection("Residential Pending Rents", residential, "Room") : null}
        {hasUnitType("shop") ? renderPendingRentSection("Commercial Pending Rents", commercial, "Shop") : null}
      </>
    );
  };

  const renderBarChart = () => {
    const totalLight = (summary.light.paid || 0) + (summary.light.pending || 0);
    const totalMaintenance =
      (summary.maintenance.paid || 0) + (summary.maintenance.pending || 0);
    const totalRent = (summary.rent.deposits || 0) + (summary.rent.pending || 0);

    const getPercent = (value, total) => (total ? (value / total) * 100 : 0);

    const data = [
      {
        name: "Light Bill",
        paid: getPercent(summary.light.paid, totalLight),
        pending: getPercent(summary.light.pending, totalLight),
      },
      {
        name: "Maintenance",
        paid: getPercent(summary.maintenance.paid, totalMaintenance),
        pending: getPercent(summary.maintenance.pending, totalMaintenance),
      },
      {
        name: "Rent",
        paid: getPercent(summary.rent.deposits, totalRent),
        pending: getPercent(summary.rent.pending, totalRent),
      },
    ];

    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          margin={{ top: 10, right: 16, left: -38, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis
            width={42}
            domain={[0, 100]}
            tickFormatter={(value) => `${value.toFixed(0)}%`}
          />
          <Tooltip formatter={(value) => `${value.toFixed(2)}%`} />
          <Bar
            dataKey="paid"
            name="Paid"
            fill="#3db7b1"
            radius={[10, 10, 0, 0]}
          />
          <Bar
            dataKey="pending"
            name="Pending"
            fill="#1e3a8a"
            radius={[10, 10, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const renderPieCharts = () => {
    const pieData = [
      {
        title: "Rent Status",
        data: [
          { name: "Deposits", value: summary.rent.deposits || 0 },
          { name: "Pending", value: summary.rent.pending || 0 },
        ],
      },
      {
        title: "Light Bill Status",
        data: [
          { name: "Paid", value: summary.light.paid || 0 },
          { name: "Pending", value: summary.light.pending || 0 },
        ],
      },
      {
        title: "Maintenance Status",
        data: [
          { name: "Paid", value: summary.maintenance.paid || 0 },
          { name: "Pending", value: summary.maintenance.pending || 0 },
        ],
      },
      {
        title: "Bed Occupancy",
        data: [
          { name: "Occupied", value: summary.beds.occupied || 0 },
          { name: "Vacant", value: summary.beds.vacant || 0 },
        ],
      },
    ];

    return (
      <div className="row g-3 mt-2 px-2">
        {pieData.map((chart, idx) => (
          <div className="col-12 col-md-6 col-lg-3" key={idx}>
            <div className="bg-white p-2 rounded shadow-sm h-100 text-center">
              <h6 className="text-primary mb-2">{chart.title}</h6>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={chart.data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    label
                  >
                    {chart.data.map((entry, i) => (
                      <Cell
                        key={`cell-${i}`}
                        fill={COLORS[i % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const quickNavigate = (label, fallback) => {
    const flatItems = menuItems.flatMap((item) => [item, ...(item.children || [])]);
    const match = flatItems.find((item) =>
      String(item.label || "").toLowerCase().includes(label.toLowerCase())
    );
    handleNavigation(match?.path || fallback, match?.state);
  };

  const openAddTenantFromDashboard = () => {
    const trackerType = enabledUnitTypes === null || hasUnitType("bed")
      ? "bed"
      : hasUnitType("room")
        ? "room"
        : "shop";

    navigate(`/tracker/${trackerType}`, {
      state: {
        tab: "rent",
        trackerType,
        openAddTenant: true,
        addTenantRequestId: Date.now(),
      },
    });
  };

  const openRentTrackerFromDashboard = () => {
    const trackerType = enabledUnitTypes === null || hasUnitType("bed")
      ? "bed"
      : hasUnitType("room")
        ? "room"
        : "shop";

    navigate(`/tracker/${trackerType}`, {
      state: { tab: "rent", trackerType },
    });
  };

  const openTrackerSectionFromDashboard = (section) => {
    const trackerType = enabledUnitTypes === null || hasUnitType("bed")
      ? "bed"
      : hasUnitType("room")
        ? "room"
        : "shop";
    const unitLabel = trackerType === "bed" ? "hostel" : trackerType;

    navigate(`/tracker/${trackerType}`, {
      state: { tab: `${section}-${unitLabel}`, trackerType },
    });
  };

  const totalLight = (summary.light.paid || 0) + (summary.light.pending || 0);
  const totalMaintenance =
    (summary.maintenance.paid || 0) + (summary.maintenance.pending || 0);
  const percent = (value, total) => (total ? Math.round((value / total) * 100) : 0);

  const dashboardCards = [
    { label: "Total", value: summary.beds.totalUnits || 0, tone: "blue", icon: BedDouble, action: () => setShowTotalModal(true) },
    { label: "Total Vacant", value: summary.beds.totalVacant || 0, tone: "orange", icon: BedDouble, action: () => findVacantUnits() },
    { label: "Pending Rents", value: summary.rent.pending || 0, tone: "pink", icon: CreditCard, action: () => setShowPendingRentModal(true) },
    { label: "Upcoming Leaves", value: futureLeaveCount, tone: "purple", icon: CalendarDays, action: () => setShowFutureLeaveModal(true) },
    { label: "Light Bill Paid", value: summary.light.paid || 0, tone: "green", icon: Zap },
    { label: "Light Bill Pending", value: summary.light.pending || 0, tone: "orange", icon: Zap },
    { label: "Category Report", value: "Download", tone: "purple", icon: FileText, action: handleDownloadCategoryReport, download: true },
    { label: "Maintenance Pending", value: summary.maintenance.pending || 0, tone: "pink", icon: Wrench },
  ];

  const statusCards = [
    { title: "Rent Status", icon: CalendarDays, total: summary.rent.pending || 0, first: ["Pending", summary.rent.pending || 0], second: ["Paid", summary.rent.deposits || 0], firstColor: "#1355b4", secondColor: "#ffbd00" },
    { title: "Light Bill Status", icon: Zap, total: totalLight, first: ["Paid", summary.light.paid || 0], second: ["Pending", summary.light.pending || 0], firstColor: "#1355b4", secondColor: "#ffbd00" },
    { title: "Maintenance Status", icon: Wrench, total: totalMaintenance, first: ["Pending", summary.maintenance.pending || 0], second: ["Completed", summary.maintenance.paid || 0], firstColor: "#ffbd00", secondColor: "#1355b4" },
    { title: "Bed Occupancy", icon: BedDouble, total: summary.beds.totalUnits || 0, first: ["Occupied", summary.beds.occupied || 0], second: ["Vacant", summary.beds.totalVacant || 0], firstColor: "#ffad00", secondColor: "#1355b4" },
  ];

  return (
    <div className="main-dashboard">
      <div className="md-topbar">
        <button
          className="md-iconbtn"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              strokeWidth="2"
              strokeLinecap="round"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <div className="md-mobile-brand"><Building2 size={20} /> Hostel Manager</div>
        <span style={{ width: 24 }} />
      </div>

      {open && <div className="md-backdrop" onClick={() => setOpen(false)} />}

      <nav
        ref={drawerRef}
        className={`md-drawer ${open ? "open" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="md-nav-main">
          <div className="md-brand md-desktop-heading">
            <span className="md-brand-icon"><Building2 /></span>
            <span>Hostel<br />Manager</span>
          </div>

          <ul className="md-menu">
            {menuItems.map((item, idx) => {
              const hasChildren = Array.isArray(item.children) && item.children.length > 0;
              const isOpen = openSubmenu === item.label;

              if (!hasChildren) {
                return (
                  <li
                    key={idx}
                    onClick={() => {
                      handleNavigation(item.path, item.state);
                      setOpen(false);
                      setOpenSubmenu(null);
                    }}
                    className={`md-menu-item ${item.label === "Dashboard" ? "active" : ""}`}
                  >
                    <span className="md-menu-icon">{item.icon}</span><span>{item.label}</span>
                  </li>
                );
              }

              return (
                <li
                  key={idx}
                  className="md-menu-group"
                  onMouseEnter={() => setOpenSubmenu(item.label)}
                  onMouseLeave={() => setOpenSubmenu((current) => (current === item.label ? null : current))}
                >
                  <div
                    onClick={() => toggleSubmenu(item.label)}
                    className="md-menu-item"
                  >
                    <span className="md-menu-icon">{item.icon}</span><span>{item.label}</span><ChevronDown size={14} className="md-menu-chevron" />
                  </div>

                  <ul
                    className="md-submenu"
                    style={{ display: isOpen ? "block" : "none" }}
                  >
                    {item.children.map((child) => (
                      <li
                        key={child.label}
                        onClick={() => {
                          handleNavigation(child.path, child.state);
                          setOpen(false);
                          setOpenSubmenu(null);
                        }}
                        className="md-submenu-item"
                      >
                        {child.label}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
            <li
              onClick={() => {
                handleLogout();
                setOpen(false);
              }}
              className="md-menu-item"
            >
              <FontAwesomeIcon icon={faSignOutAlt} className="md-menu-icon" /> <span>Logout</span>
            </li>
          </ul>
        </div>
        <div className="md-sidebar-footer">
          <div className="md-building-art"><Building2 /></div>
          <span>v1.0.0</span>
        </div>
      </nav>

      <main className="md-shell">
        <header className="md-header">
          <div className="md-title-block">
            <h1>Dashboard</h1>
            <p>Hostel Management Overview</p>
          </div>
          <label className="md-search"><Search size={20} /><input aria-label="Search dashboard" placeholder="Search tenants, units, payments, documents..." /></label>
          <button className="md-header-icon" aria-label="Notifications"><Bell size={21} /><i /></button>
          <div className="md-admin"><div className="md-avatar">A</div><div><strong>Admin</strong><span>System Administrator</span></div><ChevronDown size={17} /></div>
        </header>

        <div className="md-content">
          <section className="md-summary-grid" aria-label="Dashboard summary">
            {dashboardCards.map(({ label, value, tone, icon: Icon, action, download }) => (
              <button type="button" key={label} className={`md-summary-card ${tone}`} onClick={action} disabled={!action}>
                <span className="md-summary-icon"><Icon /></span>
                <span className="md-summary-copy"><small>{label}</small><strong>{value}</strong></span>
                {download && <span className="md-download"><Download size={18} /></span>}
              </button>
            ))}
          </section>

          <section className="md-overview-grid">
            <article className="md-panel md-welcome">
              <div className="md-hostel-illustration"><img src={hostelWelcomeImage} alt="Hostel building" /></div>
              <div className="md-welcome-copy"><h2>Welcome Admin <span>👋</span></h2><p className="md-welcome-time"><span className="md-clock">◷</span> Today is <strong>{dayName}, {dateString}, {timeString}</strong></p><p>Manage tenants, rent, light bill, maintenance, expenses and<br className="md-welcome-break" /> all hostel operations from one place.</p></div>
            </article>

            <article className="md-panel md-quick-panel">
              <h3><Zap size={21} /> Quick Actions</h3>
              <div className="md-quick-actions">
                {[
                  ["Add Tenant", UserPlus, "blue", openAddTenantFromDashboard],
                  ["Record Payment", CreditCard, "green", openRentTrackerFromDashboard],
                  ["Add Expense", FileText, "orange", () => openTrackerSectionFromDashboard("expenses")],
                  ["Shift Bed", ArrowLeftRight, "purple", openRentTrackerFromDashboard],
                  ["Add Light Bill", Zap, "cyan", () => openTrackerSectionFromDashboard("light")],
                ].map(([label, Icon, tone, action]) => <button type="button" key={label} onClick={action}><span className={tone}><Icon /></span><small>{label}</small></button>)}
              </div>
            </article>

            <article className="md-panel md-chart-panel">
              <div className="md-chart-heading">
                <h3><FiBarChart2 /> Overall Payment Status (%)</h3>
                <div className="md-chart-legend" aria-label="Chart legend">
                  <span><i className="paid" />Paid</span>
                  <span><i className="pending" />Pending</span>
                </div>
              </div>
              {renderBarChart()}
            </article>
          </section>

          <section className="md-lower-grid">
            <div className="md-status-grid">
              {statusCards.map(({ title, icon: Icon, total, first, second, firstColor, secondColor }) => {
                const cardTotal = Number(first[1]) + Number(second[1]);
                const firstPct = percent(first[1], cardTotal);
                return <article className="md-panel md-status-card" key={title}>
                  <h3><Icon size={19} /> {title}</h3>
                  <div className="md-status-body">
                    <div className="md-donut" style={{ background: `conic-gradient(${firstColor} 0 ${firstPct}%, ${secondColor} ${firstPct}% 100%)` }}><span><strong>{total}</strong><small>Total</small></span></div>
                    <div className="md-legend"><span><i style={{ background: firstColor }} />{first[0]}: <strong>{first[1]}</strong></span><span><i style={{ background: secondColor }} />{second[0]}: <strong>{second[1]}</strong></span></div>
                  </div>
                </article>;
              })}

              <article className="md-panel md-features">
                <div className="md-panel-heading"><h3><Layers3 size={21} /> System Features</h3><span>All-in-one hostel management solution</span></div>
                <div className="md-feature-grid">
                  {[["Tenant Records", Users],["Documents",FileText],["Share Link",Share2],["Automated Reminders",Bell],["Reports Generation",FileBarChart],["Light Bill",Zap],["Maintenance Record",Wrench],["Staff Payment History",CreditCard],["Canteen",Utensils],["Chatbot",MessageCircle],["Payment Receive Messages",Mail],["Shift Bed",ArrowLeftRight]].map(([label, Icon]) => <div key={label}><Icon /><span>{label}</span></div>)}
                </div>
              </article>
            </div>

            <aside className="md-panel md-attention">
              <h3><AlertCircle size={20} /> Needs Attention</h3>
              {[
                [CreditCard, `${summary.rent.pending || 0} pending rent payments`, () => setShowPendingRentModal(true)],
                [Wrench, `${summary.maintenance.pending || 0} maintenance requests pending`, () => quickNavigate("maintenance", "/maintenance")],
                [CalendarDays, `${futureLeaveCount} upcoming leave request`, () => setShowFutureLeaveModal(true)],
                [Zap, `${summary.light.pending || 0} light bill pending`, () => quickNavigate("light", "/light-bill")],
              ].map(([Icon, label, action]) => <button type="button" key={label} onClick={action}><Icon /><span>{label}</span><ChevronRight /></button>)}
            </aside>
          </section>
        </div>

        {/* TOTAL MODAL */}
        {showTotalModal && (
          <div
            className="md-rent-modal-backdrop"
            tabIndex="-1"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowTotalModal(false);
            }}
          >
              <div className="md-rent-modal md-total-modal" role="dialog" aria-modal="true" aria-labelledby="total-count-title">
                <div className="md-rent-modal-header">
                  <span className="md-rent-modal-icon"><Layers3 size={22} /></span>
                  <div><h2 id="total-count-title">Total Count</h2><p>Property capacity by unit type</p></div>
                  <button
                    type="button"
                    className="md-rent-modal-close"
                    onClick={() => setShowTotalModal(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>

                <div className="md-rent-modal-body">{renderTotalModalBody()}</div>

                <div className="md-rent-modal-footer">
                  <button
                    type="button"
                    onClick={() => setShowTotalModal(false)}
                  >
                    Close
                  </button>
                </div>
            </div>
          </div>
        )}

        {/* VACANT MODAL */}
        {showVacantModal && (
          <div
            className="md-rent-modal-backdrop"
            tabIndex="-1"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowVacantModal(false);
            }}
          >
              <div className="md-rent-modal" role="dialog" aria-modal="true" aria-labelledby="total-vacant-title">
                <div className="md-rent-modal-header">
                  <span className="md-rent-modal-icon"><BedDouble size={22} /></span>
                  <div><h2 id="total-vacant-title">Total Vacant</h2><p>Available beds, rooms and commercial units</p></div>
                  <button
                    type="button"
                    className="md-rent-modal-close"
                    onClick={() => setShowVacantModal(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>

                <div className="md-rent-modal-body">
                  {renderVacantModalBody()}
                  
                </div>

                <div className="md-rent-modal-footer">
                  <button
                    type="button"
                    onClick={() => setShowVacantModal(false)}
                  >
                    Close
                  </button>
                </div>
            </div>
          </div>
        )}

        {/* FUTURE LEAVE MODAL */}
        {showFutureLeaveModal && (
          <div
            className="md-leave-modal-backdrop"
            tabIndex="-1"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setShowFutureLeaveModal(false);
              }
            }}
          >
            <div
              className="md-leave-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="upcoming-leave-title"
            >
                <div className="md-leave-modal-header">
                  <span className="md-leave-modal-icon" aria-hidden="true">
                    <CalendarDays size={22} />
                  </span>
                  <div>
                    <h2 id="upcoming-leave-title">Upcoming Leave Tenants</h2>
                    <p>Tenants scheduled to leave after today</p>
                  </div>
                  <span className="md-leave-modal-badge">Leave Schedule</span>
                  <button
                    type="button"
                    className="md-leave-modal-close"
                    onClick={() => setShowFutureLeaveModal(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>

                <div
                  className={`md-leave-modal-body${
                    futureLeaveTenants.length === 0 ? " is-empty" : ""
                  }`}
                >
                  {futureLeaveTenants.length === 0 ? (
                    <div className="md-leave-empty">
                      <span aria-hidden="true"><CalendarDays size={28} /></span>
                      <strong>No upcoming leaves</strong>
                      <p>There are no tenants scheduled to leave right now.</p>
                    </div>
                  ) : (
                    <div className="md-leave-table-wrap">
                      <table className="md-leave-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Room</th>
                            <th>Bed</th>
                            <th>Leave Date</th>
                            <th>Deposit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {futureLeaveTenants.map((t, i) => {
                            const { deposit } = calculateRefund(t);
                            return (
                              <tr key={t._id || i}>
                                <td data-label="Name">
                                  <span className="md-leave-tenant">
                                    <span className="md-leave-avatar" aria-hidden="true">
                                      {(t.name || "T").trim().charAt(0).toUpperCase()}
                                    </span>
                                    <strong>{t.name || "—"}</strong>
                                  </span>
                                </td>
                                <td data-label="Room">
                                  <span className="md-leave-unit-chip">{t.roomNo || "—"}</span>
                                </td>
                                <td data-label="Bed">
                                  <span className="md-leave-bed-chip">{t.bedNo || "—"}</span>
                                </td>
                                <td data-label="Leave Date">
                                  <span className="md-leave-date-chip">
                                    <CalendarDays size={14} />
                                    {new Date(t.leaveDate).toLocaleDateString("en-IN", {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </span>
                                </td>
                                <td data-label="Deposit">
                                  <span className="md-leave-deposit">
                                    ₹{deposit.toLocaleString("en-IN")}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="md-leave-modal-footer">
                  <button
                    type="button"
                    onClick={() => setShowFutureLeaveModal(false)}
                  >
                    Close
                  </button>
                </div>
            </div>
          </div>
        )}

        {/* PENDING RENT MODAL */}
        {/* PENDING RENT MODAL */}
        {showPendingRentModal && (
          <div
            className="md-rent-modal-backdrop"
            tabIndex="-1"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowPendingRentModal(false);
            }}
          >
              <div className="md-rent-modal" role="dialog" aria-modal="true" aria-labelledby="pending-rents-title">
                <div className="md-rent-modal-header">
                  <span className="md-rent-modal-icon"><CreditCard size={22} /></span>
                  <div>
                    <h2 id="pending-rents-title">Pending Rents</h2>
                    <p>Review overdue rent payments by property type</p>
                  </div>

                  <button
                    type="button"
                    className="md-rent-modal-close"
                    onClick={() => setShowPendingRentModal(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>

                <div className="md-rent-modal-body">{renderPendingRentModalBody()}</div>

                <div className="md-rent-modal-footer">
                  <button
                    type="button"
                    onClick={() => setShowPendingRentModal(false)}
                  >
                    Close
                  </button>
                </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default MainDashboard;
