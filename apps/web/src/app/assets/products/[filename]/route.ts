import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  const safeName = path.basename(filename);
  const candidates = [
    path.join(process.cwd(), 'public', 'assets', 'products', safeName),
    path.join(process.cwd(), '..', '..', 'assets', 'products', safeName),
    path.join(process.cwd(), 'assets', 'products', safeName),
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath);
      const ext = path.extname(safeName).toLowerCase();
      const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }
  }

  return new NextResponse('Asset not found', { status: 404 });
}
