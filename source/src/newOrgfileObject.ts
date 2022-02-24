import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats"
import { NewOrgfile } from "./schemas/new-orgfile-schema"

import * as newOrgfileSchema from "./schemas/new-orgfile-schema.json";

// Problem: avj most likely won't be able to load $refs from other files... may have to get rid of the base orgfile concept :(

export function validateOrgfile(orgfile: object, logger?: (msg: string) => void): { status: boolean, message: string } {
    //const ajv = new Ajv();

    const ajv = new Ajv2020({ allErrors: true });
    addFormats(ajv);
    // ajv.addMetaSchema("http://json-schema.org/draft-04/schema#")
    const validate = ajv.compile(newOrgfileSchema);

    if (validate(orgfile)) {
        return {
            status: true,
            message: ""
        };
    }
    else if (validate.errors) {
        logger === undefined ? "" : logger(`Count of: ${JSON.stringify(validate.errors)}`);
        const errStringArray = [];
        for (let err of validate.errors) {
            errStringArray.push(err.message);
        }
        return {
            status: false,
            message: errStringArray.join("\n")
        };
    }
    else {
        return {
            status: false,
            message: "Fatal error in validation."
        };
    }
}

export type OrganizationConfiguration = NewOrgfile & { OrgFilePath: string };