const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

admin.initializeApp();

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Entre para continuar.");
  }
  return request.auth.uid;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function emailInviteId(email) {
  return Buffer.from(email).toString("base64url");
}

async function requirePilot(db, uid) {
  const snapshot = await db.collection("users").doc(uid).get();
  if (!snapshot.exists || snapshot.data()?.role !== "pilot") {
    throw new HttpsError("permission-denied", "Entre com uma conta de piloto.");
  }
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
    const pdfParse = require("pdf-parse");
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
  const email = normalizeEmail(request.data?.email);
  if (!email) {
    throw new HttpsError("invalid-argument", "Informe o email do familiar.");
  }

  const auth = admin.auth();
  const db = admin.firestore();
  await requirePilot(db, pilotUid);

  let familyUser;
  try {
    familyUser = await auth.getUserByEmail(email);
  } catch (error) {
    familyUser = null;
  }

  if (familyUser?.uid === pilotUid) {
    throw new HttpsError("invalid-argument", "Use uma conta diferente para o familiar.");
  }
  if (familyUser) {
    const familyProfile = await db.collection("users").doc(familyUser.uid).get();
    if (familyProfile.exists && familyProfile.data()?.role === "pilot") {
      throw new HttpsError("invalid-argument", "Este email pertence a uma conta de piloto.");
    }
  }

  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const pilotRef = db.collection("pilots").doc(pilotUid);
    const inviteRef = pilotRef.collection("familyInvites").doc(emailInviteId(email));

    transaction.set(inviteRef, {
      email,
      familyName: familyUser?.displayName || email,
      grantedAt: now,
      familyUid: familyUser?.uid || "",
      status: familyUser ? "active" : "pending",
    }, { merge: true });

    if (familyUser) {
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
    }
  });

  return { ok: true, familyUid: familyUser?.uid || "", status: familyUser ? "active" : "pending" };
});

exports.claimFamilyAccess = onCall({
  region: "us-central1",
}, async (request) => {
  const familyUid = requireAuth(request);
  const email = normalizeEmail(request.auth?.token?.email);
  if (!email) {
    throw new HttpsError("invalid-argument", "Esta conta precisa ter email para receber acesso.");
  }

  const db = admin.firestore();
  const auth = admin.auth();
  const user = await auth.getUser(familyUid);
  const now = new Date().toISOString();
  const invites = await db.collectionGroup("familyInvites")
    .where("email", "==", email)
    .get();

  const pendingInvites = invites.docs.filter((invite) => invite.data()?.status === "pending");
  if (!pendingInvites.length) return { ok: true, claimed: 0 };

  const batch = db.batch();
  const userRef = db.collection("users").doc(familyUid);
  pendingInvites.forEach((invite) => {
    const pilotRef = invite.ref.parent.parent;
    if (!pilotRef) return;
    const familyRef = pilotRef.collection("familyAccess").doc(familyUid);
    batch.set(familyRef, {
      email,
      familyName: user.displayName || email,
      grantedAt: invite.data()?.grantedAt || now,
      claimedAt: now,
      status: "active",
    }, { merge: true });
    batch.set(invite.ref, {
      familyUid,
      familyName: user.displayName || email,
      claimedAt: now,
      status: "active",
    }, { merge: true });
    batch.set(userRef, {
      role: "family",
      name: user.displayName || email.split("@")[0],
      email,
      pilotIds: FieldValue.arrayUnion(pilotRef.id),
      updatedAt: now,
    }, { merge: true });
  });
  await batch.commit();

  return { ok: true, claimed: pendingInvites.length };
});

exports.revokeFamilyAccess = onCall({
  region: "us-central1",
}, async (request) => {
  const pilotUid = requireAuth(request);
  const email = normalizeEmail(request.data?.email);
  const familyUid = String(request.data?.familyUid || "").trim();
  if (!email && !familyUid) {
    throw new HttpsError("invalid-argument", "Informe o email ou usuario do familiar.");
  }

  const auth = admin.auth();
  const db = admin.firestore();
  await requirePilot(db, pilotUid);

  let resolvedUid = familyUid;
  let resolvedEmail = email;
  if (!resolvedUid && email) {
    try {
      resolvedUid = (await auth.getUserByEmail(email)).uid;
    } catch {
      resolvedUid = "";
    }
  }
  if (!resolvedEmail && resolvedUid) {
    try {
      resolvedEmail = normalizeEmail((await auth.getUser(resolvedUid)).email);
    } catch {
      resolvedEmail = "";
    }
  }

  const batch = db.batch();
  const pilotRef = db.collection("pilots").doc(pilotUid);
  if (resolvedUid) {
    batch.delete(pilotRef.collection("familyAccess").doc(resolvedUid));
    batch.set(db.collection("users").doc(resolvedUid), {
      pilotIds: FieldValue.arrayRemove(pilotUid),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }
  if (resolvedEmail) {
    batch.delete(pilotRef.collection("familyInvites").doc(emailInviteId(resolvedEmail)));
  }
  await batch.commit();

  return { ok: true };
});
