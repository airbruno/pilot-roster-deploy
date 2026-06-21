const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const pdfParse = require("pdf-parse");

admin.initializeApp();

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Entre para continuar.");
  }
  return request.auth.uid;
}

exports.extractRosterPdf = onCall({
  region: "us-central1",
  memory: "512MiB",
  timeoutSeconds: 60,
}, async (request) => {
  requireAuth(request);
  const filename = String(request.data?.filename || "escala.pdf");
  const pdfBase64 = String(request.data?.pdfBase64 || "");
  if (!filename.toLowerCase().endsWith(".pdf")) {
    throw new HttpsError("invalid-argument", "Envie um arquivo PDF.");
  }
  if (!pdfBase64) {
    throw new HttpsError("invalid-argument", "Nenhum PDF recebido.");
  }

  const buffer = Buffer.from(pdfBase64, "base64");
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new HttpsError("resource-exhausted", "PDF muito grande. Limite atual: 20 MB.");
  }

  try {
    const parsed = await pdfParse(buffer);
    const text = String(parsed.text || "").trim();
    if (!text) {
      throw new HttpsError(
        "failed-precondition",
        "Nao consegui extrair texto. O PDF pode ser uma imagem/scanner; sera necessario OCR.",
      );
    }
    return {
      filename,
      pages: parsed.numpages || 0,
      characters: text.length,
      text,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", `Falha ao ler PDF: ${error.message || error}`);
  }
});

exports.grantFamilyAccess = onCall({
  region: "us-central1",
}, async (request) => {
  const pilotUid = requireAuth(request);
  const email = String(request.data?.email || "").trim().toLowerCase();
  if (!email) {
    throw new HttpsError("invalid-argument", "Informe o email do familiar.");
  }

  const auth = admin.auth();
  const db = admin.firestore();
  let familyUser;
  try {
    familyUser = await auth.getUserByEmail(email);
  } catch (error) {
    throw new HttpsError("not-found", "O familiar precisa criar uma conta antes de ser liberado.");
  }

  if (familyUser.uid === pilotUid) {
    throw new HttpsError("invalid-argument", "Use uma conta diferente para o familiar.");
  }

  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const pilotRef = db.collection("pilots").doc(pilotUid);
    const familyRef = pilotRef.collection("familyAccess").doc(familyUser.uid);
    const userRef = db.collection("users").doc(familyUser.uid);

    transaction.set(familyRef, {
      email,
      familyName: familyUser.displayName || email,
      grantedAt: now,
      status: "active",
    }, { merge: true });

    transaction.set(userRef, {
      role: "family",
      name: familyUser.displayName || email.split("@")[0],
      email,
      pilotIds: FieldValue.arrayUnion(pilotUid),
      updatedAt: now,
    }, { merge: true });
  });

  return { ok: true, familyUid: familyUser.uid };
});
