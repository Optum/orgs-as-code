import { OrgValidationResponse } from "./orgValidator";

function mapToStatusText(Status: "notRan" | boolean) {
  if (Status == "notRan") {
    return `🟨 (skipped or to-be-added)`;
  }

  if (Status) {
    return `✔ (passed)`;
  }

  return `❌ (failed)`;
}

export function mapOrgValidationResponseToCheck(validationResponses: OrgValidationResponse[]): { Status: boolean; Text: string; } {
  let overallStatus = false;
  let text = "";
  for (let response of validationResponses) {
    const orgWordIndex = response.OrgFilePath.indexOf("/organizations/");
    const prettierOrgFileName = response.OrgFilePath.substring(orgWordIndex);

    text += `## [${prettierOrgFileName}](${response.OrgFilePath})\n`;

    if (!response.Success) {
      text += `Check failed to run\n\n`;
      text += `Message: ${response.ErrorMessage}\n`;
      text += `---\n`;
      continue;
    }

    const failedStatusCheck = Object.entries(response.Data).map(v => v[1]).find(s => s.Status === false);

    if (!failedStatusCheck) {
      text += `Overal Status: ✔ (passed or skipped)\n\n`;
      overallStatus = true;
    }
    else {
      text += `Overal Status: ❌ (failed)\n\n`;
    }

    Object.entries(response.Data).forEach((key, _) => {
      const name = key[0];
      const result = key[1];
      let statusText = mapToStatusText(result.Status);

      text += `### Check: \`${name}\`\n`;
      text += `${statusText}\n\n`;

      let explanation = "";
      if (!result.Status) {
        explanation = result.Messages.join("\n");
      }

      text += `${explanation}\n`;
    });

    text += `---\n`;
  }

  return {
    Status: overallStatus,
    Text: text
  };
}
