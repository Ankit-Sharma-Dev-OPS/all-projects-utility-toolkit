const { MongoClient } = require('mongodb');

// Connection URI from .env file
const MAKE_DB_URI = "";

async function migrateExchangeRateHistory() {
    console.log("--- Starting Migration for CurrencyExchangeRate History ---");
    const client = new MongoClient(MAKE_DB_URI);
    try {
        await client.connect();
        const db = client.db();

        // 1. Fetch Organization Currency from organizationSetup collection
        const orgSetup = await db.collection('organizationsetups').findOne();
        const orgCurrency = orgSetup?.organizationCurrency;

        if (!orgCurrency) {
            console.error("Organization currency not found in organizationsetups collection.");
            return;
        }
        console.log(`Target Organization Currency: ${orgCurrency}`);

        const exchangeRateColl = db.collection('currencyexchangerates');

        // 2. Find records where base_currency is USD (or not orgCurrency)
        const cursor = exchangeRateColl.find({
            base_currency: { $ne: orgCurrency }
        });

        let count = 0;
        while (await cursor.hasNext()) {
            const record = await cursor.next();
            const oldRates = record.rates;

            // Rebase rates to organization currency
            // NewRate(Org -> X) = OldRate(USD -> X) / OldRate(USD -> Org)
            const usdToOrgRate = oldRates[orgCurrency];
            if (!usdToOrgRate) {
                console.warn(`Record for date ${record.date} missing rate for ${orgCurrency}. Skipping.`);
                continue;
            }

            const newRates = {};
            for (const [currency, rate] of Object.entries(oldRates)) {
                newRates[currency] = rate / usdToOrgRate;
            }

            // Ensure the org currency itself is exactly 1
            newRates[orgCurrency] = 1;

            await exchangeRateColl.updateOne(
                { _id: record._id },
                {
                    $set: {
                        base_currency: orgCurrency,
                        rates: newRates,
                        lastUpdated: new Date()
                    }
                }
            );
            count++;
        }
        console.log(`Updated ${count} historical record(s) in currencyexchangerates.`);
    } catch (err) {
        console.error("Error in migrateExchangeRateHistory:", err);
    } finally {
        await client.close();
    }
}

migrateExchangeRateHistory().catch(console.error);
