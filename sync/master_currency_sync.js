const { MongoClient, ObjectId } = require('mongodb');

/**
 * Synchronizes and migrates currency snapshot data across the Make and SC
 * backend databases.
 *
 * The script rebases snapshot rates to the organization base currency,
 * removes legacy `adminRate` values, and propagates updated snapshots from
 * parent records to their related child records.
 *
 * Update the database connection URIs below before running the script.
 */

// Connection URIs from .env files
const MAKE_DB_URI = "";
const SC_DB_URI = "";

/**
 * Step 1: Synchronize snapshots from parent to child records
 *
 * @async
 * @param {import('mongodb').Db} db MongoDB database instance.
 * @param {string} parentCollName Parent collection containing the source snapshot.
 * @param {string} childCollName Child collection that receives the snapshot.
 * @param {string} joinField Parent document field containing the child record id.
 * @returns {Promise<void>} Resolves when snapshot synchronization completes.
 */
async function syncSnapshots(db, parentCollName, childCollName, joinField) {
    console.log(`--- Syncing records from ${parentCollName} to ${childCollName}...`);
    const parentColl = db.collection(parentCollName);
    const childColl = db.collection(childCollName);

    const parents = await parentColl.find({
        currencySnapshot: { $exists: true, $ne: null }
    }).toArray();

    let syncedCount = 0;
    for (const parent of parents) {
        if (parent[joinField]) {
            const childId = parent[joinField];
            const snapshot = parent.currencySnapshot;

            // Copy snapshot to child if it's missing or if we want to ensure sync
            const result = await childColl.updateOne(
                { _id: new ObjectId(childId) },
                { $set: { currencySnapshot: snapshot } }
            );

            if (result.modifiedCount > 0) syncedCount++;
        }
    }
    console.log(`Synced ${syncedCount} records.`);
}

/**
 * Step 2: Migrate rates to Org Base and remove adminRate
 *
 * @async
 * @param {import('mongodb').Db} db MongoDB database instance.
 * @param {string} collectionName Collection whose currency snapshots should be migrated.
 * @returns {Promise<void>} Resolves when the rate migration finishes.
 */
async function migrateRates(db, collectionName) {
    console.log(`--- Migrating rates in collection: ${collectionName}...`);
    const collection = db.collection(collectionName);

    const cursor = collection.find({
        "currencySnapshot.adminRate": { $exists: true, $ne: null }
    });

    let migratedCount = 0;
    while (await cursor.hasNext()) {
        const record = await cursor.next();
        const { customerRate, adminRate } = record.currencySnapshot;

        if (adminRate && adminRate !== 0) {
            const newCustomerRate = customerRate / adminRate;

            await collection.updateOne(
                { _id: record._id },
                {
                    $set: { "currencySnapshot.customerRate": newCustomerRate },
                    $unset: { "currencySnapshot.adminRate": "" }
                }
            );
            migratedCount++;
        }
    }
    console.log(`Migrated ${migratedCount} records.`);
}

/**
 * Runs the currency snapshot migration workflow for the Make backend.
 *
 * @async
 * @returns {Promise<void>} Resolves when Make backend processing completes.
 */
async function processMakeBackend() {
    console.log("\n--- Processing Make Backend ---");
    const client = new MongoClient(MAKE_DB_URI);
    try {
        await client.connect();
        const db = client.db();

        // 1. Migrate rates first (rebase customerRate, remove adminRate)
        await migrateRates(db, 'checkouts');
        await migrateRates(db, 'quotes');

        // 2. Sync already-migrated snapshot from Checkout -> Quote
        await syncSnapshots(db, 'checkouts', 'quotes', 'quoteId');

    } catch (err) {
        console.error("Error in Make Backend:", err);
    } finally {
        await client.close();
    }
}

/**
 * Runs the currency snapshot migration workflow for the SC backend.
 *
 * @async
 * @returns {Promise<void>} Resolves when SC backend processing completes.
 */
async function processSCBackend() {
    console.log("\n--- Processing SC Backend ---");
    const client = new MongoClient(SC_DB_URI);
    try {
        await client.connect();
        const db = client.db();

        // 1. Migrate rates first (rebase customerRate, remove adminRate)
        await migrateRates(db, 'purchaseorders');
        await migrateRates(db, 'supplierrfqoffers');

        // 2. Sync already-migrated snapshot from PO -> RFQ Offer
        await syncSnapshots(db, 'purchaseorders', 'supplierrfqoffers', 'supplierRfqOfferId');

    } catch (err) {
        console.error("Error in SC Backend:", err);
    } finally {
        await client.close();
    }
}

/**
 * Executes the full currency snapshot sync and migration process for all
 * configured backends.
 *
 * @async
 * @returns {Promise<void>} Resolves when all sync steps have completed.
 */
async function main() {
    console.log("Starting Consolidated Currency Snapshot Sync & Migration...");
    await processMakeBackend();
    await processSCBackend();
    console.log("\nMaster Sync & Migration Completed.");
}

main().catch(console.error);
