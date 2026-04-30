const config = require('../config');
const utils = require('../utils');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const OUTPUT_DIR = path.join(__dirname, 'output');

// Set SOURCE to 'json' or 'xlsx' to choose which file type to read from
const SOURCE = process.env.SOURCE || 'json'; // 'json' | 'xlsx'

// Set MODE to control insert behaviour:
//   'upsert'    – update if _id exists, insert if not (default, safest)
//   'insert'    – plain insertMany; fails on duplicate _id
//   'overwrite' – delete existing docs first, then insert
const MODE = process.env.MODE || 'upsert';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Read source data. Returns a plain JS array.
 */
function readSource(filename) {
    const jsonPath = path.join(OUTPUT_DIR, `${filename}.json`);
    const xlsxPath = path.join(OUTPUT_DIR, `${filename}.xlsx`);

    if (SOURCE === 'json') {
        if (!fs.existsSync(jsonPath)) throw new Error(`JSON file not found: ${jsonPath}`);
        console.log(`  Reading JSON: ${jsonPath}`);
        return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    }

    if (SOURCE === 'xlsx') {
        if (!fs.existsSync(xlsxPath)) throw new Error(`XLSX file not found: ${xlsxPath}`);
        console.log(`  Reading XLSX: ${xlsxPath}`);
        const workbook = XLSX.readFile(xlsxPath);
        const sheetName = workbook.SheetNames[0];
        return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    }

    throw new Error(`Unknown SOURCE "${SOURCE}". Use 'json' or 'xlsx'.`);
}

/**
 * Coerce string _id values back to MongoDB ObjectId where possible.
 */
function toObjectId(value) {
    if (!value) return undefined;
    try {
        return new ObjectId(value.toString());
    } catch {
        return value; // leave as-is if not a valid ObjectId string
    }
}

/**
 * Upsert a single document by _id.
 */
async function upsertDoc(collection, doc) {
    const { _id, ...rest } = doc;
    await collection.updateOne(
        { _id },
        { $set: rest },
        { upsert: true }
    );
}

/**
 * Core import logic – applies MODE strategy.
 */
async function importDocs(collection, docs, label) {
    if (!docs.length) {
        console.log(`  No ${label} to import.`);
        return;
    }

    if (MODE === 'upsert') {
        console.log(`  Upserting ${docs.length} ${label}...`);
        for (const doc of docs) await upsertDoc(collection, doc);

    } else if (MODE === 'insert') {
        console.log(`  Inserting ${docs.length} ${label} (plain insert)...`);
        await collection.insertMany(docs, { ordered: false });

    } else if (MODE === 'overwrite') {
        console.log(`  Overwriting – deleting existing ${label} first...`);
        const ids = docs.map(d => d._id).filter(Boolean);
        if (ids.length) await collection.deleteMany({ _id: { $in: ids } });
        console.log(`  Inserting ${docs.length} ${label}...`);
        await collection.insertMany(docs, { ordered: false });

    } else {
        throw new Error(`Unknown MODE "${MODE}". Use 'upsert', 'insert', or 'overwrite'.`);
    }

    console.log(`  ✓ Done – ${docs.length} ${label} processed.`);
}

// ─────────────────────────────────────────────
// Sales Orders import
// ─────────────────────────────────────────────
async function importSalesOrders(makeDb) {
    console.log('\n── Sales Orders ──');
    const raw = readSource('sales_orders_export');

    const docs = raw.map(o => {
        const doc = { ...o };

        // Restore ObjectId
        if (doc._id) doc._id = toObjectId(doc._id);
        if (doc.quoteId) doc.quoteId = toObjectId(doc.quoteId);
        if (doc.adminOwnerId) doc.adminOwnerId = toObjectId(doc.adminOwnerId);
        if (doc.userId) doc.userId = toObjectId(doc.userId);

        // Restore Date
        if (doc.createdAt) doc.createdAt = new Date(doc.createdAt);
        if (doc.currencySnapshot?.rateDate) {
            doc.currencySnapshot.rateDate = new Date(doc.currencySnapshot.rateDate);
        }

        // Drop computed/export-only fields – they are derived, not stored
        delete doc.calculatedTotal;
        delete doc.organizationPrice;
        delete doc.type;
        delete doc.refId; // original field is RefId (capital R)

        return doc;
    });

    await importDocs(makeDb.collection('checkouts'), docs, 'Sales Orders');
}

// ─────────────────────────────────────────────
// Purchase Orders import
// ─────────────────────────────────────────────
async function importPurchaseOrders(scDb) {
    console.log('\n── Purchase Orders ──');
    const raw = readSource('purchase_orders_export');

    const docs = raw.map(po => {
        // XLSX export only had a flat shape; rebuild the DB shape
        const doc = {
            _id: toObjectId(po._id),
            purchaseOrderNumber: po.PONumber,
            pORefId: po.PONumber,
            totalAmount: Number(po.OrganizationValue) || 0,
            createdAt: po.CreatedAt ? new Date(po.CreatedAt) : undefined,
            currencySnapshot: {
                customerRate: Number(po.CustomerRate) || 1
            }
        };

        // Carry over any extra fields present in JSON source
        const knownKeys = new Set(['_id', 'PONumber', 'CreatedAt', 'CustomerValue', 'OrganizationValue', 'CustomerRate']);
        for (const [k, v] of Object.entries(po)) {
            if (!knownKeys.has(k)) doc[k] = v;
        }

        return doc;
    });

    await importDocs(scDb.collection('purchaseorders'), docs, 'Purchase Orders');
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function importAllOrders() {
    console.log('=== Starting Import Process ===');
    console.log(`  Source : ${SOURCE.toUpperCase()}`);
    console.log(`  Mode   : ${MODE.toUpperCase()}`);

    let makeClient, scClient;
    try {
        makeClient = await utils.connectToDB(config.MAKE_DB_URI);
        scClient = await utils.connectToDB(config.SC_DB_URI);

        const makeDb = makeClient.db('pipl-make-local');
        const scDb = scClient.db('pipl-sc-local');

        await importSalesOrders(makeDb);
        await importPurchaseOrders(scDb);

        console.log('\n=== Import Complete ===\n');

    } catch (error) {
        console.error('\nImport failed:', error);
        process.exit(1);
    } finally {
        if (makeClient) await makeClient.close();
        if (scClient) await scClient.close();
    }
}

importAllOrders();