import { PutFunctionConcurrencyCommand } from "@aws-sdk/client-lambda";
import { lambdaClient, config } from "../../config";

export async function capLambdaConcurrency(anomaly: {
  resource_id: string;
  resource_type: string;
}) {
  const maxConcurrency = config.thresholds.maxLambdaConcurrency;

  const cmd = new PutFunctionConcurrencyCommand({
    FunctionName: anomaly.resource_id,
    ReservedConcurrentExecutions: maxConcurrency,
  });

  const response = await lambdaClient.send(cmd);

  return {
    success: true,
    costBefore: 0, // Lambda cost is per-invocation, not hourly
    costAfter: 0,
    details: {
      functionName: anomaly.resource_id,
      reservedConcurrency: response.ReservedConcurrentExecutions,
      maxConcurrencySet: maxConcurrency,
      message: `Capped ${anomaly.resource_id} concurrency to ${maxConcurrency}`,
    },
  };
}
