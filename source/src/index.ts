import { Probot } from "probot";
import * as dotenv from "dotenv";
import { NewOrgAdministrator } from "./enterpriseServerAdministrator";
import { OrganizationConfiguration, validateOrgfile } from "./newOrgfileObject";
import YAML from "yaml"
import { RestEndpointMethods } from "@octokit/plugin-rest-endpoint-methods/dist-types/generated/method-types";
import { OrganizationValidatorFactory } from "./orgValidator";
import { DefaultConfig } from "./orgsAsCodeConfigObject";
import { mapOrgValidationResponseToCheck } from "./mapToStatusText";
import { getFileExtension } from "./getFileExtension";

type Enterprise = {
  id: number;
  slug: string;
  name: string;
  node_id: string;
  avatar_url: string;
  description: null;
  website_url: null;
  html_url: string;
  created_at: Date;
  updated_at: Date;
}

const orgFileSchemaUrl = "https://raw.githubusercontent.com/Optum/orgs-as-code/main/source/src/schemas/new-orgfile-schema.json";
const mainHead = "heads/main";

function enterpriseCheck(payload: any): Enterprise | false {
  const enterprise = payload["enterprise"] as Enterprise;

  if (!enterprise) {
    return false;
  }

  return enterprise;
}

export = (app: Probot) => {
  dotenv.config();

  const configurationOrganization = process.env.CONFIGURATION_ORGANIZATION;
  const configurationRepository = process.env.CONFIGURATION_REPOSITORY = "orgs-as-code-operations";
  const configurationSlug = `${configurationOrganization}/${configurationRepository}`;

  const orgAdmin = NewOrgAdministrator({
    type: "EnterpriseServer",
    baseUrl: `https://${process.env.GHE_HOST}/api`,
    debugLogger: app.log.debug
  });

  app.on(["push"], async (context) => {
    if (context.payload.ref !== `refs/${mainHead}`) {
      return;
    }

    const ref = context.payload.after;
    const { owner: ownerObject, name: repo } = context.payload.repository;
    const { login: owner } = ownerObject;

    if (repositoryIsNotConfigurationRepository(context, configurationSlug)) {
      app.log.info("event not from configured configuration repository");
      await context.octokit.rest.repos.createCommitStatus({
        owner,
        repo,
        state: "success",
        sha: ref,
        context: "orgs-as-code",
        description: "Nothing for this bot to check or do."
      });
      return;
    }

    if (context.isBot) {
      await context.octokit.rest.repos.createCommitStatus({
        owner,
        repo,
        state: "success",
        sha: ref,
        context: "orgs-as-code",
        description: "Nothing for this bot to check or do."
      });
      return;
    }

    const config = await context.config('orgs-as-code.yml', DefaultConfig);

    app.log.debug(`orgs-as-code.yml\n${JSON.stringify(config)}\n`);

    if (!config) {
      await context.octokit.rest.repos.createCommitStatus({
        owner,
        repo,
        state: "error",
        sha: ref,
        context: "orgs-as-code",
        description: "Unable to load configuration"
      });
      return;
    }

    const fileFetcher = async (path: string) => {
      const response = await context.octokit.request({ baseUrl: path, method: "GET", url: "" });

      if (response.status < 200 || response.status > 299) {
        return false;
      }

      return response.data as string;
    }

    const enterpriseCheckResponse = enterpriseCheck(context.payload);

    if (!enterpriseCheckResponse) {
      app.log.error("event not from an enterprise instance");
      return;
    }

    // This needs to be properly paged...
    // If we actually wanted to support a large amount of files, this check should be offloaded to
    // a seperate process. What a "large amount of files" actually is, is up for debate.
    const commitResponse = await context.octokit.rest.repos.getCommit({ owner, repo, ref });

    if (commitResponse.status < 200 || commitResponse.status > 299) {
      return;
    }

    const onlyNewOrgFiles = filterOnlyNewOrgFiles({ data: commitResponse.data.files as any });

    if (onlyNewOrgFiles.length < 1) {
      await context.octokit.rest.repos.createCommitStatus({
        owner,
        repo,
        state: "success",
        sha: ref,
        context: "orgs-as-code",
        description: "Nothing for this bot to check or do."
      });
      return;
    }

    type applyState = "error"|"failure"|"pending"|"success";

    let responses = [] as {status:applyState, message:string}[];

    for (let file of onlyNewOrgFiles) {

      const rawUrl = file.raw_url as string;
      const fileExtension = getFileExtension(rawUrl);

      const newOrgFileAsString = await fileFetcher(rawUrl);

      if (newOrgFileAsString === false) {
        responses.push({
          status:"error",
          message:"Failed to fetch new org file."
        })

        // await context.octokit.rest.repos.createCommitStatus({
        //   owner,
        //   repo,
        //   state: "error",
        //   sha: ref,
        //   context: "orgs-as-code",
        //   description: "Failed to fetch new org file."
        // });
        continue;
      }

      let orgFileObject;
      if (fileExtension === "json") {
        orgFileObject = JSON.parse(newOrgFileAsString);
      }
      else if (fileExtension === "yml") {
        orgFileObject = YAML.parse(newOrgFileAsString);
      }
      else {
        responses.push({
          status:"error",
          message:"File extension of new-orgfile is not yml or json"
        })
        continue;
      }

      app.log.info(`THING:\n${JSON.stringify(orgFileObject)}`);

      const ownersArrayWithPotentialDuplicates = orgFileObject.owners.map((o: { gitHubUserName: string }) => o.gitHubUserName).concat(config.alwaysAddedOwners) as string[];

      const response = await orgAdmin.CreateOrg({
        // TODO: remove ANY usage here
        AdminLogins: ownersArrayWithPotentialDuplicates.filter((n, i) => ownersArrayWithPotentialDuplicates.indexOf(n) === i),
        Login: orgFileObject.name,
        BillingEmail: orgFileObject.sponsor.billingEmail,
        EnterpriseId: enterpriseCheckResponse.node_id,
        ProfileName: orgFileObject.name
      });

      if (!response.Success) {
        app.log.error(JSON.stringify(response.Error));
        responses.push({
          status:"error",
          message:"Failed to create new Organization"
        })
        continue;
      }

      orgFileObject["existingOrg-doNotChangeThis"] = {
        id: response.Data
      }

      let newContents;
      if (fileExtension === "json") {
        if (!orgFileObject["$schema"]) {
          orgFileObject["$schema"] = orgFileSchemaUrl;
        }

        newContents = JSON.stringify(orgFileObject, null, "    ");
      }
      else {
        newContents = YAML.stringify(orgFileObject, {
          indent: 3
        });
        const magicOrgfileSchemaPath = `# yaml-language-server: $schema=${orgFileSchemaUrl}`;
        if (!newContents.startsWith(magicOrgfileSchemaPath)) {
          newContents = magicOrgfileSchemaPath + "\n" + newContents;
        }
      }

      const indexOfOrganizations = rawUrl.indexOf("organizations");
      const lengthOfOrganizationsWord = "organizations".length;
      const pathSubstring = rawUrl.substring(indexOfOrganizations + lengthOfOrganizationsWord + 1);
      const indexOfNextFolder = pathSubstring.indexOf("/");
      const orgFolderSubstring = pathSubstring.substring(0, indexOfNextFolder);

      app.log.info(orgFolderSubstring);

      const replaceNewOrgfileResponse = await replaceNewOrgfile(context.octokit, {
        owner,
        repo,
        contents: newContents,
        // TODO: unhardcode this reference to main. Should be env var for main branch name
        currentHeadRef: mainHead,
        // TODO: unhardcode
        pathToNewOrgfile: `organizations/${orgFolderSubstring}`,
        fileType: fileExtension
      });

      if (!replaceNewOrgfileResponse) {
        responses.push({
          status:"error",
          message:"Unknown failure"
        })
        continue;
      }

      const errorResponse = responses.find(r => r.status === "error")?.status;
      const failureResponse = responses.find(r => r.status === "failure")?.status;
      
      const state = errorResponse ?? failureResponse ?? "success" as applyState;

      await context.octokit.rest.repos.createCommitStatus({
        owner,
        repo,
        state,
        sha: ref,
        context: "orgs-as-code"
      });
    }
  });

  app.on(["pull_request.opened", "pull_request.synchronize"], async (context) => {
    if (repositoryIsNotConfigurationRepository(context, configurationSlug)) {
      app.log.info("event not from configured configuration repository");
      return;
    }

    const { number: pull_number } = context.payload.pull_request;
    const { owner: ownerObject, name: repo } = context.payload.repository;
    const { login: owner } = ownerObject;

    const config = await context.config('orgs-as-code.yml', DefaultConfig);

    app.log.debug(`orgs-as-code.yml\n${JSON.stringify(config)}\n`);

    if (!config) {
      await context.octokit.rest.checks.create({
        owner,
        repo,
        name: "orgs-as-code",
        head_sha: context.payload.pull_request.head.sha,
        status: "completed",
        conclusion: "skipped",
        output: {
          title: "Unable to load configuration",
          summary: "Unable to load configuration"
        }
      });
      return;
    }

    app.log.debug({ owner: owner, repo: repo, pull_number: pull_number })

    // This needs to be properly paged...
    // If we actually wanted to support a large amount of files, this check should be offloaded to
    // a seperate process. What a "large amount of files" actually is, is up for debate.
    const filesResponse = await context.octokit.rest.pulls.listFiles({ owner, repo, pull_number });

    const onlyOrgFiles = filterOnlyOrgFiles(filesResponse);

    if (onlyOrgFiles.length == 0) {
      await postChecksSkippedStatus(context, owner, repo);
      return;
    }

    const enterpriseCheckResponse = enterpriseCheck(context.payload);

    if (!enterpriseCheckResponse) {
      app.log.error("event not from an enterprise instance");
      return;
    }

    const fileFetcher = async (path: string) => {
      const response = await context.octokit.request({ baseUrl: path, method: "GET", url: "" });

      if (response.status < 200 || response.status > 299) {
        return false;
      }

      return response.data as string;
    }

    const orgFileSchemaValidator = async (orgfile: object) => { return validateOrgfile(orgfile) };

    const orgNameCheck = async (name: string) => {
      return await orgAdmin.CheckIfLoginExists(name);
    };

    const orgValidator = OrganizationValidatorFactory({
      orgFileSchemaValidator: orgFileSchemaValidator,
      organizationNameChecker: orgNameCheck,
      acceptablePrefixListFetcher: async () => {
        return {
          Success: true,
          Data: config.requiredOrganizationPrefixes
        }
      },
      debugLogger: app.log.debug
    })

    const orgFilesPromises = onlyOrgFiles.map(async o => {
      const orgFileString = await fileFetcher(o.raw_url);
      return {
        orgFileAsString: orgFileString,
        rawUrl: o.raw_url
      }
    });

    const orgFiles = await Promise.all(orgFilesPromises);

    const potentialOrgFileObjects = orgFiles.map(o => {
      if (typeof o.orgFileAsString !== "string") {
        return false;
      }

      const fileExtension = getFileExtension(o.rawUrl);
      let orgFileObject: OrganizationConfiguration;

      if (fileExtension === "json") {
        orgFileObject = JSON.parse(o.orgFileAsString);
      }
      else {
        orgFileObject = YAML.parse(o.orgFileAsString);
      }

      orgFileObject.OrgFilePath = o.rawUrl;

      return orgFileObject
    })

    const onlyOrgFileObjects = potentialOrgFileObjects.filter(o => o !== false) as OrganizationConfiguration[];

    if (onlyOrgFileObjects.length !== potentialOrgFileObjects.length) {
      await context.octokit.rest.checks.create({
        owner,
        repo,
        name: "orgs-as-code",
        head_sha: context.payload.pull_request.head.sha,
        status: "completed",
        conclusion: "failure", // or success or skipped or failure
        output: {
          title: "Failed to fetch org file(s)"
        }
      });
    }

    const validationResponses = await orgValidator.ValidateConfigurations(onlyOrgFileObjects);

    app.log.debug("Done validating");

    const statusCheck = mapOrgValidationResponseToCheck(validationResponses);

    const conclusion = statusCheck.Status ? "success" : "failure";

    await context.octokit.rest.checks.create({
      owner,
      repo,
      name: "orgs-as-code",
      head_sha: context.payload.pull_request.head.sha,
      status: "completed",
      conclusion: conclusion, // or success or skipped or failure
      output: {
        title: conclusion,
        summary: "Scan results are as follows:",
        text: statusCheck.Text
      }
    });
  });
};

