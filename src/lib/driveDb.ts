import type {
  AuditEntry,
  EnquiryRecord,
  HospitalSourcingRequest,
  InsuranceClaim,
  Order,
  PatientPrescription,
  PatientVitalReading,
  PharmaAuditRecord,
  PharmacovigilanceReport,
  ProviderAppointment,
  RadiologyCase,
  RecallNotice,
  SupportCase,
  TradeOrder,
  TradeRfq,
} from '../types/nirog';

export const DEFAULT_DRIVE_FOLDER_NAME = 'NIROG.AI Database';
export const DEFAULT_DB_FILENAME = 'nirog-ai-database.json';

export interface NirogDatabaseFile {
  schemaVersion: '1.0';
  appName: 'NIROG.AI';
  exportedAt: string;
  ownerEmail?: string;
  recordCount: number;
  collections: {
    orders: Order[];
    cases: SupportCase[];
    appointments: ProviderAppointment[];
    radQueue: RadiologyCase[];
    audits: PharmaAuditRecord[];
    recalls: RecallNotice[];
    pvReports: PharmacovigilanceReport[];
    rfqs: TradeRfq[];
    tradeOrders: TradeOrder[];
    claims: InsuranceClaim[];
    enquiries: EnquiryRecord[];
    auditLog: AuditEntry[];
    diaryOn: boolean;
    diaryDays: Record<number, boolean>;
    vitalsHistory?: PatientVitalReading[];
    prescriptions?: PatientPrescription[];
    sourcingRequests?: HospitalSourcingRequest[];
  };
}

export interface DriveFileMeta {
  id: string;
  name: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

export function buildDatabaseSnapshot(
  collections: NirogDatabaseFile['collections'],
  ownerEmail?: string
): NirogDatabaseFile {
  const recordCount =
    collections.orders.length +
    collections.cases.length +
    collections.appointments.length +
    collections.radQueue.length +
    collections.audits.length +
    collections.recalls.length +
    collections.pvReports.length +
    collections.rfqs.length +
    collections.tradeOrders.length +
    collections.claims.length +
    collections.enquiries.length +
    (collections.sourcingRequests?.length ?? 0);

  return {
    schemaVersion: '1.0',
    appName: 'NIROG.AI',
    exportedAt: new Date().toISOString(),
    ownerEmail,
    recordCount,
    collections,
  };
}

export function parseDatabaseFileJson(rawText: string): NirogDatabaseFile {
  const parsed = JSON.parse(rawText) as Partial<NirogDatabaseFile>;
  if (!parsed || parsed.appName !== 'NIROG.AI' || !parsed.collections) {
    throw new Error('Invalid NIROG.AI database JSON structure.');
  }
  const c = parsed.collections;
  if (!Array.isArray(c.orders) || !Array.isArray(c.cases) || !Array.isArray(c.appointments)) {
    throw new Error('Database file is missing core collections.');
  }
  return parsed as NirogDatabaseFile;
}

export function downloadLocalDatabaseFile(
  dbFile: NirogDatabaseFile,
  filename = DEFAULT_DB_FILENAME
): void {
  const json = JSON.stringify(dbFile, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeDriveQuery(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function findOrCreateDriveFolder(
  accessToken: string,
  folderName = DEFAULT_DRIVE_FOLDER_NAME
): Promise<{ id: string; name: string; created: boolean }> {
  const safeName = folderName.trim() || DEFAULT_DRIVE_FOLDER_NAME;
  const q = `name='${escapeDriveQuery(safeName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!searchRes.ok) {
    const errBody = await searchRes.text();
    throw new Error(`Google Drive folder lookup failed (${searchRes.status}): ${errBody}`);
  }
  const searchJson = (await searchRes.json()) as { files?: { id: string; name: string }[] };
  if (searchJson.files && searchJson.files.length > 0) {
    return { id: searchJson.files[0].id, name: searchJson.files[0].name, created: false };
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: safeName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(`Google Drive folder creation failed (${createRes.status}): ${errBody}`);
  }
  const created = (await createRes.json()) as { id: string; name: string };
  return { id: created.id, name: created.name, created: true };
}

export async function listDriveDatabaseFiles(
  accessToken: string,
  folderId: string
): Promise<DriveFileMeta[]> {
  const q = `'${escapeDriveQuery(folderId)}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,size,webViewLink)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Drive file listing failed (${res.status}): ${errBody}`);
  }
  const json = (await res.json()) as { files?: DriveFileMeta[] };
  return json.files || [];
}

export async function createDriveDatabaseFile(
  accessToken: string,
  folderId: string,
  fileName: string,
  dbFile: NirogDatabaseFile
): Promise<DriveFileMeta> {
  const metadata = {
    name: fileName.trim() || DEFAULT_DB_FILENAME,
    parents: [folderId],
    mimeType: 'application/json',
  };
  const boundary = 'nirog_db_boundary_' + Date.now();
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(dbFile, null, 2) +
    `\r\n--${boundary}--`;

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Drive file upload failed (${res.status}): ${errBody}`);
  }
  return (await res.json()) as DriveFileMeta;
}

export async function overwriteDriveDatabaseFile(
  accessToken: string,
  fileId: string,
  dbFile: NirogDatabaseFile
): Promise<DriveFileMeta> {
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime,size,webViewLink`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(dbFile, null, 2),
    }
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Drive file update failed (${res.status}): ${errBody}`);
  }
  return (await res.json()) as DriveFileMeta;
}

export async function downloadDriveDatabaseFile(
  accessToken: string,
  fileId: string
): Promise<NirogDatabaseFile> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Drive file download failed (${res.status}): ${errBody}`);
  }
  const text = await res.text();
  return parseDatabaseFileJson(text);
}
