import React, { useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Cloud,
  Database,
  Download,
  FolderOpen,
  HardDrive,
  LogOut,
  RefreshCw,
  Upload,
} from 'lucide-react';
import {
  buildDatabaseSnapshot,
  createDriveDatabaseFile,
  DEFAULT_DB_FILENAME,
  DEFAULT_DRIVE_FOLDER_NAME,
  downloadDriveDatabaseFile,
  downloadLocalDatabaseFile,
  findOrCreateDriveFolder,
  listDriveDatabaseFiles,
  overwriteDriveDatabaseFile,
  parseDatabaseFileJson,
  type DriveFileMeta,
  type NirogDatabaseFile,
} from '../lib/driveDb';
import {
  persistDriveBackupLog,
  reauthorizeGoogleDrive,
  updateWorkspaceDriveMetadata,
  type WorkspaceSnapshotData,
} from '../lib/firebase';

interface DatabaseSyncPanelProps {
  authUser: User | null;
  authReady: boolean;
  driveAccessToken: string | null;
  workspaceData: WorkspaceSnapshotData | null;
  snapshotCollections: NirogDatabaseFile['collections'];
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  onSyncSessionToFirestore: () => Promise<void>;
  onRestoreDatabase: (dbFile: NirogDatabaseFile, sourceLabel: string) => void;
  onNotify: (msg: string) => void;
}

type PendingConfirm =
  | {
      kind: 'overwrite-drive';
      folderId: string;
      folderName: string;
      fileId: string;
      fileName: string;
      dbFile: NirogDatabaseFile;
    }
  | {
      kind: 'restore-db';
      sourceLabel: string;
      dbFile: NirogDatabaseFile;
    }
  | null;

