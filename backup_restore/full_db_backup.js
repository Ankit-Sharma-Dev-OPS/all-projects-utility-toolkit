
//THIS SCRIPT WILL TAKE FULL DB BACKUP

const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");

const sourceDBURI = "";
const sourceDBName = "";

// Generate timestamped folder name (YYYY-MM-DD_dbName)
const currentDate = new Date().toISOString().split("T")[0];
const backupFolder = `${currentDate}_${sourceDBName}`;
const outputDir = path.join(__dirname, "..", "full_db_mongodb_exports", backupFolder);

async function exportCollections() {
    const client = new MongoClient(sourceDBURI);

    try {
        await client.connect();
        const db = client.db(sourceDBName);

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Get all collections in the database
        const collections = await db.listCollections().toArray();

        for (const { name: collectionName } of collections) {
            console.log(`📥 Exporting collection: ${collectionName}`);

            const collection = db.collection(collectionName);
            const documents = await collection.find({}).toArray();

            const filePath = path.join(outputDir, `${collectionName}.json`);
            fs.writeFileSync(filePath, JSON.stringify(documents, null, 2), "utf-8");

            console.log(`✅ ${collectionName} exported to ${filePath}`);
        }

        console.log("🎉 Full database backup completed.");
    } catch (error) {
        console.error("❌ Error exporting collections:", error);
    } finally {
        await client.close();
    }
}

exportCollections();
