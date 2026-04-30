module.exports = {
    // MongoDB Connection Strings
    MAKE_DB_URI: '',
    SC_DB_URI: '',

    EXPORT_FILE_BASE: 'orders_export',

    // Fields that can be updated in the DB from the exported files
    ALLOWED_IMPORT_FIELDS: [
        'refId',
        'adminOwnerId',
        'userId',
        'currencySnapshot',
        'totalAmount',
        'subTotal',
        'shippingCharge',
        'orderCertificationsCost',
        'tax',
        'tax2',
        'status',
        'adjustmentValue'
    ]
};
