import { Context, Schema, h } from "koishi";
import {} from "koishi-plugin-canvas";

export const name = "symmetry";
export const inject = ["canvas", "http"];

export interface Config {}

export const Config: Schema<Config> = Schema.object({});

type Direction = "left" | "right" | "up" | "down" | "both";
type FrameDims = { left: number; top: number; width: number; height: number };
type DecodedFrame = {
  delay: number;
  disposalType?: number;
  dims: FrameDims;
  patch: Uint8ClampedArray;
};

const directionAliases: Record<string, Direction> = {
  left: "left",
  l: "left",
  lr: "left",
  right: "right",
  r: "right",
  rl: "right",
  up: "up",
  u: "up",
  top: "up",
  down: "down",
  d: "down",
  bottom: "down",
  both: "both",
  all: "both",
  hv: "both",
  vh: "both",
  quad: "both",
};

function normalizeDirection(value?: string): Direction | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return directionAliases[key] ?? null;
}

function getImageSize(image: {
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
}): { width: number; height: number } {
  const width = image.naturalWidth ?? image.width ?? 0;
  const height = image.naturalHeight ?? image.height ?? 0;
  if (!width || !height) throw new Error("invalid image size");
  return { width, height };
}

function isGif(buffer: Buffer): boolean {
  if (buffer.length < 6) return false;
  const signature = buffer.slice(0, 6).toString("ascii");
  return signature === "GIF87a" || signature === "GIF89a";
}

function parseDataUrl(dataUrl: string): { buffer: Buffer } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl);
  if (!match) throw new Error("invalid data url");
  const isBase64 = Boolean(match[2]);
  const data = match[3] ?? "";
  const buffer = isBase64
    ? Buffer.from(data, "base64")
    : Buffer.from(decodeURIComponent(data), "utf8");
  return { buffer };
}

async function fetchImageBuffer(ctx: Context, src: string): Promise<Buffer> {
  if (src.startsWith("data:")) return parseDataUrl(src).buffer;
  const arrayBuffer = await ctx.http.get(src, {
    responseType: "arraybuffer",
    timeout: 15000,
  });
  return Buffer.isBuffer(arrayBuffer)
    ? arrayBuffer
    : Buffer.from(arrayBuffer);
}

async function convertWithSharp(buffer: Buffer): Promise<Buffer | null> {
  try {
    const mod = await import("sharp");
    const sharpFn = (mod.default ?? mod) as any;
    return await sharpFn(buffer, { animated: false }).png().toBuffer();
  } catch {
    return null;
  }
}

async function loadImageFromBuffer(ctx: Context, buffer: Buffer) {
  try {
    return await ctx.canvas.loadImage(buffer);
  } catch (error) {
    const converted = await convertWithSharp(buffer);
    if (!converted) throw error;
    return await ctx.canvas.loadImage(converted);
  }
}

function drawSymmetry(
  canvasCtx: any,
  source: any,
  width: number,
  height: number,
  direction: Direction
) {
  canvasCtx.clearRect(0, 0, width, height);
  switch (direction) {
    case "left": {
      const baseWidth = Math.ceil(width / 2);
      canvasCtx.drawImage(source, 0, 0, baseWidth, height, 0, 0, baseWidth, height);
      canvasCtx.drawImage(
        source,
        0,
        0,
        baseWidth,
        height,
        width,
        0,
        -baseWidth,
        height
      );
      break;
    }
    case "right": {
      const baseWidth = Math.ceil(width / 2);
      const srcX = width - baseWidth;
      canvasCtx.drawImage(
        source,
        srcX,
        0,
        baseWidth,
        height,
        srcX,
        0,
        baseWidth,
        height
      );
      canvasCtx.drawImage(
        source,
        srcX,
        0,
        baseWidth,
        height,
        baseWidth,
        0,
        -baseWidth,
        height
      );
      break;
    }
    case "up": {
      const baseHeight = Math.ceil(height / 2);
      canvasCtx.drawImage(source, 0, 0, width, baseHeight, 0, 0, width, baseHeight);
      canvasCtx.drawImage(
        source,
        0,
        0,
        width,
        baseHeight,
        0,
        height,
        width,
        -baseHeight
      );
      break;
    }
    case "down": {
      const baseHeight = Math.ceil(height / 2);
      const srcY = height - baseHeight;
      canvasCtx.drawImage(
        source,
        0,
        srcY,
        width,
        baseHeight,
        0,
        srcY,
        width,
        baseHeight
      );
      canvasCtx.drawImage(
        source,
        0,
        srcY,
        width,
        baseHeight,
        0,
        baseHeight,
        width,
        -baseHeight
      );
      break;
    }
    case "both": {
      const baseWidth = Math.ceil(width / 2);
      const baseHeight = Math.ceil(height / 2);
      canvasCtx.drawImage(source, 0, 0, baseWidth, baseHeight, 0, 0, baseWidth, baseHeight);
      canvasCtx.drawImage(
        source,
        0,
        0,
        baseWidth,
        baseHeight,
        width,
        0,
        -baseWidth,
        baseHeight
      );
      canvasCtx.drawImage(
        source,
        0,
        0,
        baseWidth,
        baseHeight,
        0,
        height,
        baseWidth,
        -baseHeight
      );
      canvasCtx.drawImage(
        source,
        0,
        0,
        baseWidth,
        baseHeight,
        width,
        height,
        -baseWidth,
        -baseHeight
      );
      break;
    }
  }
}

