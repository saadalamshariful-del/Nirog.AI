import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'] as const;

const app = initializeApp(firebaseConfig);
const configuredDbId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const db = configuredDbId ? getFirestore(app, configuredDbId) : getFirestore(app);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
DRIVE_SCOPES.forEach((scope) => googleProvider.addScope(scope));
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Strict in-memory OAuth access token cache (never stored in localStorage/sessionStorage)
let cachedDriveAccessToken: string | null = null;
let isSigningIn = false;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: the client is offline.');
    }
  }
}

if (typeof window !== 'undefined') {
  void testConnection();
}

export function sanitizeDocId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 120);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

export function encodeDiaryMask(days: Record<number, boolean>): string {
  let mask = '';
  for (let i = 0; i < 7; i++) {
    mask += days[i] ? '1' : '0';
  }
  return mask;
}

export function decodeDiaryMask(mask: string): Record<number, boolean> {
  const out: Record<number, boolean> = {};
  for (let i = 0; i < 7; i++) {
    out[i] = mask[i] === '1';
  }
  return out;
}

export interface WorkspaceDoc {
  uid: string;
  displayName: string;
  diaryOn: boolean;
  diaryDaysMask: string;
  driveFolderId?: string;
  driveFolderName?: string;
  driveFileId?: string;
  lastDriveSyncIso?: string;
}

export interface PersistedOrderSummary {
  uid: string;
  ref: string;
  status: 'received' | 'rx_review' | 'confirmed' | 'packed' | 'dispatched' | 'delivered';
  payMethod: 'cod' | 'card' | 'mfs';
  totalBdt: number;
  itemCount: number;
  summary: string;
}

export interface PersistedSupportCaseSummary {
  uid: string;
  ref: string;
  program: string;
  status: 'submitted' | 'under_review' | 'more_info' | 'approved' | 'withdrawn';
  summary: string;
}

export interface PersistedAppointmentSummary {
  uid: string;
  ref: string;
  patient: string;
  time: string;
  reason: string;
  status: 'Scheduled' | 'Waiting' | 'In Review' | 'Completed';
  vitals: string;
}

export interface PersistedPvReportSummary {
  uid: string;
  ref: string;
  reporter: string;
  product: string;
  severity: 'Mild' | 'Moderate' | 'Severe / Seek urgent care';
  description: string;
  status: 'Received' | 'Under Pharmacovigilance Review' | 'Closed';
}

export interface PersistedDriveBackup {
  uid: string;
  fileId: string;
  folderId: string;
  fileName: string;
  folderName: string;
  recordCount: number;
}

export interface PersistedSourcingRequestSummary {
  uid: string;
  ref: string;
  hospitalName: string;
  category:
    | 'Unapproved / Unavailable Medicine'
    | 'Hospital Beds'
    | 'Clinical Equipment & Devices'
    | 'Robotic Surgery Systems';
  originHub: 'China NMPA Originator Hub' | 'China MedTech Partner' | 'Turkey MedTech Partner';
  itemName: string;
  quantity: number;
  dgdaAssistance: boolean;
  patientOrDeptContext: string;
  status: 'Submitted' | 'DGDA Filing / Partner Quote' | 'Approved / In Transit';
}

export function initFirebaseAuth(
  onUserChanged: (user: User | null, driveToken: string | null) => void
): Unsubscribe {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedDriveAccessToken = null;
      onUserChanged(null, null);
      return;
    }
    if (!isSigningIn) {
      onUserChanged(user, cachedDriveAccessToken);
    }
  });
}

export async function signInWithGoogleWorkspace(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedDriveAccessToken = credential?.accessToken ?? null;
    return {
      user: result.user,
      accessToken: cachedDriveAccessToken,
    };
  } finally {
    isSigningIn = false;
  }
}

export async function reauthorizeGoogleDrive(): Promise<string | null> {
  const res = await signInWithGoogleWorkspace();
  return res.accessToken;
}

export function getCachedDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export async function signOutGoogleWorkspace(): Promise<void> {
  cachedDriveAccessToken = null;
  await signOut(auth);
}

