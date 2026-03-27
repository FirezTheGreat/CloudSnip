import { CreateTagsCommand } from "@aws-sdk/client-ec2";
import { ec2 } from "../../config";

export async function tagResources(anomaly: {
  resource_id: string;
  resource_type: string;
}) {
  const tags = [
    { Key: "CostIntel", Value: "needs-review" },
    { Key: "TaggedBy", Value: "cloud-cost-intel-auto" },
    { Key: "TaggedAt", Value: new Date().toISOString() },
  ];

  const cmd = new CreateTagsCommand({
    Resources: [anomaly.resource_id],
    Tags: tags,
  });

  await ec2.send(cmd);

  return {
    success: true,
    costBefore: 0,
    costAfter: 0,
    details: {
      resourceId: anomaly.resource_id,
      tagsApplied: tags,
      message: `Tagged ${anomaly.resource_id} with 'needs-review'`,
    },
  };
}
