import fs from "fs";
import axios from "axios";
import type { AxiosError } from "axios";
import { Book, DetailedBookData, removeDuplicateSubstrings, createLoadingAnimation } from "./utils";

export class WolneLekturyService {
  private readonly apiUrl = "https://wolnelektury.pl/api";

  async getBooksByTitle(bookTitle: string): Promise<Book[]> {
    const response = await axios.get<Book[]>(`${this.apiUrl}/books`);
    return response.data.filter((book: Book) => book.title.toLowerCase().includes(bookTitle.toLowerCase()));
  }

  async getBookBySlug(bookSlug: string): Promise<DetailedBookData> {
    try {
      const response = await axios.get<DetailedBookData>(`${this.apiUrl}/books/${bookSlug}`);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) {
        throw new Error(`Book --> ${bookSlug} <-- not found`);
      }
      throw error;
    }
  }

  async downloadBookFb2(bookSlug: string): Promise<Buffer<ArrayBufferLike>> {
    try {
      const book = await this.getBookBySlug(bookSlug);
      const loading = createLoadingAnimation();
      const itemName = `Downloading ${bookSlug}.fb2`;
      loading.addItem(itemName);

      const response = await axios.get<Buffer>(book.fb2, { responseType: "arraybuffer" });

      if (!fs.existsSync(`./books-data/${bookSlug}/input`)) {
        fs.mkdirSync(`./books-data/${bookSlug}/input`, { recursive: true });
      }

      const filePath = `./books-data/${bookSlug}/input/${bookSlug}.fb2`;
      fs.writeFileSync(filePath, response.data);

      loading.updateStatus(itemName, "done");
      loading.complete();

      return response.data;
    } catch (error: unknown) {
      throw new Error(`Error while downloading book ${bookSlug}: ${error}.`);
    }
  }

  async downloadAudiobookMp3(bookSlug: string): Promise<{ mp3Name: string; data: Buffer<ArrayBufferLike> }[]> {
    try {
      const book = await this.getBookBySlug(bookSlug);
      const mp3Files = book.media.filter(({ type }) => type === "mp3");
      const loading = createLoadingAnimation();

      const results = await Promise.all(
        mp3Files.map(async (mp3) => {
          const mp3Name = removeDuplicateSubstrings(mp3.name);
          loading.addItem(mp3Name);

          const response = await axios.get<Buffer>(mp3.url, { responseType: "arraybuffer" });

          if (!fs.existsSync(`./books-data/${bookSlug}/input/audiobook`)) {
            fs.mkdirSync(`./books-data/${bookSlug}/input/audiobook`, { recursive: true });
          }

          const filePath = `./books-data/${bookSlug}/input/audiobook/${mp3Name}.mp3`;
          fs.writeFileSync(filePath, response.data);

          loading.updateStatus(mp3Name, "done");
          return { mp3Name, data: response.data };
        }),
      );

      loading.complete();

      return results;
    } catch (error: unknown) {
      throw new Error(`Error while downloading book ${bookSlug}: ${error}.`);
    }
  }
}
