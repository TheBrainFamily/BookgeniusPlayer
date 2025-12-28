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

export interface WLBookDetails {
  title: string;
  slug: string;
  language: string;
  authors: { name: string; slug: string }[];
  epochs: WLCategory[];
  genres: WLCategory[];
  kinds: WLCategory[];
  fb2: string;
  epub: string;
  cover: string;
  cover_thumb: string;
}
