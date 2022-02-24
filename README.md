# OrgsAsCode Bot

Naming is hard, this is a simple name.

Feel free to skip to [How to create an Organization with this Probot][how].

## Maintainers

- JoshuaTheMiller <joshua.d.miller@optum.com>

## READ FIRST

Whenever the default behavior of a well known system is changed, good documentation and communication becomes vitally important. In the context of this Probot, ["how to create Organizations"][how] **must** be communicated to all users of GitHub so that they are aware of how Organizations should and must be created. To drive home this point, when using the OrgsAsCode Probot, the behavior that changes is, "the ability to create and administer Organizations manually." If [**how to create Organizations**][how] is thus not properly communicated, GitHub user dissatisfaction could rise sharply.

While it may seem that this Probot adds additional steps to create Organizations, the time savings administering Enterprises and GitHub usage may be dramatically decreased overall. With that being said, this Probot strives to create a process as simple as it can given the requirements.

## Premise

GitHub Organizations are a powerful tool. They assist with

* Organization (obviously)
* Configuration ([default organization-wide settings][communityHealthFiles])
* Discovery ([activity dashboards][activityDashboards])
* (to name a few areas)

This all leads to making our lives as users of GitHub *easier*. However, unrestrained/untrained Organization creation can have the opposite affect- instead of making life easier for folks, too many Organizations *will* make life harder (e.g., more to manage, more to search through).

Additionally, depending on the version of GitHub used, items like Organizations, Repositories, etc. cost money. As such, it is beneficial to Enterprises (or companies/teams in general) as a whole to ensure that certain patterns are followed. These patterns could include items like the following:

* Default Organization Owners
* Standard GitHub Applications to always have installed
* Documentation around who and/or what organization is paying for (i.e., sponsoring) the GitHub Organization itself

## How to create organizations with this bot

This Probot uses a repository to store Organization configuration. As such, to create and administer an Organization, one must first know the specific repository that the configuration is stored in. **THIS MUST BE COMMUNICATED OUT BY THE ENTERPRISE**. 

💡 *IMPORTANT NOTE BELOW* 💡 

> By default, this Probot will look for a repository named `orgs-as-code-operations`. This is done so that if you do not know the path off hand, simply searching for that repository within the appropriate GitHub Enterprise instance should bring you to where you need to go.

### How to request a **new** Organization

