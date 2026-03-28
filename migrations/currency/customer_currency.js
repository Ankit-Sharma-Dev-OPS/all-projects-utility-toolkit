// THIS SCRIPT UPDATE CUSTOMER AND COMPANY CURRENCY TO ORGANIZATION CURRENCY , ADD CURRENCY SNAPSHOT IN QUOTE AND ORDER

const { MongoClient } = require("mongodb");

const uri = "";
const dbName = "";

async function runMigration() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(dbName);

    /* STEP 1: Fetch master currency */
    const organization = await db
      .collection("organizationsetups") // adjust collection name if different
      .findOne({});

    if (!organization) {
      throw new Error("Organization setup not found");
    }

    const masterCurrency = organization.organizationCurrency?.toUpperCase();
    console.log("Master Currency:", masterCurrency);

    /* STEP 2: Update all companies */
    const companyResult = await db.collection("companies").updateMany(
      {},
      { $set: { currency: masterCurrency } }
    );

    console.log("Companies updated:", companyResult.modifiedCount);

    /* STEP 3: Update all quotes */
    const quotesCursor = db.collection("quotes").find({});

    while (await quotesCursor.hasNext()) {
      const quote = await quotesCursor.next();

      await db.collection("quotes").updateOne(
        { _id: quote._id },
        {
          $set: {
            currencySnapshot: {
              adminRate: 1,
              customerRate: 1,
              rateDate: quote.createdAt || new Date(),
            },
          },
        }
      );
    }

    console.log("Quotes updated");

    /* STEP 4: Update all checkout/orders */
    const ordersCursor = db.collection("checkouts").find({}); // adjust name

    while (await ordersCursor.hasNext()) {
      const order = await ordersCursor.next();

      await db.collection("checkouts").updateOne(
        { _id: order._id },
        {
          $set: {
            currencySnapshot: {
              adminRate: 1,
              customerRate: 1,
              rateDate: order.createdAt || new Date(),
            },
          },
        }
      );
    }

    console.log("Orders updated");
    console.log("Migration completed successfully");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.close();
  }
}

runMigration();
