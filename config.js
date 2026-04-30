module.exports = {
    // MongoDB Connection Strings
    MAKE_DB_URI: 'mongodb+srv://ankitdainstatest:CYybMpQwodm7hmYE@cluster0.s8cihku.mongodb.net/pipl-make-local',
    SC_DB_URI: 'mongodb+srv://ankitdainstatest:CYybMpQwodm7hmYE@cluster0.s8cihku.mongodb.net/pipl-sc-local',

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
