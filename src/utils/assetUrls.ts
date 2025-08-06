import { bookDataLoader } from "@/services/bookDataLoader";

const getBookBaseUrl = () => `http://localhost:8082/books/${bookDataLoader.getCurrentBook()}`;

export const getBookAssetBaseUrl = () => `${getBookBaseUrl()}/assets`;

export const getBookAssetUrl = (assetPath: string) => `${getBookAssetBaseUrl()}/${assetPath}`;

export const buildAudioUrl = (trackId: string) => `${getBookAssetBaseUrl()}/${trackId}.mp3`;

export const getBookDataUrl = (fileName: string) => `${getBookBaseUrl()}/compiled/${fileName}`;
