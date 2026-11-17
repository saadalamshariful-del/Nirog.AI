# NIROG.AI Firestore Security Specification (Phase 0)

## 1. Core Data Invariants
1. **Default-Deny Catch-All**: Every path defaults to `false`; only explicitly matched, authenticated, owner-scoped resources are accessible.
2. **Master Gate Parent Sync**: Every subcollection under `/workspaces/{userId}/...` verifies parent existence via `exists(/databases/$(database)/documents/workspaces/$(userId))` and strict owner match `request.auth.uid == userId` with verified email (`request.auth.token.email_verified == true`).
3. **PII Isolation**: User email is isolated strictly in `/workspaces/{userId}/private/profile`, readable and writable only by the authenticated verified owner.
4. **Anti-Update-Gap & Strict Keys**: Every `create` enforces `keys().hasAll(...) && keys().hasOnly(...)` with exact type and `.size()` limits; every `update` enforces `isValid[Entity](incoming())`, immutable `uid` and `createdAt`, server-timestamp integrity (`request.time`), and explicit `affectedKeys().hasOnly(...)` allowlists.
5. **Terminal State Locking**: Orders at `'delivered'`, Support Cases at `'withdrawn'`/`'approved'`, Appointments at `'Completed'`, and PV Reports at `'Closed'` cannot be altered by client updates once finalized.
6. **ID Poisoning Guard**: Every single-document path validates document IDs via `isValidId(id)` (`^[a-zA-Z0-9_\\-]+$`, `size <= 128`).

## 2. "Dirty Dozen" Attack Payloads (All Must Fail with PERMISSION_DENIED)
1. **Unauthenticated Workspace Read**: Unauthenticated client calls `getDoc(/workspaces/userA)`.
2. **Cross-Tenant Read/List**: Signed-in `userB` calls `list` or `get` on `/workspaces/userA/orders`.
3. **UID Spoofing on Create**: Signed-in `userA` creates `/workspaces/userA/orders/ord1` with `uid: "userB"`.
4. **Ghost Shadow Field Injection**: `userA` creates `/workspaces/userA` with extra field `isAdmin: true` or `role: "superadmin"`.
5. **Client-Forged Timestamp**: `userA` creates `/workspaces/userA` with `createdAt` set to a past client `Timestamp` instead of `request.time`.
6. **Unverified Email Bypass**: User with `email_verified: false` tries to create `/workspaces/userA/orders/ord1`.
7. **Orphan Subcollection Write**: `userA` tries to write `/workspaces/userA/orders/ord1` before parent `/workspaces/userA` exists.
8. **1MB Resource Exhaustion String**: `userA` tries to set `summary` > 500 characters or `description` > 1000 characters.
9. **Path ID Poisoning**: `userA` tries to create document ID containing invalid characters or length > 128.
10. **Immutable Ownership Tampering**: `userA` updates `/workspaces/userA` attempting to change `uid` or `createdAt`.
11. **Terminal State Reversal**: `userA` updates `/workspaces/userA/orders/ord1` from `status: "delivered"` back to `status: "received"`.
12. **PII Leak to Non-Owner**: `userB` requests `get` on `/workspaces/userA/private/profile`.
