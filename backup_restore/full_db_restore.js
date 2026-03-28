//RESTORE DB 

const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

const targetDBURI = "";
const targetDBName = "";

/* Path to backup folder */
const backupFolderPath = path.join(
  __dirname,
  "..",
  "full_db_mongodb_exports",
  "2026-02-07_ndcs-make-local" // change to your folder
);

async function restoreCollections() {
  const client = new MongoClient(targetDBURI);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(targetDBName);

    const files = fs.readdirSync(backupFolderPath);

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const collectionName = file.replace(".json", "");
      const filePath = path.join(backupFolderPath, file);

      console.log(`📥 Restoring collection: ${collectionName}`);

      const fileData = fs.readFileSync(filePath, "utf-8");
      const documents = JSON.parse(fileData);

      if (!documents.length) {
        console.log(`⚠️ ${collectionName} is empty, skipping`);
        continue;
      }

      const collection = db.collection(collectionName);

      /* Optional: clear collection before restore */
      await collection.deleteMany({});

      /* Insert documents */
      await collection.insertMany(documents);

      console.log(`✅ Restored ${documents.length} documents into ${collectionName}`);
    }

    console.log("🎉 Restore completed successfully");
  } catch (error) {
    console.error("❌ Restore failed:", error);
  } finally {
    await client.close();
  }
}

restoreCollections();
