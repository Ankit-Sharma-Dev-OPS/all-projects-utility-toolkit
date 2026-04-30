const { MongoClient } = require('mongodb');

/**
 * Connect to MongoDB and return the client
 */
async function connectToDB(uri) {
    const client = new MongoClient(uri);
    await client.connect();
    return client;
}

/**
 * Calculates the total amount for a Sales Order or Purchase Order.
 * Matches logic from frontend (orderDetailsAdmin.js, PurchaseOrderDetails.js, and helper.js)
 */
/**
 * Calculates the tax amount for a given price and tax percentage.
 */
/**
 * Calculates the tax amount for a given price and tax percentage.
 * @param {number} price
 * @param {number} taxPercent
 * @param {boolean} round - Whether to round to 2 decimals (matches orderDetailsAdmin.js local version)
 */
function calculateTaxAmount(price, taxPercent, round = false) {
    if (!price || !taxPercent) return 0;
    const amount = (Number(price) * Number(taxPercent)) / 100;
    return round ? Number(amount.toFixed(2)) : Number(amount);
}

/**
 * Calculates line tax total for a part. Matches getLineTaxTotal from helper.js
 */
function getLineTaxTotal(val, shipMethod, qty, taxCount = 0) {
    let totalTax = 0;
    for (let i = 0; i < taxCount; i++) {
        const taxNumber = i + 1;
        const taxPrice = calculateTaxAmount(val?.[`price${shipMethod}`], val?.[`tax${taxNumber}`], false); // helper.js version doesn't round
        totalTax += (taxPrice || 0) * (qty || 0);
    }
    return totalTax;
}

/**
 * Calculates line total for a part. Matches getLineTotal from helper.js
 */
function getLineTotal(val, shipMethod, qty, taxCount = 0) {
    const price = Number(val?.[`price${shipMethod}`]) || 0;
    if (!qty) return 0;
    const baseTotal = price * qty;
    const taxTotal = getLineTaxTotal(val, shipMethod, qty, taxCount);
    return baseTotal + taxTotal;
}

/**
 * Calculates total for a component (shipping/cert) with taxes. 
 * Matches calculateTotalShippingCost / calculateTotalCertificationsCost from orderDetailsAdmin.js
 */
function calculateComponentTotalWithTax(baseCost, taxPercents = [], roundTax = true) {
    const base = Number(baseCost) || 0;
    const totalTax = taxPercents.reduce((sum, taxPercent) => {
        return sum + calculateTaxAmount(base, taxPercent, roundTax);
    }, 0);
    return base + totalTax;
}

/**
 * Mimics frontend convertAdminPriceToCustomer
 */
function convertAdminPriceToCustomer(basePrice, exchangeRate, decimals = 2) {
    if (typeof basePrice !== 'number' || typeof exchangeRate !== 'number') {
        return 0;
    }
    return Number((basePrice * exchangeRate).toFixed(decimals));
}

/**
 * Master calculation function that mimics the frontend's "convert-then-calculate" flow.
 * Matches logic from orderDetailsAdmin.js (calculateInvoiceTotalAmount using full quantities).
 */
/**
 * Core calculation logic for a Sales Order total.
 * @param {object} order - The order/checkout object
 * @param {object} quote - The quote object
 * @param {array} partsData - The parts data to use (already potentially converted)
 * @param {number} shippingCharge - The shipping charge to use (already potentially converted)
 * @param {number} certificationCost - The certification cost to use (already potentially converted)
 */
