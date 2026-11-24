import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { imageUrl } from "./catalogue.js";

export const receiveImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 12, fields: 0 },
  fileFilter: (_req, file, done) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype))
      return done(new Error("Choose JPG, PNG or WebP images."));
    done(null, true);
  },
}).array("images", 12);

export function saveImages({ uploads, baseUrl }) {
  return async (req, res, next) => {
    const written = [];
    try {
      if (!req.files?.length) throw new Error("Select at least one image.");
      // Decode every image before writing any file; never trust the MIME header.
      const prepared = [];
      for (const file of req.files) {
        let buffer;
        try {
          const input = sharp(file.buffer, { limitInputPixels: 40000000 });
          const metadata = await input.metadata();
          if (!["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages || 1) > 1)
            throw new Error("Unsupported image");
          buffer = await input.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
        } catch {
          throw new Error("One of the images is invalid or too large. Choose a non-animated JPG, PNG or WebP under 40 megapixels.");
        }
        prepared.push({ buffer, filename: `${randomUUID()}.webp`, name: file.originalname });
      }
      await mkdir(uploads, { recursive: true });
      for (const item of prepared) {
        const path = join(uploads, item.filename);
        written.push(path);
        await writeFile(path, item.buffer, { flag: "wx" });
      }
      res.status(201).json({ images: prepared.map(({ filename, name }) => ({
        name, path: `/uploads/${filename}`, url: imageUrl(`/uploads/${filename}`, baseUrl),
      })) });
    } catch (error) {
      await Promise.all(written.map(path => unlink(path).catch(() => {})));
      next(error);
    }
  };
}
