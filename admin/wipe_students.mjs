import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8");
initializeApp({ credential: cert(JSON.parse(json)) });
const db = getFirestore();

async function deleteCollection(ref, batchSize = 200) {
  let count = 0;
  while (true) {
    const snapshot = await ref.limit(batchSize).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    for (const doc of snapshot.docs) batch.delete(doc.ref);
    await batch.commit();
    count += snapshot.size;
  }
  return count;
}

const students = await db.collection("students").get();
let courseCount = 0;
for (const doc of students.docs) {
  courseCount += await deleteCollection(doc.ref.collection("courses"));
}
const studentCount = await deleteCollection(db.collection("students"));
const syncStateCount = await deleteCollection(db.collection("syncState"));

console.log(`deleted ${studentCount} students, ${courseCount} courses, ${syncStateCount} syncState docs`);
