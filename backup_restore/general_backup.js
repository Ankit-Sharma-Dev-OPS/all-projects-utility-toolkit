const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");


const sourceDBURI = "";
const sourceDBName = ""; 

// List of collections to export
const collectionsToExport = [
    "certifications",
    "cnc_certifications",
    "cnc_heat_treatments",
    "cnc_internal_corners",
    "cnc_machines",
    "cnc_material_machine_mrrs",
    "cnc_materials",
    "cnc_part_markings",
    "cnc_review_my_designs",
    "cnc_surface_finishes",
    "cnc_tolerances",
    "purchaseorderissues",
    "qualityrelatedissues",
    "shipping_rates",
    "threed_certifications",
    "threedleadtimes",
    "threedmachines",
    "threedmaterials",
    "threedmetalccs",
    "threedpostprocessings",
    "threedtechnologies",
];

// Generate timestamped folder name (YYYY-MM-DD_dbName)
const currentDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
const backupFolder = `${currentDate}_${sourceDBName}`;
const outputDir = path.join(__dirname, "..", "mongodb_exports", backupFolder); // Path: mongodb_exports/YYYY-MM-DD_dbName



async function exportCollections() {
    const prodClient = new MongoClient(sourceDBURI);

    try {
        await prodClient.connect();
        const prodDb = prodClient.db(sourceDBName);

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        for (const collectionName of collectionsToExport) {
            console.log(`📥 Exporting collection: ${collectionName}`);

            const collection = prodDb.collection(collectionName);
            const documents = await collection.find().toArray(); // Fetch all documents

            // Define file path
            const filePath = path.join(outputDir, `${collectionName}.json`);

            // Save as JSON file
            fs.writeFileSync(filePath, JSON.stringify(documents, null, 2), "utf-8");

            console.log(`✅ ${collectionName} exported to ${filePath}`);
        }
    } catch (error) {
        console.error("❌ Error exporting collections:", error);
    } finally {
        await prodClient.close();
    }
}

exportCollections();
