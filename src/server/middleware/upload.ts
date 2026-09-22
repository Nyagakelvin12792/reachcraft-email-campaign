import multer from 'multer';
import path from 'path';
import fs from 'fs';

const UPLOADS_DIR = process.env.VERCEL ? '/tmp/uploads' : path.resolve(process.cwd(), 'uploads');
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch {
  // Ignored in read-only environment
}

// Allowed MIME types and extensions
const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls']);
const ALLOWED_MIMES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', // some OS/browsers report CSV as text/plain
  'application/csv',
  'application/x-csv',
  'text/comma-separated-values',
]);

// Dangerous executable extensions to reject explicitly
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.bin', '.js', '.mjs', '.vbs', '.ps1', '.py', '.msi', '.dll'
]);

// In-memory storage for spreadsheet uploads (eliminates disk I/O and EROFS errors on serverless)
const memoryStorage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB maximum
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (BLOCKED_EXTENSIONS.has(ext)) {
      return cb(new Error('Executable and script file uploads are strictly prohibited.'));
    }

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('Invalid file format. Only .csv, .xlsx, and .xls spreadsheet files are accepted.'));
    }

    // Check MIME type if supplied
    if (file.mimetype && !ALLOWED_MIMES.has(file.mimetype) && file.mimetype !== 'application/octet-stream') {
      return cb(new Error(`Unsupported MIME type: ${file.mimetype}. Expected spreadsheet.`));
    }

    cb(null, true);
  },
});

const IMAGES_DIR = process.env.VERCEL
  ? path.join('/tmp', 'uploads', 'images')
  : path.resolve(process.cwd(), 'uploads/images');

try {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
} catch {
  // Ignored in read-only environment
}

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      if (!fs.existsSync(IMAGES_DIR)) {
        fs.mkdirSync(IMAGES_DIR, { recursive: true });
      }
    } catch {
      // Ignored
    }
    cb(null, IMAGES_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, safeName);
  },
});

const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

export const imageUploadMiddleware = multer({
  storage: imageStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB maximum for images
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMAGE_EXTS.has(ext)) {
      return cb(new Error('Invalid image format. Only PNG, JPG, JPEG, GIF, WebP, and SVG are accepted.'));
    }
    if (file.mimetype && !ALLOWED_IMAGE_MIMES.has(file.mimetype)) {
      return cb(new Error(`Unsupported image type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});
