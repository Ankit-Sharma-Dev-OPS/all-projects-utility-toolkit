const config = require('../config');
const utils = require('../utils');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Output directory for generated files
const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ─────────────────────────────────────────────
// Sales Orders
// ─────────────────────────────────────────────
async function fetchSalesOrders(makeDb) {
    console.log('Fetching Sales Orders + Quote Data...');

    const salesOrdersRaw = await makeDb.collection('checkouts').aggregate([
        {
            $lookup: {
                from: 'quotes',
                localField: 'quoteId',
                foreignField: '_id',
                as: 'quoteData'
            }
        },
        { $unwind: { path: '$quoteData', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                _id: 1,
                RefId: 1,
                currencySnapshot: 1,
                adminOwnerId: 1,
                userId: 1,
                createdAt: 1,
                totalAmount: 1,
                subTotal: 1,
                shippingCharge: 1,
                orderCertificationsCost: 1,
                tax: 1,
                tax2: 1,
                adjustmentValue: 1,
                quoteSelectedShipMethod: 1,
                quoteId: 1,
                "quoteData.partsData": 1,
                "quoteData.shippingCharge1": 1,
                "quoteData.shippingCharge2": 1,
                "quoteData.shippingCharge3": 1,
                "quoteData.orderCertificationsCost": 1,
                "quoteData.certificationTax1": 1,
                "quoteData.certificationTax2": 1,
                "quoteData.shippingTax1": 1,
                "quoteData.shippingTax2": 1
            }
        }
    ]).toArray();

    console.log(`  Found ${salesOrdersRaw.length} Sales Orders.`);

    return salesOrdersRaw.map(o => {
        const customerRate = o.currencySnapshot?.customerRate || 1;

        const calculatedTotal = utils.calculateSalesOrderTotalCustomerCurrency(
            o, o.quoteData, customerRate
        );
        const organizationPrice = utils.calculateSalesOrderTotalAdminCurrency(
            o, o.quoteData
        );

        delete o.quoteData;
        return {
            ...o,
            type: 'Sales Order',
            refId: o.RefId,
            calculatedTotal,
            organizationPrice
        };
    });
}

// ─────────────────────────────────────────────
// Purchase Orders
// ─────────────────────────────────────────────
async function fetchPurchaseOrders(scDb) {
    console.log('Fetching Purchase Orders + Supplier RFQ Offer Data...');

    const purchaseOrdersRaw = await scDb.collection('purchaseorders').aggregate([
        {
            $lookup: {
                from: 'supplierrfqoffers',
                localField: 'supplierRfqOfferId',
                foreignField: '_id',
                as: 'offerData'
            }
        },
        { $unwind: { path: '$offerData', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                _id: 1,
                purchaseOrderNumber: 1,
                pORefId: 1,
                currencySnapshot: 1,
                totalAmount: 1,
                adjustmentValue: 1,
                status: 1,
                createdAt: 1,
                "offerData.partsData": 1
            }
        }
    ]).toArray();

    console.log(`  Found ${purchaseOrdersRaw.length} Purchase Orders.`);

    return purchaseOrdersRaw.map(po => {
        const customerRate = po.currencySnapshot?.customerRate || 1;
        const dbTotalRaw = Number(po.totalAmount) || 0;
        const dbTotalConverted = utils.convertAdminPriceToCustomer(dbTotalRaw, customerRate, 10);
        const organizationTotal = dbTotalRaw;

        return {
            _id: po._id ? po._id.toString() : '',
            PONumber: po.purchaseOrderNumber || po.pORefId,
            CreatedAt: po.createdAt,
            CustomerValue: dbTotalConverted.toFixed(2),
            OrganizationValue: organizationTotal.toFixed(2),
            CustomerRate: customerRate
        };
    });
}

// ─────────────────────────────────────────────
// Main export orchestrator
// ─────────────────────────────────────────────
async function exportAllOrders() {
    console.log('=== Starting Export Process ===\n');
    let makeClient, scClient;

    try {
        makeClient = await utils.connectToDB(config.MAKE_DB_URI);
        scClient = await utils.connectToDB(config.SC_DB_URI);

        const makeDb = makeClient.db('pipl-make-local');
        const scDb = scClient.db('pipl-sc-local');

        // ── Fetch both in parallel ──
        const [salesOrders, purchaseOrders] = await Promise.all([
            fetchSalesOrders(makeDb),
            fetchPurchaseOrders(scDb)
        ]);

        // ── Sales Orders export ──
        const soExcelData = salesOrders.map(o => ({
            _id: o._id.toString(),
            type: o.type,
            refId: o.refId || '',
            customerRate: o.currencySnapshot?.customerRate || 1,
            exchangeRateDate: o.currencySnapshot?.rateDate || '',
            calculatedTotal: o.calculatedTotal || 0,
            organizationPrice: o.organizationPrice || 0,
            createdAt: o.createdAt
        }));

        const soJsonPath = path.join(OUTPUT_DIR, 'sales_orders_export.json');
        fs.writeFileSync(soJsonPath, JSON.stringify(salesOrders, null, 2));

        // ── Purchase Orders export ──
        const poJsonPath = path.join(OUTPUT_DIR, 'purchase_orders_export.json');
        fs.writeFileSync(poJsonPath, JSON.stringify(purchaseOrders, null, 2));

        // ── Sales Orders Excel export ──
        const soWb = XLSX.utils.book_new();
        const soSheet = XLSX.utils.json_to_sheet(soExcelData);
        XLSX.utils.book_append_sheet(soWb, soSheet, 'Sales Orders');
        const soExcelPath = path.join(OUTPUT_DIR, 'sales_orders_export.xlsx');
        XLSX.writeFile(soWb, soExcelPath);

        // ── Purchase Orders Excel export ──
        const poWb = XLSX.utils.book_new();
        const poSheet = XLSX.utils.json_to_sheet(purchaseOrders);
        XLSX.utils.book_append_sheet(poWb, poSheet, 'Purchase Orders');
        const poExcelPath = path.join(OUTPUT_DIR, 'purchase_orders_export.xlsx');
        XLSX.writeFile(poWb, poExcelPath);

        // ── Summary ──
        console.log('\n=== Export Complete ===');
        console.log(`  Sales Orders : ${salesOrders.length}`);
        console.log(`  Purchase Orders: ${purchaseOrders.length}`);
        console.log(`  Files created in ${OUTPUT_DIR}:`);
        console.log(`    - sales_orders_export.json / .xlsx`);
        console.log(`    - purchase_orders_export.json / .xlsx`);

    } catch (error) {
        console.error('Export failed:', error);
    } finally {
        if (makeClient) await makeClient.close();
        if (scClient) await scClient.close();
    }
}

exportAllOrders();
