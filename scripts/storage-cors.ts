import "./env";
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
  console.error("S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required.");
  process.exit(1);
}

const origins = [
  process.env.APP_URL,
  ...(process.env.CORS_ORIGINS ?? "").split(","),
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]
  .map(value => value?.trim())
  .filter((value): value is string => Boolean(value));

const uniqueOrigins = [...new Set(origins)];

const client = new S3Client({
  endpoint,
  region: process.env.S3_REGION || "auto",
  forcePathStyle: ["1", "true", "yes"].includes(
    (process.env.S3_FORCE_PATH_STYLE || "false").toLowerCase(),
  ),
  credentials: { accessKeyId, secretAccessKey },
});

await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: uniqueOrigins,
          AllowedMethods: ["POST"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3000,
        },
      ],
    },
  }),
);

console.log(`Bucket CORS set for: ${uniqueOrigins.join(", ")}`);
