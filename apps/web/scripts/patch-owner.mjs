// One-time patch — run with: node apps/web/scripts/patch-owner.mjs
// Then delete this file.

import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc } from "firebase/firestore";

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

const UID = "uVfggh47h4VTVEekx69Xj7sVp2z1";

const ALL_PERMS = [
  "document:upload","document:read","document:reprocess",
  "record:read","record:edit","record:export","record:dispute","record:annotate",
  "review:claim","review:approve","review:bulk_approve","review:escalate",
  "gis:read","gis:edit","gis:georeference",
  "insights:read","insights:operations",
  "rules:read","rules:edit",
  "integration:read","integration:manage",
  "user:read","user:manage","admin:manage",
  "audit:read","audit:verify","audit:full",
  "model:read","model:promote",
  "platform:config","platform:deploy","platform:logs","platform:debug","platform:api_config","platform:analytics",
  "system:config","citizen:self_view",
];

await updateDoc(doc(db, "bhumi_users", UID), {
  designation: "owner",
  domain: "platform",
  permissions: ALL_PERMS,
});

console.log("✅ owner@bhumi.gov updated to role: owner with all permissions");
process.exit(0);
