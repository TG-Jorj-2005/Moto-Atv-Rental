import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, contentTypeFor, sniffImage, uploadDir, uploadFilePath, uploadProblem } from "./uploads";

const bytes = (...n: number[]) => Uint8Array.from(n);
const ascii = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

describe("sniffImage decides by content, not by name", () => {
  it("recognizes JPEG, PNG and WebP", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toEqual({ ext: "jpg", mime: "image/jpeg" });
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({ ext: "png", mime: "image/png" });
    expect(sniffImage(Uint8Array.from([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")]))).toEqual({ ext: "webp", mime: "image/webp" });
  });
  it("refuses everything else, including look-alikes", () => {
    expect(sniffImage(ascii("GIF89a......"))).toBeNull();
    expect(sniffImage(ascii("%PDF-1.7 ..."))).toBeNull();
    expect(sniffImage(ascii("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"))).toBeNull();
    expect(sniffImage(ascii("<html><body>not an image</body></html>"))).toBeNull();
    expect(sniffImage(Uint8Array.from([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVE")]))).toBeNull(); // RIFF but not WebP
    expect(sniffImage(bytes(0xff, 0xd8))).toBeNull(); // too short to be a JPEG
    expect(sniffImage(bytes())).toBeNull();
  });
});

describe("uploadFilePath only accepts the names the server generates", () => {
  const original = process.env.UPLOAD_DIR;
  afterEach(() => {
    if (original === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = original;
  });
  it("accepts random hex names with a known extension", () => {
    process.env.UPLOAD_DIR = "/srv/uploads";
    expect(uploadFilePath("a1b2c3d4e5f60718293a4b5c6d7e8f90.jpg")).toBe(path.join("/srv/uploads", "a1b2c3d4e5f60718293a4b5c6d7e8f90.jpg"));
    expect(uploadFilePath("a1b2c3d4e5f60718293a4b5c6d7e8f90.webp")).not.toBeNull();
  });
  it("refuses traversal, absolute paths, hidden files, other extensions and odd characters", () => {
    for (const bad of ["../etc/passwd", "..%2f..%2fsecret.jpg", "/etc/passwd", "a/b.jpg", "a\\b.jpg", ".htaccess", "file.svg", "file.html", "file.jpg.exe", "short.jpg", "UPPERCASE0123456789.jpg", "name with space.jpg", "a1b2c3d4e5f60718293a4b5c6d7e8f90.jpg\0.png", ""]) {
      expect(uploadFilePath(bad), bad).toBeNull();
    }
  });
  it("maps the extension to the content type", () => {
    expect([contentTypeFor("x.png"), contentTypeFor("x.webp"), contentTypeFor("x.jpg")]).toEqual(["image/png", "image/webp", "image/jpeg"]);
  });
  it("uses ./uploads by default", () => {
    delete process.env.UPLOAD_DIR;
    expect(uploadDir()).toBe(path.resolve("./uploads"));
  });
});

describe("uploadProblem: content, name and declared type must agree", () => {
  const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0);
  const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0);
  const webp = Uint8Array.from([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")]);
  const file = (name: string, type: string, b: Uint8Array) => ({ name, type, bytes: b });

  it("accepts real images with a matching name, in any letter case, with the usual types", () => {
    expect(uploadProblem(file("moto.jpg", "image/jpeg", jpeg))).toBeNull();
    expect(uploadProblem(file("MOTO.JPEG", "image/jpeg", jpeg))).toBeNull();
    expect(uploadProblem(file("a b (1).png", "image/png", png))).toBeNull();
    expect(uploadProblem(file("x.webp", "image/webp", webp))).toBeNull();
    expect(uploadProblem(file("x.jpg", "", jpeg))).toBeNull(); // some browsers send no type
    expect(uploadProblem(file("x.jpg", "application/octet-stream", jpeg))).toBeNull();
  });
  it("refuses an empty file and a file over the limit, before looking at anything else", () => {
    expect(uploadProblem(file("x.jpg", "image/jpeg", bytes()))).toBe("EMPTY");
    expect(uploadProblem(file("x.jpg", "image/jpeg", new Uint8Array(MAX_PHOTO_BYTES + 1)))).toBe("TOO_BIG");
    expect(uploadProblem(file("x.jpg", "image/jpeg", Uint8Array.from([...jpeg, ...new Uint8Array(MAX_PHOTO_BYTES - jpeg.length)])))).toBeNull(); // exactly the limit
  });
  it("refuses content that is not an image, whatever the name and the declared type say", () => {
    expect(uploadProblem(file("x.jpg", "image/jpeg", ascii("<html><script>alert(1)</script>")))).toBe("NOT_AN_IMAGE");
    expect(uploadProblem(file("x.png", "image/png", ascii("GIF89a....")))).toBe("NOT_AN_IMAGE");
  });
  it("refuses a name that is not an image name even when the bytes are an image (php, svg, gif, no extension, double extension)", () => {
    for (const name of ["shell.php", "pic.svg", "pic.gif", "pic", "pic.", ".jpg.php", "pic.jpg.exe", "pic.html"]) {
      expect(uploadProblem(file(name, "image/jpeg", jpeg)), name).toBe("NOT_AN_IMAGE");
    }
  });
  it("refuses a name or a declared type that contradicts the content", () => {
    expect(uploadProblem(file("x.png", "image/png", jpeg))).toBe("NOT_AN_IMAGE");
    expect(uploadProblem(file("x.jpg", "image/jpeg", png))).toBe("NOT_AN_IMAGE");
    expect(uploadProblem(file("x.webp", "image/webp", jpeg))).toBe("NOT_AN_IMAGE");
    expect(uploadProblem(file("x.jpg", "text/html", jpeg))).toBe("NOT_AN_IMAGE");
    expect(uploadProblem(file("x.jpg", "image/png", jpeg))).toBe("NOT_AN_IMAGE");
  });
});
