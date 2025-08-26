export const getPlaceholderFromVideoUrl = (videoUrl: string): string => {
  return videoUrl.replace(/-(listens|speaks)\.(mp4|webm)/, ".png");
};
