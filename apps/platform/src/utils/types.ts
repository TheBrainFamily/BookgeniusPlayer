export interface Book {
  id: number;
  title: string;
  slug: string;
  author: string;
  metadata: Partial<{ [key in "pl" | "en"]: { genre: string; description: string; features: string[]; phrases: string[] } }>;
  year: string;
  rating: number;
  video: string;
  poster: string;
  readTime: string;
  language: string;
  type: string;
}
