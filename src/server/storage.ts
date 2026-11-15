import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, optionalEnv } from "./config";

const globalForS3 = globalThis as unknown as { rootsS3?: S3Client };

export const s3 =
  globalForS3.rootsS3 ??
  new S3Client({
    endpoint: env("S3_ENDPOINT"),
    region: optionalEnv("S3_REGION", "auto"),
    forcePathStyle: ["1", "true", "yes"].includes(optionalEnv("S3_FORCE_PATH_STYLE", "false")),
    credentials: {
      accessKeyId: env("S3_ACCESS_KEY_ID"),
      secretAccessKey: env("S3_SECRET_ACCESS_KEY"),
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForS3.rootsS3 = s3;
}

export const bucket = () => env("S3_BUCKET");
export const TREE_PREFIX = "trees";

export async function createUploadPost(
  key: string,
  contentType: string,
  maxBytes: number,
): Promise<{ url: string; fields: Record<string, string> }> {
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: bucket(),
    Key: key,
    Expires: 900,
    Conditions: [
      { bucket: bucket() },
      ["eq", "$key", key],
      ["eq", "$Content-Type", contentType],
      ["content-length-range", 1, maxBytes],
    ],
  });
  return { url, fields: fields as Record<string, string> };
}

export async function headObject(key: string) {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function getObjectBytes(key: string, length: number): Promise<Uint8Array> {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      Range: `bytes=0-${Math.max(0, length - 1)}`,
    }),
  );
  const body = response.Body as unknown as { transformToByteArray?: () => Promise<Uint8Array> };
  if (!body?.transformToByteArray) throw new Error("Storage returned an unreadable object body.");
  return body.transformToByteArray();
}

export async function getObjectStream(key: string) {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const body = response.Body as unknown as { transformToWebStream?: () => ReadableStream };
  if (!body?.transformToWebStream) throw new Error("Storage returned an unreadable object body.");
  return {
    stream: body.transformToWebStream(),
    contentType: response.ContentType,
    contentLength: response.ContentLength,
    etag: response.ETag,
  };
}

export async function putObject(key: string, body: Uint8Array | string, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteKeys(keys: string[]) {
  for (let index = 0; index < keys.length; index += 1000) {
    const batch = keys.slice(index, index + 1000);
    if (!batch.length) continue;
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: batch.map(Key => ({ Key })), Quiet: true },
      }),
    );
  }
}

export async function listObjectKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of page.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

export async function deletePrefix(prefix: string) {
  const keys = await listObjectKeys(prefix);
  await deleteKeys(keys);
}

export async function presignDownload(
  key: string,
  options: { fileName: string; contentType: string; inline?: boolean; expiresIn?: number },
) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentType: options.contentType,
      ResponseContentDisposition: contentDisposition(options.fileName, options.inline ?? false),
    }),
    { expiresIn: options.expiresIn ?? 300 },
  );
}

export function contentDisposition(fileName: string, inline: boolean) {
  const safe = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${inline ? "inline" : "attachment"}; filename="${safe}"; filename*=UTF-8''${encoded}`;
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
