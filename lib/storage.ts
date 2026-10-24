// Vultr Object Storage (S3-compatible). Photos are uploaded by the server,
// and shown to crew members through short-lived signed links.

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: "us-east-1", // Vultr ignores this, but the SDK requires one
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});

const BUCKET = process.env.S3_BUCKET ?? "";

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
  return key;
}

export async function getObject(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return Buffer.from(await res.Body!.transformToByteArray());
}

/** Link that works for 10 minutes. Never make the bucket public. */
export function signedUrl(key: string, expiresIn = 600) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}