async function generateStatic(
  ctx: Context,
  buffer: Buffer,
  direction: Direction
): Promise<h> {
  const image = await loadImageFromBuffer(ctx, buffer);
  const { width, height } = getImageSize(image);
  const canvas = await ctx.canvas.createCanvas(width, height);
  const canvasCtx = canvas.getContext("2d");
  drawSymmetry(canvasCtx, image, width, height, direction);
  return h.image(await canvas.toBuffer("image/png"), "image/png");
}

function clearRectPixels(
  target: Uint8ClampedArray,
  dims: FrameDims,
  width: number
) {
  for (let y = 0; y < dims.height; y++) {
    const offset = ((dims.top + y) * width + dims.left) * 4;
    target.fill(0, offset, offset + dims.width * 4);
  }
}

function applyPatch(
  target: Uint8ClampedArray,
  patch: Uint8ClampedArray,
  dims: FrameDims,
  width: number
) {
  const rowSize = dims.width * 4;
  for (let y = 0; y < dims.height; y++) {
    const srcOffset = y * rowSize;
    const destOffset = ((dims.top + y) * width + dims.left) * 4;
    target.set(patch.subarray(srcOffset, srcOffset + rowSize), destOffset);
  }
}

function buildFullFrames(
  frames: DecodedFrame[],
  width: number,
  height: number
) {
  const canvas = new Uint8ClampedArray(width * height * 4);
  const fullFrames: { data: Uint8ClampedArray; delay: number }[] = [];
  let prevDisposal = 0;
  let prevRect: FrameDims | null = null;
  let restoreSnapshot: Uint8ClampedArray | null = null;

  for (const frame of frames) {
    const patch =
      frame.patch instanceof Uint8ClampedArray
        ? frame.patch
        : Uint8ClampedArray.from(frame.patch);
    if (prevDisposal === 2 && prevRect) {
      clearRectPixels(canvas, prevRect, width);
    } else if (prevDisposal === 3 && restoreSnapshot) {
      canvas.set(restoreSnapshot);
    }

    let nextRestore: Uint8ClampedArray | null = null;
    if (frame.disposalType === 3) {
      nextRestore = new Uint8ClampedArray(canvas);
    }

    if (patch.length === width * height * 4) {
      canvas.set(patch);
    } else {
      applyPatch(canvas, patch, frame.dims, width);
    }

    fullFrames.push({ data: new Uint8ClampedArray(canvas), delay: frame.delay });
    prevDisposal = frame.disposalType ?? 0;
    prevRect = frame.dims;
    restoreSnapshot = nextRestore;
  }

  return fullFrames;
}

async function generateGif(
  ctx: Context,
  buffer: Buffer,
  direction: Direction
): Promise<h> {
  const { parseGIF, decompressFrames } = await import("gifuct-js");
  const GIFEncoder = (await import("gif-encoder-2")).default;
  const gif = parseGIF(buffer);
  const width = gif.lsd.width;
  const height = gif.lsd.height;
  const frames = decompressFrames(gif, true) as DecodedFrame[];
  const fullFrames = buildFullFrames(frames, width, height);

  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setQuality(10);

  const frameCanvas = await ctx.canvas.createCanvas(width, height);
  const frameCtx = frameCanvas.getContext("2d");
  const imageData = frameCtx.createImageData(width, height);

  const outputCanvas = await ctx.canvas.createCanvas(width, height);
  const outputCtx = outputCanvas.getContext("2d");

  for (const frame of fullFrames) {
    imageData.data.set(frame.data);
    frameCtx.putImageData(imageData, 0, 0);
    drawSymmetry(outputCtx, frameCanvas, width, height, direction);

    const delayMs = Math.max(0, Math.round((frame.delay || 0) * 10));
    encoder.setDelay(delayMs);
    encoder.addFrame(outputCtx);
  }

  encoder.finish();
  return h.image(encoder.out.getData(), "image/gif");
}

async function generate(
  ctx: Context,
  imageSrc: string,
  direction: Direction
): Promise<h> {
  const buffer = await fetchImageBuffer(ctx, imageSrc);
  if (isGif(buffer)) {
    return await generateGif(ctx, buffer, direction);
  }
  return await generateStatic(ctx, buffer, direction);
}

function extractImageSource(input: any): string | null {
  const [argCode] = h.select(input || [], "img");
  if (argCode?.attrs?.src) return argCode.attrs.src;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function renderNotice(session: any, path: string) {
  return (
    <>
      {session.channel ? (
        <>
          <at id={session.userId} />{" "}
        </>
      ) : (
        ""
      )}
      <i18n path={path} />
    </>
  );
}

export function apply(ctx: Context) {
  // Register i18n
  ctx.i18n.define("zh-CN", require("./locales/zh-CN"));
  const logger = ctx.logger("symmetry");

  // Register the command
  ctx
    .command("symmetry [image:text]")
    .option("direction", "-d <direction:string>")
    .action(async ({ session, options }, image) => {
      const normalized = normalizeDirection(options.direction);
      if (options.direction && !normalized) {
        return renderNotice(session, ".invalidDirection");
      }
      const direction = normalized ?? "left";

      let imageSrc = extractImageSource(image);
      if (!imageSrc) {
        await session.send(renderNotice(session, ".pleaseSendImage"));
        imageSrc = extractImageSource((await session.prompt()) || []);
      }
      if (!imageSrc) return renderNotice(session, ".jobCanceled");

      try {
        return await generate(ctx, imageSrc, direction);
      } catch (error) {
        logger.warn(error);
        return renderNotice(session, ".processFailed");
      }
    });
}
