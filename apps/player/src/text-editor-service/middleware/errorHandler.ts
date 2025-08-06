import { Request, Response } from "express";

export const errorHandler = (err: Error, _: Request, res: Response) => {
  console.error(err.stack);
  res.status(500).json({ status: "error", message: "Something went wrong!", error: process.env.NODE_ENV === "development" ? err.message : undefined });
};
