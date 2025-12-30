export interface WLCollectionSummary {
  url: string;
  href: string;
  title: string;
}

export interface WLBook {
  kind: string;
  full_sort_key: string;
  title: string;
  url: string;
  cover_color: string;
  author: string;
  cover: string;
  epoch: string;
  href: string;
  has_audio: boolean;
  genre: string;
  simple_thumb: string;
  slug: string;
  cover_thumb: string;
  liked: null | boolean;
}

export interface WLCollectionDetails {
  url: string;
  title?: string;
  books: WLBook[];
}

export interface WLCategory {
  url: string;
  href: string;
  name: string;
  slug: string;
}

export interface WLFragmentData {
  title: string;
  html: string;
}

export interface WLMedia {
  url: string;
  director: string;
  type: string;
  name: string;
  artist: string;
}

export interface WLBookDetails {
  title: string;
  slug: string;
  language: string;
  authors: { name: string; slug: string; url: string; href: string }[];
  translators: { name: string }[];
  epochs: WLCategory[];
  genres: WLCategory[];
  kinds: WLCategory[];
  fragment_data: WLFragmentData;
  children: WLBook[];
  parent: WLBook | null;
  preview: boolean;
  fb2: string;
  epub: string;
  mobi: string;
  pdf: string;
  html: string;
  txt: string;
  xml: string;
  media: WLMedia[];
  audio_length: string;
  cover: string;
  cover_thumb: string;
  cover_color: string;
  simple_cover: string;
  simple_thumb: string;
  isbn_pdf: string;
  isbn_epub: string;
  isbn_mobi: string;
}
