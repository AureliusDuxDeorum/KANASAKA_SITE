import { errorResponse, getSessionUser } from "../../lib/auth.js";
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  deleteAvatar,
  getAvatarRecord,
  getUserProfile,
  profilePayload,
  saveAvatar,
} from "../../lib/profile.js";

function avatarResponse(record) {
  const body =
    record.data instanceof ArrayBuffer ? record.data : new Uint8Array(record.data);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": record.mime_type,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function onRequestGet(context) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) {
    return errorResponse("Log in to view your profile picture.", 401);
  }

  const record = await getAvatarRecord(context.env, user.id);
  if (!record) {
    return errorResponse("No profile picture uploaded.", 404);
  }

  return avatarResponse(record);
}

export async function onRequestPost(context) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) {
    return errorResponse("Log in to upload a profile picture.", 401);
  }

  let formData;
  try {
    formData = await context.request.formData();
  } catch {
    return errorResponse("Invalid upload request.");
  }

  const file = formData.get("avatar");
  if (!file || typeof file.arrayBuffer !== "function") {
    return errorResponse("Choose an image file to upload.");
  }

  const mimeType = file.type || "";
  if (!AVATAR_MIME_TYPES[mimeType]) {
    return errorResponse("Use a JPG, PNG, WebP, or GIF image.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) {
    return errorResponse("That image file is empty.");
  }

  if (bytes.length > AVATAR_MAX_BYTES) {
    return errorResponse("Profile picture must be 512 KB or smaller.");
  }

  await saveAvatar(context.env, user.id, mimeType, bytes);

  const profile = await getUserProfile(context.env, user.id);
  return new Response(
    JSON.stringify({
      success: true,
      message: "Profile picture updated.",
      ...profilePayload(profile),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function onRequestDelete(context) {
  const user = await getSessionUser(context.request, context.env);
  if (!user) {
    return errorResponse("Log in to remove your profile picture.", 401);
  }

  await deleteAvatar(context.env, user.id);

  const profile = await getUserProfile(context.env, user.id);
  return new Response(
    JSON.stringify({
      success: true,
      message: "Profile picture removed.",
      ...profilePayload(profile),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  );
}
