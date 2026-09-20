import ImageKit, { toFile } from "@imagekit/nodejs";

const imagekit = new ImageKit({ privateKey: process.env.IMAGEKIT_PRIVATE_KEY });

function hasImageKitConfig() {
  return Boolean(process.env.IMAGEKIT_PRIVATE_KEY);
}

// originalName= "My Photo (1).png"
// result: "chat-1749300000000-My_Photo__1_.png"
// this helper makes a safe, unique filename for uploaded files.
function createFileName(originalName = "upload") {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `chat-${Date.now()}-${safeName}`;
}

/**
 * Upload image or video to ImageKit, returning both the delivery URL and
 * the fileId. Chat media only ever needs the URL (see uploadChatMedia
 * below), but anything that expires — statuses — has to keep the fileId
 * around so the asset can actually be removed later.
 * @see https://imagekit.io/docs/api-reference/upload-file/upload-file
 */
async function uploadMedia(file, { folder = "/chat" } = {}) {
  const fileName = createFileName(file.originalname);

  const result = await imagekit.files.upload({
    file: await toFile(file.buffer, fileName, { type: file.mimetype }),
    fileName,
    folder,
  });

  return { url: result.url, fileId: result.fileId };
}

async function uploadChatMedia(file, options) {
  const { url } = await uploadMedia(file, options);
  return url;
}

// A file that's already gone is a success as far as callers are
// concerned — the cleanup job's whole job is "make sure this isn't in
// ImageKit any more", and 404 means it isn't.
function isMissingFileError(error) {
  return error?.status === 404;
}

/**
 * Deletes one asset. Resolves quietly if it was already deleted, throws
 * on anything else so the caller can decide whether to retry.
 * @see https://imagekit.io/docs/api-reference/digital-asset-management-dam/managing-assets/delete-file
 */
async function deleteMediaFile(fileId) {
  if (!fileId || !hasImageKitConfig()) return;

  try {
    await imagekit.files.delete(fileId);
  } catch (error) {
    if (isMissingFileError(error)) return;
    throw error;
  }
}

/**
 * Bulk variant, capped at ImageKit's 100-per-call limit. The bulk
 * endpoint is all-or-nothing — one unknown fileId fails the whole batch —
 * so a failed batch falls back to deleting one at a time, which also
 * tells us exactly which ids are still a problem.
 *
 * Returns the ids that were successfully removed (or were already gone).
 * @see https://imagekit.io/docs/api-reference/digital-asset-management-dam/managing-assets/delete-files-bulk
 */
async function deleteMediaFiles(fileIds = []) {
  const ids = fileIds.filter(Boolean);
  if (ids.length === 0 || !hasImageKitConfig()) return [];

  const deleted = [];

  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);

    try {
      await imagekit.files.bulk.delete({ fileIds: batch });
      deleted.push(...batch);
    } catch {
      // Fall back to individual deletes so one stale id doesn't block
      // the rest of the batch.
      for (const fileId of batch) {
        try {
          await deleteMediaFile(fileId);
          deleted.push(fileId);
        } catch (error) {
          console.error("Failed to delete ImageKit file", fileId, error.message);
        }
      }
    }
  }

  return deleted;
}

export { uploadChatMedia, uploadMedia, deleteMediaFile, deleteMediaFiles, hasImageKitConfig };
