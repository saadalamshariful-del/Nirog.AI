import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { AiSolutionsView } from './components/AiSolutionsView';
import { CompanyView, StaffConsoleView, SupportView } from './components/CompanySupportView';
import { DatabaseSyncPanel } from './components/DatabaseSyncPanel';
import { HomeView } from './components/HomeView';
import { InsuranceView } from './components/InsuranceView';
import { Layout } from './components/Layout';
import { PatientProView } from './components/PatientProView';
import { PharmacyView } from './components/PharmacyView';
import { PharmaTradeView } from './components/PharmaTradeView';
import { ProviderPortalView } from './components/ProviderPortalView';
import type { NirogDatabaseFile } from './lib/driveDb';
import {
  ensureUserWorkspace,
  initFirebaseAuth,
  persistWorkspaceAppointment,
  persistWorkspaceOrder,
  persistWorkspacePvReport,
  persistWorkspaceSourcingRequest,
  persistWorkspaceSupportCase,
  signInWithGoogleWorkspace,
  signOutGoogleWorkspace,
  subscribeUserWorkspace,
  updateWorkspaceDiaryState,
  type PersistedAppointmentSummary,
  type PersistedOrderSummary,
  type PersistedPvReportSummary,
  type PersistedSourcingRequestSummary,
  type PersistedSupportCaseSummary,
  type WorkspaceSnapshotData,
} from './lib/firebase';
import {
  INITIAL_APPOINTMENTS,
  INITIAL_CASES,
  INITIAL_ENQUIRIES,
  INITIAL_HOSPITAL_SOURCING_REQUESTS,
  INITIAL_INSURANCE_CLAIMS,
  INITIAL_ORDERS,
  INITIAL_PATIENT_PRESCRIPTIONS,
  INITIAL_PATIENT_VITALS,
  INITIAL_PHARMA_AUDITS,
  INITIAL_PV_REPORTS,
  INITIAL_RAD_CASES,
  INITIAL_RECALLS,
  INITIAL_RFQS,
  INITIAL_TRADE_ORDERS,
  PRODUCTS,
} from './data/seed';
import type {
  AuditEntry,
  CartLine,
  EnquiryRecord,
  HospitalSourcingRequest,
  InsuranceClaim,
  Order,
  OrderStatus,
  PartnerSession,
  PatientPrescription,
  PatientVitalReading,
  PharmaAuditRecord,
  PharmacovigilanceReport,
  ProviderAppointment,
  RadiologyCase,
  RecallNotice,
  RouteId,
  SupportCase,
  TradeOrder,
  TradeOrderStatus,
  TradeRfq,
} from './types/nirog';
import { calculateCartTotals, verifySerialCode } from './utils/logic';

const VALID_ROUTES: RouteId[] = [
  'home',
  'ai-solutions',
  'patient-pro',
  'providers',
  'pharmacy',
  'cart',
  'orders',
  'pharma-tech',
  'insurance',
  'company',
  'support',
  'staff',
];

