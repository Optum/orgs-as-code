import { Octokit } from "@octokit/core";
import { createProbotAuth } from "octokit-auth-probot";
import { GraphqlResponseError, Response } from "./response";

/**
 * https://docs.github.com/en/graphql/reference/input-objects#createenterpriseorganizationinput
 */
export type NewOrg = {
  Login: string
  ProfileName: string
  BillingEmail: string
  AdminLogins: string[]
  EnterpriseId: string
}

export interface OrgAdministrator {
  CheckIfLoginExists(name: string): Promise<Response<{ nameTaken: boolean }>>;
  CreateOrg(props: NewOrg): Promise<Response<string>>;
}

type EnterpriseServerAdministratorProps = {
  octokit: Octokit
  debugLogger: (msg: string) => void
}

class EnterpriseServerAdministrator implements OrgAdministrator {
  octokit: Octokit;
  debugLogger: (msg: string) => void;

  constructor(props: EnterpriseServerAdministratorProps) {
    this.octokit = props.octokit;
    this.debugLogger = props.debugLogger;
  }

  async CheckIfLoginExists(login: string): Promise<Response<{ nameTaken: boolean }>> {
    this.debugLogger(`Querying for login \`${login}\``);

    const orgQuery = `
    query findOrganization($login: String!) {
      organization(login: $login) {
        login,
        id
      }
    }
    `;

    let response;
    try {
      response = await this.octokit.graphql(orgQuery, {
        login: login
      }) as any;
    }
    catch (err: any) {
      if (err.name === "GraphqlResponseError") {
        const graphqlResponseError = err as GraphqlResponseError;

        if (graphqlResponseError.errors.length === 1
          && graphqlResponseError.errors[0].type === "NOT_FOUND") {
          return {
            Success: true,
            Data: {
              nameTaken: false
            }
          }
        }
      }

      return {
        Success: false,
        ErrorMessage: JSON.stringify(err)
      }
    }

    this.debugLogger(JSON.stringify(response));

    if (!response) {
      return {
        Success: false,
        Error: response,
        ErrorMessage: "Failure"
      };
    }

    return {
      Success: true,
      Data: { nameTaken: response.organization === undefined ? false : true }
    }
  }

  async CreateOrg(props: NewOrg): Promise<Response<string>> {
    const { AdminLogins, BillingEmail, EnterpriseId, Login, ProfileName } = props;

    const addOrg = `
      mutation organization($adminLogins: [String!]!, $billingEmail: String!, $login: String!, $profileName: String!, $enterpriseId:String!) {
        createEnterpriseOrganization(input: {adminLogins: $adminLogins, billingEmail: $billingEmail, login:$login, profileName:$profileName, enterpriseId:$enterpriseId}) {
          organization {
            id
          }
        }
      }
    `;

    let response;

    try {
      response = await this.octokit.graphql(addOrg, {
        adminLogins: AdminLogins,
        billingEmail: BillingEmail,
        login: Login,
        profileName: ProfileName,
        enterpriseId: EnterpriseId
      }) as any;
    }
    catch (e: any) {
      return {
        Success: false,
        Error: e,
        ErrorMessage: JSON.stringify(e)
      };
    }

    if (!response) {
      return {
        Success: false,
        Error: response,
        ErrorMessage: "Failure"
      };
    }

    return {
      Success: true,
      Data: response.createEnterpriseOrganization.organization.id as string
    }
  }

}

type OrgAdministratorType = "EnterpriseServer" | "EnterpriseCloud"

export type NewOrgAdministratorProps = {
  type: OrgAdministratorType,
  baseUrl: string
  debugLogger: (msg: string) => void
}

export function NewOrgAdministrator(props: NewOrgAdministratorProps): OrgAdministrator {
  const { type, baseUrl, debugLogger } = props;

  const ProbotOctokit = Octokit.defaults({
    authStrategy: createProbotAuth,
  });

  const octokit = new ProbotOctokit({
    baseUrl: baseUrl,
    auth: {
      token: process.env.AUTH_TOKEN_1,
    },
  });

  if (!process.env.AUTH_TOKEN_1) {
    throw new Error("AUTH_TOKEN_1 not set in environment!")
  }

  const orgDictionary = new Map([
    ["EnterpriseServer", () => {
      return new EnterpriseServerAdministrator({
        octokit,
        debugLogger
      })
    }]
  ])

  const creationFunction = orgDictionary.get(type);

  if (creationFunction) {
    return creationFunction();
  }

  throw new Error(`OrgAdministrator of type ${type} is not yet supported.`)
}