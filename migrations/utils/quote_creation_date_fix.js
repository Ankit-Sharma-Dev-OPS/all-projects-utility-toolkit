const { MongoClient } = require("mongodb");

// Use the same connection details as your other migration scripts
const uri = "";
const dbName = "";

async function runMigration() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log("Connected to MongoDB");

        const db = client.db(dbName);
        const quotesCollection = db.collection("quotes");

        console.log("Fetching quotes...");
        const quotesCursor = quotesCollection.find({ createdAt: { $exists: true } });

        let modifiedCount = 0;
        let processedCount = 0;

        while (await quotesCursor.hasNext()) {
            const quote = await quotesCursor.next();
            processedCount++;

            if (quote.createdAt) {
                const result = await quotesCollection.updateOne(
                    { _id: quote._id },
                    {
                        $set: {
                            quoteCreatedAt: quote.createdAt,
                        },
                    }
                );

                if (result.modifiedCount > 0) {
                    modifiedCount++;
                }
            } else {
                console.log('Found quote withoug created at date');
            }

            if (processedCount % 100 === 0) {
                console.log(`Processed ${processedCount} quotes...`);
            }
        }

        console.log(`Migration completed successfully.`);
        console.log(`Total quotes processed: ${processedCount}`);
        console.log(`Total quotes updated with quoteCreatedAt: ${modifiedCount}`);

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.close();
        console.log("MongoDB connection closed.");
    }
}

runMigration();
