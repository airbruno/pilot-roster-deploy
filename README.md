# Pilot Roster Deploy

Aplicativo PWA para pilotos publicarem escala mensal e familiares visualizarem apenas os pilotos autorizados.

## Arquitetura Firebase

```txt
frontend/           Firebase Hosting
functions/          Cloud Functions
firestore.rules     Regras de acesso Auth + Firestore
backend/            Backend Render legado, mantido temporariamente como fallback
```

## Serviços usados

- Firebase Authentication: login por email/senha.
- Cloud Firestore: pilotos, familiares autorizados e escalas.
- Cloud Functions: extração de PDF e liberação de familiares por email.
- Firebase Hosting: entrega do PWA.

## Modelo de dados

```txt
users/{uid}
  role: "pilot" | "family"
  name
  email
  pilotIds: []

pilots/{pilotUid}
  displayName
  familyNote
  activeRosterMonth
  updatedAt

pilots/{pilotUid}/rosters/{yyyy-mm}
  meta
  duties
  updatedAt
  publishedBy

pilots/{pilotUid}/familyAccess/{familyUid}
  email
  familyName
  grantedAt
  status
```

## Primeiro setup Firebase

1. Crie um projeto no Firebase.
2. Ative Authentication com provedor Email/Password.
3. Crie o Firestore em modo production.
4. Ative Cloud Functions no plano Blaze.
5. Copie `.firebaserc.example` para `.firebaserc` e troque `seu-projeto-firebase`.
6. No console Firebase, crie um app Web e copie a config para `frontend/config.js`.

Exemplo:

```js
window.APP_CONFIG = {
  API_URL: "",
  FUNCTIONS_REGION: "us-central1",
  FIREBASE: {
    apiKey: "...",
    authDomain: "seu-projeto.firebaseapp.com",
    projectId: "seu-projeto",
    storageBucket: "seu-projeto.firebasestorage.app",
    messagingSenderId: "...",
    appId: "...",
  },
};
```

## Fluxo

- `/piloto/`: piloto entra, importa PDF, revisa e publica.
- `/`: familiar entra e vê a escala do primeiro piloto vinculado à conta.
- No portal do piloto, o campo "Família autorizada" libera um familiar pelo email. O familiar precisa ter criado conta antes.

## Checks locais

```bash
npm run check:static
npm run check:functions
npm run check:backend
```

## Deploy Firebase

```bash
npm install --prefix functions
npx firebase-tools login
npx firebase-tools deploy
```

Ou, se a CLI `firebase` já estiver instalada:

```bash
firebase deploy
```

## Notas

- O backend Python em `backend/` permanece como fallback legado para o deploy antigo Render/Vercel.
- Com `APP_CONFIG.FIREBASE` preenchido, o frontend usa Auth, Firestore e Functions.
- Sem `APP_CONFIG.FIREBASE`, o app continua no modo legado com API Render.
- PDFs escaneados como imagem ainda precisam de OCR; a Function atual extrai texto de PDFs com texto selecionável.
