
// THIS SCRIPT UPDATE SUPPLIER COMPANY CURRENCY TO ORGANIZATION CURRENCY , ADD CURRENCY SNAPSHOT IN QUOTE AND ORDER




const { MongoClient } = require("mongodb");

const uri = "";
const dbName = "";

const makeDbUri = "";
const makeDbName = "";

async function runMigration() {
    const client = new MongoClient(uri);
    const makeClient = new MongoClient(makeDbUri);

   
        /* STEP 1: Fetch master currency from make db */
    try {
        await client.connect();
        await makeClient.connect();
        console.log("Connected to MongoDB");

        const db = client.db(dbName);


        const makeDb = makeClient.db(makeDbName);
        const organization = await makeDb
            .collection("organizationsetups") // adjust collection name if different
            .findOne({});

        if (!organization) {
            throw new Error("Organization setup not found");
        }

        const masterCurrency = organization.organizationCurrency?.toUpperCase();
        console.log("Master Currency:", masterCurrency);


        /* STEP 2: Update supplier companies */
        const supplierCompanyResult = await db
            .collection("suppliercompanies") // confirm collection name
            .updateMany({}, { $set: { currency: masterCurrency } });

        console.log("Supplier companies updated:", supplierCompanyResult.modifiedCount);

        /* STEP 3: Update supplier RFQ & Offer */
        const rfqCursor = db.collection("supplierrfqoffers").find({});

        while (await rfqCursor.hasNext()) {
            const rfq = await rfqCursor.next();

            await db.collection("supplierrfqoffers").updateOne(
                { _id: rfq._id },
                {
                    $set: {
                        currencySnapshot: {
                            adminRate: 1,
                            customerRate: 1,
                            rateDate: rfq.createdAt || new Date(),
                        },
                    },
                }
            );
        }

        console.log("Supplier RFQ & Offer updated");

        /* STEP 4: Update Purchase Orders */
        const poCursor = db.collection("purchaseorders").find({});

        while (await poCursor.hasNext()) {
            const po = await poCursor.next();

            await db.collection("purchaseorders").updateOne(
                { _id: po._id },
                {
                    $set: {
                        currencySnapshot: {
                            adminRate: 1,
                            customerRate: 1,
                            rateDate: po.createdAt || new Date(),
                        },
                    },
                }
            );
        }

        console.log("Purchase Orders updated");
        console.log("Migration completed successfully");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.close();
    }
}

runMigration();
