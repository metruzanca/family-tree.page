import "./env";
import { mkdirSync } from "node:fs";
import S3rver from "s3rver";

const directory = ".dev/s3";
mkdirSync(directory, { recursive: true });

const cors = `<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>http://localhost:3000</AllowedOrigin>
    <AllowedOrigin>http://127.0.0.1:3000</AllowedOrigin>
    <AllowedOrigin>*</AllowedOrigin>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3000</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`;

const server = new S3rver({
  address: "0.0.0.0",
  port: 9000,
  silent: false,
  directory,
  configureBuckets: [{ name: "roots", configs: [cors] }],
  vhostBuckets: false,
  allowMismatchedSignatures: true,
});

await server.run();
console.log("Local S3 listening on http://127.0.0.1:9000 (bucket: roots)");

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
