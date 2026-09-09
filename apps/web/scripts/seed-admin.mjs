// One-time script — run with: node scripts/seed-admin.mjs
// Then delete this file.

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDo408JrI7j5ahy9OJT0Pmwk4-ednfM5RQ",
  authDomain: "bhumi-india-2026.firebaseapp.com",
  projectId: "bhumi-india-2026",
  storageBucket: "bhumi-india-2026.firebasestorage.app",
  messagingSenderId: "361953136511",
  appId: "1:361953136511:web:22f87f4d6f2c132d44544a",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const UID   = "uVfggh47h4VTVEekx69Xj7sVp2z1";
const EMAIL = "owner@bhumi.gov";

const profile = {
  uid:             UID,
  email:           EMAIL,
  fullName:        "BHUMI Owner",
  employeeCode:    "BH-OW-0001",
  designation:     "admin",
  department:      "Department of Land Resources",
  state:           "Karnataka",
  district:        "Mysuru",
  mobile:          "",
  status:          "active",
  permissions:     [
    "document:upload","document:read","document:reprocess",
    "record:read","record:edit","record:export",
    "review:claim","review:approve","review:bulk_approve","review:escalate",
    "gis:read","gis:edit","gis:georeference",
    "insights:read","insights:operations",
    "rules:read","rules:edit",
    "integration:read","integration:manage",
    "user:read","user:manage",
    "audit:read","audit:verify",
    "model:read","model:promote",
  ],
  createdAt:       new Date().toISOString(),
};

await setDoc(doc(db, "bhumi_users", UID), profile);
console.log("✅ Admin profile written to bhumi_users/" + UID);
process.exit(0);
