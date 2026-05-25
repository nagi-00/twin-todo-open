# TwinTodo Strict Security Implementation Spec

This spec defines the initial security baseline for TwinTodo Open.

## 1) Security Stance

- The client is not trusted for authorization decisions.
- Firebase Auth, Firestore Rules, Storage Rules, and Cloud Functions enforce access.
- Solo mode is first-class and must be safe by default.
- Pair mode is optional and must require explicit request acceptance.
- Admin access is limited, audited, and never treated as a blanket data-reading permission.

## 2) Threat Model

### Account Takeover

Controls:

- Google OAuth only at launch.
- Email verification recorded on the user profile.
- Sensitive operations require fresh auth where practical.
- Admin accounts use separate Google accounts and 2FA.

### Nickname Hijacking

Controls:

- Normalize nicknames with Unicode NFKC, trim, whitespace collapse, and lowercase.
- Enforce length, allowed characters, and reserved words.
- Use `nicknames/{nicknameNormalized}` as a unique lock.
- Create and change nicknames only through server transactions.

### Confused Pairing

Controls:

- Nickname entry creates a request, not a connection.
- The target user must accept.
- Duplicate pending requests are blocked.
- Already paired users cannot be paired again without policy support.

### Unauthorized Data Access

Controls:

- Solo documents are accessible only by their owner UID.
- Pair documents are accessible only by active pair members.
- Pair creation and pair status updates are server-only.
- Audit logs are server-only.

### Malicious Client or Code Tampering

Controls:

- Security rules do not depend on UI state.
- App Check is required for server functions and Firebase APIs where supported.
- Hosting uses strict security headers.
- GitHub branch protection and required reviews are required before public launch.

## 3) Firestore Model

### User scope

`users/{uid}`

- `email`
- `emailVerified`
- `displayName`
- `nickname`
- `nicknameNormalized`
- `avatarPath`
- `role`
- `createdAt`
- `updatedAt`

`users/{uid}/todos/{todoId}`

- `ownerUid`
- `categoryKey`
- `title`
- `status`
- `date`
- `createdAt`
- `updatedAt`

`users/{uid}/settings/categories`

- `required`
- `growth`
- `freedom`
- `updatedBy`
- `updatedAt`

Other solo collections:

- `users/{uid}/journal/{date}`
- `users/{uid}/notes/{date}`
- `users/{uid}/routines/{routineId}`
- `users/{uid}/dateColors/{date}`

### Pair scope

`nicknames/{nicknameNormalized}`

- `uid`
- `nickname`
- `createdAt`
- `updatedAt`

`pairRequests/{requestId}`

- `fromUid`
- `toUid`
- `status`
- `createdAt`
- `updatedAt`

`pairs/{pairId}`

- `members`
- `memberMap`
- `status`
- `createdAt`
- `updatedAt`

`pairs/{pairId}/todos/{todoId}`

- `ownerUid`
- `categoryKey`
- `title`
- `status`
- `date`
- `createdAt`
- `updatedAt`

`pairs/{pairId}/settings/categories`

- `required`
- `growth`
- `freedom`
- `updatedBy`
- `updatedAt`

## 4) Server-only Operations

- Nickname claim/change
- Pair request create/accept/reject/cancel
- Pair create/status change
- Admin actions
- Audit log writes

## 5) Validation

Nickname:

- 2 to 20 characters after normalization
- No control characters
- No URL or email form
- Reserved words blocked: `admin`, `support`, `twintodo`, `twin-todo`, `관리자`, `운영자`
- Nickname change cooldown recommended: 7 days

Category labels:

- 1 to 12 characters
- No control characters
- No HTML tags
- Empty string rejected

Profile images:

- Max 2MB
- `image/jpeg`, `image/png`, `image/webp`
- Stored under `profiles/{uid}/avatar/{fileName}`

## 6) Release Gate

Do not publicly launch until these pass:

- Google login only
- No password field in user data
- No auth session in localStorage
- Firestore rules emulator tests
- Storage rules emulator tests
- Nickname transaction tests
- Pair request permission tests
- Solo mode permission tests
- Pair non-member denial tests
- App Check enabled
- CSP and security headers enabled
- Firebase budget alerts enabled
- GitHub protected branch enabled