type repositoryContext = {
  payload: {
    repository: {
      full_name: string
    }
  }
}

async function postChecksSkippedStatus(context: any, owner: string, repo: string) {
  await context.octokit.rest.checks.create({
    owner,
    repo,
    name: "orgs-as-code",
    head_sha: context.payload.pull_request.head.sha,
    status: "completed",
    conclusion: "skipped",
    output: {
      title: "No orgfiles found!",
      summary: "This Probot only runs checks for specific files.",
      text: "This check was skipped as there were no **modified** `orgfile.yml` or `orgfile.json` files found under the `organizations` folder."
    }
  });
}

// TODO: gross ANY usage
function filterOnlyOrgFiles(filesResponse: { data: any[] }) {
  return filesResponse.data.filter(d => {
    const loweredName = d.filename.toLowerCase();
    const orgfileIsInCorrectFolder = loweredName.startsWith("organizations");
    const fileNameIsCaredAbout = loweredName.endsWith("orgfile.json") || loweredName.endsWith("orgfile.yml");
    return orgfileIsInCorrectFolder && fileNameIsCaredAbout;
  });
}

function filterOnlyNewOrgFiles(filesResponse: { data: any[] }) {
  return filesResponse.data.filter(d => {
    const loweredName = d.filename.toLowerCase();
    const orgfileIsInCorrectFolder = loweredName.startsWith("organizations");
    const fileNameIsCaredAbout = loweredName.endsWith("new-orgfile.json") || loweredName.endsWith("new-orgfile.yml");
    return orgfileIsInCorrectFolder && fileNameIsCaredAbout;
  });
}