export async function ensureUserWorkspace(
  user: User,
  defaults: { diaryOn: boolean; diaryDays: Record<number, boolean> }
): Promise<void> {
  const uid = sanitizeDocId(user.uid);
  const wsPath = `workspaces/${uid}`;
  const wsRef = doc(db, 'workspaces', uid);

  try {
    const snap = await getDoc(wsRef);
    if (!snap.exists()) {
      await setDoc(wsRef, {
        uid,
        displayName: (user.displayName || 'NIROG.AI Member').slice(0, 160),
        diaryOn: defaults.diaryOn,
        diaryDaysMask: encodeDiaryMask(defaults.diaryDays),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, wsPath);
  }

  const privPath = `workspaces/${uid}/private/profile`;
  const privRef = doc(db, 'workspaces', uid, 'private', 'profile');
  try {
    const privSnap = await getDoc(privRef);
    const email = (user.email || '').slice(0, 160);
    if (!privSnap.exists()) {
      await setDoc(privRef, {
        uid,
        email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (privSnap.data().email !== email) {
      await updateDoc(privRef, {
        email,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privPath);
  }
}

export async function updateWorkspaceDiaryState(
  uid: string,
  displayName: string,
  diaryOn: boolean,
  diaryDays: Record<number, boolean>
): Promise<void> {
  const cleanUid = sanitizeDocId(uid);
  const path = `workspaces/${cleanUid}`;
  try {
    await updateDoc(doc(db, 'workspaces', cleanUid), {
      displayName: (displayName || 'NIROG.AI Member').slice(0, 160),
      diaryOn,
      diaryDaysMask: encodeDiaryMask(diaryDays),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateWorkspaceDriveMetadata(
  uid: string,
  meta: {
    driveFolderId: string;
    driveFolderName: string;
    driveFileId: string;
    lastDriveSyncIso: string;
  }
): Promise<void> {
  const cleanUid = sanitizeDocId(uid);
  const path = `workspaces/${cleanUid}`;
  try {
    await updateDoc(doc(db, 'workspaces', cleanUid), {
      driveFolderId: meta.driveFolderId.slice(0, 128),
      driveFolderName: meta.driveFolderName.slice(0, 120),
      driveFileId: meta.driveFileId.slice(0, 128),
      lastDriveSyncIso: meta.lastDriveSyncIso.slice(0, 64),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function persistWorkspaceOrder(order: PersistedOrderSummary): Promise<void> {
  const uid = sanitizeDocId(order.uid);
  const docId = sanitizeDocId(order.ref);
  const path = `workspaces/${uid}/orders/${docId}`;
  const ref = doc(db, 'workspaces', uid, 'orders', docId);
  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        uid,
        ref: docId.slice(0, 40),
        status: order.status,
        payMethod: order.payMethod,
        totalBdt: Math.max(0, Number(order.totalBdt) || 0),
        itemCount: Math.max(0, Number(order.itemCount) || 0),
        summary: order.summary.slice(0, 500),
        createdAt: serverTimestamp(),
      });
    } else if (existingSnap.data().status !== 'delivered' && existingSnap.data().status !== order.status) {
      await updateDoc(ref, { status: order.status });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function persistWorkspaceSupportCase(c: PersistedSupportCaseSummary): Promise<void> {
  const uid = sanitizeDocId(c.uid);
  const docId = sanitizeDocId(c.ref);
  const path = `workspaces/${uid}/supportCases/${docId}`;
  const ref = doc(db, 'workspaces', uid, 'supportCases', docId);
  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        uid,
        ref: docId.slice(0, 40),
        program: c.program.slice(0, 120),
        status: c.status,
        summary: c.summary.slice(0, 500),
        createdAt: serverTimestamp(),
      });
    } else {
      const curStatus = existingSnap.data().status;
      if (curStatus !== 'approved' && curStatus !== 'withdrawn' && curStatus !== c.status) {
        await updateDoc(ref, { status: c.status });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function persistWorkspaceAppointment(apt: PersistedAppointmentSummary): Promise<void> {
  const uid = sanitizeDocId(apt.uid);
  const docId = sanitizeDocId(apt.ref);
  const path = `workspaces/${uid}/appointments/${docId}`;
  const ref = doc(db, 'workspaces', uid, 'appointments', docId);
  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        uid,
        ref: docId.slice(0, 40),
        patient: apt.patient.slice(0, 120),
        time: apt.time.slice(0, 40),
        reason: apt.reason.slice(0, 240),
        status: apt.status,
        vitals: apt.vitals.slice(0, 240),
        createdAt: serverTimestamp(),
      });
    } else if (
      existingSnap.data().status !== 'Completed' &&
      (existingSnap.data().status !== apt.status || existingSnap.data().vitals !== apt.vitals.slice(0, 240))
    ) {
      await updateDoc(ref, {
        status: apt.status,
        vitals: apt.vitals.slice(0, 240),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function persistWorkspacePvReport(pv: PersistedPvReportSummary): Promise<void> {
  const uid = sanitizeDocId(pv.uid);
  const docId = sanitizeDocId(pv.ref);
  const path = `workspaces/${uid}/pvReports/${docId}`;
  const ref = doc(db, 'workspaces', uid, 'pvReports', docId);
  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        uid,
        ref: docId.slice(0, 40),
        reporter: pv.reporter.slice(0, 80),
        product: pv.product.slice(0, 120),
        severity: pv.severity,
        description: pv.description.slice(0, 1000),
        status: pv.status,
        createdAt: serverTimestamp(),
      });
    } else if (existingSnap.data().status !== 'Closed' && existingSnap.data().status !== pv.status) {
      await updateDoc(ref, { status: pv.status });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function persistDriveBackupLog(entry: PersistedDriveBackup): Promise<void> {
  const uid = sanitizeDocId(entry.uid);
  const docId = sanitizeDocId(`drv_${Date.now()}`);
  const path = `workspaces/${uid}/driveBackups/${docId}`;
  try {
    await setDoc(doc(db, 'workspaces', uid, 'driveBackups', docId), {
      uid,
      fileId: entry.fileId.slice(0, 128),
      folderId: entry.folderId.slice(0, 128),
      fileName: entry.fileName.slice(0, 160),
      folderName: entry.folderName.slice(0, 120),
      recordCount: Math.max(0, Number(entry.recordCount) || 0),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function persistWorkspaceSourcingRequest(
  req: PersistedSourcingRequestSummary
): Promise<void> {
  const uid = sanitizeDocId(req.uid);
  const docId = sanitizeDocId(req.ref);
  const path = `workspaces/${uid}/sourcingRequests/${docId}`;
  const ref = doc(db, 'workspaces', uid, 'sourcingRequests', docId);
  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        uid,
        ref: docId.slice(0, 40),
        hospitalName: req.hospitalName.slice(0, 160),
        category: req.category,
        originHub: req.originHub,
        itemName: req.itemName.slice(0, 200),
        quantity: Math.max(1, Math.round(Number(req.quantity) || 1)),
        dgdaAssistance: Boolean(req.dgdaAssistance),
        patientOrDeptContext: req.patientOrDeptContext.slice(0, 300),
        status: req.status,
        createdAt: serverTimestamp(),
      });
    } else if (
      existingSnap.data().status !== 'Approved / In Transit' &&
      existingSnap.data().status !== req.status
    ) {
      await updateDoc(ref, { status: req.status });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface WorkspaceSnapshotData {
  workspace: WorkspaceDoc | null;
  ordersCount: number;
  casesCount: number;
  appointmentsCount: number;
  pvCount: number;
  sourcingRequestsCount: number;
  driveBackups: PersistedDriveBackup[];
}

export function subscribeUserWorkspace(
  uid: string,
  onUpdate: (data: WorkspaceSnapshotData) => void
): Unsubscribe {
  const cleanUid = sanitizeDocId(uid);
  const wsPath = `workspaces/${cleanUid}`;
  const state: WorkspaceSnapshotData = {
    workspace: null,
    ordersCount: 0,
    casesCount: 0,
    appointmentsCount: 0,
    pvCount: 0,
    sourcingRequestsCount: 0,
    driveBackups: [],
  };

  const emit = () => onUpdate({ ...state });

  const unsubWs = onSnapshot(
    doc(db, 'workspaces', cleanUid),
    (snap) => {
      state.workspace = snap.exists() ? (snap.data() as WorkspaceDoc) : null;
      emit();
    },
    (err) => handleFirestoreError(err, OperationType.GET, wsPath)
  );

  const backupsPath = `workspaces/${cleanUid}/driveBackups`;
  const backupsQuery = query(
    collection(db, 'workspaces', cleanUid, 'driveBackups'),
    where('uid', '==', cleanUid),
    orderBy('createdAt', 'desc'),
    limit(10)
  );
  const unsubBackups = onSnapshot(
    backupsQuery,
    (snap) => {
      state.driveBackups = snap.docs.map((d) => d.data() as PersistedDriveBackup);
      emit();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, backupsPath)
  );

  const unsubOrders = onSnapshot(
    query(collection(db, 'workspaces', cleanUid, 'orders'), where('uid', '==', cleanUid)),
    (snap) => {
      state.ordersCount = snap.size;
      emit();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `workspaces/${cleanUid}/orders`)
  );

  const unsubCases = onSnapshot(
    query(collection(db, 'workspaces', cleanUid, 'supportCases'), where('uid', '==', cleanUid)),
    (snap) => {
      state.casesCount = snap.size;
      emit();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `workspaces/${cleanUid}/supportCases`)
  );

  const unsubApts = onSnapshot(
    query(collection(db, 'workspaces', cleanUid, 'appointments'), where('uid', '==', cleanUid)),
    (snap) => {
      state.appointmentsCount = snap.size;
      emit();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `workspaces/${cleanUid}/appointments`)
  );

  const unsubPv = onSnapshot(
    query(collection(db, 'workspaces', cleanUid, 'pvReports'), where('uid', '==', cleanUid)),
    (snap) => {
      state.pvCount = snap.size;
      emit();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `workspaces/${cleanUid}/pvReports`)
  );

  const unsubSourcing = onSnapshot(
    query(collection(db, 'workspaces', cleanUid, 'sourcingRequests'), where('uid', '==', cleanUid)),
    (snap) => {
      state.sourcingRequestsCount = snap.size;
      emit();
    },
    (err) =>
      handleFirestoreError(err, OperationType.LIST, `workspaces/${cleanUid}/sourcingRequests`)
  );

  return () => {
    unsubWs();
    unsubBackups();
    unsubOrders();
    unsubCases();
    unsubApts();
    unsubPv();
    unsubSourcing();
  };
}
