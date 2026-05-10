import { getSupabase } from "./db";

const BUCKET = "photos";

export async function uploadPhoto(filename: string, buf: Buffer, contentType: string) {
  const { error } = await getSupabase().storage.from(BUCKET).upload(filename, buf, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`uploadPhoto: ${error.message}`);
}

// Short-lived signed URL — bucket is private, so we hand out 5-minute
// links from the /api/photo/[filename] route on demand.
export async function signedPhotoUrl(filename: string, expiresInSec = 300): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from(BUCKET)
    .createSignedUrl(filename, expiresInSec);
  if (error) throw new Error(`signedPhotoUrl: ${error.message}`);
  return data.signedUrl;
}
