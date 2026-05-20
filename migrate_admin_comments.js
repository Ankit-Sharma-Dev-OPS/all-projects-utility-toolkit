const { MongoClient } = require('mongodb');
const utils = require('./utils');

/**
 * Migrates a specific collection from adminComment string to adminComments array.
 */
async function migrateCollection(db, collectionName) {
    console.log(`\n--- Starting migration for collection: ${collectionName} ---`);
    const collection = db.collection(collectionName);

    // Find all documents where adminComment exists
    const cursor = collection.find({
        adminComment: { $exists: true }
    });

    let migratedCount = 0;
    let emptyCleanedCount = 0;

    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        const adminCommentVal = doc.adminComment;

        // If adminComment is not a valid string or is just whitespace, clean it up
        if (!adminCommentVal || typeof adminCommentVal !== 'string' || adminCommentVal.trim() === '') {
            await collection.updateOne(
                { _id: doc._id },
                { $unset: { adminComment: "" } }
            );
            emptyCleanedCount++;
            continue;
        }

        const commentObj = {
            adminName: "System",
            comment: adminCommentVal.trim(),
            createdAt: doc.updatedAt || doc.createdAt || new Date(),
            updatedAt: doc.updatedAt || doc.createdAt || new Date()
        };

        // Update the document: push the comment object to the adminComments array
        // and unset the old singular adminComment field
        await collection.updateOne(
            { _id: doc._id },
            {
                $push: { adminComments: commentObj },
                $unset: { adminComment: "" }
            }
        );

        migratedCount++;
    }

    console.log(`Finished migrating ${collectionName}:`);
    console.log(`- Migrated to adminComments array: ${migratedCount} documents.`);
    console.log(`- Cleaned up empty/invalid adminComment fields: ${emptyCleanedCount} documents.`);
}

async function runMigration() {
    console.log('====================================================');
    console.log('=== STARTING ADMIN COMMENTS MIGRATION SCRIPT ===');
    console.log('====================================================');

    // Retrieve URIs from config or environment variables, or fall back to defaults
    const makeURI = '';
    const scURI = '';

    //db name
    const makeDbName = '';
    const scDbName = '';

    let makeClient, scClient;

    try {
        // --- 1. Migrate MAKE DB ---
        console.log(`\nConnecting to MAKE database at URI: ${makeURI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);
        makeClient = await utils.connectToDB(makeURI);
        const makeDb = makeClient.db(makeDbName);
        console.log(`Connected successfully to MAKE DB: "${makeDbName}"`);

        // Collections in MAKE DB
        // checkouts = Sales Orders, quotes = Quotes, invoices = Invoices
        const makeCollections = ['checkouts', 'quotes', 'invoices'];
        for (const coll of makeCollections) {
            await migrateCollection(makeDb, coll);
        }

        // --- 2. Migrate SC DB ---
        console.log(`\nConnecting to SC database at URI: ${scURI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);
        scClient = await utils.connectToDB(scURI);
        const scDb = scClient.db(scDbName);
        console.log(`Connected successfully to SC DB: "${scDbName}"`);

        // Collections in SC DB
        // purchaseorders = PO, rfqoffers = RFQ/Offer, bills = Bills
        const scCollections = ['purchaseorders', 'rfqoffers', 'bills'];
        for (const coll of scCollections) {
            await migrateCollection(scDb, coll);
        }

        console.log('\n====================================================');
        console.log('=== MIGRATION COMPLETED SUCCESSFULLY ===');
        console.log('====================================================');

    } catch (error) {
        console.error('\n❌ Migration failed with error:', error);
    } finally {
        if (makeClient) {
            await makeClient.close();
            console.log('Closed connection to MAKE database.');
        }
        if (scClient) {
            await scClient.close();
            console.log('Closed connection to SC database.');
        }
    }
}

runMigration();