function getRouteFromHash(): RouteId {
  const raw = (window.location.hash || '').replace(/^#/, '') as RouteId;
  return VALID_ROUTES.includes(raw) ? raw : 'home';
}

function makeRef(prefix: string): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${out}`;
}

export default function App() {
  const [route, setRoute] = useState<RouteId>(getRouteFromHash);
  const [toast, setToast] = useState<string | null>(null);

  // Shared cross-portal stateful collections
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [cases, setCases] = useState<SupportCase[]>(INITIAL_CASES);
  const [diaryOn, setDiaryOn] = useState(true);
  const [diaryDays, setDiaryDays] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true });
  const [appointments, setAppointments] = useState<ProviderAppointment[]>(INITIAL_APPOINTMENTS);
  const [radQueue, setRadQueue] = useState<RadiologyCase[]>(INITIAL_RAD_CASES);
  const [audits, setAudits] = useState<PharmaAuditRecord[]>(INITIAL_PHARMA_AUDITS);
  const [recalls, setRecalls] = useState<RecallNotice[]>(INITIAL_RECALLS);
  const [pvReports, setPvReports] = useState<PharmacovigilanceReport[]>(INITIAL_PV_REPORTS);
  const [rfqs, setRfqs] = useState<TradeRfq[]>(INITIAL_RFQS);
  const [tradeOrders, setTradeOrders] = useState<TradeOrder[]>(INITIAL_TRADE_ORDERS);
  const [claims, setClaims] = useState<InsuranceClaim[]>(INITIAL_INSURANCE_CLAIMS);
  const [enquiries, setEnquiries] = useState<EnquiryRecord[]>(INITIAL_ENQUIRIES);
  const [vitalsHistory, setVitalsHistory] = useState<PatientVitalReading[]>(INITIAL_PATIENT_VITALS);
  const [prescriptions, setPrescriptions] = useState<PatientPrescription[]>(
    INITIAL_PATIENT_PRESCRIPTIONS
  );
  const [sourcingRequests, setSourcingRequests] = useState<HospitalSourcingRequest[]>(
    INITIAL_HOSPITAL_SOURCING_REQUESTS
  );
  const [scanCounts, setScanCounts] = useState<Record<string, number>>({});
  const [partnerSession, setPartnerSession] = useState<PartnerSession | null>(null);
  const [sharedBriefIds, setSharedBriefIds] = useState<string[]>([
    'rel-pembro-mab',
    'rel-semaglutide-pep',
  ]);
  const [bookmarkedMoleculeIds, setBookmarkedMoleculeIds] = useState<string[]>(['rel-tagrix']);
  const [pharmaTabFocus, setPharmaTabFocus] = useState<'intel' | 'radar' | 'qa' | 'trade'>('intel');
  const [aiTabFocus, setAiTabFocus] = useState<'cdss' | 'radiology' | 'assistant' | 'modules'>('radiology');
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null);
  const [workspaceData, setWorkspaceData] = useState<WorkspaceSnapshotData | null>(null);
  const diaryRef = useRef({ diaryOn, diaryDays });
  diaryRef.current = { diaryOn, diaryDays };

  const [auditLog, setAuditLog] = useState<AuditEntry[]>([
    { t: Date.now(), role: 'System', action: 'NIROG.AI 3D Ecosystem initialized with synthetic demo data', ref: 'INIT' },
  ]);

  const notify = (msg: string) => {
    setToast(msg);
  };

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const addAudit = (role: string, action: string, ref: string) => {
    setAuditLog((prev) => [{ t: Date.now(), role, action, ref }, ...prev].slice(0, 60));
  };

  useEffect(() => {
    let unsubWorkspace: (() => void) | null = null;
    const unsubAuth = initFirebaseAuth(async (user, token) => {
      setAuthUser(user);
      setDriveAccessToken(token);
      setAuthReady(true);

      if (unsubWorkspace) {
        unsubWorkspace();
        unsubWorkspace = null;
      }

      if (!user) {
        setWorkspaceData(null);
        return;
      }

      try {
        await ensureUserWorkspace(user, diaryRef.current);
        unsubWorkspace = subscribeUserWorkspace(user.uid, (data) => {
          setWorkspaceData(data);
        });
      } catch (err) {
        console.error('Failed to initialize Firestore workspace:', err);
      }
    });

    return () => {
      unsubAuth();
      if (unsubWorkspace) unsubWorkspace();
    };
  }, []);

  const toFirestoreOrder = (uid: string, order: Order): PersistedOrderSummary | null => {
    if (order.status === 'cancelled') return null;
    return {
      uid,
      ref: order.ref,
      status: order.status,
      payMethod: order.payMethod === 'bank' ? 'card' : order.payMethod,
      totalBdt: order.totals.total,
      itemCount: order.items.reduce((sum, l) => sum + l.qty, 0),
      summary: `${order.delivery.name} · ${order.delivery.mode} (${order.delivery.zone})`,
    };
  };

  const toFirestoreCase = (uid: string, c: SupportCase): PersistedSupportCaseSummary => {
    const mappedStatus: PersistedSupportCaseSummary['status'] =
      c.status === 'in_review'
        ? 'under_review'
        : c.status === 'not_eligible'
          ? 'withdrawn'
          : c.status;
    return {
      uid,
      ref: c.ref,
      program: c.programme.toUpperCase(),
      status: mappedStatus,
      summary: `${c.name} (${c.country}) · ${c.physician}, ${c.hospital}`,
    };
  };

  const toFirestoreAppointment = (
    uid: string,
    apt: ProviderAppointment
  ): PersistedAppointmentSummary => ({
    uid,
    ref: apt.id,
    patient: apt.patient,
    time: apt.time,
    reason: apt.reason,
    status: apt.status,
    vitals: apt.vitals || 'Pending nurse triage',
  });

  const toFirestorePv = (uid: string, pv: PharmacovigilanceReport): PersistedPvReportSummary => ({
    uid,
    ref: pv.ref,
    reporter: pv.reporter,
    product: pv.product,
    severity: pv.severity === 'Serious' ? 'Severe / Seek urgent care' : pv.severity,
    description: pv.description,
    status: pv.status === 'Under Safety Review' ? 'Under Pharmacovigilance Review' : pv.status,
  });

  const toFirestoreSourcing = (
    uid: string,
    req: HospitalSourcingRequest
  ): PersistedSourcingRequestSummary => ({
    uid,
    ref: req.ref,
    hospitalName: req.hospitalName,
    category: req.category,
    originHub: req.originHub,
    itemName: req.itemName,
    quantity: req.quantity,
    dgdaAssistance: req.dgdaAssistance,
    patientOrDeptContext: req.patientOrDeptContext,
    status: req.status,
  });

  const handleGoogleSignIn = async () => {
    try {
      const { user, accessToken } = await signInWithGoogleWorkspace();
      setAuthUser(user);
      setDriveAccessToken(accessToken);
      await ensureUserWorkspace(user, diaryRef.current);
      addAudit('Cloud Auth', `Signed in with Google (${user.email || user.uid})`, 'G-AUTH');
      notify(`Signed in as ${user.displayName || user.email || 'Google Member'}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in cancelled.';
      notify(msg.includes('popup-closed') ? 'Google sign-in popup was closed.' : msg);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGoogleWorkspace();
    setAuthUser(null);
    setDriveAccessToken(null);
    setWorkspaceData(null);
    addAudit('Cloud Auth', 'Signed out of Google Workspace & Firestore session', 'G-AUTH');
    notify('Signed out of Google Workspace.');
  };

  const handleSyncSessionToFirestore = async () => {
    if (!authUser) {
      notify('Sign in with Google first to sync to Cloud Firestore.');
      return;
    }
    await ensureUserWorkspace(authUser, { diaryOn, diaryDays });
    await updateWorkspaceDiaryState(
      authUser.uid,
      authUser.displayName || 'NIROG.AI Member',
      diaryOn,
      diaryDays
    );

    const orderWrites = orders
      .map((o) => toFirestoreOrder(authUser.uid, o))
      .filter((o): o is PersistedOrderSummary => o !== null)
      .map((o) => persistWorkspaceOrder(o));
    const caseWrites = cases.map((c) => persistWorkspaceSupportCase(toFirestoreCase(authUser.uid, c)));
    const aptWrites = appointments.map((a) =>
      persistWorkspaceAppointment(toFirestoreAppointment(authUser.uid, a))
    );
    const pvWrites = pvReports.map((p) => persistWorkspacePvReport(toFirestorePv(authUser.uid, p)));
    const sourcingWrites = sourcingRequests.map((s) =>
      persistWorkspaceSourcingRequest(toFirestoreSourcing(authUser.uid, s))
    );

    await Promise.all([...orderWrites, ...caseWrites, ...aptWrites, ...pvWrites, ...sourcingWrites]);
    const syncedCount =
      orderWrites.length +
      caseWrites.length +
      aptWrites.length +
      pvWrites.length +
      sourcingWrites.length;
    addAudit('Firestore Sync', `Synced ${syncedCount} workspace records to Cloud Firestore`, 'FS-SYNC');
    notify(`Synced ${syncedCount} records to Cloud Firestore.`);
  };

  const handleRestoreDatabase = (dbFile: NirogDatabaseFile, sourceLabel: string) => {
    const col = dbFile.collections;
    setOrders(col.orders);
    setCases(col.cases);
    setAppointments(col.appointments);
    if (Array.isArray(col.radQueue)) setRadQueue(col.radQueue);
    if (Array.isArray(col.audits)) setAudits(col.audits);
    if (Array.isArray(col.recalls)) setRecalls(col.recalls);
    if (Array.isArray(col.pvReports)) setPvReports(col.pvReports);
    if (Array.isArray(col.rfqs)) setRfqs(col.rfqs);
    if (Array.isArray(col.tradeOrders)) setTradeOrders(col.tradeOrders);
    if (Array.isArray(col.claims)) setClaims(col.claims);
    if (Array.isArray(col.enquiries)) setEnquiries(col.enquiries);
    if (Array.isArray(col.vitalsHistory)) setVitalsHistory(col.vitalsHistory);
    if (Array.isArray(col.prescriptions)) setPrescriptions(col.prescriptions);
    if (Array.isArray(col.sourcingRequests)) setSourcingRequests(col.sourcingRequests);
    if (typeof col.diaryOn === 'boolean') setDiaryOn(col.diaryOn);
    if (col.diaryDays) setDiaryDays(col.diaryDays);

    setAuditLog((prev) => [
      {
        t: Date.now(),
        role: 'Database Restore',
        action: `Restored ${dbFile.recordCount} records from ${sourceLabel}`,
        ref: 'DB-LOAD',
      },
      ...(Array.isArray(col.auditLog) ? col.auditLog : prev),
    ].slice(0, 60));
    notify(`Restored ${dbFile.recordCount} records from ${sourceLabel}.`);
  };

  useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (nextRoute: RouteId, focusId?: string) => {
    if (nextRoute === 'pharma-tech') {
      setPharmaTabFocus(focusId === 'launch-radar' ? 'radar' : 'intel');
    }
    if (nextRoute === 'ai-solutions' && focusId === 'radiology-workbench') {
      setAiTabFocus('radiology');
    }
    const routeChanged = window.location.hash !== `#${nextRoute}`;
    if (routeChanged) {
      window.location.hash = nextRoute;
      window.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      setRoute(nextRoute);
    }
    window.setTimeout(() => {
      if (focusId) {
        const el = document.getElementById(focusId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
      if (!routeChanged) {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    }, 40);
  };

  const handleAddToCart = (id: string) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.id === id);
      if (existing) {
        return prev.map((l) => (l.id === id ? { ...l, qty: Math.min(20, l.qty + 1) } : l));
      }
      return [...prev, { id, qty: 1 }];
    });
    const med = PRODUCTS.find((p) => p.id === id);
    if (med) notify(`${med.generic} ${med.strength} added to cart.`);
  };

  const handleDecCart = (id: string) => {
    setCart((prev) =>
      prev
        .map((l) => (l.id === id ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0)
    );
  };

  const handleRemoveCart = (id: string) => {
    setCart((prev) => prev.filter((l) => l.id !== id));
  };

  const handlePlaceOrder = (payload: {
    delivery: Order['delivery'];
    rxFiles: string[];
    rxDeferred: boolean;
    payMethod: Order['payMethod'];
    promoActive: boolean;
  }) => {
    const totals = calculateCartTotals(cart, PRODUCTS, {
      promoActive: payload.promoActive,
      deliveryMode: payload.delivery.mode,
      zoneId: payload.delivery.zone,
    });
    const status: OrderStatus = totals.hasRx ? 'rx_review' : 'confirmed';
    const refNo = makeRef('ORD');
    const now = Date.now();
    const newOrder: Order = {
      ref: refNo,
      t: now,
      items: cart.map((l) => ({
        id: l.id,
        qty: l.qty,
        price: PRODUCTS.find((p) => p.id === l.id)?.price || 0,
      })),
      rxNeeded: totals.hasRx,
      rxFiles: payload.rxFiles,
      rxDeferred: payload.rxDeferred,
      delivery: payload.delivery,
      payMethod: payload.payMethod,
      payStatus: payload.payMethod === 'card' || payload.payMethod === 'mfs' ? 'paid' : 'pending',
      totals: { sub: totals.sub, disc: totals.disc, fee: totals.fee, total: totals.total },
      status,
      history: [
        { status: 'received', t: now },
        { status, t: now + 1000 },
      ],
    };
    setOrders((prev) => [newOrder, ...prev]);
    setCart([]);
    addAudit('Patient', 'Pharmacy demo order submitted', refNo);
    notify(`Order ${refNo} submitted.`);
    if (authUser) {
      const payload = toFirestoreOrder(authUser.uid, newOrder);
      if (payload) void persistWorkspaceOrder(payload);
    }
    return refNo;
  };

  const handleSubmitCase = (
    c: Omit<SupportCase, 'ref' | 't' | 'status' | 'note' | 'history' | 'mine' | 'initials'>
  ) => {
    const refNo = makeRef('PSP');
    const now = Date.now();
    const created: SupportCase = {
      ...c,
      ref: refNo,
      mine: true,
      initials: `Patient ${c.name.slice(0, 2).toUpperCase()}`,
      t: now,
      status: 'submitted',
      note: '',
      history: [{ label: 'Application submitted', t: now }],
    };
    setCases((prev) => [created, ...prev]);
    addAudit('Applicant', 'Patient Support Programme application submitted', refNo);
    notify(`Support application ${refNo} submitted.`);
    if (authUser) {
      void persistWorkspaceSupportCase(toFirestoreCase(authUser.uid, created));
    }
    return refNo;
  };

  const handleWithdrawCase = (refNo: string) => {
    let updatedCase: SupportCase | null = null;
    setCases((prev) =>
      prev.map((c) => {
        if (c.ref !== refNo) return c;
        updatedCase = {
          ...c,
          status: 'withdrawn',
          history: [...c.history, { label: 'Withdrawn by applicant', t: Date.now() }],
        };
        return updatedCase;
      })
    );
    addAudit('Applicant', 'Support case withdrawn', refNo);
    notify(`Case ${refNo} withdrawn.`);
    if (authUser && updatedCase) {
      void persistWorkspaceSupportCase(toFirestoreCase(authUser.uid, updatedCase));
    }
  };

  const handleAdvanceOrder = (refNo: string, nextStatus: OrderStatus) => {
    let updatedOrder: Order | null = null;
    setOrders((prev) =>
      prev.map((o) => {
        if (o.ref !== refNo) return o;
        updatedOrder = {
          ...o,
          status: nextStatus,
          courier: nextStatus === 'dispatched' && !o.courier ? makeRef('CR') : o.courier,
          history: [...o.history, { status: nextStatus, t: Date.now() }],
        };
        return updatedOrder;
      })
    );
    addAudit('Pharmacist / Fulfillment', `Order advanced to ${nextStatus}`, refNo);
    notify(`Order ${refNo} updated to ${nextStatus.replace('_', ' ')}.`);
    if (authUser && updatedOrder) {
      const payload = toFirestoreOrder(authUser.uid, updatedOrder);
      if (payload) void persistWorkspaceOrder(payload);
    }
  };

  const handleIssueQuote = (rfqRef: string) => {
    const quoteRef = makeRef('QUO');
    setRfqs((prev) =>
      prev.map((r) => {
        if (r.ref !== rfqRef) return r;
        return {
          ...r,
          status: 'quoted',
          quote: {
            ref: quoteRef,
            t: Date.now(),
            lines: r.lines.map((l) => {
              const p = PRODUCTS.find((x) => x.id === l.id)!;
              return { id: l.id, qty: l.qty, unitUsd: +(p.listUsd * 0.93).toFixed(2) };
            }),
            freightUsd: 380,
            lead: '4 to 6 weeks from confirmed wire transfer',
            terms: 'Prepayment by bank transfer (Tier B · 7% discount)',
          },
        };
      })
    );
    addAudit('Trade Desk', `Issued quotation ${quoteRef}`, rfqRef);
    notify(`Quotation ${quoteRef} issued for ${rfqRef}.`);
  };

  const handleAcceptQuote = (rfqRef: string) => {
    const rfq = rfqs.find((r) => r.ref === rfqRef);
    if (!rfq || !rfq.quote) return '';
    const poRef = makeRef('TRD');
    const now = Date.now();
    const newPo: TradeOrder = {
      ref: poRef,
      quoteRef: rfq.quote.ref,
      t: now,
      lines: rfq.quote.lines,
      freightUsd: rfq.quote.freightUsd,
      incoterm: rfq.incoterm,
      destination: rfq.destination,
      status: 'awaiting_payment',
      invoices: [{ ref: makeRef('PI'), kind: 'Proforma invoice', status: 'Issued' }],
      history: [{ status: 'awaiting_payment', t: now }],
    };
    setRfqs((prev) => prev.map((r) => (r.ref === rfqRef ? { ...r, status: 'accepted' } : r)));
    setTradeOrders((prev) => [newPo, ...prev]);
    addAudit('Distributor', `Accepted quotation ${rfq.quote.ref} → Purchase Order ${poRef}`, poRef);
    notify(`Purchase Order ${poRef} generated.`);
    return poRef;
  };

  const handleAdvanceTradeOrder = (refNo: string, nextStatus: TradeOrderStatus) => {
    setTradeOrders((prev) =>
      prev.map((o) =>
        o.ref === refNo
          ? {
              ...o,
              status: nextStatus,
              awb: nextStatus === 'dispatched' && !o.awb ? makeRef('AWB') : o.awb,
              history: [...o.history, { status: nextStatus, t: Date.now() }],
            }
          : o
      )
    );
    addAudit('Trade Logistics', `Trade order advanced to ${nextStatus}`, refNo);
    notify(`Trade order ${refNo} updated to ${nextStatus.replace('_', ' ')}.`);
  };

  const handleTriageCase = (refNo: string, status: SupportCase['status']) => {
    let updatedCase: SupportCase | null = null;
    setCases((prev) =>
      prev.map((c) => {
        if (c.ref !== refNo) return c;
        updatedCase = {
          ...c,
          status,
          note: status === 'more_info' ? 'Please attach updated hospital summary.' : c.note,
          history: [...c.history, { label: `Staff status: ${status}`, t: Date.now() }],
        };
        return updatedCase;
      })
    );
    addAudit('PSP Coordinator', `Triaged case to ${status}`, refNo);
    notify(`Case ${refNo} updated to ${status}.`);
    if (authUser && updatedCase) {
      void persistWorkspaceSupportCase(toFirestoreCase(authUser.uid, updatedCase));
    }
  };

  const handleResetDemo = () => {
    setCart([]);
    setOrders(INITIAL_ORDERS);
    setCases(INITIAL_CASES);
    setAppointments(INITIAL_APPOINTMENTS);
    setRadQueue(INITIAL_RAD_CASES);
    setAudits(INITIAL_PHARMA_AUDITS);
    setRecalls(INITIAL_RECALLS);
    setPvReports(INITIAL_PV_REPORTS);
    setRfqs(INITIAL_RFQS);
    setTradeOrders(INITIAL_TRADE_ORDERS);
    setClaims(INITIAL_INSURANCE_CLAIMS);
    setEnquiries(INITIAL_ENQUIRIES);
    setVitalsHistory(INITIAL_PATIENT_VITALS);
    setPrescriptions(INITIAL_PATIENT_PRESCRIPTIONS);
    setSourcingRequests(INITIAL_HOSPITAL_SOURCING_REQUESTS);
    setScanCounts({});
    addAudit('System', 'Demo state reset to baseline', 'RESET');
    notify('All portals reset to baseline synthetic demo state.');
  };

  const totalCartCount = cart.reduce((a, l) => a + l.qty, 0);

  const databasePanel = (
    <DatabaseSyncPanel
      authUser={authUser}
      authReady={authReady}
      driveAccessToken={driveAccessToken}
      workspaceData={workspaceData}
      snapshotCollections={{
        orders,
        cases,
        appointments,
        radQueue,
        audits,
        recalls,
        pvReports,
        rfqs,
        tradeOrders,
        claims,
        enquiries,
        auditLog,
        diaryOn,
        diaryDays,
        vitalsHistory,
        prescriptions,
        sourcingRequests,
      }}
      onGoogleSignIn={handleGoogleSignIn}
      onGoogleSignOut={handleGoogleSignOut}
      onSyncSessionToFirestore={handleSyncSessionToFirestore}
      onRestoreDatabase={handleRestoreDatabase}
      onNotify={notify}
    />
  );

  return (
    <Layout
      route={route}
      onNavigate={navigate}
      cartCount={totalCartCount}
      authEmail={authUser?.email ?? null}
    >
      {route === 'home' && <HomeView onNavigate={navigate} />}
      {route === 'ai-solutions' && (
        <AiSolutionsView
          initialTab={aiTabFocus}
          onDispatchRadiologyCase={(item) => {
            const refId = makeRef('RAD');
            setRadQueue((prev) => [
              {
                id: refId,
                patient: item.patient,
                modality: item.modality,
                findingKey: item.findingKey,
                aiHighlight: item.aiHighlight,
                status: 'Pending Radiologist Sign-off',
              },
              ...prev,
            ]);
            addAudit('AI Scanning', `Dispatched ${item.modality} scan to Provider Radiology Queue`, refId);
            notify(`Study ${refId} queued in Provider Portal for Radiologist sign-off.`);
            return refId;
          }}
          onNavigate={navigate}
        />
      )}
      {route === 'patient-pro' && (
        <PatientProView
          cases={cases}
          orderCount={orders.length}
          diaryOn={diaryOn}
          diaryDays={diaryDays}
          vitals={vitalsHistory}
          prescriptions={prescriptions}
          appointments={appointments}
          onToggleDiaryOn={(val) => {
            setDiaryOn(val);
            if (authUser) {
              void updateWorkspaceDiaryState(
                authUser.uid,
                authUser.displayName || 'NIROG.AI Member',
                val,
                diaryDays
              );
            }
          }}
          onToggleDiaryDay={(idx) => {
            const nextDays = { ...diaryDays, [idx]: !diaryDays[idx] };
            setDiaryDays(nextDays);
            if (authUser) {
              void updateWorkspaceDiaryState(
                authUser.uid,
                authUser.displayName || 'NIROG.AI Member',
                diaryOn,
                nextDays
              );
            }
          }}
          onLogVital={(reading) => {
            setVitalsHistory((prev) => [...prev, reading]);
            addAudit('Patient Pro', `Logged new vital signs (${reading.fastingGlucoseMgDl} mg/dL · ${reading.systolicMmHg}/${reading.diastolicMmHg})`, 'VITALS');
            notify(`Vital reading recorded (${reading.dateLabel}).`);
          }}
          onQuickRefill={(rxId, productId) => {
            handleAddToCart(productId);
            setPrescriptions((prev) =>
              prev.map((rx) =>
                rx.id === rxId
                  ? {
                      ...rx,
                      refillsRemaining: Math.max(0, rx.refillsRemaining - 1),
                      status: rx.status === 'Refill Due' ? 'Active' : rx.status,
                    }
                  : rx
              )
            );
            addAudit('Patient Pro', `Queued quick refill for ${rxId}`, rxId);
          }}
          onSubmitCase={handleSubmitCase}
          onWithdrawCase={handleWithdrawCase}
          onNavigate={navigate}
          databasePanel={databasePanel}
        />
      )}
      {route === 'providers' && (
        <ProviderPortalView
          appointments={appointments}
          radQueue={radQueue}
          auditLog={auditLog}
          sourcingRequests={sourcingRequests}
          sharedBriefIds={sharedBriefIds}
          bookmarkedMoleculeIds={bookmarkedMoleculeIds}
          onCompleteAppointment={(id, role) => {
            let updated: ProviderAppointment | null = null;
            setAppointments((prev) =>
              prev.map((a) => {
                if (a.id !== id) return a;
                updated = { ...a, status: 'Completed' };
                return updated;
              })
            );
            addAudit(role, 'Completed outpatient consult & signed EMR', id);
            notify(`Consult ${id} signed by ${role}.`);
            if (authUser && updated) {
              void persistWorkspaceAppointment(toFirestoreAppointment(authUser.uid, updated));
            }
          }}
          onCheckInAppointment={(id, role) => {
            let updated: ProviderAppointment | null = null;
            setAppointments((prev) =>
              prev.map((a) => {
                if (a.id !== id) return a;
                updated = { ...a, status: 'Waiting' };
                return updated;
              })
            );
            addAudit(role, 'Checked in outpatient appointment', id);
            notify(`Appointment ${id} checked in by ${role}.`);
            if (authUser && updated) {
              void persistWorkspaceAppointment(toFirestoreAppointment(authUser.uid, updated));
            }
          }}
          onRecordVitals={(id, vitals, role) => {
            let updated: ProviderAppointment | null = null;
            setAppointments((prev) =>
              prev.map((a) => {
                if (a.id !== id) return a;
                updated = { ...a, vitals, status: 'In Review' };
                return updated;
              })
            );
            addAudit(role, 'Recorded triage vitals in EMR', id);
            notify(`Vitals updated for ${id} by ${role}.`);
            if (authUser && updated) {
              void persistWorkspaceAppointment(toFirestoreAppointment(authUser.uid, updated));
            }
          }}
          onScheduleAppointment={(patient, time, reason, role) => {
            const id = makeRef('APT');
            const created: ProviderAppointment = {
              id,
              patient,
              time,
              reason,
              emr: 'New intake · Awaiting clinical review',
              vitals: 'Pending nurse triage',
              status: 'Scheduled',
            };
            setAppointments((prev) => [created, ...prev]);
            addAudit(role, 'Scheduled outpatient appointment', id);
            notify(`Appointment ${id} scheduled by ${role}.`);
            if (authUser) {
              void persistWorkspaceAppointment(toFirestoreAppointment(authUser.uid, created));
            }
          }}
          onSignRadiology={(id, role) => {
            setRadQueue((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'Clinician Signed' } : r)));
            addAudit(role, 'Verified assistive radiology overlay', id);
            notify(`Radiology case ${id} signed off by ${role}.`);
          }}
          onSubmitSourcingRequest={(req, role) => {
            const refNo = makeRef('SRC');
            const created: HospitalSourcingRequest = {
              ...req,
              ref: refNo,
              t: Date.now(),
              requestedByRole: role,
              status: 'Submitted',
            };
            setSourcingRequests((prev) => [created, ...prev]);
            addAudit(
              role,
              `Submitted global sourcing request (${req.originHub}${req.dgdaAssistance ? ' + DGDA NPA' : ''}) for ${req.itemName}`,
              refNo
            );
            notify(`Hospital sourcing request ${refNo} logged${req.dgdaAssistance ? ' with DGDA NPA assistance' : ''}.`);
            if (authUser) {
              void persistWorkspaceSourcingRequest(toFirestoreSourcing(authUser.uid, created));
            }
            return refNo;
          }}
          onAdvanceSourcingStatus={(refNo, nextStatus, role) => {
            let updatedReq: HospitalSourcingRequest | null = null;
            setSourcingRequests((prev) =>
              prev.map((r) => {
                if (r.ref !== refNo) return r;
                updatedReq = { ...r, status: nextStatus };
                return updatedReq;
              })
            );
            addAudit(role, `Advanced global sourcing & DGDA request to ${nextStatus}`, refNo);
            notify(`Sourcing request ${refNo} updated to ${nextStatus}.`);
            if (authUser && updatedReq) {
              void persistWorkspaceSourcingRequest(toFirestoreSourcing(authUser.uid, updatedReq));
            }
          }}
          onToggleBookmarkMolecule={(molecule, role) => {
            const exists = bookmarkedMoleculeIds.includes(molecule.id);
            setBookmarkedMoleculeIds((prev) =>
              exists ? prev.filter((id) => id !== molecule.id) : [...prev, molecule.id]
            );
            addAudit(
              role,
              exists
                ? `Removed ${molecule.molecule} from hospital formulary watchlist`
                : `Bookmarked ${molecule.molecule} (${molecule.modality}) to clinical protocol watchlist`,
              molecule.id.toUpperCase()
            );
            notify(
              exists
                ? `Removed ${molecule.molecule} from protocol watchlist.`
                : `Saved ${molecule.molecule} to hospital formulary watchlist.`
            );
          }}
          onRequestMedicalDossier={(molecule, role) => {
            const refNo = makeRef('MAF');
            addAudit(
              role,
              `Requested scientific dossier & trial brief for ${molecule.molecule} (${molecule.launcherCategory})`,
              refNo
            );
            notify(`Medical Affairs dossier request ${refNo} logged for ${molecule.molecule}.`);
          }}
          onRoleSwitch={(role) => {
            addAudit('RBAC Session', `Switched Provider Portal role to ${role}`, 'RBAC');
          }}
          onNavigate={navigate}
        />
      )}
      {(route === 'pharmacy' || route === 'cart' || route === 'orders') && (
        <PharmacyView
          mode={route}
          cart={cart}
          orders={orders}
          onAddToCart={handleAddToCart}
          onDecCart={handleDecCart}
          onRemoveCart={handleRemoveCart}
          onPlaceOrder={handlePlaceOrder}
          onNavigate={navigate}
        />
      )}
      {route === 'pharma-tech' && (
        <PharmaTradeView
          audits={audits}
          recalls={recalls}
          pvReports={pvReports}
          rfqs={rfqs}
          tradeOrders={tradeOrders}
          partnerSession={partnerSession}
          sharedBriefIds={sharedBriefIds}
          initialTab={pharmaTabFocus}
          onPartnerSignIn={(session) => {
            setPartnerSession(session);
            addAudit('Partner Portal', `Authenticated ${session.company} for Generic Launch Monitor`, 'PARTNER');
            notify(`Signed in as ${session.company}.`);
          }}
          onPartnerSignOut={() => {
            setPartnerSession(null);
            addAudit('Partner Portal', 'Partner company signed out of Launch Monitor', 'PARTNER');
            notify('Signed out of Partner Generic Launch Monitor.');
          }}
          onPublishClinicianBrief={(item) => {
            const alreadyShared = sharedBriefIds.includes(item.id);
            setSharedBriefIds((prev) =>
              alreadyShared ? prev.filter((id) => id !== item.id) : [item.id, ...prev]
            );
            addAudit(
              'Partner Medical Affairs',
              alreadyShared
                ? `Unpublished scientific brief for ${item.molecule}`
                : `Shared scientific brief & AI summary for ${item.molecule} (${item.launcherCategory}) to Provider Portal`,
              item.id.toUpperCase()
            );
            notify(
              alreadyShared
                ? `Removed ${item.molecule} from Partner-Featured Doctor Briefs.`
                : `Published ${item.molecule} research & AI usage brief to Doctors & Hospitals.`
            );
          }}
          onVerifyAudit={(batch) => {
            setAudits((prev) => prev.map((a) => (a.batch === batch ? { ...a, status: 'Released · QA Verified' } : a)));
            addAudit('Pharma QA', 'Batch released after QA/QC audit', batch);
            notify(`Batch ${batch} QA verified.`);
          }}
          onTriggerRecall={(batch, product, scope, area = 'Cardiovascular', severity = 'Class II') => {
            const refNo = makeRef('RCL');
            setRecalls((prev) => [
              {
                ref: refNo,
                batch,
                product,
                area,
                severity,
                issuedDate: '16 Nov 2026',
                affectedLots: 250,
                acknowledged: false,
                scope,
                status: 'Simulated Notice Sent',
              },
              ...prev,
            ]);
            addAudit('Pharma QA', `Dispatched simulated recall for ${batch}`, refNo);
            notify(`Simulated recall notice ${refNo} sent.`);
          }}
          onAcknowledgeRecall={(refNo) => {
            setRecalls((prev) =>
              prev.map((r) =>
                r.ref === refNo
                  ? { ...r, acknowledged: true, status: 'Acknowledged · Quarantine Verified' }
                  : r
              )
            );
            addAudit('Pharma QA Lead', 'Acknowledged recall alert & logged quarantine compliance', refNo);
            notify(`Recall ${refNo} acknowledged.`);
          }}
          onSubmitRfq={(lines, incoterm, destination, notes) => {
            const refNo = makeRef('RFQ');
            setRfqs((prev) => [
              { ref: refNo, t: Date.now(), lines, incoterm, destination, notes, status: 'submitted' },
              ...prev,
            ]);
            addAudit('Distributor', 'Submitted B2B Trade RFQ', refNo);
            notify(`RFQ ${refNo} submitted.`);
            return refNo;
          }}
          onAcceptQuote={handleAcceptQuote}
        />
      )}
      {route === 'insurance' && (
        <InsuranceView
          claims={claims}
          onDecideClaim={(id, status) => {
            setClaims((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
            addAudit('Insurance Adjuster', `Claim updated to ${status}`, id);
            notify(`Claim ${id} marked ${status}.`);
          }}
        />
      )}
      {route === 'company' && (
        <CompanyView
          enquiries={enquiries}
          onSubmitEnquiry={(e) => {
            const refNo = makeRef('ENQ');
            setEnquiries((prev) => [{ ...e, ref: refNo, t: Date.now() }, ...prev]);
            addAudit('Partner / Investor', `Submitted ${e.kind}`, refNo);
            notify(`Enquiry ${refNo} submitted.`);
            return refNo;
          }}
          onNavigate={navigate}
        />
      )}
      {route === 'support' && (
        <SupportView
          pvReports={pvReports}
          scanCounts={scanCounts}
          onSubmitPv={(r) => {
            const refNo = makeRef('PV');
            const created: PharmacovigilanceReport = {
              ...r,
              ref: refNo,
              t: Date.now(),
              status: 'Received',
            };
            setPvReports((prev) => [created, ...prev]);
            addAudit('Pharmacovigilance', 'Logged ADR safety report', refNo);
            notify(`ADR safety report ${refNo} received.`);
            if (authUser) {
              void persistWorkspacePvReport(toFirestorePv(authUser.uid, created));
            }
            return refNo;
          }}
          onVerifySerial={(code) => {
            const res = verifySerialCode(code, scanCounts, PRODUCTS);
            if (res.valid) {
              setScanCounts((prev) => ({ ...prev, [res.code]: res.scans }));
            }
            addAudit('Pack Verification', res.valid ? 'Serial matched' : 'Unrecognized serial', res.code || 'NONE');
            return res;
          }}
        />
      )}
      {route === 'staff' && (
        <StaffConsoleView
          orders={orders}
          rfqs={rfqs}
          tradeOrders={tradeOrders}
          cases={cases}
          pvReports={pvReports}
          enquiries={enquiries}
          auditLog={auditLog}
          onAdvanceOrder={handleAdvanceOrder}
          onIssueQuote={handleIssueQuote}
          onAdvanceTradeOrder={handleAdvanceTradeOrder}
          onTriageCase={handleTriageCase}
          onResetDemo={handleResetDemo}
          databasePanel={databasePanel}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 bg-[#03151c] text-white text-sm px-4 py-3 rounded-xl shadow-lg border border-cyan-400/30"
        >
          {toast}
        </div>
      )}
    </Layout>
  );
}
