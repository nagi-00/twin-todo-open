# modoo-todo Secure Rebuild Plan From Existing UI

Reference UI branch:
`https://github.com/nagi-00/nagi-todo/tree/claude/setup-firebase-twin-todo-1KpLb`

This repository is the maintainable public rebuild target. modoo-todo preserves the original TwinTodo UI and feature flow while rebuilding the security model for a public deployed service.

## 1) Product Model

modoo-todo supports two modes:

- Solo mode: a user can use todo, journal, routines, notes, categories, profile, and widgets without connecting to anyone.
- Pair mode: a user can optionally connect with another user through nickname request and approval, then share selected todo snapshots through a pair scope.

Pairing is optional. Lack of a pair must never block normal personal usage.

## 2) Preserve vs Replace

### Preserve

- Sidebar calendar
- Todo tab
- Journal tab
- Week tab
- Routine flow
- Music widget
- Memo widget
- Existing calm visual style
- Mobile sidebar behavior
- modoo-todo brand concept

### Replace

- Custom username/password login
- Plaintext password storage
- `localStorage` auth session
- Direct `partnerId` linking
- Client-controlled database paths
- CDN React/Babel runtime for production
- Single-file application structure

## 3) Target Architecture

Recommended stack:

- Frontend: Vite React
- Auth: Firebase Authentication with Google provider
- Database: Firestore
- Storage: Firebase Storage
- Server-only logic: Cloud Functions
- Protection: Firestore Rules, Storage Rules, App Check, Hosting security headers

Vite React is the recommended first target because the existing app is already a client-heavy React experience and can deploy simply to Firebase Hosting.

## 4) Authentication Model

Existing model to remove:

- User-created IDs and passwords
- Password stored in Realtime Database
- `twin-session` stored in `localStorage`

New model:

- Google login only at launch
- Firebase Auth UID is the account identity
- `users/{uid}` stores profile and settings only
- Important operations are verified in Cloud Functions
- The client never chooses an arbitrary user path as its identity

## 5) Solo Mode Data Model

Solo data is scoped by UID:

- `users/{uid}`
- `users/{uid}/todos/{todoId}`
- `users/{uid}/journal/{date}`
- `users/{uid}/notes/{date}`
- `users/{uid}/routines/{routineId}`
- `users/{uid}/dateColors/{date}`
- `users/{uid}/settings/categories`

Solo mode is the default after onboarding. The user only needs a Google account and nickname to start.

## 6) Pair Mode Data Model

Pair data is scoped by an approved pair:

- `nicknames/{nicknameNormalized}`
- `pairRequests/{requestId}`
- `pairs/{pairId}`
- `pairs/{pairId}/todos/{todoId}`
- `pairs/{pairId}/settings/categories`

Pairing flow:

1. User A enters User B's nickname.
2. A server function resolves the nickname to B's UID.
3. The server creates a pending pair request.
4. User B accepts or rejects.
5. On accept, the server creates `pairs/{pairId}`.
6. Only pair members can read/write pair-scoped data.

## 7) Migration Mapping From Existing UI

| Existing intent | Old shape | New solo shape | New pair shape |
| --- | --- | --- | --- |
| profile | `users/{id}/profile` | `users/{uid}` | n/a |
| partner link | `partnerId` | n/a | `pairRequests`, `pairs/{pairId}` |
| date todo | `users/{id}/todos/{date}` | `users/{uid}/todos/{todoId}` | `pairs/{pairId}/todos/{todoId}` |
| notes | `users/{id}/notes/{date}` | `users/{uid}/notes/{date}` | optional later |
| journal | `users/{id}/journal/{date}` | `users/{uid}/journal/{date}` | optional later |
| routines | `users/{id}/routines` | `users/{uid}/routines/{routineId}` | optional later |
| colors | `users/{id}/dateColors` | `users/{uid}/dateColors/{date}` | optional later |
| categories | hardcoded `CATS` | `users/{uid}/settings/categories` | `pairs/{pairId}/settings/categories` |

## 8) UI Rebuild Strategy

1. Move the existing UI into a Vite React project.
2. Replace `LoginScreen` with Google login.
3. Add first-run nickname onboarding.
4. Show the full app in solo mode by default.
5. Add a pair request panel as an optional workflow.
6. Keep existing todo/journal/routine interactions intact.
7. Route data operations through typed service modules.
8. Move sensitive operations to Cloud Functions.

Recommended component split:

- `App`
- `AuthGate`
- `LoginScreen`
- `NicknameOnboarding`
- `PairRequestPanel`
- `MainApp`
- `SidebarCalendar`
- `TodoBoard`
- `JournalView`
- `WeekView`
- `RoutineModal`
- `MusicWidget`
- `MemoWidget`
- `ProfileMenu`
- `CategorySettingsModal`

## 9) Server Functions

Minimum server functions:

- `claimNickname(nickname)`
- `changeNickname(nickname)`
- `searchNickname(nickname)`
- `createPairRequest(nickname)`
- `acceptPairRequest(requestId)`
- `rejectPairRequest(requestId)`
- `cancelPairRequest(requestId)`
- `updateProfileAvatarMetadata(path)`
- `adminAuditAction(action, target, reason)`

Common requirements:

- Auth required
- App Check required
- Schema validation
- Rate limiting
- Audit logging where appropriate
- Never trust client-supplied `uid`, `role`, or `pairId`

## 10) Non-negotiable Decisions

- Users can always use the app without a pair.
- Password login is not retained.
- Nickname input never creates an immediate connection.
- Admin UI does not directly read user private content.
- Rules enforce security regardless of UI state.
- Production code is not kept as one large HTML file.
