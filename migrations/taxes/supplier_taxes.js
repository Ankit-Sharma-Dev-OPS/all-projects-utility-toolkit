// THIS SCRIPT UPDATE TAXES IN COMPANY AND ADD TAXES IN QUOTE 

const { MongoClient } = require("mongodb");

//clear url
const uri = "";
const dbName = "";

/* CONSTANTS */
const TAX2_VALUE = 0;     // or 0
const TAX2_LABEL = "SGST"; // or ""

const TAX1_LABEL = 'GST';

async function runMigration() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log("Connected to MongoDB");

        const db = client.db(dbName);

        /* STEP 1: Update supplier companies tax2 */
        await db.collection("suppliercompanies").updateMany(
            {},
            {
                $set: {
                    taxes: 0,
                    taxesLabel: TAX1_LABEL,
                    taxes2: TAX2_VALUE,
                    taxes2Label: TAX2_LABEL
                }
            }
        );

        console.log("Supplier companies updated");

        /* STEP 2: Load suppliers */
        const suppliers = await db
            .collection("suppliercompanies")
            .find({})
            .toArray();

        const supplierMap = new Map(
            suppliers.map(s => [s._id.toString(), s])
        );

        /* STEP 3: Process RFQ / Offers */
        const cursor = db.collection("supplierrfqoffers").find({});

        let updated = 0;

        while (await cursor.hasNext()) {
            const doc = await cursor.next();

            if (!doc.supplierId) continue;

            const supplier = supplierMap.get(doc.supplierId.toString());
            if (!supplier) continue;

            const tax1 = supplier.taxes || 0;
            const tax2 = supplier.taxes2 || 0;

            await db.collection("supplierrfqoffers").updateOne(
                { _id: doc._id },
                {
                    $set: {
                        "partsData.$[elem].tax1": tax1,
                        "partsData.$[elem].tax2": tax2
                    }
                },
                {
                    arrayFilters: [{ elem: { $ne: null } }]
                }
            );

            updated++;
        }




        console.log("Supplier RFQ/Offers updated:", updated);
        console.log("Migration completed successfully");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.close();
    }
}

runMigration();
