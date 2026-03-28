import xlsx from "xlsx";
import { MongoClient } from "mongodb";

const MONGO_URI = "";
const DB_NAME = "";
const COLLECTION = "cnc_materials";


//key is name of excel column and value is db schema field name
const fieldsObjectToInsertOrUpdate = {
    'Hardness Value': 'cnc_hardening',
    'Hardness Scale ': 'cnc_hardening_scale',
    'Density _gms_per_cm3':'cnc_material_density_gms_cm3'
}
const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db(DB_NAME);
const materials = db.collection(COLLECTION);

async function updateMaterials() {
    try {
        const workbook = xlsx.readFile("../../data/material.xlsx");
        const sheet = workbook.Sheets["Material Master"];
        const data = xlsx.utils.sheet_to_json(sheet);
        const values = Object.entries(fieldsObjectToInsertOrUpdate);

        const promiseArray = [];

        for (const row of data) {
            const materialCodeFromExcel = row["cnc_material_number"];

            const setObject = values.reduce((pre, [excelSheetName, dbSchemaName]) => {
                let value = row[excelSheetName]
                if (typeof value == 'string') {
                    value = value.trim()
                }
                pre[dbSchemaName] = value
                return pre;
            }, {});

            console.log('Set Object ::', setObject);
            const p = materials.updateOne(
                { cnc_material_number: materialCodeFromExcel },
                { $set: setObject },
            );
            promiseArray.push(p)
        }
        await Promise.all(promiseArray)

        console.log("✅ All materials updated successfully!");

    } catch (error) {
        console.log('Error ::', error);
    } finally {
        await client.close();
    }






};

updateMaterials().catch(console.error);
