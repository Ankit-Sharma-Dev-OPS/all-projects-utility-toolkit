// THIS SCRIPT UPDATE TAXES IN COMPANY AND ADD TAXES IN QUOTE 

const { MongoClient } = require("mongodb");

const uri = "";
const dbName = "";

/* CONSTANTS */
const TAX2_VALUE = 0;       // or 0
const TAX2_LABEL = "";   // or ""
const TAX1_LABEL = 'VAT';

async function runMigration() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log("Connected to MongoDB");

        const db = client.db(dbName);

        /* STEP 1: Update companies tax2 */
        await db.collection("companies").updateMany(
            {},
            {
                $set: {
                    taxesLabel:TAX1_LABEL,
                    taxes2: TAX2_VALUE,
                    taxes2Label: TAX2_LABEL,
                },
            }
        );

        console.log("Companies updated");

        /* STEP 2: Preload Users and Companies */
        const users = await db.collection("users").find({}).toArray();
        const companies = await db.collection("companies").find({}).toArray();

        const userMap = new Map(users.map(u => [u._id.toString(), u]));
        const companyMap = new Map(companies.map(c => [c._id.toString(), c]));

        /* STEP 3: Process Quotes */
        const quotesCursor = db.collection("quotes").find({});

        let updatedCount = 0;

        while (await quotesCursor.hasNext()) {
            const quote = await quotesCursor.next();

            if (!quote.userId) continue;

            const user = userMap.get(quote.userId.toString());
            if (!user || !user.companySiteId) continue;

            const company = companyMap.get(user.companySiteId.toString());
            if (!company) continue;

            const tax1 = company.taxes || 0;
            const tax2 = company.taxes2 || 0;

            await db.collection("quotes").updateOne(
                {
                    _id: quote._id,
                    partsData: { $type: "array" }
                },
                {
                    $set: {
                        certificationTax1: tax1,
                        certificationTax2: tax2,
                        shippingTax1: tax1,
                        shippingTax2: tax2,
                        "partsData.$[elem].tax1": tax1,
                        "partsData.$[elem].tax2": tax2
                    }
                },
                {
                    arrayFilters: [
                        { elem: { $ne: null } }
                    ]
                }
            );


            updatedCount++;
        }

        console.log("Quotes updated:", updatedCount);
        console.log("Migration completed successfully");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.close();
    }
}

runMigration();
