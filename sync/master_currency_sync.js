const { MongoClient, ObjectId } = require('mongodb');

/**
 * CONFIGURATION
 * Set DRY_RUN to true to log proposed changes without writing to the database.
 */
const DRY_RUN = true; 
const MAKE_DB_URI = ""; // To be filled by user
const SC_DB_URI = "";   // To be filled by user

/**
 * HELPER: Get the closest exchange rate for a specific date
 */
async function getClosestRate(db, targetDate, targetCurrency) {
    const rateColl = db.collection('currencyexchangerates');
    
    // 1. Try to find the exact day first
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    let rateDoc = await rateColl.findOne({
        date: { $gte: dayStart, $lte: dayEnd }
    });

    // 2. If not found, find the closest previous rate
    if (!rateDoc) {
        rateDoc = await rateColl.findOne(
            { date: { $lte: targetDate } },
            { sort: { date: -1 } }
        );
    }

    // 3. Fallback to the absolute closest if still not found
    if (!rateDoc) {
        rateDoc = await rateColl.findOne(
            {},
            { sort: { date: 1 } }
        );
    }

    if (!rateDoc || !rateDoc.rates || !rateDoc.rates[targetCurrency]) {
        return null;
    }

    return {
        adminRate: rateDoc.rates['INR'] || 92.1, // Defaulting to INR as Admin Base
        customerRate: rateDoc.rates[targetCurrency] || 1,
        rateDate: rateDoc.date
    };
}

/**
 * HELPER: Back-calculate the Admin Price (INR) from the intended Customer Price
 */
function rebasePrice(originalAdminValue, oldAdminRate, oldCustomerRate) {
    if (!originalAdminValue || isNaN(originalAdminValue)) return 0;
    
    // 1. Calculate what the Customer actually saw (rounded to 2 decimals)
    const intendedCustomerPrice = Number((originalAdminValue * (oldCustomerRate / oldAdminRate)).toFixed(2));
    
    // 2. Define the new direct exchange rate (Admin -> Customer)
    const newExchangeRate = oldCustomerRate / oldAdminRate;
    
    // 3. Back-calculate the "Clean" Admin Price (INR)
    // newAdminPrice * newExchangeRate = intendedCustomerPrice
    const newAdminPrice = intendedCustomerPrice / newExchangeRate;

    return {
        newAdminPrice: parseFloat(newAdminPrice.toFixed(10)), // High precision for internal storage
        newExchangeRate,
        intendedCustomerPrice
    };
}

/**
 * CORE: Migrate a collection to the simplified currency model
 */
