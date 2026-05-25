# Firebase Setup Guide

이 문서는 TwinTodo Open을 Firebase에 연결하고 안전하게 배포하기 위한 초기 설정 순서입니다.

## 1) Firebase Project

1. Firebase Console에서 새 프로젝트를 만든다.
2. Google Analytics는 필요하면 켠다.
3. 프로젝트 지역은 한국 사용자 기준으로 `asia-northeast3` 또는 가까운 리전을 선택한다.
4. Billing은 공개 서비스 전환 전에 Blaze 플랜으로 연결한다.
5. Budget alert를 반드시 설정한다.

## 2) Authentication

1. Authentication > Sign-in method로 이동한다.
2. Google provider만 활성화한다.
3. Authorized domains에는 실제 배포 도메인과 Firebase Hosting 도메인만 남긴다.
4. Email/password provider는 켜지 않는다.

## 3) Firestore

1. Firestore Database를 production mode로 만든다.
2. 리전은 Cloud Functions 리전과 가깝게 선택한다.
3. 로컬에서 `firebase deploy --only firestore`로 rules와 indexes를 배포한다.

## 4) Storage

1. Firebase Storage를 활성화한다.
2. 기본 공개 규칙을 쓰지 않는다.
3. `firebase deploy --only storage`로 `storage.rules`를 배포한다.

## 5) App Check

1. App Check에서 Web App을 등록한다.
2. reCAPTCHA Enterprise를 권장한다.
3. 발급된 site key를 `VITE_FIREBASE_APP_CHECK_RECAPTCHA_KEY`에 넣는다.
4. Functions는 `enforceAppCheck: true`로 배포된다.

개발 중에는 Firebase Console의 App Check debug token을 사용한다.

## 6) Local Environment

`.env.example`을 `.env.local`로 복사한 뒤 Firebase Web App 설정값을 채운다.

```bash
cp .env.example .env.local
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

이 저장소는 기본 Firebase 프로젝트를 `twintodo-open`으로 사용한다. `.firebaserc`가 없다면 `.firebaserc.example`을 `.firebaserc`로 복사한다.

```powershell
Copy-Item .firebaserc.example .firebaserc
```

배포 전에는 항상 CLI가 올바른 프로젝트를 보고 있는지 확인한다.

```powershell
firebase use
```

출력이 `twintodo-open`이 아니면 아래 명령으로 바꾼다.

```powershell
firebase use twintodo-open
```

## 7) GitHub Deployment

권장 방식은 Firebase service account JSON을 GitHub Secret에 저장하는 것이다.

Required secrets:

- `FIREBASE_SERVICE_ACCOUNT`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_APP_CHECK_RECAPTCHA_KEY`

## 8) Release Gate

공개 배포 전 확인:

- Google 로그인만 가능
- 비밀번호 기반 로그인 없음
- Firestore rules 배포 완료
- Storage rules 배포 완료
- Functions 배포 완료
- App Check enforcement 확인
- GitHub branch protection 활성화
- Firebase budget alert 활성화
- 실제 계정 2개로 solo mode와 pair mode 수동 테스트
