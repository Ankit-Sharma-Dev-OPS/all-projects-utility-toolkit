const { MongoClient } = require("mongodb");

const sourceDBURI = "";
const sourceDBName = "";

const destinationDBURI = "";
const destinationDBName = "";

async function syncCollections() {
    const sourceClient = new MongoClient(sourceDBURI);
    const destinationClient = new MongoClient(destinationDBURI);

    try {
        await sourceClient.connect();
        await destinationClient.connect();

        const sourceDb = sourceClient.db(sourceDBName);
        const destinationDb = destinationClient.db(destinationDBName);

        // Get all collections from source DB
        const collections = await sourceDb.listCollections().toArray();

        for (const { name: collectionName } of collections) {
            try {


                // Skip system collections
                if (collectionName.startsWith("system.")) continue;

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
            }
            catch (error) {
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
