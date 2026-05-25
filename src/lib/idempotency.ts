import crypto from "crypto";

export function generateRequestHash(body: unknown): string {
  const normalizedString = body ? JSON.stringify(body) : "";
  return crypto.createHash("sha256").update(normalizedString).digest("hex");
}

export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  response?: {
    body: unknown;
    statusCode: number;
  };
  hashMismatch: boolean;
}

interface PrismaClientLike {
  idempotencyKey: {
    findUnique(args: { where: { key: string } }): Promise<{
      id: string;
      key: string;
      endpoint: string;
      requestHash: string;
      responseBody: string;
      statusCode: number;
      createdAt: Date;
    } | null>;
  };
}

/**
 * Checks if the idempotency key already exists.
 * Returns information if the key exists and if the body hash matches.
 */
export async function checkIdempotency(
  prismaClient: PrismaClientLike,
  key: string,
  body: unknown
): Promise<IdempotencyCheckResult> {
  const existingRecord = await prismaClient.idempotencyKey.findUnique({
    where: { key },
  });

  if (!existingRecord) {
    return { isDuplicate: false, hashMismatch: false };
  }

  const currentHash = generateRequestHash(body);

  if (existingRecord.requestHash !== currentHash) {
    console.warn(
      `[Idempotency] Request hash mismatch for key: ${key}. Expected: ${existingRecord.requestHash}, Got: ${currentHash}`
    );
    return { isDuplicate: true, hashMismatch: true };
  }

  let parsedBody: unknown = existingRecord.responseBody;
  try {
    parsedBody = JSON.parse(existingRecord.responseBody);
  } catch {
    // Ignore parsing errors for non-JSON responses
  }

  return {
    isDuplicate: true,
    hashMismatch: false,
    response: {
      body: parsedBody,
      statusCode: existingRecord.statusCode,
    },
  };
}

interface TransactionClientLike {
  idempotencyKey: {
    create(args: {
      data: {
        key: string;
        endpoint: string;
        requestHash: string;
        responseBody: string;
        statusCode: number;
      };
    }): Promise<unknown>;
  };
}

/**
 * Saves an idempotency key and its corresponding response inside a transaction client.
 */
export async function saveIdempotencyKey(
  tx: TransactionClientLike,
  key: string,
  endpoint: string,
  body: unknown,
  responseBody: unknown,
  statusCode: number
) {
  const requestHash = generateRequestHash(body);
  const serializedResponse = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);

  return tx.idempotencyKey.create({
    data: {
      key,
      endpoint,
      requestHash,
      responseBody: serializedResponse,
      statusCode,
    },
  });
}
