import "./env";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export type BucketConfig = {
  client: S3Client;
  bucket: string;
};

export type StoredObject = {
  key: string;
  size: number;
};

export function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function bucketConfig(prefix: "S3" | "BACKUP_S3"): BucketConfig {
  return {
    client: new S3Client({
      endpoint: required(`${prefix}_ENDPOINT`),
      region: process.env[`${prefix}_REGION`]?.trim() || "auto",
      forcePathStyle: ["1", "true", "yes"].includes(
        (process.env[`${prefix}_FORCE_PATH_STYLE`] ?? "false").trim().toLowerCase(),
      ),
      // s3rver does not decode aws-chunked bodies. Keep checksums off unless a
      // command requires them so local backups are byte-for-byte faithful.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: required(`${prefix}_ACCESS_KEY_ID`),
        secretAccessKey: required(`${prefix}_SECRET_ACCESS_KEY`),
      },
    }),
    bucket: required(`${prefix}_BUCKET`),
  };
}

export async function listObjects(
  config: BucketConfig,
  prefix: string,
): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await config.client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of page.Contents ?? []) {
      if (object.Key) objects.push({ key: object.Key, size: object.Size ?? 0 });
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

export async function deleteObjects(config: BucketConfig, keys: string[]) {
  for (let index = 0; index < keys.length; index += 1000) {
    const batch = keys.slice(index, index + 1000);
    if (!batch.length) continue;
    await config.client.send(
      new DeleteObjectsCommand({
        Bucket: config.bucket,
        Delete: { Objects: batch.map(Key => ({ Key })), Quiet: true },
      }),
    );
  }
}

export async function putJson(config: BucketConfig, key: string, value: unknown) {
  await config.client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: JSON.stringify(value, null, 2),
      ContentType: "application/json",
    }),
  );
}

export async function getJson<T>(config: BucketConfig, key: string): Promise<T | null> {
  try {
    const response = await config.client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    const body = response.Body as
      | { transformToString?: () => Promise<string> }
      | undefined;
    if (!body?.transformToString) throw new Error("Storage returned an unreadable object body.");
    return JSON.parse(await body.transformToString()) as T;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function downloadToFile(
  config: BucketConfig,
  key: string,
  path: string,
): Promise<void> {
  const response = await config.client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  );
  await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(path));
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    createReadStream(path)
      .on("data", chunk => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve());
  });
  return hash.digest("hex");
}

function isNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.Code === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}