async function migrateCollection(db, collectionName, fieldsMap) {
    console.log(`\n--- Migrating collection: ${collectionName} ---`);
    const collection = db.collection(collectionName);
    const makeDb = db; // To access rates lookup

    const cursor = collection.find({});
    let totalProcessed = 0;
    let totalUpdated = 0;
    const bulkOps = [];

    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        totalProcessed++;

        let snapshot = doc.currencySnapshot;
        const createdAt = doc.createdAt || doc.quoteCreatedAt || new Date();

        // 1. Ensure we have a valid snapshot (Lookup if missing)
        if (!snapshot || !snapshot.adminRate) {
            // Attempt to find user's target currency from context or defaults
            const targetCurrency = doc.currency || 'USD'; 
            snapshot = await getClosestRate(makeDb, createdAt, targetCurrency);
        }

        if (!snapshot || !snapshot.adminRate || snapshot.adminRate === 0) {
            console.warn(`[Skip] ${collectionName} ID: ${doc._id} - No valid rate found.`);
            continue;
        }

        const { adminRate, customerRate } = snapshot;
        const newExchangeRate = customerRate / adminRate;
        const updateSet = {};
        const updateUnset = { "currencySnapshot.adminRate": "" };

        // 2. Handle Top-Level Price Fields
        if (fieldsMap.topLevel) {
            for (const field of fieldsMap.topLevel) {
                if (doc[field] !== undefined) {
                    const { newAdminPrice } = rebasePrice(doc[field], adminRate, customerRate);
                    updateSet[field] = newAdminPrice;
                }
            }
        }

        // 3. Handle Nested partsData
        if (fieldsMap.nestedParts && doc.partsData && Array.isArray(doc.partsData)) {
            const updatedParts = doc.partsData.map(part => {
                const newPart = { ...part };
                for (const field of fieldsMap.nestedParts) {
                    if (part[field] !== undefined) {
                        const { newAdminPrice } = rebasePrice(part[field], adminRate, customerRate);
                        newPart[field] = newAdminPrice;
                    }
                }
                return newPart;
            });
            updateSet.partsData = updatedParts;
        }

        // 4. Update the Snapshot itself
        updateSet["currencySnapshot.customerRate"] = newExchangeRate;
        updateSet["currencySnapshot.rateDate"] = snapshot.rateDate || createdAt;

        // Prepare Bulk Operation
        bulkOps.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: updateSet, $unset: updateUnset }
            }
        });

        if (DRY_RUN && totalProcessed <= 2) {
            console.log(`[Dry Run] Sample Update for ${collectionName} ID: ${doc._id}`);
            console.log(`  - Old Rates: Admin: ${adminRate}, Customer: ${customerRate}`);
            console.log(`  - New Rate: ${newExchangeRate}`);
            console.log(`  - Fields Adjusted: ${Object.keys(updateSet).filter(k => !k.includes('currencySnapshot'))}`);
        }
    }

    if (!DRY_RUN && bulkOps.length > 0) {
        const result = await collection.bulkWrite(bulkOps);
        totalUpdated = result.modifiedCount;
    }

    console.log(`Finished ${collectionName}: Processed ${totalProcessed}, Updated ${totalUpdated}.`);
}

/**
 * MAIN: Process all collections across both databases
 */
async function main() {
    console.log(`Starting Consolidated Currency Migration (DRY_RUN: ${DRY_RUN})`);

    const makeClient = new MongoClient(MAKE_DB_URI);
    const scClient = new MongoClient(SC_DB_URI);

    try {
        await makeClient.connect();
        await scClient.connect();
        const makeDb = makeClient.db();
        const scDb = scClient.db();

        // FIELD MAPPINGS
        const quoteMap = {
            topLevel: ['price1', 'price2', 'price3', 'shippingCharge1', 'shippingCharge2', 'shippingCharge3', 'orderCertificationsCost'],
            nestedParts: ['price1', 'price2', 'price3']
        };
        const checkoutMap = {
            topLevel: ['subTotal', 'shippingCharge', 'orderCertificationsCost', 'adjustmentValue'],
            nestedParts: ['price1', 'price2', 'price3']
        };
        const invoiceMap = {
            topLevel: ['invoiceTotalAmount', 'invoiceAdditionalCost', 'invoiceShippingCharge', 'invoiceAdjustmentValue', 'invoiceCertificationsCharge']
        };
        const poMap = {
            topLevel: ['totalPrice', 'shippingPrice'],
            nestedParts: ['price']
        };

        // --- Execute Make Backend Migration ---
        console.log("\n--- PROCESSING MAKE BACKEND ---");
        await migrateCollection(makeDb, 'quotes', quoteMap);
        await migrateCollection(makeDb, 'checkouts', checkoutMap);
        await migrateCollection(makeDb, 'invoices', invoiceMap);
        await migrateCollection(makeDb, 'supplierbills', invoiceMap); // Similar structure

        // --- Execute SC Backend Migration ---
        console.log("\n--- PROCESSING SC BACKEND ---");
        await migrateCollection(scDb, 'purchaseorders', poMap);
        await migrateCollection(scDb, 'supplierrfqoffers', { nestedParts: ['price1', 'price2', 'price3'] });
        await migrateCollection(scDb, 'bills', invoiceMap);

    } catch (err) {
        console.error("CRITICAL ERROR during migration:", err);
    } finally {
        await makeClient.close();
        await scClient.close();
    }
}

main().catch(console.error);