function calculateSalesOrderTotalRaw(order, quote, partsData, shippingCharge, certificationCost) {
    const shipMethod = order.quoteSelectedShipMethod || 1;
    const taxesCount = (order.tax ? 1 : 0) + (order.tax2 ? 1 : 0);

    // 1. Line items total (includes per-part taxes)
    const lineItemsTotal = (partsData || []).reduce((sum, part) => {
        return sum + getLineTotal(part, shipMethod, part.Qty, taxesCount);
    }, 0);

    // 2. Certifications total
    const certTaxes = [];
    if (quote?.certificationTax1) certTaxes.push(quote.certificationTax1);
    if (quote?.certificationTax2) certTaxes.push(quote.certificationTax2);
    const certificationsTotal = calculateComponentTotalWithTax(certificationCost, certTaxes, true);

    // 3. Shipping total
    const shipTaxes = [];
    if (quote?.shippingTax1) shipTaxes.push(quote.shippingTax1);
    if (quote?.shippingTax2) shipTaxes.push(quote.shippingTax2);
    const shippingTotal = calculateComponentTotalWithTax(shippingCharge, shipTaxes, true);

    return lineItemsTotal + certificationsTotal + shippingTotal;
}

/**
 * Master calculation function that mimics the frontend's "convert-then-calculate" flow.
 * Matches logic from orderDetailsAdmin.js (calculateInvoiceTotalAmount using full quantities).
 */
function calculateSalesOrderTotalCustomerCurrency(order, quote, customerRate) {
    // 1. Convert quote parts to customer currency first (rounds to 2 decimals)
    const convertedParts = (quote?.partsData || []).map(part => ({
        ...part,
        price1: convertAdminPriceToCustomer(part.price1, customerRate),
        price2: convertAdminPriceToCustomer(part.price2, customerRate),
        price3: convertAdminPriceToCustomer(part.price3, customerRate)
    }));

    const convertedCertCost = convertAdminPriceToCustomer(order.orderCertificationsCost, customerRate);
    const convertedShipCost = convertAdminPriceToCustomer(order.shippingCharge, customerRate);

    return calculateSalesOrderTotalRaw(order, quote, convertedParts, convertedShipCost, convertedCertCost);
}

/**
 * Calculates the total in Admin/Organization currency (without rate conversion or base rounding).
 */
function calculateSalesOrderTotalAdminCurrency(order, quote) {
    return calculateSalesOrderTotalRaw(
        order, 
        quote, 
        quote?.partsData, 
        order.shippingCharge, 
        order.orderCertificationsCost
    );
}
/**
 * Calculates the total for a Purchase Order in a raw/generic way.
 */
function calculatePurchaseOrderTotalRaw(po, partsData, isConverted, customerRate = 1) {
    const subTotal = (partsData || []).reduce((acc, part) => {
        let price = Number(part.price) || 0;
        if (isConverted) {
            price = convertAdminPriceToCustomer(price, customerRate, 10); // Matching frontend's 10 decimals
        }
        const qty = Number(part.qty) || 0;
        const base = price * qty;

        // PO taxes are per part: tax1, tax2, etc.
        let itemTax = 0;
        if (part.tax1) itemTax += (base * Number(part.tax1) / 100);
        if (part.tax2) itemTax += (base * Number(part.tax2) / 100);
        if (part.tax3) itemTax += (base * Number(part.tax3) / 100);

        return acc + base + itemTax;
    }, 0);

    let adj = Number(po.adjustmentValue) || 0;
    if (isConverted) {
        adj = convertAdminPriceToCustomer(adj, customerRate, 10); // Matching frontend's 10 decimals
    }

    return subTotal + adj;
}

/**
 * Calculates PO total in Customer Currency.
 */
function calculatePurchaseOrderTotalCustomerCurrency(po, partsData, customerRate) {
    return calculatePurchaseOrderTotalRaw(po, partsData, true, customerRate);
}

/**
 * Calculates PO total in Admin/Organization Currency.
 */
function calculatePurchaseOrderTotalAdminCurrency(po, partsData) {
    return calculatePurchaseOrderTotalRaw(po, partsData, false);
}

module.exports = {
    connectToDB,
    convertAdminPriceToCustomer,
    calculateSalesOrderTotalCustomerCurrency,
    calculateSalesOrderTotalAdminCurrency,
    calculatePurchaseOrderTotalCustomerCurrency,
    calculatePurchaseOrderTotalAdminCurrency
};
