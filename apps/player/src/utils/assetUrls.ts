import { bookDataLoader } from "@/services/bookDataLoader";

const API_BASE_URL = (typeof import.meta.env !== "undefined" && import.meta.env.VITE_API_BASE_URL) ? import.meta.env.VITE_API_BASE_URL : "/api/core/content/assets/";
const getBookBaseUrl = () => `${API_BASE_URL}books/${bookDataLoader.getCurrentBook()}`;

export const getBookAssetBaseUrl = () => `${getBookBaseUrl()}/assets`;

export const getBookAssetUrl = (assetPath: string) => `${getBookAssetBaseUrl()}/${assetPath}`;

export const buildAudioUrl = (trackId: string) => `${getBookAssetBaseUrl()}/${trackId}.mp3`;

export const getBookDataUrl = (fileName: string) => `${getBookBaseUrl()}/compiled/${fileName}`;
