import { describe, expect, it } from "vitest";
import { R2S3Storage } from "../src/storage/r2-s3";

const storage = new R2S3Storage({
  accountId: "acct",
  accessKeyId: "key",
  secretAccessKey: "secret",
  endpoint: "https://acct.r2.cloudflarestorage.com",
});

describe("presigned URLs", () => {
  it("put the requested expiry in the query and sign only the host header", async () => {
    const url = new URL(await storage.signGetUrl("bucket", "a/b.txt", 60));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
  });

  it("do the same for multipart part uploads", async () => {
    const url = new URL(await storage.signUploadPart("bucket", "a/b.bin", "upload-1", 3, 900));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("partNumber")).toBe("3");
    expect(url.searchParams.get("uploadId")).toBe("upload-1");
  });
});
