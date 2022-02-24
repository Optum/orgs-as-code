import { OrganizationConfiguration } from "./newOrgfileObject";
import { Response } from "./response";

export type ValidationCheckType = "UniqueName"
    | "AppropriatePrefix"
    | "ValidSponsorCodeType"
    | "ValidSchema"
    | "ValidCustomCheck";

export type SuccessfulValidationCheck = {
    Status: true
}

export type FailedValidationCheck = {
    Status: false
    Messages: string[]
}

export type NoValidationCheck = {
    Status: "notRan"
}

export type ValidationCheck = SuccessfulValidationCheck | FailedValidationCheck | NoValidationCheck;

export type OrgValidationResponse = Response<Record<ValidationCheckType, ValidationCheck>> & {
    OrgFilePath: string
};


export interface IOrganizationValidator {
    ValidateConfigurations(configurations: OrganizationConfiguration[]): Promise<OrgValidationResponse[]>;
}

export type OrganizationValidatorFactoryProps = {
    orgFileSchemaValidator: (rawOrgFile: object) => Promise<{ status: boolean, message: string }>;
    organizationNameChecker: (name: string) => Promise<Response<{ nameTaken: boolean }>>;
    acceptablePrefixListFetcher: () => Promise<Response<string[]>>;
    debugLogger: (msg: string) => void;
}

class OrganizationValidator implements IOrganizationValidator {
    orgFileSchemaValidator: (rawOrgFile: object) => Promise<{ status: boolean, message: string }>;
    organizationNameChecker: (name: string) => Promise<Response<{ nameTaken: boolean }>>;
    acceptablePrefixListFetcher: () => Promise<Response<string[]>>;
    debugLogger: (msg: string) => void;

    constructor(props: OrganizationValidatorFactoryProps) {
        this.orgFileSchemaValidator = props.orgFileSchemaValidator;
        this.organizationNameChecker = props.organizationNameChecker;
        this.acceptablePrefixListFetcher = props.acceptablePrefixListFetcher;
        this.debugLogger = props.debugLogger;
    }

    private async validationConfiguration(configuration: object & { OrgFilePath: string }): Promise<OrgValidationResponse> {
        const { OrgFilePath } = configuration;

        this.debugLogger(JSON.stringify(configuration, null, 1));

        const orgValidationMap: Record<ValidationCheckType, ValidationCheck> = {
            ValidSchema: { Status: "notRan" },
            AppropriatePrefix: { Status: "notRan" },
            UniqueName: { Status: "notRan" },
            ValidCustomCheck: { Status: "notRan" },
            ValidSponsorCodeType: { Status: "notRan" }
        };

        // Check Schema     
        const schemaValidationResponse = await this.orgFileSchemaValidator(configuration);

        if (schemaValidationResponse.status) {
            orgValidationMap.ValidSchema = {
                Status: true
            }
        }
        else {
            orgValidationMap.ValidSchema = {
                Status: false,
                Messages: [schemaValidationResponse.message, "All other checks will be skipped as orgfile is not valid."]
            }

            return {
                OrgFilePath,
                Success: true,
                Data: orgValidationMap
            }
        }

        const { name: orgName } = configuration as OrganizationConfiguration;

        // Check Name Prefix
        const requiredPrefixesResponse = await this.acceptablePrefixListFetcher();

        if (!requiredPrefixesResponse.Success) {
            return {
                OrgFilePath,
                Success: false,
                ErrorMessage: "Unable to fetch acceptable prefix list."
            }
        }

        const appropriatePrefixes = requiredPrefixesResponse.Data;

        this.debugLogger(`Appropriate Prefixes: ${appropriatePrefixes.join(", ")}`);

        if (appropriatePrefixes.length > 0
            && appropriatePrefixes.find(p => orgName.startsWith(p)) === undefined) {
            const prefixValueListMarkdown = appropriatePrefixes.map(p => `* ${p}`).join("\n");
            const prefixValueListMessage = `Appropriate Prefixes:\n${prefixValueListMarkdown}`;
            const errorString = `\`name\` must be prefixed with an acceptable value (e.g. \`${appropriatePrefixes[0]}${orgName}\`)`;

            orgValidationMap.AppropriatePrefix = {
                Status: false,
                Messages: [errorString, prefixValueListMessage]
            };
        }
        else {
            orgValidationMap.AppropriatePrefix = {
                Status: true
            };
        }

        // Check Unique Name Constraint
        const checkIfOrgExistResponse = await this.organizationNameChecker(orgName);
        this.debugLogger(`OrgName Check: ${JSON.stringify(checkIfOrgExistResponse)}`);

        if (!checkIfOrgExistResponse.Success) {
            return {
                OrgFilePath,
                Success: false,
                ErrorMessage: "Unable to query existing organization names.",
            }
        }


        if (checkIfOrgExistResponse.Data.nameTaken) {
            orgValidationMap.UniqueName = {
                Status: false,
                Messages: [`Organization Name \`${orgName}\` already in use.`]
            };
        }
        else {
            orgValidationMap.UniqueName = {
                Status: true
            };
        }

        // Check custom check

        this.debugLogger(JSON.stringify(orgValidationMap, null, 1));

        return {
            OrgFilePath,
            Success: true,
            Data: orgValidationMap
        }
    }

    async ValidateConfigurations(configurations: OrganizationConfiguration[]): Promise<OrgValidationResponse[]> {
        this.debugLogger(`Validating ${configurations.length} file(s)`)

        const orgFileNames = configurations.map(o => o.name);
        const doDuplicateNamesExistInCurrentList = hasDuplicates(orgFileNames);

        if (doDuplicateNamesExistInCurrentList) {
            const formattedOrgFileNamesString = orgFileNames.map(n => `\`${n}\``).join(", ");
            return [{
                Success: false,
                ErrorMessage: `Org files in list contain duplicate names: ${formattedOrgFileNamesString}`,
                OrgFilePath:"Invalid"
            }]
        }

        const validationPromises = configurations.map(async c => this.validationConfiguration(c));

        const completedValidationResposnes = await Promise.all(validationPromises);

        return completedValidationResposnes;
    }
}

export function OrganizationValidatorFactory(props: OrganizationValidatorFactoryProps) {
    return new OrganizationValidator(props);
}

function hasDuplicates<T>(arr: T[]): boolean {
    return new Set(arr).size < arr.length;
}