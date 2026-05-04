const { MongoClient } = require("mongodb");

const sourceDBURI = "";
const sourceDBName = "";

const destinationDBURI = "";
const destinationDBName = "";

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

async function syncCollections() {
    const sourceClient = new MongoClient(sourceDBURI);
    const destinationClient = new MongoClient(destinationDBURI);

    try {
        await sourceClient.connect();
        await destinationClient.connect();

        const sourceDb = sourceClient.db(sourceDBName);
        const destinationDb = destinationClient.db(destinationDBName);

        for (const collectionName of collectionsToExport) {
            try {
                console.log(`Syncing collection: ${collectionName}`);

                const sourceCollection = sourceDb.collection(collectionName);
                const destinationCollection = destinationDb.collection(collectionName);

                // Fetch documents
                const sourceDocs = await sourceCollection.find().toArray();

                // Clear destination collection
                await destinationCollection.deleteMany({});

                // Insert documents
                if (sourceDocs.length > 0) {
                    await destinationCollection.insertMany(sourceDocs);
                }

                console.log(`✅ ${collectionName} synced successfully!`);
            } catch (error) {
                console.error(`❌ Failed to sync ${collectionName}:`, error);
                continue;
            }
        }

        console.log("🎉 All collections synced successfully!");

    } catch (error) {
        console.error("❌ Error syncing:", error);
    } finally {
        await sourceClient.close();
        await destinationClient.close();
    }
}

syncCollections();