function repositoryIsNotConfigurationRepository(context: repositoryContext, configurationSlug: string) {
  return context.payload.repository.full_name !== configurationSlug;
}

async function replaceNewOrgfile(
  octokit: import("@octokit/core").Octokit & void & { paginate: import("@octokit/plugin-paginate-rest").PaginateInterface; } & RestEndpointMethods & import("@octokit/plugin-rest-endpoint-methods/dist-types/types").Api & import("@probot/octokit-plugin-config/dist-types/types").API,
  props: { fileType: "yml" | "json", contents: string, pathToNewOrgfile: string, currentHeadRef: string, owner: string, repo: string }) {
  const { contents, currentHeadRef, owner, pathToNewOrgfile, repo, fileType } = props;

  const getRefResponse = await octokit.git.getRef({
    owner,
    repo,
    ref: currentHeadRef
  });

  if (getRefResponse.status != 200) {
    return false;
  }

  const getCommitResponse = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: getRefResponse.data.object.sha,
  });

  const commitSha = getCommitResponse.data.sha;

  const tree_sha = getCommitResponse.data.tree.sha;

  const getTreeResponse = await octokit.git.getTree({
    owner,
    repo,
    tree_sha,
    recursive: "1"
  });

  const postToBlobsEndpointResponse = await octokit.git.createBlob({
    owner,
    repo,
    content: contents,
    encoding: "utf-8"
  });

  const blobSha = postToBlobsEndpointResponse.data.sha;

  const existingTreeWithoutSubtrees = getTreeResponse.data.tree
    .filter(t => t.type !== "tree")
    // Remove the "new-orgfile" from the tree as it is not needed now.
    .filter(t => !t.path?.startsWith(`${pathToNewOrgfile}/new-orgfile`));

  existingTreeWithoutSubtrees.push({
    path: `${pathToNewOrgfile}/orgfile.${fileType}`,
    mode: "100644",
    sha: blobSha,
    type: "blob"
  });

  const createTreeResponse = await octokit.git.createTree({
    owner,
    repo,
    // HACK: get rid of `as any`
    tree: existingTreeWithoutSubtrees as any
  });

  const createCommitResponse = await octokit.git.createCommit({
    owner,
    repo,
    message: "Replace new-orgfile with orgfile\n* orgfile contains id of newly created org",
    parents: [commitSha],
    tree: createTreeResponse.data.sha
  });

  const updateRefResponse = await octokit.git.updateRef({
    owner,
    repo,
    ref: currentHeadRef,
    sha: createCommitResponse.data.sha
  });

  return updateRefResponse.status === 200;
}