This Probot leverages a [GitOps](https://www.gitops.tech/) approach to administration. Creation and Administration of Organizations is done via Pull Requests to the configuration repository:

1. Navigate to the appropriate "orgs-as-code-operations" repository.
2. Create a branch off of the default branch.
3. Create a new folder for your Organization under the `organizations` folder. The name should represent your organization.
4. Create a `new-orgfile.json` or `new-orgfile.yml` file under the folder you just created. See the [schema file][schema] for more information on what this file must contain.
5. Create a new entry in the [`.github/CODEOWNERS`][codeowners] file for your new folder. An example of this [is below](#codeowners-example).
6. Open a DRAFT Pull Request, wait for required STATUS CHECKS to complete.
7. Once all Status Checks pass, promote the Pull Request and wait for review.
8. When approved, the branch will be merged and the Organization will be automatically created!
    * Please note that upon successful Organization creation, this Probot will replace the `new-orgfile` file with an `orgfile` file that contains the ID of the newly created Organization.

#### CODEOWNERS Example

`.github/CODEOWNERS`

```md
.github/ @orgsascodesettingsteam

# dogfooding the administration of this organization!
/operations/github-enterprise-administration/ @githubenterpriseadministers

# The following line is an example of what **you** need to add when requesting a new Organization
# It is recommended that you have at least 3 reviewers who are all in agreement for how to review
# changes to an Organization.
/operations/yourNewOrg/ @yourGitHubId @anotherPersonsGitHubId @yetAnotherPersonsId
```

## Scope

This Probot does the following:

* Creation of GitHub Organizations
    * Deletion is **out of scope**
    * `new-orgfile` file must be valid (see schema [below](#schema))
    * Immediately upon Organization creation, this bot will replace the `new-orgfile` with an `orgfile.json` that contains the ID of the new Organization. This is done so that the name of the Organization can be modified after it is created.
    * The `orgfile` will also be modified so that it contains a reference to the schema.
        * `yml` files will have the following line added as the first line if it does not exist: `# yaml-language-server: $schema=https://redacted.com/raw/Joshua/OrgsAsCode/main/schemas/new-orgfile-schema.json`
        * `json` files will have a schema field added if it does not exist: `"$schema": "https://redacted.com/raw/Joshua/OrgsAsCode/main/schemas/new-orgfile-schema.json"`
* *Installation* of GitHub Apps (if app is not installed, install it).
    * Uninstall is **out of scope**
    * Can happen on a timer- check if installed, install.
    * Done by Organization ID
* Synchronization of Organization Owners
    * Can happen on a timer- check if Owners list matches configured list. If not, make match
    * Will add user to the Organization if they are not yet added
    * Will downgrade (not remove) owners to members if the user is not present in this list
    * Done by Organization ID
* PR Validation
    * Changes to the `orgfile.yml` or `orgfile.json` will be validated. Report will be added as a Status Check.    
    * This bot will validate all files under the `Organizations` path to make sure they are properly formed as defined by the [orgfile-schema.json][schema]
    * When creating a new folder under Organizations (i.e., requesting a new Organization), this bot will also *validate* that the `.github/CODEOWNERS` file is updated so that the Organization folder has the appropriate reviewers. This is done to eliminate/reduce the bottleneck of having one group of individuals review all Organization changes and to also allow Organization owners to have more control over their own Organization.
* 💡 Enhancement: Enforcement of Configuration
    * This Probot will validate existing Organizations against the set [Configuration][how].
    * If an Organization is found to be out of sync, this Probot will attempt to synchronize.
    * After a synchronization attempt, an email will be sent to Organization owners explaining what was done and how to go about not receiving such emails ever again.
    * If the sync failed for any reason, an email will be sent to the list of "notifyOnError" emails specified in the `orgsAsCodeSettings.json` file.
    * The email contents will be configurable as per the `orgsAsCodeSettings.json` file.
    * 💡 Enhancement: eventually, if an Organization is found to be out of sync "too many times in a rolling time window," that Organization may be put on a watchlist and training may be required for Organization Owners.

## Schema

Please see the [orgfile-schema.json][schema] file for reference.

This schema is used for orgfile validation and [can be loaded into editors like Visual Studio Code](https://frontaid.io/blog/json-schema-vscode/) for auto-completion and syntax help.

### VS Code Schema Validation

[VS Code Docs](https://code.visualstudio.com/Docs/languages/json#_json-schemas-and-settings)

1. Open VS Code Settings (`Ctrl+,` or `File-->Preferences-->Settings`)
2. Search for json-schema
3. Click **JSON: Schemas** then *Edit in settings.json*
4. Add the following block if it does not exist, or append the contents in the block if it already exists:

```json
"json.schemas": [
    {
        "fileMatch": [
            "new-orgfile.json",
            "new-orgfile.yml"
        ],
        "url": "https://redacted.com/raw/Joshua/OrgsAsCode/main/schemas/new-orgfile-schema.json"
    },
    {
        "fileMatch": [
            "orgfile.json",
            "orgfile.yml"
        ],
        "url": "https://redacted.com/raw/Joshua/OrgsAsCode/main/schemas/orgfile-schema.json"
    },
    {
        "fileMatch": [
            "orgsAsCodeSettings.json"                
        ],
        "url": "https://redacted.com/raw/Joshua/OrgsAsCode/main/schemas/orgsAsCodeSettings-schema.json"
    }
]
```

## Development

If you have never developed and/or maintained a Probot before, please familiarize yourself with the following documentation first: https://probot.github.io/docs/development/

For further development instructions, check out the [README in the source folder](source/README.md)!

## Operations Information

Information on how to run this Probot can be found within this README (below). Information regarding a running instance of this Probot, such as how to access logs, where the OrgsAsCode bot is running, etc. should all be contained within the repository that contains the orgsAsCodeSettings file (this repository is JUST the source code and definitions for this Probot).

### How to run this Probot

1. Register this Probot as a GitHub App
2. Create a Personal Access Token that has the following permissions:
    * Create Organizations
        * [Enterprise Cloud](https://docs.github.com/en/enterprise-cloud@latest/graphql/reference/mutations#createenterpriseorganization)
        * Needs a PAT with `read:org` and `admin:enterprise`
3. Register an Enterprise Webhook
    * Only send `Organization` events, otherwise this bot will be overloaded.
    * Sample webhook: [LINK](https://redacted.com/enterprises/somecompany/settings/hooks)
4. GitHub App Registration as defined by the [app.yml](./source/app.yml) file 

### Future Considerations

The most appropriate architecture for this Probot most likely entails splitting into at least 2 pieces: one bot that would watch the configuration repository, and one bot that would be installed in all orgs and would only "listen" for org related events. The downside of having this exist as one bot is that this bot will receive many events it does not care about. For example, for this bot to run it needs to watch for PRs and Repo events on the configuration repository. As such, since this bot also must be installed on other Orgs to complete checks and listen for Org events, it will ALSO receive all of the other orgs repo and PR events. 

 [activityDashboards]: https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/about-your-organization-dashboard
 [communityHealthFiles]: https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file
 [schema]: ./schemas/orgfile-schema.json
 [how]: #how-to-create-organizations-with-this-bot
 [codeowners]: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
