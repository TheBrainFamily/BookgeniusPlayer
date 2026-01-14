import { getAvatarUrlForVideo } from "./assetUrls";

export const getPlaceholderFromVideoUrl = (videoUrl: string): string => {
  if (!videoUrl) return videoUrl;

  // Look up avatar from registry
  const avatarUrl = getAvatarUrlForVideo(videoUrl);
  return avatarUrl ?? videoUrl;
};
