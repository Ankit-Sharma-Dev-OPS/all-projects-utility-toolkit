const { MongoClient, ObjectId } = require('mongodb');

// Connection URIs from .env files
const MAKE_DB_URI = "";
const SC_DB_URI = "";

async function syncMakeBackend() {
    console.log("--- Starting Sync for Make Backend ---");
    const client = new MongoClient(MAKE_DB_URI);
    try {
        await client.connect();
        const db = client.db();
        const checkoutsColl = db.collection('checkouts');
        const quotesColl = db.collection('quotes');

        // Find checkouts that have a currencySnapshot
        const checkouts = await checkoutsColl.find({
            currencySnapshot: { $exists: true, $ne: null }
        }).toArray();

        console.log(`Found ${checkouts.length} checkouts with currencySnapshot.`);

        let updatedCount = 0;
        for (const checkout of checkouts) {
            if (checkout.quoteId) {
                const quoteId = checkout.quoteId;

                // Get the snapshot from checkout and ensure adminRate is excluded
                const { adminRate, ...snapshot } = checkout.currencySnapshot;

                // Update the corresponding quote if it doesn't have the snapshot or if it matches
                // We typically want to ensure the quote (the source of truths for the order) has the same rate.
                const result = await quotesColl.updateOne(
                    {
                        _id: new ObjectId(quoteId)
                    },
                    {
                        $set: { currencySnapshot: snapshot }
                    }
                );

                if (result.modifiedCount > 0) {
                    updatedCount++;
                }
            }
        }
        console.log(`Updated ${updatedCount} quotes in Make Backend.`);
    } catch (err) {
        console.error("Error in syncMakeBackend:", err);
    } finally {
        await client.close();
    }
}

async function syncSCBackend() {
    console.log("--- Starting Sync for SC Backend ---");
    const client = new MongoClient(SC_DB_URI);
    try {
        await client.connect();
        const db = client.db();
        const poColl = db.collection('purchaseorders');
        const rfqOfferColl = db.collection('supplierrfqoffers');

        // Find POs that have a currencySnapshot
        const pos = await poColl.find({
            currencySnapshot: { $exists: true, $ne: null }
        }).toArray();

        console.log(`Found ${pos.length} Purchase Orders with currencySnapshot.`);

        let updatedCount = 0;
        for (const po of pos) {
            if (po.supplierRfqOfferId) {
                const rfqOfferId = po.supplierRfqOfferId;
                // Get the snapshot from PO and ensure adminRate is excluded
                const { adminRate, ...snapshot } = po.currencySnapshot;

                // Update the corresponding SupplierRfqOffer if it doesn't have the snapshot
                const result = await rfqOfferColl.updateOne(
                    {
                        _id: new ObjectId(rfqOfferId)
                    },
                    {
                        $set: { currencySnapshot: snapshot }
                    }
                );

                if (result.modifiedCount > 0) {
                    updatedCount++;
                }
            }
        }
        console.log(`Updated ${updatedCount} SupplierRfqOffers in SC Backend.`);
    } catch (err) {
        console.error("Error in syncSCBackend:", err);
    } finally {
        await client.close();
    }
}

async function cleanupAdminRate() {
    console.log("--- Starting Cleanup of adminRate ---");
    const makeClient = new MongoClient(MAKE_DB_URI);
    const scClient = new MongoClient(SC_DB_URI);
    try {
        // Cleanup Make Backend
        await makeClient.connect();
        const makeDb = makeClient.db();
        console.log("Cleaning up Make Backend...");
        await makeDb.collection('checkouts').updateMany(
            { "currencySnapshot.adminRate": { $exists: true } },
            { $unset: { "currencySnapshot.adminRate": "" } }
        );
        await makeDb.collection('quotes').updateMany(
            { "currencySnapshot.adminRate": { $exists: true } },
            { $unset: { "currencySnapshot.adminRate": "" } }
        );

        // Cleanup SC Backend
        await scClient.connect();
        const scDb = scClient.db();
        console.log("Cleaning up SC Backend...");
        await scDb.collection('purchaseorders').updateMany(
            { "currencySnapshot.adminRate": { $exists: true } },
            { $unset: { "currencySnapshot.adminRate": "" } }
        );
        await scDb.collection('supplierrfqoffers').updateMany(
            { "currencySnapshot.adminRate": { $exists: true } },
            { $unset: { "currencySnapshot.adminRate": "" } }
        );

        console.log("Cleanup of adminRate completed.");
    } catch (err) {
        console.error("Error in cleanupAdminRate:", err);
    } finally {
        await makeClient.close();
        await scClient.close();
    }
}

async function main() {
    console.log("Starting Master Currency Snapshot Sync...");
    await syncMakeBackend();
    await syncSCBackend();
    await cleanupAdminRate();
    console.log("Master Sync Completed.");
}

main().catch(console.error);
