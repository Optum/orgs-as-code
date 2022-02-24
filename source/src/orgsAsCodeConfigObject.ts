import { OrgsAsCodeSettings } from "./schemas/orgsAsCodeSettings-schema";

export type OrgsAsCodeConfig = Required<OrgsAsCodeSettings>;

export const DefaultConfig: OrgsAsCodeConfig = {
    alwaysAddedOwners: [],
    alwaysInstalledGitHubApps: [],
    organizationSyncCheckInterval: 60,
    excludedOrganizations: [],
    requiredOrganizationPrefixes: []
};