export const DatabaseSyncPanel: React.FC<DatabaseSyncPanelProps> = ({
  authUser,
  authReady,
  driveAccessToken,
  workspaceData,
  snapshotCollections,
  onGoogleSignIn,
  onGoogleSignOut,
  onSyncSessionToFirestore,
  onRestoreDatabase,
  onNotify,
}) => {
  const [folderName, setFolderName] = useState(
    workspaceData?.workspace?.driveFolderName || DEFAULT_DRIVE_FOLDER_NAME
  );
  const [fileName, setFileName] = useState(DEFAULT_DB_FILENAME);
  const [driveFiles, setDriveFiles] = useState<DriveFileMeta[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(
    workspaceData?.workspace?.driveFolderId || null
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string>('');
  const [errorNote, setErrorNote] = useState<string>('');
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentSnapshot = buildDatabaseSnapshot(
    snapshotCollections,
    authUser?.email || undefined
  );

  const ensureDriveToken = async (): Promise<string | null> => {
    if (driveAccessToken) return driveAccessToken;
    const freshToken = await reauthorizeGoogleDrive();
    return freshToken;
  };

  const handleSaveLocalFile = () => {
    setErrorNote('');
    downloadLocalDatabaseFile(currentSnapshot, fileName.trim() || DEFAULT_DB_FILENAME);
    setStatusNote(
      `Exported ${currentSnapshot.recordCount} records to local file ${fileName.trim() || DEFAULT_DB_FILENAME}.`
    );
    onNotify(`Database file downloaded (${currentSnapshot.recordCount} records).`);
  };

  const handleLocalFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorNote('');
    try {
      const text = await file.text();
      const parsed = parseDatabaseFileJson(text);
      setPendingConfirm({
        kind: 'restore-db',
        sourceLabel: `Local file "${file.name}"`,
        dbFile: parsed,
      });
    } catch (err) {
      setErrorNote(err instanceof Error ? err.message : 'Unable to parse database JSON file.');
    }
  };

  const handleSaveToDriveFolder = async () => {
    setErrorNote('');
    setStatusNote('');
    setBusyAction('save-drive');
    try {
      const token = await ensureDriveToken();
      if (!token) {
        setErrorNote('Google Drive access permission is required to save inside your Drive folder.');
        return;
      }
      const targetFolder = await findOrCreateDriveFolder(token, folderName);
      setActiveFolderId(targetFolder.id);

      const files = await listDriveDatabaseFiles(token, targetFolder.id);
      setDriveFiles(files);

      const cleanFileName = fileName.trim() || DEFAULT_DB_FILENAME;
      const existing = files.find((f) => f.name === cleanFileName);
      const dbFile = buildDatabaseSnapshot(snapshotCollections, authUser?.email || undefined);

      if (existing) {
        // Explicit user confirmation required before mutating/overwriting existing Drive file
        setPendingConfirm({
          kind: 'overwrite-drive',
          folderId: targetFolder.id,
          folderName: targetFolder.name,
          fileId: existing.id,
          fileName: existing.name,
          dbFile,
        });
        return;
      }

      const created = await createDriveDatabaseFile(token, targetFolder.id, cleanFileName, dbFile);
      const updatedList = await listDriveDatabaseFiles(token, targetFolder.id);
      setDriveFiles(updatedList);

      if (authUser) {
        const nowIso = new Date().toISOString();
        await updateWorkspaceDriveMetadata(authUser.uid, {
          driveFolderId: targetFolder.id,
          driveFolderName: targetFolder.name,
          driveFileId: created.id,
          lastDriveSyncIso: nowIso,
        });
        await persistDriveBackupLog({
          uid: authUser.uid,
          fileId: created.id,
          folderId: targetFolder.id,
          fileName: created.name,
          folderName: targetFolder.name,
          recordCount: dbFile.recordCount,
        });
      }

      setStatusNote(
        `Saved "${created.name}" inside Google Drive folder "${targetFolder.name}" (${dbFile.recordCount} records).`
      );
      onNotify(`Database saved to Google Drive folder "${targetFolder.name}".`);
    } catch (err) {
      setErrorNote(err instanceof Error ? err.message : 'Google Drive save failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleBrowseDriveFolder = async () => {
    setErrorNote('');
    setBusyAction('list-drive');
    try {
      const token = await ensureDriveToken();
      if (!token) {
        setErrorNote('Sign in with Google Drive permission to list folder backups.');
        return;
      }
      const targetFolder = await findOrCreateDriveFolder(token, folderName);
      setActiveFolderId(targetFolder.id);
      const files = await listDriveDatabaseFiles(token, targetFolder.id);
      setDriveFiles(files);
      setStatusNote(
        files.length > 0
          ? `Found ${files.length} file(s) inside Google Drive folder "${targetFolder.name}".`
          : `Folder "${targetFolder.name}" is ready in your Google Drive (0 files yet).`
      );
    } catch (err) {
      setErrorNote(err instanceof Error ? err.message : 'Unable to read Google Drive folder.');
    } finally {
      setBusyAction(null);
    }
  };

  const handlePickDriveRestore = async (file: DriveFileMeta) => {
    setErrorNote('');
    setBusyAction('load-drive');
    try {
      const token = await ensureDriveToken();
      if (!token) {
        setErrorNote('Google Drive access token unavailable. Please reconnect Google Drive.');
        return;
      }
      const parsed = await downloadDriveDatabaseFile(token, file.id);
      setPendingConfirm({
        kind: 'restore-db',
        sourceLabel: `Google Drive file "${file.name}"`,
        dbFile: parsed,
      });
    } catch (err) {
      setErrorNote(err instanceof Error ? err.message : 'Unable to download database file from Drive.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmPendingAction = async () => {
    if (!pendingConfirm) return;
    const action = pendingConfirm;
    setPendingConfirm(null);

    if (action.kind === 'restore-db') {
      onRestoreDatabase(action.dbFile, action.sourceLabel);
      setStatusNote(
        `Restored ${action.dbFile.recordCount} records from ${action.sourceLabel}.`
      );
      return;
    }

    if (action.kind === 'overwrite-drive') {
      setBusyAction('save-drive');
      setErrorNote('');
      try {
        const token = await ensureDriveToken();
        if (!token) {
          setErrorNote('Google Drive token expired. Re-authorize and try again.');
          return;
        }
        const updated = await overwriteDriveDatabaseFile(token, action.fileId, action.dbFile);
        const files = await listDriveDatabaseFiles(token, action.folderId);
        setDriveFiles(files);

        if (authUser) {
          const nowIso = new Date().toISOString();
          await updateWorkspaceDriveMetadata(authUser.uid, {
            driveFolderId: action.folderId,
            driveFolderName: action.folderName,
            driveFileId: updated.id,
            lastDriveSyncIso: nowIso,
          });
          await persistDriveBackupLog({
            uid: authUser.uid,
            fileId: updated.id,
            folderId: action.folderId,
            fileName: updated.name,
            folderName: action.folderName,
            recordCount: action.dbFile.recordCount,
          });
        }

        setStatusNote(
          `Updated "${updated.name}" inside Google Drive folder "${action.folderName}" (${action.dbFile.recordCount} records).`
        );
        onNotify(`Updated database file "${updated.name}" in Google Drive.`);
      } catch (err) {
        setErrorNote(err instanceof Error ? err.message : 'Failed to update Drive database file.');
      } finally {
        setBusyAction(null);
      }
    }
  };

  return (
    <section
      id="database-drive-sync"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 scroll-mt-24"
      data-testid="database-sync-panel"
    >
      {/* Header + Official Google Sign-In Control */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-[#071e26]">
            <Database className="w-5 h-5 text-cyan-700" />
            <span>Cloud Database (Firestore) &amp; Google Drive Folder Backup</span>
          </h2>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl">
            Sign in with Google to persist your NIROG.AI workspace records in Cloud Firestore and save/restore portable <span className="font-mono">.json</span> database snapshots inside a dedicated Google Drive folder.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {!authReady ? (
            <span className="text-xs font-mono text-slate-500">Checking session...</span>
          ) : authUser ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="text-right">
                <div className="text-xs font-bold text-[#071e26]">
                  {authUser.displayName || 'Google Member'}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  {authUser.email}
                </div>
              </div>
              <button
                type="button"
                onClick={onSyncSessionToFirestore}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Sync to Firestore</span>
              </button>
              <button
                type="button"
                onClick={onGoogleSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onGoogleSignIn}
              data-testid="google-signin-button"
              className="gsi-material-button inline-flex items-center gap-2.5 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold text-[#1f1f1f] transition-colors shadow-xs whitespace-nowrap"
            >
              <svg
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 48 48"
                className="w-4 h-4 shrink-0 block"
                aria-hidden="true"
              >
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
                <path fill="none" d="M0 0h48v48H0z" />
              </svg>
              <span>Sign in with Google</span>
            </button>
          )}
        </div>
      </div>

      {/* Hairline-Divided Telemetry Summary Row (Single Elevation) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border-y border-slate-200 py-3 text-xs">
        <div className="px-2 sm:pr-4 py-1">
          <span className="text-slate-500 block">Cloud Auth Status</span>
          <span className="text-sm font-bold text-[#071e26] font-mono">
            {authUser ? 'Authenticated (Verified)' : 'Local Session'}
          </span>
        </div>
        <div className="px-2 sm:px-4 py-1">
          <span className="text-slate-500 block">Firestore Persisted Docs</span>
          <span className="text-sm font-bold text-cyan-800 font-mono tabular-nums">
            {authUser && workspaceData
              ? `${
                  workspaceData.ordersCount +
                  workspaceData.casesCount +
                  workspaceData.appointmentsCount +
                  workspaceData.pvCount +
                  (workspaceData.sourcingRequestsCount ?? 0)
                } records`
              : 'Sign in to sync'}
          </span>
        </div>
        <div className="px-2 sm:px-4 py-1">
          <span className="text-slate-500 block">Snapshot Size</span>
          <span className="text-sm font-bold text-[#071e26] font-mono tabular-nums">
            {currentSnapshot.recordCount} total items
          </span>
        </div>
        <div className="px-2 sm:pl-4 py-1">
          <span className="text-slate-500 block">Last Drive Sync</span>
          <span className="text-sm font-bold text-emerald-700 font-mono tabular-nums truncate block">
            {workspaceData?.workspace?.lastDriveSyncIso
              ? workspaceData.workspace.lastDriveSyncIso.slice(0, 16).replace('T', ' ')
              : 'Not backed up yet'}
          </span>
        </div>
      </div>

      {/* Google Drive Folder Backup & Portable Database File Controls */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Left: Google Drive Folder Config & Actions */}
        <div className="lg:col-span-7 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="drive-folder-name" className="block text-xs font-semibold mb-1">
                Google Drive Folder Name
              </label>
              <input
                id="drive-folder-name"
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder={DEFAULT_DRIVE_FOLDER_NAME}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="drive-file-name" className="block text-xs font-semibold mb-1">
                Database File Name (.json)
              </label>
              <input
                id="drive-file-name"
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder={DEFAULT_DB_FILENAME}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleSaveToDriveFolder}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#03151c] hover:bg-[#072430] text-white text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>
                {busyAction === 'save-drive'
                  ? 'Saving to Drive...'
                  : 'Save Database to Google Drive Folder'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleBrowseDriveFolder}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:border-cyan-700 text-xs font-semibold text-[#071e26] transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <FolderOpen className="w-3.5 h-3.5 text-cyan-700" />
              <span>
                {busyAction === 'list-drive' ? 'Loading Folder...' : 'Browse Drive Folder'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleSaveLocalFile}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:border-cyan-700 text-xs font-semibold text-[#071e26] transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-cyan-700" />
              <span>Download .JSON File</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:border-cyan-700 text-xs font-semibold text-[#071e26] transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-700" />
              <span>Import .JSON File</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleLocalFileSelected}
              className="hidden"
              aria-label="Import NIROG.AI database JSON file"
            />
          </div>

          {statusNote && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-900">
              {statusNote}
            </div>
          )}
          {errorNote && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-800">
              {errorNote}
            </div>
          )}
        </div>

        {/* Right: Drive Folder Files & Firestore Backup History */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#071e26]">
              Drive Folder Contents ({driveFiles.length})
            </span>
            {activeFolderId && (
              <span className="font-mono text-slate-500 truncate max-w-[180px]">
                Folder ID: {activeFolderId}
              </span>
            )}
          </div>

          {driveFiles.length > 0 ? (
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
              {driveFiles.map((f) => (
                <div
                  key={f.id}
                  className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-mono font-semibold text-[#071e26] truncate">
                      {f.name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {f.modifiedTime ? f.modifiedTime.slice(0, 16).replace('T', ' ') : 'Synced'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePickDriveRestore(f)}
                    disabled={busyAction !== null}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-cyan-700 text-cyan-800 font-semibold hover:bg-cyan-50 shrink-0"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Restore</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 text-xs text-slate-600 text-center">
              {workspaceData?.driveBackups && workspaceData.driveBackups.length > 0 ? (
                <div className="space-y-1 text-left">
                  <div className="font-semibold text-[#071e26]">Recent Firestore Drive Sync Log:</div>
                  {workspaceData.driveBackups.slice(0, 3).map((b, i) => (
                    <div key={`${b.fileId}-${i}`} className="font-mono text-[11px] text-slate-600 truncate">
                      {b.folderName}/{b.fileName} · {b.recordCount} records
                    </div>
                  ))}
                </div>
              ) : (
                'Save or browse your Google Drive folder to view stored .json database snapshots.'
              )}
            </div>
          )}
        </div>
      </div>

      {/* Explicit Confirmation Modal Before Modifying Google Drive File or Restoring Workspace */}
      {pendingConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#03151c]/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="db-confirm-title"
        >
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-2xl">
            <h3 id="db-confirm-title" className="text-base font-bold text-[#071e26]">
              {pendingConfirm.kind === 'overwrite-drive'
                ? 'Update Existing Google Drive Database File?'
                : 'Restore Workspace from Database File?'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {pendingConfirm.kind === 'overwrite-drive' ? (
                <>
                  A file named <strong className="font-mono">{pendingConfirm.fileName}</strong> already exists inside your Google Drive folder <strong>{pendingConfirm.folderName}</strong>. Confirm to replace its contents with the latest snapshot ({pendingConfirm.dbFile.recordCount} records).
                </>
              ) : (
                <>
                  Confirm restoring workspace collections from <strong>{pendingConfirm.sourceLabel}</strong> ({pendingConfirm.dbFile.recordCount} records exported on{' '}
                  <span className="font-mono">{pendingConfirm.dbFile.exportedAt.slice(0, 16)}</span>). This will replace your current in-session workspace tables.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPendingAction}
                className="px-4 py-2 rounded-lg bg-[#03151c] hover:bg-[#072430] text-white text-xs font-semibold"
              >
                {pendingConfirm.kind === 'overwrite-drive' ? 'Confirm Update' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
