// src/server/app.ts
import express from "express";
import cors from "cors";

// src/server/routes/campaigns.ts
import { Router } from "express";
import { z } from "zod";

// src/server/services/db.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL_ENV);
var tmpDbPath = process.env.SERVERLESS_DATABASE_PATH || "/tmp/dev.db";
function makeDatabaseWritable(databasePath) {
  try {
    fs.chmodSync(databasePath, 384);
  } catch (err) {
    console.warn(`Could not update SQLite permissions for ${databasePath}:`, err);
  }
}
if (isServerless) {
  try {
    const tmpDir = path.dirname(tmpDbPath);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    if (!fs.existsSync(tmpDbPath)) {
      const candidatePaths = [
        path.join(process.cwd(), "prisma/seed.db"),
        path.join(process.cwd(), "prisma/dev.db"),
        path.resolve("./prisma/seed.db"),
        path.resolve("./prisma/dev.db"),
        path.join(__dirname, "prisma/seed.db"),
        path.join(__dirname, "../prisma/seed.db"),
        path.join(__dirname, "../../prisma/seed.db"),
        path.join(__dirname, "../../../prisma/seed.db"),
        path.join(__dirname, "../../../../prisma/seed.db")
      ];
      let found = false;
      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          try {
            fs.writeFileSync(tmpDbPath, fs.readFileSync(p), { mode: 384 });
            makeDatabaseWritable(tmpDbPath);
            const stat = fs.statSync(tmpDbPath);
            console.log(`Successfully initialized SQLite database at ${tmpDbPath} from ${p} (${stat.size} bytes)`);
            found = true;
            break;
          } catch (e) {
            console.warn(`Could not copy seed DB from ${p} to /tmp:`, e);
          }
        }
      }
      if (!found) {
        console.warn("\u26A0\uFE0F Warning: seed.db was not found in any candidate path in serverless container:", candidatePaths);
      }
    }
    if (fs.existsSync(tmpDbPath)) {
      makeDatabaseWritable(tmpDbPath);
    }
  } catch (err) {
    console.error("Error ensuring /tmp SQLite database exists:", err);
  }
  process.env.DATABASE_URL = `file:${tmpDbPath}`;
}
var dbUrl = isServerless ? `file:${tmpDbPath}` : process.env.DATABASE_URL;
var globalForPrisma = globalThis;
var prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: dbUrl ? { db: { url: dbUrl } } : void 0,
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
});
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// src/server/services/auditLogger.ts
async function logAuditEvent(action, details, campaignId, ipAddress) {
  try {
    const cleanDetails = { ...details };
    if (typeof cleanDetails.email === "string") {
      const parts = cleanDetails.email.split("@");
      if (parts.length === 2) {
        cleanDetails.email = `${parts[0][0]}***@${parts[1]}`;
      }
    }
    await prisma.auditEvent.create({
      data: {
        action,
        campaignId,
        ipAddress,
        details: JSON.stringify(cleanDetails)
      }
    });
  } catch (err) {
    console.error("Failed to record audit event:", err);
  }
}

// src/server/routes/campaigns.ts
var campaignsRouter = Router();
campaignsRouter.get("/", async (_req, res, next) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        sendJob: true,
        template: {
          select: { subject: true, senderName: true }
        }
      }
    });
    res.json({ campaigns });
  } catch (err) {
    next(err);
  }
});
campaignsRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        template: true,
        sendJob: true,
        recipients: {
          orderBy: { rowNumber: "asc" }
        }
      }
    });
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    res.json({ campaign });
  } catch (err) {
    next(err);
  }
});
var createCampaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required").max(100),
  sendDelayMs: z.number().min(500).default(2e3),
  optOutEnabled: z.boolean().default(true),
  optOutText: z.string().optional()
});
campaignsRouter.post("/", async (req, res, next) => {
  try {
    const parsed2 = createCampaignSchema.parse(req.body);
    const campaign = await prisma.campaign.create({
      data: {
        name: parsed2.name,
        sendDelayMs: parsed2.sendDelayMs,
        optOutEnabled: parsed2.optOutEnabled,
        optOutText: parsed2.optOutText ?? "If you wish to opt out from future communications, please reply with 'UNSUBSCRIBE'.",
        status: "DRAFT"
      }
    });
    await logAuditEvent("CAMPAIGN_CREATED", { name: campaign.name }, campaign.id, req.ip);
    res.status(201).json({ campaign });
  } catch (err) {
    next(err);
  }
});
var updateCampaignSchema = z.object({
  name: z.string().trim().min(1, "Campaign name is required").max(100).optional(),
  sendDelayMs: z.number().min(500).max(1e4).optional()
}).refine((data) => data.name !== void 0 || data.sendDelayMs !== void 0, {
  message: "Provide at least one campaign field to update"
});
campaignsRouter.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const parsed2 = updateCampaignSchema.parse(req.body);
    const existing = await prisma.campaign.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    if (["SENDING", "COMPLETED", "CANCELLED"].includes(existing.status)) {
      res.status(409).json({ error: "This campaign can no longer be edited." });
      return;
    }
    const campaign = await prisma.campaign.update({
      where: { id },
      data: parsed2
    });
    await logAuditEvent("CAMPAIGN_SETUP_UPDATED", {
      fields: Object.keys(parsed2)
    }, campaign.id, req.ip);
    res.json({ campaign });
  } catch (err) {
    next(err);
  }
});
campaignsRouter.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.campaign.delete({
      where: { id }
    });
    await logAuditEvent("CAMPAIGN_DELETED", { id }, id, req.ip);
    res.json({ message: "Campaign deleted successfully" });
  } catch (err) {
    next(err);
  }
});

// src/server/routes/upload.ts
import { Router as Router2 } from "express";
import { z as z3 } from "zod";
import fs4 from "fs";
import path3 from "path";

// src/server/middleware/upload.ts
import multer from "multer";
import path2 from "path";
import fs2 from "fs";
var UPLOADS_DIR = process.env.VERCEL ? "/tmp/uploads" : path2.resolve(process.cwd(), "uploads");
try {
  if (!fs2.existsSync(UPLOADS_DIR)) {
    fs2.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch {
}
var ALLOWED_EXTENSIONS = /* @__PURE__ */ new Set([".csv", ".xlsx", ".xls"]);
var ALLOWED_MIMES = /* @__PURE__ */ new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  // some OS/browsers report CSV as text/plain
  "application/csv",
  "application/x-csv",
  "text/comma-separated-values"
]);
var BLOCKED_EXTENSIONS = /* @__PURE__ */ new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".sh",
  ".bin",
  ".js",
  ".mjs",
  ".vbs",
  ".ps1",
  ".py",
  ".msi",
  ".dll"
]);
var memoryStorage = multer.memoryStorage();
var uploadMiddleware = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024
    // 5MB maximum
  },
  fileFilter: (_req, file, cb) => {
    const ext = path2.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      return cb(new Error("Executable and script file uploads are strictly prohibited."));
    }
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error("Invalid file format. Only .csv, .xlsx, and .xls spreadsheet files are accepted."));
    }
    if (file.mimetype && !ALLOWED_MIMES.has(file.mimetype) && file.mimetype !== "application/octet-stream") {
      return cb(new Error(`Unsupported MIME type: ${file.mimetype}. Expected spreadsheet.`));
    }
    cb(null, true);
  }
});
var IMAGES_DIR = process.env.VERCEL ? path2.join("/tmp", "uploads", "images") : path2.resolve(process.cwd(), "uploads/images");
try {
  if (!fs2.existsSync(IMAGES_DIR)) {
    fs2.mkdirSync(IMAGES_DIR, { recursive: true });
  }
} catch {
}
var imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      if (!fs2.existsSync(IMAGES_DIR)) {
        fs2.mkdirSync(IMAGES_DIR, { recursive: true });
      }
    } catch {
    }
    cb(null, IMAGES_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path2.extname(file.originalname).toLowerCase();
    const safeName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, safeName);
  }
});
var ALLOWED_IMAGE_EXTS = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
var ALLOWED_IMAGE_MIMES = /* @__PURE__ */ new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml"
]);
var imageUploadMiddleware = multer({
  storage: imageStorage,
  limits: {
    fileSize: 10 * 1024 * 1024
    // 10MB maximum for images
  },
  fileFilter: (_req, file, cb) => {
    const ext = path2.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMAGE_EXTS.has(ext)) {
      return cb(new Error("Invalid image format. Only PNG, JPG, JPEG, GIF, WebP, and SVG are accepted."));
    }
    if (file.mimetype && !ALLOWED_IMAGE_MIMES.has(file.mimetype)) {
      return cb(new Error(`Unsupported image type: ${file.mimetype}`));
    }
    cb(null, true);
  }
});

// src/server/services/spreadsheet.ts
import * as XLSX from "xlsx";
import fs3 from "fs";
function suggestColumnMapping(columns) {
  const mapping = {
    email: "",
    firstName: "",
    lastName: "",
    company: "",
    phone: "",
    jobTitle: "",
    awb: "",
    destination: ""
  };
  const normalized = columns.map((col) => ({
    original: col,
    clean: col.toLowerCase().replace(/[^a-z0-9]/g, "")
  }));
  for (const item of normalized) {
    if (!mapping.email && (item.clean === "email" || item.clean.includes("mail") || item.clean === "emailaddress")) {
      mapping.email = item.original;
    } else if (!mapping.firstName && (item.clean === "firstname" || item.clean === "first" || item.clean === "fname")) {
      mapping.firstName = item.original;
    } else if (!mapping.lastName && (item.clean === "lastname" || item.clean === "last" || item.clean === "lname" || item.clean === "surname")) {
      mapping.lastName = item.original;
    } else if (!mapping.company && (item.clean === "company" || item.clean === "companyname" || item.clean === "organization" || item.clean === "business")) {
      mapping.company = item.original;
    } else if (!mapping.phone && (item.clean === "phone" || item.clean === "phonenumber" || item.clean === "mobile" || item.clean === "tel")) {
      mapping.phone = item.original;
    } else if (!mapping.jobTitle && (item.clean === "jobtitle" || item.clean === "title" || item.clean === "role" || item.clean === "position" || item.clean === "occupation" || item.clean.includes("jobtitle"))) {
      mapping.jobTitle = item.original;
    } else if (!mapping.awb && (item.clean.includes("awb") || item.clean.includes("tracking") || item.clean === "airwaybill")) {
      mapping.awb = item.original;
    } else if (!mapping.destination && (item.clean.includes("dest") || item.clean.includes("airport") || item.clean === "city" || item.clean === "station")) {
      mapping.destination = item.original;
    }
  }
  if (!mapping.firstName) {
    const nameCol = normalized.find((i) => i.clean === "name" || i.clean === "fullname");
    if (nameCol) {
      mapping.firstName = nameCol.original;
    }
  }
  return mapping;
}
function parseSpreadsheetBuffer(fileBuffer, originalName) {
  const workbook = XLSX.read(fileBuffer, {
    type: "buffer",
    cellFormula: false,
    cellHTML: false,
    cellText: true
  });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("Spreadsheet contains no sheets.");
  }
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Worksheet ${sheetName} could not be read.`);
  }
  const rawRows = XLSX.utils.sheet_to_json(worksheet, {
    raw: false,
    defval: ""
  });
  if (rawRows.length === 0) {
    throw new Error("Spreadsheet is empty or contains no data rows.");
  }
  const columnSet = /* @__PURE__ */ new Set();
  for (const row of rawRows) {
    for (const key of Object.keys(row)) {
      const trimmed = key.trim();
      if (trimmed && !trimmed.toLowerCase().startsWith("__empty")) {
        columnSet.add(trimmed);
      }
    }
  }
  const columns = Array.from(columnSet);
  if (columns.length === 0) {
    throw new Error("No valid columns found in the spreadsheet header.");
  }
  const normalizedRows = rawRows.map((row) => {
    const rowObj = {};
    for (const col of columns) {
      const val = row[col];
      rowObj[col] = val !== void 0 && val !== null ? String(val).trim() : "";
    }
    return rowObj;
  });
  const suggestedMapping = suggestColumnMapping(columns);
  return {
    fileName: originalName,
    columns,
    suggestedMapping,
    rows: normalizedRows
  };
}
function parseSpreadsheetFile(filePath, originalName) {
  if (!fs3.existsSync(filePath)) {
    throw new Error("Spreadsheet file does not exist on disk.");
  }
  const fileBuffer = fs3.readFileSync(filePath);
  return parseSpreadsheetBuffer(fileBuffer, originalName);
}

// src/server/services/validator.ts
import { z as z2 } from "zod";
var emailSchema = z2.string().email();
function validateEmail(email) {
  const trimmed = email.trim();
  if (!trimmed) {
    return { valid: false, reason: "Email address is empty or missing." };
  }
  if (trimmed.includes(" ") || trimmed.includes("	") || trimmed.includes("\n")) {
    return { valid: false, reason: "Email contains invalid whitespace characters." };
  }
  const parseResult = emailSchema.safeParse(trimmed);
  if (!parseResult.success) {
    return { valid: false, reason: "Malformed email format (does not match RFC standards)." };
  }
  const parts = trimmed.split("@");
  if (parts.length !== 2 || !parts[1].includes(".")) {
    return { valid: false, reason: "Email domain must contain a valid top-level domain." };
  }
  return { valid: true };
}
function validateSpreadsheetRows(rawRows, mapping, dedupeOptions = { strategy: "keep_first" }, suppressedEmails = /* @__PURE__ */ new Set()) {
  const emailCol = mapping.email;
  if (!emailCol) {
    throw new Error("Email column mapping is required for validation.");
  }
  const emailOccurrences = /* @__PURE__ */ new Map();
  rawRows.forEach((row, index) => {
    const rawEmail = (row[emailCol] || "").trim().toLowerCase();
    if (rawEmail) {
      const existing = emailOccurrences.get(rawEmail) || [];
      existing.push(index);
      emailOccurrences.set(rawEmail, existing);
    }
  });
  const validatedRows = [];
  let readyCount = 0;
  let rejectedCount = 0;
  let duplicateCount = 0;
  let missingEmailCount = 0;
  let invalidEmailCount = 0;
  let missingRequiredCount = 0;
  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const rawEmail = (row[emailCol] || "").trim();
    const normalizedEmail = rawEmail.toLowerCase();
    const firstName = mapping.firstName ? capitalizePersonName(row[mapping.firstName]) : "";
    const lastName = mapping.lastName ? capitalizePersonName(row[mapping.lastName]) : "";
    const company = mapping.company ? (row[mapping.company] || "").trim() : "";
    const phone = mapping.phone ? (row[mapping.phone] || "").trim() : "";
    const jobTitle = mapping.jobTitle ? (row[mapping.jobTitle] || "").trim() : "";
    const awb = mapping.awb ? (row[mapping.awb] || "").trim() : "";
    const destination = mapping.destination ? (row[mapping.destination] || "").trim() : "";
    const mappedCols = new Set([
      emailCol,
      mapping.firstName,
      mapping.lastName,
      mapping.company,
      mapping.phone,
      mapping.jobTitle,
      mapping.awb,
      mapping.destination
    ].filter(Boolean));
    const customFields = {};
    for (const [colKey, colVal] of Object.entries(row)) {
      if (!mappedCols.has(colKey) && !colKey.toLowerCase().startsWith("__empty")) {
        customFields[colKey] = (colVal || "").trim();
      }
    }
    let status = "READY";
    let rejectReason;
    if (!rawEmail) {
      status = "MISSING_EMAIL";
      rejectReason = "Missing email address in specified column.";
      missingEmailCount++;
      rejectedCount++;
    } else {
      const emailCheck = validateEmail(rawEmail);
      if (!emailCheck.valid) {
        status = "INVALID_EMAIL";
        rejectReason = emailCheck.reason;
        invalidEmailCount++;
        rejectedCount++;
      } else if (suppressedEmails.has(normalizedEmail)) {
        status = "SUPPRESSED";
        rejectReason = "Recipient email address is in the suppression list.";
        rejectedCount++;
      } else {
        const occurrences = emailOccurrences.get(normalizedEmail) || [];
        if (occurrences.length > 1) {
          if (dedupeOptions.strategy === "allow_all") {
          } else if (dedupeOptions.strategy === "remove_all_duplicates") {
            status = "DUPLICATE";
            rejectReason = `Duplicate email found across ${occurrences.length} rows. Policy set to remove all duplicates.`;
            duplicateCount++;
            rejectedCount++;
          } else {
            const firstIdx = occurrences[0];
            if (idx !== firstIdx) {
              status = "DUPLICATE";
              rejectReason = `Duplicate email already registered on spreadsheet row ${firstIdx + 2}. Kept first record.`;
              duplicateCount++;
              rejectedCount++;
            }
          }
        }
      }
    }
    if (status === "READY" && mapping.requiredFields && mapping.requiredFields.length > 0) {
      for (const requiredCol of mapping.requiredFields) {
        const val = (row[requiredCol] || "").trim();
        if (!val) {
          status = "MISSING_REQUIRED";
          rejectReason = `Missing required field: ${requiredCol}`;
          missingRequiredCount++;
          rejectedCount++;
          break;
        }
      }
    }
    if (status === "READY") {
      readyCount++;
    }
    validatedRows.push({
      rowNumber,
      email: rawEmail,
      firstName,
      lastName,
      company,
      phone,
      jobTitle,
      awb,
      destination,
      customFields,
      status,
      rejectReason,
      isExcluded: false
    });
  });
  return {
    totalRows: rawRows.length,
    readyCount,
    rejectedCount,
    duplicateCount,
    missingEmailCount,
    invalidEmailCount,
    missingRequiredCount,
    exceedsMaxRecipients: readyCount > 100,
    rows: validatedRows
  };
}

// src/server/routes/upload.ts
var uploadRouter = Router2({ mergeParams: true });
var uploadCache = /* @__PURE__ */ new Map();
function setUploadCache(campaignId, data) {
  uploadCache.set(campaignId, data);
  try {
    const tmpDir = process.env.VERCEL ? "/tmp" : path3.resolve(process.cwd(), "uploads");
    if (!fs4.existsSync(tmpDir)) {
      fs4.mkdirSync(tmpDir, { recursive: true });
    }
    fs4.writeFileSync(path3.join(tmpDir, `cache_${campaignId}.json`), JSON.stringify(data), "utf-8");
  } catch {
  }
}
function getUploadCache(campaignId) {
  if (uploadCache.has(campaignId)) {
    return uploadCache.get(campaignId);
  }
  try {
    const tmpDir = process.env.VERCEL ? "/tmp" : path3.resolve(process.cwd(), "uploads");
    const cacheFile = path3.join(tmpDir, `cache_${campaignId}.json`);
    if (fs4.existsSync(cacheFile)) {
      const parsed2 = JSON.parse(fs4.readFileSync(cacheFile, "utf-8"));
      uploadCache.set(campaignId, parsed2);
      return parsed2;
    }
  } catch {
  }
  return void 0;
}
uploadRouter.post("/paste", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const { rawText, fileName } = req.body;
    if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
      res.status(400).json({ error: "No spreadsheet text provided." });
      return;
    }
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    const displayName = fileName && typeof fileName === "string" && fileName.trim() ? fileName.trim() : "Pasted Spreadsheet Data";
    const parsed2 = parseSpreadsheetBuffer(Buffer.from(rawText.trim(), "utf-8"), displayName);
    setUploadCache(campaignId, {
      originalFileName: displayName,
      columns: parsed2.columns,
      suggestedMapping: parsed2.suggestedMapping,
      rows: parsed2.rows
    });
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        originalFileName: displayName,
        totalUploaded: parsed2.rows.length
      }
    });
    await logAuditEvent("SPREADSHEET_UPLOADED", {
      fileName: displayName,
      rowCount: parsed2.rows.length,
      columnCount: parsed2.columns.length,
      method: "PASTE"
    }, campaignId, req.ip);
    res.json({
      fileName: displayName,
      columns: parsed2.columns,
      suggestedMapping: parsed2.suggestedMapping,
      totalRows: parsed2.rows.length,
      sampleRows: parsed2.rows.slice(0, 3)
    });
  } catch (err) {
    next(err);
  }
});
uploadRouter.post("/upload", uploadMiddleware.single("file"), async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    if (!req.file || !req.file.buffer && !req.file.path) {
      res.status(400).json({ error: "No file uploaded or file rejected by security filters." });
      return;
    }
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    const parsed2 = req.file.buffer ? parseSpreadsheetBuffer(req.file.buffer, req.file.originalname) : parseSpreadsheetFile(req.file.path, req.file.originalname);
    setUploadCache(campaignId, {
      filePath: req.file.path,
      originalFileName: req.file.originalname,
      columns: parsed2.columns,
      suggestedMapping: parsed2.suggestedMapping,
      rows: parsed2.rows
    });
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        originalFileName: req.file.originalname,
        totalUploaded: parsed2.rows.length
      }
    });
    await logAuditEvent("SPREADSHEET_UPLOADED", {
      fileName: req.file.originalname,
      rowCount: parsed2.rows.length,
      columnCount: parsed2.columns.length
    }, campaignId, req.ip);
    res.json({
      fileName: req.file.originalname,
      columns: parsed2.columns,
      suggestedMapping: parsed2.suggestedMapping,
      totalRows: parsed2.rows.length,
      sampleRows: parsed2.rows.slice(0, 3)
      // Safe preview snippet
    });
  } catch (err) {
    next(err);
  }
});
uploadRouter.get("/upload", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const cached = getUploadCache(campaignId);
    if (!cached) {
      res.status(404).json({ error: "No cached spreadsheet upload found for this campaign." });
      return;
    }
    res.json({
      fileName: cached.originalFileName,
      columns: cached.columns,
      suggestedMapping: cached.suggestedMapping || {},
      totalRows: cached.rows.length,
      sampleRows: cached.rows.slice(0, 3)
    });
  } catch (err) {
    next(err);
  }
});
var mappingSchema = z3.object({
  mapping: z3.object({
    email: z3.string().min(1, "Email column is required"),
    firstName: z3.string().optional(),
    lastName: z3.string().optional(),
    company: z3.string().optional(),
    phone: z3.string().optional(),
    jobTitle: z3.string().optional(),
    awb: z3.string().optional(),
    destination: z3.string().optional(),
    requiredFields: z3.array(z3.string()).optional()
  }),
  dedupeOptions: z3.object({
    strategy: z3.enum(["remove_all_duplicates", "keep_first", "allow_all"]).default("keep_first")
  }).default({ strategy: "keep_first" })
});
uploadRouter.post("/map", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const cached = getUploadCache(campaignId);
    if (!cached) {
      res.status(400).json({ error: "No uploaded spreadsheet found for this campaign. Please upload a file first." });
      return;
    }
    const { mapping, dedupeOptions } = mappingSchema.parse(req.body);
    const suppressions = await prisma.suppressionList.findMany({ select: { email: true } });
    const suppressedSet = new Set(suppressions.map((s) => s.email.toLowerCase()));
    const summary = validateSpreadsheetRows(
      cached.rows,
      mapping,
      dedupeOptions,
      suppressedSet
    );
    await prisma.recipient.deleteMany({ where: { campaignId } });
    await prisma.$transaction(
      summary.rows.map(
        (row) => prisma.recipient.create({
          data: {
            campaignId,
            rowNumber: row.rowNumber,
            email: row.email || null,
            firstName: row.firstName || null,
            lastName: row.lastName || null,
            company: row.company || null,
            phone: row.phone || null,
            jobTitle: row.jobTitle || null,
            awb: row.awb || null,
            destination: row.destination || null,
            customFields: Object.keys(row.customFields).length > 0 ? JSON.stringify(row.customFields) : null,
            status: row.status,
            rejectReason: row.rejectReason || null,
            isExcluded: row.isExcluded
          }
        })
      )
    );
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: "MAPPED",
        readyCount: summary.readyCount,
        rejectedCount: summary.rejectedCount,
        totalUploaded: summary.totalRows
      }
    });
    await logAuditEvent("MAPPING_APPLIED", {
      readyCount: summary.readyCount,
      rejectedCount: summary.rejectedCount,
      duplicateCount: summary.duplicateCount
    }, campaignId, req.ip);
    res.json({
      success: true,
      summary: {
        totalRows: summary.totalRows,
        readyCount: summary.readyCount,
        rejectedCount: summary.rejectedCount,
        duplicateCount: summary.duplicateCount,
        missingEmailCount: summary.missingEmailCount,
        invalidEmailCount: summary.invalidEmailCount,
        missingRequiredCount: summary.missingRequiredCount,
        exceedsMaxRecipients: summary.readyCount > 100
      }
    });
  } catch (err) {
    next(err);
  }
});

// src/server/routes/templates.ts
import { Router as Router3 } from "express";
import { z as z4 } from "zod";

// src/server/services/templateEngine.ts
import sanitizeHtml from "sanitize-html";
function escapeHtml(unsafe) {
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function normalizeTokenKey(token) {
  return token.trim().toLowerCase().replace(/[_-]/g, " ");
}
function normalizePlaceholdersInText(text) {
  if (!text) return "";
  return text.replace(/\[\s*(first\s*name|name|full\s*name|recipient(\s*name)?)\s*\]/gi, "{{first name}}").replace(/<\s*(first\s*name|name|full\s*name|recipient(\s*name)?)\s*>/gi, "{{first name}}").replace(/\[\s*(last\s*name|surname)\s*\]/gi, "{{last name}}").replace(/\[\s*(company(\s*name)?|organization|business)\s*\]/gi, "{{company name}}").replace(/\[\s*(job\s*title|role|position)\s*\]/gi, "{{job title}}").replace(/\[\s*(phone(\s*number)?|mobile)\s*\]/gi, "{{phone number}}").replace(/\[\s*(email(\s*address)?)\s*\]/gi, "{{email address}}");
}
function extractPlaceholders(text) {
  if (!text) return [];
  const normalized = normalizePlaceholdersInText(text);
  const regex = /\{\{\s*([^}]+)\s*\}\}/g;
  const matches = /* @__PURE__ */ new Set();
  let match;
  while ((match = regex.exec(normalized)) !== null) {
    matches.add(match[1].trim());
  }
  return Array.from(matches);
}
function capitalizePersonName(value) {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ");
  return normalized.split(/([\s'-]+)/).map((part) => {
    if (!part || /^[\s'-]+$/.test(part)) return part;
    const lower = part.toLocaleLowerCase();
    const upper = part.toLocaleUpperCase();
    if (part !== lower && part !== upper) return part;
    return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
  }).join("");
}
function resolveTokenValue(token, recipient) {
  const norm = normalizeTokenKey(token);
  if (norm === "first name" || norm === "firstname" || norm === "first") {
    return capitalizePersonName(recipient.firstName) || void 0;
  }
  if (norm === "name" || norm === "full name" || norm === "recipient" || norm === "recipient name") {
    const firstName = capitalizePersonName(recipient.firstName);
    const lastName = capitalizePersonName(recipient.lastName);
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    return firstName || lastName || void 0;
  }
  if (norm === "last name" || norm === "lastname" || norm === "last" || norm === "surname") {
    return capitalizePersonName(recipient.lastName) || void 0;
  }
  if (norm === "email address" || norm === "email") {
    return recipient.email ?? void 0;
  }
  if (norm === "phone number" || norm === "phone" || norm === "mobile" || norm === "telephone") {
    return recipient.phone ?? void 0;
  }
  if (norm === "job title" || norm === "jobtitle" || norm === "title" || norm === "role" || norm === "position" || norm === "occupation") {
    return recipient.jobTitle ?? void 0;
  }
  if (norm === "company name" || norm === "company" || norm === "organization" || norm === "business") {
    return recipient.company ?? void 0;
  }
  if (norm === "awb" || norm === "air waybill" || norm === "tracking" || norm === "tracking number") {
    return recipient.awb ?? void 0;
  }
  if (norm === "destination" || norm === "dest" || norm === "city") {
    return recipient.destination ?? void 0;
  }
  if (recipient.customFields) {
    for (const [key, val] of Object.entries(recipient.customFields)) {
      if (normalizeTokenKey(key) === norm) {
        return val;
      }
    }
  }
  return void 0;
}
var SANITIZE_OPTIONS = {
  allowedTags: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "p",
    "a",
    "ul",
    "ol",
    "nl",
    "li",
    "b",
    "i",
    "strong",
    "em",
    "strike",
    "code",
    "hr",
    "br",
    "div",
    "table",
    "thead",
    "caption",
    "tbody",
    "tr",
    "th",
    "td",
    "pre",
    "span",
    "img"
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel", "style"],
    img: ["src", "alt", "width", "height", "style"],
    div: ["style", "class"],
    span: ["style", "class"],
    p: ["style", "class"],
    table: ["style", "class", "border", "cellpadding", "cellspacing", "width"],
    td: ["style", "class", "colspan", "rowspan", "width", "align", "valign"],
    th: ["style", "class", "colspan", "rowspan", "width", "align", "valign"],
    tr: ["style", "class"]
  },
  allowedSchemes: ["http", "https", "mailto", "cid", "data"]
};
function sanitizeTemplateHtml(rawHtml) {
  if (!rawHtml) return "";
  return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
}
function renderTemplateString(template, recipient, isHtml = false, highlightMissing = true) {
  if (!template) {
    return { rendered: "", missing: [] };
  }
  const missing = [];
  const normalizedTemplate = normalizePlaceholdersInText(template);
  const regex = /\{\{\s*([^}]+)\s*\}\}/g;
  const rendered = normalizedTemplate.replace(regex, (_fullMatch, tokenRaw) => {
    const token = tokenRaw.trim();
    const val = resolveTokenValue(token, recipient);
    if (val !== void 0 && val !== null && String(val).trim() !== "") {
      const strVal = String(val).trim();
      return isHtml ? escapeHtml(strVal) : strVal;
    }
    missing.push(token);
    if (highlightMissing) {
      if (isHtml) {
        return `<span style="background-color: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; border: 1px solid #fca5a5; font-weight: bold; font-family: monospace; font-size: 0.85em;">[MISSING: {{${escapeHtml(token)}}}]</span>`;
      }
      return `[MISSING: {{${token}}}]`;
    }
    return "";
  });
  return { rendered, missing };
}
function renderEmail(subjectTemplate, bodyTextTemplate, bodyHtmlTemplate, signature, optOutFooter, recipient, highlightMissing = true) {
  const allMissing = /* @__PURE__ */ new Set();
  const renderedSubject = renderTemplateString(subjectTemplate, recipient, false, highlightMissing);
  renderedSubject.missing.forEach((m) => allMissing.add(m));
  let fullBodyText = bodyTextTemplate || "";
  if (signature) {
    fullBodyText += `

${signature}`;
  }
  if (optOutFooter?.enabled && optOutFooter.text) {
    fullBodyText += `

---
${optOutFooter.text}`;
  }
  const renderedText = renderTemplateString(fullBodyText, recipient, false, highlightMissing);
  renderedText.missing.forEach((m) => allMissing.add(m));
  let renderedHtml;
  if (bodyHtmlTemplate && bodyHtmlTemplate.trim() !== "") {
    const sanitizedBase = sanitizeTemplateHtml(bodyHtmlTemplate);
    let fullHtml = sanitizedBase;
    if (signature) {
      const sanitizedSig = sanitizeTemplateHtml(signature.replace(/\n/g, "<br/>"));
      fullHtml += `<div class="email-signature" style="margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px;">${sanitizedSig}</div>`;
    }
    if (optOutFooter?.enabled && optOutFooter.text) {
      const sanitizedFooter = escapeHtml(optOutFooter.text);
      fullHtml += `<div class="opt-out-footer" style="margin-top: 32px; padding-top: 16px; border-top: 1px dashed #d1d5db; font-size: 11px; color: #6b7280;">${sanitizedFooter}</div>`;
    }
    const htmlResult = renderTemplateString(fullHtml, recipient, true, highlightMissing);
    renderedHtml = htmlResult.rendered;
    htmlResult.missing.forEach((m) => allMissing.add(m));
  }
  return {
    subject: renderedSubject.rendered,
    bodyText: renderedText.rendered,
    bodyHtml: renderedHtml,
    missingPlaceholders: Array.from(allMissing)
  };
}

// src/server/routes/templates.ts
var templatesRouter = Router3({ mergeParams: true });
var templateSchema = z4.object({
  senderName: z4.string().optional().nullable().default(""),
  replyTo: z4.string().optional().nullable().default(""),
  subject: z4.string().min(1, "Subject is required"),
  bodyText: z4.string().min(1, "Plain-text message is required"),
  bodyHtml: z4.string().optional().nullable().default(""),
  signature: z4.string().optional().nullable().default("")
});
templatesRouter.get("/template", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const template = await prisma.template.findUnique({
      where: { campaignId }
    });
    res.json({ template });
  } catch (err) {
    next(err);
  }
});
templatesRouter.post("/upload-image", imageUploadMiddleware.single("image"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No image file uploaded." });
      return;
    }
    const imageUrl = `/api/images/${req.file.filename}`;
    res.json({
      url: imageUrl,
      fileName: req.file.originalname,
      size: req.file.size
    });
  } catch (err) {
    next(err);
  }
});
templatesRouter.put("/template", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const parsed2 = templateSchema.parse(req.body);
    const template = await prisma.template.upsert({
      where: { campaignId },
      create: {
        campaignId,
        senderName: parsed2.senderName || null,
        replyTo: parsed2.replyTo || null,
        subject: parsed2.subject,
        bodyText: parsed2.bodyText,
        bodyHtml: parsed2.bodyHtml || null,
        signature: parsed2.signature || null
      },
      update: {
        senderName: parsed2.senderName || null,
        replyTo: parsed2.replyTo || null,
        subject: parsed2.subject,
        bodyText: parsed2.bodyText,
        bodyHtml: parsed2.bodyHtml || null,
        signature: parsed2.signature || null
      }
    });
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "CONFIGURED" }
    });
    await logAuditEvent("TEMPLATE_SAVED", { subject: template.subject }, campaignId, req.ip);
    res.json({ template });
  } catch (err) {
    next(err);
  }
});
templatesRouter.post("/preview", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { template: true }
    });
    if (!campaign || !campaign.template) {
      res.status(400).json({ error: "Campaign or template not found. Configure a template first." });
      return;
    }
    const recipients = await prisma.recipient.findMany({
      where: { campaignId },
      orderBy: { rowNumber: "asc" }
    });
    const template = campaign.template;
    const optOutFooter = {
      enabled: campaign.optOutEnabled,
      text: campaign.optOutText
    };
    const previewList = [];
    for (const r of recipients) {
      let customFields = {};
      if (r.customFields) {
        try {
          customFields = JSON.parse(r.customFields);
        } catch {
        }
      }
      const rendered = renderEmail(
        template.subject,
        template.bodyText,
        template.bodyHtml,
        template.signature,
        optOutFooter,
        {
          email: r.email,
          firstName: r.firstName,
          lastName: r.lastName,
          company: r.company,
          phone: r.phone,
          jobTitle: r.jobTitle,
          awb: r.awb,
          destination: r.destination,
          customFields
        },
        true
        // Highlight missing values
      );
      await prisma.recipient.update({
        where: { id: r.id },
        data: {
          previewSubject: rendered.subject,
          previewBodyText: rendered.bodyText,
          previewBodyHtml: rendered.bodyHtml || null,
          missingPlaceholders: rendered.missingPlaceholders.length > 0 ? JSON.stringify(rendered.missingPlaceholders) : null
        }
      });
      previewList.push({
        id: r.id,
        rowNumber: r.rowNumber,
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
        company: r.company,
        status: r.status,
        isExcluded: r.isExcluded,
        previewSubject: rendered.subject,
        previewBodyText: rendered.bodyText,
        previewBodyHtml: rendered.bodyHtml,
        missingPlaceholders: rendered.missingPlaceholders
      });
    }
    const placeholdersUsed = [
      ...extractPlaceholders(template.subject),
      ...extractPlaceholders(template.bodyText),
      ...template.bodyHtml ? extractPlaceholders(template.bodyHtml) : []
    ];
    res.json({
      success: true,
      totalPreviews: previewList.length,
      placeholdersUsed: Array.from(new Set(placeholdersUsed)),
      previews: previewList
    });
  } catch (err) {
    next(err);
  }
});

// src/server/routes/approval.ts
import { Router as Router4 } from "express";
import { z as z6 } from "zod";

// src/server/services/mailer.ts
import nodemailer from "nodemailer";
import path4 from "path";
import fs5 from "fs";

// src/server/config.ts
import dotenv from "dotenv";
import { z as z5 } from "zod";
dotenv.config();
var blankAsUndefined = (schema) => z5.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? void 0 : value,
  schema
);
var envSchema = z5.object({
  PORT: blankAsUndefined(z5.coerce.number().default(3001)),
  NODE_ENV: blankAsUndefined(z5.enum(["development", "production", "test"]).default("development")),
  DATABASE_URL: blankAsUndefined(z5.string().default("file:./dev.db")),
  GMAIL_USER: z5.string().email().optional().or(z5.literal("")).default(""),
  GMAIL_APP_PASSWORD: z5.string().optional().default(""),
  DEFAULT_FROM_NAME: blankAsUndefined(z5.string().default("Campaign Manager")),
  APP_ENCRYPTION_KEY: blankAsUndefined(z5.string().min(16).default("12345678901234567890123456789012")),
  SEND_DELAY_MS: blankAsUndefined(z5.coerce.number().min(100).default(2e3)),
  MAX_RETRIES: blankAsUndefined(z5.coerce.number().min(0).max(10).default(3)),
  MAX_RECIPIENTS: blankAsUndefined(z5.coerce.number().min(1).max(100).default(100))
});
var parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("\u274C Invalid environment variables:", parsed.error.format());
  process.exit(1);
}
var config = parsed.data;
function maskEmail(email) {
  if (!email || typeof email !== "string") return "N/A";
  const parts = email.split("@");
  if (parts.length !== 2) return "***";
  const [local, domain] = parts;
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
function updateRuntimeCredentials(user, pass, fromName) {
  config.GMAIL_USER = user.trim();
  config.GMAIL_APP_PASSWORD = pass.trim();
  if (fromName && fromName.trim()) {
    config.DEFAULT_FROM_NAME = fromName.trim();
  }
  process.env.GMAIL_USER = config.GMAIL_USER;
  process.env.GMAIL_APP_PASSWORD = config.GMAIL_APP_PASSWORD;
  process.env.DEFAULT_FROM_NAME = config.DEFAULT_FROM_NAME;
}
function clearRuntimeCredentials() {
  config.GMAIL_USER = "";
  config.GMAIL_APP_PASSWORD = "";
  process.env.GMAIL_USER = "";
  process.env.GMAIL_APP_PASSWORD = "";
}

// src/server/services/mailer.ts
function classifySmtpError(err) {
  if (!err || typeof err !== "object") {
    return {
      category: "TEMP_FAILURE",
      message: "Unknown mail transport error occurred."
    };
  }
  const errObj = err;
  const code = typeof errObj.responseCode === "number" ? errObj.responseCode : void 0;
  const rawMsg = String(errObj.message || errObj.response || "SMTP Dispatch Failed");
  if (code === 535 || rawMsg.includes("Invalid login") || rawMsg.includes("Username and Password not accepted") || rawMsg.includes("BadCredentials") || rawMsg.includes("Please log in via your web browser")) {
    return {
      category: "AUTH_ERROR",
      code: 535,
      message: "Gmail authentication failed. Please verify your Gmail address and 16-character Google App Password."
    };
  }
  if (code === 454 || code === 552 || rawMsg.includes("Daily user sending limit exceeded") || rawMsg.includes("5.4.5") || rawMsg.includes("Rate limit exceeded") || rawMsg.includes("abuse") || rawMsg.includes("quota")) {
    return {
      category: "QUOTA_ERROR",
      code: code ?? 454,
      message: "Gmail sending quota or rate limit exceeded. Sending must be halted."
    };
  }
  if (code === 550 || code === 551 || code === 553 || code === 554 || rawMsg.includes("User unknown") || rawMsg.includes("does not exist") || rawMsg.includes("mailbox unavailable") || rawMsg.includes("recipient rejected")) {
    return {
      category: "PERM_FAILURE",
      code: code ?? 550,
      message: `Permanent delivery rejection: ${rawMsg.substring(0, 120)}`
    };
  }
  return {
    category: "TEMP_FAILURE",
    code: code ?? 421,
    message: `Temporary transport issue: ${rawMsg.substring(0, 120)}`
  };
}
var transporterInstance = null;
var isServerless2 = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL_ENV);
function resetTransporter() {
  transporterInstance = null;
}
function getTransporter() {
  if (transporterInstance) {
    return transporterInstance;
  }
  const hasLiveCredentials = Boolean(config.GMAIL_USER) && Boolean(config.GMAIL_APP_PASSWORD) && !config.GMAIL_APP_PASSWORD.startsWith("mock_");
  if (!hasLiveCredentials) {
    console.warn("\u26A0\uFE0F GMAIL_APP_PASSWORD not set or using mock credentials. Initializing mock mailer transport.");
    transporterInstance = nodemailer.createTransport({
      streamTransport: true,
      newline: "windows",
      buffer: true
    });
    return transporterInstance;
  }
  transporterInstance = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    // SSL
    auth: {
      user: config.GMAIL_USER,
      pass: config.GMAIL_APP_PASSWORD.replace(/\s+/g, "")
      // Strip spaces from app password
    },
    // Conservative socket timeouts
    connectionTimeout: isServerless2 ? 7e3 : 15e3,
    greetingTimeout: isServerless2 ? 7e3 : 1e4,
    socketTimeout: isServerless2 ? 9e3 : 2e4
  });
  return transporterInstance;
}
async function verifySmtpConnection() {
  try {
    const transporter = getTransporter();
    if (config.GMAIL_APP_PASSWORD.startsWith("mock_") || !config.GMAIL_USER) {
      return {
        connected: true,
        category: "SUCCESS",
        message: "Mock mailer initialized for local development and automated testing."
      };
    }
    await transporter.verify();
    return {
      connected: true,
      category: "SUCCESS",
      message: "Successfully connected and authenticated with Gmail SMTP."
    };
  } catch (err) {
    const errorInfo = classifySmtpError(err);
    console.error(`\u274C SMTP verification failed [${errorInfo.category}]: ${errorInfo.message}`);
    return {
      connected: false,
      category: errorInfo.category,
      message: errorInfo.message
    };
  }
}
function processEmailImages(html) {
  if (!html) return { html, attachments: [] };
  const attachments = [];
  const addedCids = /* @__PURE__ */ new Set();
  const searchDirs = [
    path4.resolve(process.cwd(), "uploads/images"),
    path4.resolve(process.cwd(), "src/client/public/images"),
    path4.resolve(process.cwd(), "dist/client/images")
  ];
  const imgSrcRegex = /(<img\b[^>]*?\bsrc=["'])(https?:\/\/[^"'/]+)?(?:\/api\/images\/|\/images\/|cid:)?([^"'>\s?#]+)(["'][^>]*?>)/gi;
  const transformedHtml = html.replace(imgSrcRegex, (match, prefix, host, rawFilename, suffix) => {
    if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
      return match;
    }
    const cleanName = path4.basename(rawFilename);
    const candidateNames = [
      cleanName,
      `${cleanName}.png`,
      `${cleanName}.jpg`,
      `${cleanName}.jpeg`,
      `${cleanName}.gif`,
      `${cleanName}.webp`
    ];
    let foundPath = null;
    let finalFilename = cleanName;
    for (const dir of searchDirs) {
      for (const candidate of candidateNames) {
        const fullPath = path4.join(dir, candidate);
        if (fs5.existsSync(fullPath) && fs5.statSync(fullPath).isFile()) {
          foundPath = fullPath;
          finalFilename = candidate;
          break;
        }
      }
      if (foundPath) break;
    }
    if (!foundPath) {
      return match;
    }
    const cid = finalFilename.replace(/[^a-zA-Z0-9_-]/g, "_");
    if (!addedCids.has(cid)) {
      addedCids.add(cid);
      attachments.push({
        filename: finalFilename,
        path: foundPath,
        cid
      });
    }
    return `${prefix}cid:${cid}${suffix}`;
  });
  return { html: transformedHtml, attachments };
}
async function sendPersonalizedEmail(options) {
  const maskedTo = maskEmail(options.to);
  const fromName = options.senderName?.trim() || config.DEFAULT_FROM_NAME;
  const fromAddress = config.GMAIL_USER || "campaign@localhost";
  const fromHeader = `"${fromName}" <${fromAddress}>`;
  let finalHtml = options.html;
  let attachments = [];
  if (options.html) {
    const processed = processEmailImages(options.html);
    finalHtml = processed.html;
    attachments = processed.attachments;
  }
  const mailOptions = {
    from: fromHeader,
    to: options.to,
    subject: options.subject,
    text: options.text,
    replyTo: options.replyTo || fromAddress
  };
  if (finalHtml) {
    mailOptions.html = finalHtml;
  }
  if (attachments.length > 0) {
    mailOptions.attachments = attachments;
  }
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.log(`\u2705 Mail dispatched successfully to ${maskedTo} [MessageId: ${info.messageId || "MOCK-ID"}] (${attachments.length} inline images attached)`);
    return {
      success: true,
      messageId: info.messageId || `mock-${Date.now()}`,
      category: "SUCCESS",
      message: "Delivered to SMTP server successfully"
    };
  } catch (err) {
    const classified = classifySmtpError(err);
    console.error(`\u274C Mail delivery error for recipient ${maskedTo} [${classified.category}]: ${classified.message}`);
    return {
      success: false,
      category: classified.category,
      code: classified.code,
      message: classified.message
    };
  }
}

// src/server/routes/approval.ts
var approvalRouter = Router4({ mergeParams: true });
approvalRouter.post("/recipients/:recipientId/toggle-exclude", async (req, res, next) => {
  try {
    const { recipientId } = req.params;
    const recipient = await prisma.recipient.findUnique({ where: { id: recipientId } });
    if (!recipient) {
      res.status(404).json({ error: "Recipient not found" });
      return;
    }
    const updated = await prisma.recipient.update({
      where: { id: recipientId },
      data: { isExcluded: !recipient.isExcluded }
    });
    res.json({ success: true, isExcluded: updated.isExcluded });
  } catch (err) {
    next(err);
  }
});
var bulkExcludeSchema = z6.object({
  recipientIds: z6.array(z6.string()),
  isExcluded: z6.boolean()
});
approvalRouter.post("/recipients/bulk-exclude", async (req, res, next) => {
  try {
    const { recipientIds, isExcluded } = bulkExcludeSchema.parse(req.body);
    await prisma.recipient.updateMany({
      where: { id: { in: recipientIds } },
      data: { isExcluded }
    });
    res.json({ success: true, count: recipientIds.length, isExcluded });
  } catch (err) {
    next(err);
  }
});
var updateRecipientSchema = z6.object({
  email: z6.string().optional(),
  firstName: z6.string().optional(),
  lastName: z6.string().optional(),
  company: z6.string().optional(),
  phone: z6.string().optional(),
  jobTitle: z6.string().optional(),
  awb: z6.string().optional(),
  destination: z6.string().optional()
});
approvalRouter.patch("/recipients/:recipientId", async (req, res, next) => {
  try {
    const { id: campaignId, recipientId } = req.params;
    const data = updateRecipientSchema.parse(req.body);
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { template: true }
    });
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    const existing = await prisma.recipient.findUnique({ where: { id: recipientId } });
    if (!existing) {
      res.status(404).json({ error: "Recipient not found" });
      return;
    }
    const updatedEmail = data.email !== void 0 ? data.email.trim() : existing.email;
    const updatedFirstName = data.firstName !== void 0 ? capitalizePersonName(data.firstName) : capitalizePersonName(existing.firstName);
    const updatedLastName = data.lastName !== void 0 ? capitalizePersonName(data.lastName) : capitalizePersonName(existing.lastName);
    let status = existing.status;
    let rejectReason = existing.rejectReason;
    if (data.email !== void 0) {
      const emailCheck = validateEmail(updatedEmail || "");
      if (emailCheck.valid) {
        status = "READY";
        rejectReason = null;
      } else {
        status = "INVALID_EMAIL";
        rejectReason = emailCheck.reason || "Invalid email address";
      }
    }
    let previewSubject = existing.previewSubject;
    let previewBodyText = existing.previewBodyText;
    let previewBodyHtml = existing.previewBodyHtml;
    let missingPlaceholdersStr = null;
    if (campaign.template) {
      let customFields = {};
      if (existing.customFields) {
        try {
          customFields = JSON.parse(existing.customFields);
        } catch {
        }
      }
      const rendered = renderEmail(
        campaign.template.subject,
        campaign.template.bodyText,
        campaign.template.bodyHtml,
        campaign.template.signature,
        { enabled: campaign.optOutEnabled, text: campaign.optOutText },
        {
          email: updatedEmail,
          firstName: updatedFirstName,
          lastName: updatedLastName,
          company: data.company !== void 0 ? data.company : existing.company,
          phone: data.phone !== void 0 ? data.phone : existing.phone,
          jobTitle: data.jobTitle !== void 0 ? data.jobTitle : existing.jobTitle,
          awb: data.awb !== void 0 ? data.awb : existing.awb,
          destination: data.destination !== void 0 ? data.destination : existing.destination,
          customFields
        },
        true
      );
      previewSubject = rendered.subject;
      previewBodyText = rendered.bodyText;
      previewBodyHtml = rendered.bodyHtml || null;
      missingPlaceholdersStr = rendered.missingPlaceholders.length > 0 ? JSON.stringify(rendered.missingPlaceholders) : null;
    }
    const updated = await prisma.recipient.update({
      where: { id: recipientId },
      data: {
        email: updatedEmail,
        firstName: updatedFirstName,
        lastName: updatedLastName,
        company: data.company !== void 0 ? data.company : existing.company,
        phone: data.phone !== void 0 ? data.phone : existing.phone,
        jobTitle: data.jobTitle !== void 0 ? data.jobTitle : existing.jobTitle,
        awb: data.awb !== void 0 ? data.awb : existing.awb,
        destination: data.destination !== void 0 ? data.destination : existing.destination,
        status,
        rejectReason,
        previewSubject,
        previewBodyText,
        previewBodyHtml,
        missingPlaceholders: missingPlaceholdersStr
      }
    });
    res.json({ success: true, recipient: updated });
  } catch (err) {
    next(err);
  }
});
var testEmailSchema = z6.object({
  testEmail: z6.string().min(3)
});
approvalRouter.post("/test-email", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const { testEmail } = testEmailSchema.parse(req.body);
    const emailCheck = validateEmail(testEmail);
    if (!emailCheck.valid) {
      res.status(400).json({ error: `Invalid test email address: ${emailCheck.reason}` });
      return;
    }
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { template: true }
    });
    if (!campaign || !campaign.template) {
      res.status(400).json({ error: "Campaign template is missing. Please save a template before sending a test." });
      return;
    }
    const sampleRecipient = await prisma.recipient.findFirst({
      where: { campaignId, status: "READY" }
    });
    let sampleCustomFields = {};
    if (sampleRecipient?.customFields) {
      try {
        sampleCustomFields = JSON.parse(sampleRecipient.customFields);
      } catch {
      }
    }
    const recipientData = sampleRecipient ? {
      email: testEmail,
      firstName: sampleRecipient.firstName || "Participant",
      lastName: sampleRecipient.lastName || "",
      company: sampleRecipient.company || "Organization",
      phone: sampleRecipient.phone || "",
      jobTitle: sampleRecipient.jobTitle || "Attendee",
      customFields: sampleCustomFields
    } : {
      email: testEmail,
      firstName: "Sample",
      lastName: "Recipient",
      company: "Sample Organization",
      phone: "",
      jobTitle: "Participant",
      customFields: {}
    };
    const rendered = renderEmail(
      `[TEST] ${campaign.template.subject}`,
      `*** THIS IS A CAMPAIGN TEST EMAIL ***

${campaign.template.bodyText}`,
      campaign.template.bodyHtml ? `<div style="background-color: #fef3c7; color: #92400e; padding: 10px; font-weight: bold; border-radius: 4px; margin-bottom: 16px; border: 1px solid #fcd34d;">\u26A0\uFE0F THIS IS A CAMPAIGN TEST EMAIL</div>${campaign.template.bodyHtml}` : void 0,
      campaign.template.signature,
      { enabled: campaign.optOutEnabled, text: campaign.optOutText },
      recipientData,
      false
      // Do not render missing token badges in real test email dispatch
    );
    const sendResult = await sendPersonalizedEmail({
      to: testEmail,
      subject: rendered.subject,
      text: rendered.bodyText,
      html: rendered.bodyHtml,
      senderName: campaign.template.senderName || void 0,
      replyTo: campaign.template.replyTo || void 0
    });
    if (!sendResult.success) {
      res.status(500).json({
        error: `Failed to deliver test email: ${sendResult.message}`,
        category: sendResult.category
      });
      return;
    }
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        testEmailAddress: testEmail,
        testEmailSentAt: /* @__PURE__ */ new Date()
      }
    });
    await logAuditEvent("TEST_EMAIL_SENT", { testEmail, messageId: sendResult.messageId }, campaignId, req.ip);
    res.json({
      success: true,
      message: "Test email successfully dispatched via Gmail SMTP.",
      testEmailAddress: testEmail,
      testEmailSentAt: /* @__PURE__ */ new Date()
    });
  } catch (err) {
    next(err);
  }
});
var approveSchema = z6.object({
  confirmationText: z6.string()
});
approvalRouter.post("/approve-and-start", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const { confirmationText } = approveSchema.parse(req.body);
    if (confirmationText.trim() !== "SEND") {
      res.status(400).json({
        error: "Confirmation text mismatch. You must type exactly 'SEND' to authorize starting this campaign."
      });
      return;
    }
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        template: true
      }
    });
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    if (!campaign.template) {
      res.status(400).json({ error: "Approval blocked: Email template has not been configured." });
      return;
    }
    if (!campaign.testEmailSentAt) {
      res.status(400).json({
        error: "Approval blocked: You must send and verify one test email before starting the campaign."
      });
      return;
    }
    const eligibleRecipients = await prisma.recipient.findMany({
      where: {
        campaignId,
        status: "READY",
        isExcluded: false
      }
    });
    const eligibleCount = eligibleRecipients.length;
    if (eligibleCount === 0) {
      res.status(400).json({
        error: "Approval blocked: There are 0 approved and ready recipients in this campaign."
      });
      return;
    }
    if (eligibleCount > 100) {
      res.status(400).json({
        error: `Approval blocked: Campaign contains ${eligibleCount} recipients, exceeding the hard maximum of 100 authorized recipients per campaign. Please exclude rows until total is 100 or less.`
      });
      return;
    }
    const now = /* @__PURE__ */ new Date();
    const [updatedCampaign, sendJob] = await prisma.$transaction([
      prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: "SENDING",
          approvedAt: now,
          approvedCount: eligibleCount
        }
      }),
      prisma.sendJob.upsert({
        where: { campaignId },
        create: {
          campaignId,
          status: "QUEUED",
          totalRecipients: eligibleCount,
          sentCount: 0,
          failedCount: 0,
          skippedCount: 0,
          startedAt: now
        },
        update: {
          status: "QUEUED",
          totalRecipients: eligibleCount,
          sentCount: 0,
          failedCount: 0,
          skippedCount: 0,
          startedAt: now,
          pausedAt: null,
          completedAt: null,
          lastError: null
        }
      })
    ]);
    await logAuditEvent("CAMPAIGN_APPROVED_AND_QUEUED", {
      approvedCount: eligibleCount,
      confirmedBy: "USER"
    }, campaignId, req.ip);
    res.json({
      success: true,
      message: "Campaign approved and queued for persistent sending.",
      campaign: updatedCampaign,
      sendJob
    });
  } catch (err) {
    next(err);
  }
});

// src/server/routes/queue.ts
import { Router as Router5 } from "express";

// src/worker/queueWorker.ts
var QueueWorker = class {
  isRunning = false;
  pollIntervalMs = 1e3;
  /**
   * Recovers any stalled jobs or state from prior sudden server restarts
   */
  async recoverStalledJobs() {
    try {
      const runningJobs = await prisma.sendJob.findMany({
        where: { status: "RUNNING" }
      });
      for (const job of runningJobs) {
        console.log(`\u{1F504} Recovering stalled send job for campaign ${job.campaignId}`);
        await prisma.sendJob.update({
          where: { id: job.id },
          data: { status: "QUEUED" }
        });
      }
    } catch (err) {
      console.error("Error during stalled jobs recovery:", err);
    }
  }
  /**
   * Starts the persistent worker polling loop
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("\u{1F4EC} Persistent Email Queue Worker started.");
    await this.recoverStalledJobs();
    while (this.isRunning) {
      try {
        await this.processNextBatch();
      } catch (err) {
        console.error("Worker loop encountered an error:", err);
      }
      await this.sleep(this.pollIntervalMs);
    }
  }
  stop() {
    this.isRunning = false;
    console.log("\u{1F6D1} Persistent Email Queue Worker stopped.");
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * Inspects database for queued jobs and processes the next eligible recipient
   */
  async processNextBatch(specificCampaignId) {
    const whereClause = {
      status: { in: ["QUEUED", "RUNNING"] }
    };
    if (specificCampaignId) {
      whereClause.campaignId = specificCampaignId;
    }
    const job = await prisma.sendJob.findFirst({
      where: whereClause,
      include: {
        campaign: {
          include: {
            template: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });
    if (!job || !job.campaign || !job.campaign.template) {
      return false;
    }
    const campaign = job.campaign;
    const template = campaign.template;
    if (!template) {
      return false;
    }
    if (campaign.status === "PAUSED") {
      if (job.status !== "PAUSED") {
        await prisma.sendJob.update({ where: { id: job.id }, data: { status: "PAUSED" } });
      }
      return false;
    }
    if (campaign.status === "CANCELLED") {
      if (job.status !== "CANCELLED") {
        await prisma.sendJob.update({
          where: { id: job.id },
          data: { status: "CANCELLED", completedAt: /* @__PURE__ */ new Date() }
        });
      }
      return false;
    }
    if (job.status === "QUEUED") {
      await prisma.sendJob.update({
        where: { id: job.id },
        data: { status: "RUNNING", startedAt: job.startedAt || /* @__PURE__ */ new Date() }
      });
    }
    const recipient = await prisma.recipient.findFirst({
      where: {
        campaignId: campaign.id,
        status: "READY",
        isExcluded: false,
        sentAt: null
      },
      orderBy: { rowNumber: "asc" }
    });
    if (!recipient) {
      const now2 = /* @__PURE__ */ new Date();
      await prisma.$transaction([
        prisma.sendJob.update({
          where: { id: job.id },
          data: { status: "COMPLETED", completedAt: now2 }
        }),
        prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: "COMPLETED" }
        })
      ]);
      await logAuditEvent("CAMPAIGN_COMPLETED", {
        sentCount: job.sentCount,
        failedCount: job.failedCount,
        skippedCount: job.skippedCount
      }, campaign.id);
      console.log(`\u{1F389} Campaign ${campaign.name} (${campaign.id}) finished dispatching all recipients.`);
      return true;
    }
    const recipientEmail = recipient.email?.trim().toLowerCase();
    if (!recipientEmail) {
      await prisma.recipient.update({
        where: { id: recipient.id },
        data: { status: "MISSING_EMAIL" }
      });
      await prisma.sendJob.update({
        where: { id: job.id },
        data: { skippedCount: { increment: 1 } }
      });
      return true;
    }
    const suppression = await prisma.suppressionList.findUnique({
      where: { email: recipientEmail }
    });
    if (suppression) {
      console.log(`\u26D4 Recipient ${maskEmail(recipientEmail)} is suppressed. Skipping send.`);
      await prisma.$transaction([
        prisma.recipient.update({
          where: { id: recipient.id },
          data: {
            status: "SUPPRESSED",
            rejectReason: `Address is suppressed: ${suppression.reason || "Suppression list"}`
          }
        }),
        prisma.sendAttempt.create({
          data: {
            campaignId: campaign.id,
            recipientId: recipient.id,
            maskedEmail: maskEmail(recipientEmail),
            attemptNumber: 1,
            status: "SKIPPED",
            smtpResponseCategory: "PERM_FAILURE",
            failureReason: "Address matches suppression list"
          }
        }),
        prisma.sendJob.update({
          where: { id: job.id },
          data: { skippedCount: { increment: 1 } }
        })
      ]);
      return true;
    }
    let customFields = {};
    if (recipient.customFields) {
      try {
        customFields = JSON.parse(recipient.customFields);
      } catch {
      }
    }
    const rendered = renderEmail(
      template.subject,
      template.bodyText,
      template.bodyHtml,
      template.signature,
      { enabled: campaign.optOutEnabled, text: campaign.optOutText },
      {
        email: recipient.email,
        firstName: recipient.firstName,
        lastName: recipient.lastName,
        company: recipient.company,
        phone: recipient.phone,
        jobTitle: recipient.jobTitle,
        awb: recipient.awb,
        destination: recipient.destination,
        customFields
      },
      false
      // Do not insert missing token badges in live sending
    );
    const previousAttempts = await prisma.sendAttempt.count({
      where: { recipientId: recipient.id }
    });
    const currentAttemptNumber = previousAttempts + 1;
    console.log(`\u{1F4E4} Sending to ${maskEmail(recipientEmail)} (Campaign: ${campaign.name}, Row: ${recipient.rowNumber})...`);
    const result = await sendPersonalizedEmail({
      to: recipient.email,
      subject: rendered.subject,
      text: rendered.bodyText,
      html: rendered.bodyHtml,
      senderName: template.senderName || void 0,
      replyTo: template.replyTo || void 0
    });
    const now = /* @__PURE__ */ new Date();
    await prisma.sendAttempt.create({
      data: {
        campaignId: campaign.id,
        recipientId: recipient.id,
        maskedEmail: maskEmail(recipient.email),
        attemptNumber: currentAttemptNumber,
        status: result.success ? "SENT" : "FAILED",
        smtpResponseCategory: result.category,
        smtpCode: result.code,
        responseMessage: result.message,
        failureReason: result.success ? null : result.message,
        timestamp: now
      }
    });
    if (result.success) {
      await prisma.$transaction([
        prisma.recipient.update({
          where: { id: recipient.id },
          data: {
            sentAt: now,
            previewSubject: rendered.subject,
            previewBodyText: rendered.bodyText
          }
        }),
        prisma.sendJob.update({
          where: { id: job.id },
          data: { sentCount: { increment: 1 } }
        })
      ]);
    } else {
      if (result.category === "AUTH_ERROR" || result.category === "QUOTA_ERROR") {
        console.error(`\u{1F6A8} Halting campaign ${campaign.id} due to ${result.category}: ${result.message}`);
        await prisma.$transaction([
          prisma.sendJob.update({
            where: { id: job.id },
            data: { status: "FAILED", lastError: result.message }
          }),
          prisma.campaign.update({
            where: { id: campaign.id },
            data: { status: "FAILED" }
          })
        ]);
        await logAuditEvent("CAMPAIGN_HALTED_ON_LIMIT", {
          category: result.category,
          message: result.message
        }, campaign.id);
        return true;
      }
      if (result.category === "PERM_FAILURE") {
        await prisma.$transaction([
          prisma.recipient.update({
            where: { id: recipient.id },
            data: {
              status: "FAILED",
              rejectReason: result.message
            }
          }),
          prisma.sendJob.update({
            where: { id: job.id },
            data: { failedCount: { increment: 1 } }
          })
        ]);
      } else {
        if (currentAttemptNumber >= config.MAX_RETRIES) {
          await prisma.$transaction([
            prisma.recipient.update({
              where: { id: recipient.id },
              data: {
                status: "FAILED",
                rejectReason: `Failed after ${currentAttemptNumber} attempts: ${result.message}`
              }
            }),
            prisma.sendJob.update({
              where: { id: job.id },
              data: { failedCount: { increment: 1 } }
            })
          ]);
        } else {
          const backoffDelay = Math.min(3e4, 1e3 * Math.pow(2, currentAttemptNumber));
          console.log(`\u23F3 Temporary failure for ${maskEmail(recipientEmail)}. Backing off ${backoffDelay}ms before next retry.`);
          await this.sleep(backoffDelay);
        }
      }
    }
    const delay = campaign.sendDelayMs || config.SEND_DELAY_MS || 2e3;
    await this.sleep(delay);
    return true;
  }
};
var queueWorker = new QueueWorker();

// src/server/routes/queue.ts
var queueRouter = Router5({ mergeParams: true });
queueRouter.get("/progress", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const isServerless2 = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    if (isServerless2) {
      try {
        await queueWorker.processNextBatch(campaignId);
      } catch (err) {
        console.warn("Serverless queue tick encountered error:", err);
      }
    }
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        sendJob: true
      }
    });
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    const job = campaign.sendJob;
    const total = job ? job.totalRecipients : campaign.approvedCount;
    const sent = job ? job.sentCount : 0;
    const failed = job ? job.failedCount : 0;
    const skipped = job ? job.skippedCount : 0;
    const processed = sent + failed + skipped;
    const queued = Math.max(0, total - processed);
    const percentComplete = total > 0 ? Math.min(100, Math.round(processed / total * 100)) : 0;
    const remainingMs = queued * (campaign.sendDelayMs || 2e3);
    const estimatedSecondsRemaining = Math.ceil(remainingMs / 1e3);
    const recentAttempts = await prisma.sendAttempt.findMany({
      where: { campaignId },
      orderBy: { timestamp: "desc" },
      take: 15
    });
    res.json({
      campaignId,
      campaignName: campaign.name,
      campaignStatus: campaign.status,
      jobStatus: job?.status || "IDLE",
      metrics: {
        totalRecipients: total,
        queued,
        sending: job?.status === "RUNNING" ? 1 : 0,
        sent,
        failed,
        skipped,
        percentageComplete: percentComplete,
        estimatedSecondsRemaining
      },
      recentAttempts
    });
  } catch (err) {
    next(err);
  }
});
queueRouter.post("/pause", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const now = /* @__PURE__ */ new Date();
    await prisma.$transaction([
      prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "PAUSED" }
      }),
      prisma.sendJob.updateMany({
        where: { campaignId },
        data: {
          status: "PAUSED",
          pausedAt: now
        }
      })
    ]);
    await logAuditEvent("CAMPAIGN_PAUSED", {}, campaignId, req.ip);
    res.json({ success: true, message: "Campaign paused." });
  } catch (err) {
    next(err);
  }
});
queueRouter.post("/resume", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    await prisma.$transaction([
      prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "SENDING" }
      }),
      prisma.sendJob.updateMany({
        where: { campaignId },
        data: {
          status: "QUEUED",
          pausedAt: null
        }
      })
    ]);
    await logAuditEvent("CAMPAIGN_RESUMED", {}, campaignId, req.ip);
    res.json({ success: true, message: "Campaign resumed." });
  } catch (err) {
    next(err);
  }
});
queueRouter.post("/cancel", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const now = /* @__PURE__ */ new Date();
    await prisma.$transaction([
      prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "CANCELLED" }
      }),
      prisma.sendJob.updateMany({
        where: { campaignId },
        data: {
          status: "CANCELLED",
          completedAt: now
        }
      })
    ]);
    await logAuditEvent("CAMPAIGN_CANCELLED", {}, campaignId, req.ip);
    res.json({ success: true, message: "Campaign cancelled. Unsent recipients will not be sent." });
  } catch (err) {
    next(err);
  }
});
queueRouter.post("/retry", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const failedAttempts = await prisma.sendAttempt.findMany({
      where: {
        campaignId,
        status: "FAILED",
        smtpResponseCategory: { not: "PERM_FAILURE" }
      },
      select: { recipientId: true }
    });
    const retryableIds = Array.from(new Set(failedAttempts.map((a) => a.recipientId)));
    if (retryableIds.length === 0) {
      res.status(400).json({
        error: "No retryable failed recipients found. (Permanent delivery rejections cannot be retried)."
      });
      return;
    }
    await prisma.$transaction([
      prisma.recipient.updateMany({
        where: { id: { in: retryableIds } },
        data: {
          sentAt: null,
          status: "READY"
        }
      }),
      prisma.sendJob.updateMany({
        where: { campaignId },
        data: {
          status: "QUEUED",
          completedAt: null
        }
      }),
      prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "SENDING" }
      })
    ]);
    await logAuditEvent("FAILED_RECIPIENTS_RETRIED", { count: retryableIds.length }, campaignId, req.ip);
    res.json({
      success: true,
      message: `Re-queued ${retryableIds.length} failed recipients for retry.`,
      retriedCount: retryableIds.length
    });
  } catch (err) {
    next(err);
  }
});

// src/server/routes/reports.ts
import { Router as Router6 } from "express";
var reportsRouter = Router6({ mergeParams: true });
function escapeCsvCell(val) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
reportsRouter.get("/report/csv", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        recipients: {
          orderBy: { rowNumber: "asc" },
          include: {
            sendAttempts: {
              orderBy: { timestamp: "desc" },
              take: 1
            }
          }
        }
      }
    });
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    const headers = [
      "Row number",
      "Recipient name",
      "Email",
      "Company",
      "Job Title",
      "Campaign ID",
      "Status",
      "Attempt count",
      "Sent timestamp",
      "Failure reason"
    ];
    const lines = [headers.map(escapeCsvCell).join(",")];
    for (const r of campaign.recipients) {
      const name = [r.firstName, r.lastName].filter(Boolean).join(" ") || "N/A";
      const lastAttempt = r.sendAttempts[0];
      const attemptCount = await prisma.sendAttempt.count({ where: { recipientId: r.id } });
      lines.push(
        [
          r.rowNumber,
          name,
          r.email || "",
          r.company || "",
          r.jobTitle || "",
          campaignId,
          r.status,
          attemptCount,
          r.sentAt ? r.sentAt.toISOString() : "",
          r.rejectReason || lastAttempt?.failureReason || ""
        ].map(escapeCsvCell).join(",")
      );
    }
    const csvContent = lines.join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="campaign-${campaignId}-report.csv"`
    );
    res.send(csvContent);
  } catch (err) {
    next(err);
  }
});
reportsRouter.get("/rejected/csv", async (req, res, next) => {
  try {
    const { id: campaignId } = req.params;
    const rejectedRecipients = await prisma.recipient.findMany({
      where: {
        campaignId,
        status: { not: "READY" }
      },
      orderBy: { rowNumber: "asc" }
    });
    const headers = ["Row Number", "Email", "First Name", "Last Name", "Company", "Status", "Reject Reason"];
    const lines = [headers.map(escapeCsvCell).join(",")];
    for (const r of rejectedRecipients) {
      lines.push(
        [
          r.rowNumber,
          r.email || "",
          r.firstName || "",
          r.lastName || "",
          r.company || "",
          r.status,
          r.rejectReason || ""
        ].map(escapeCsvCell).join(",")
      );
    }
    const csvContent = lines.join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="campaign-${campaignId}-rejected-rows.csv"`
    );
    res.send(csvContent);
  } catch (err) {
    next(err);
  }
});

// src/server/routes/suppression.ts
import { Router as Router7 } from "express";
import { z as z7 } from "zod";
var suppressionRouter = Router7();
suppressionRouter.get("/", async (_req, res, next) => {
  try {
    const list = await prisma.suppressionList.findMany({
      orderBy: { createdAt: "desc" }
    });
    res.json({ suppressions: list });
  } catch (err) {
    next(err);
  }
});
var addSuppressionSchema = z7.object({
  email: z7.string().min(3),
  reason: z7.string().optional().default("Manually added")
});
suppressionRouter.post("/", async (req, res, next) => {
  try {
    const { email, reason } = addSuppressionSchema.parse(req.body);
    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      res.status(400).json({ error: `Invalid email address: ${emailCheck.reason}` });
      return;
    }
    const normalized = email.trim().toLowerCase();
    const record = await prisma.suppressionList.upsert({
      where: { email: normalized },
      create: { email: normalized, reason },
      update: { reason }
    });
    await logAuditEvent("SUPPRESSION_ADDED", { email: normalized, reason }, void 0, req.ip);
    res.status(201).json({ suppression: record });
  } catch (err) {
    next(err);
  }
});
suppressionRouter.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.suppressionList.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Suppression record not found" });
      return;
    }
    await prisma.suppressionList.delete({ where: { id } });
    await logAuditEvent("SUPPRESSION_REMOVED", { email: existing.email }, void 0, req.ip);
    res.json({ message: "Email address removed from suppression list." });
  } catch (err) {
    next(err);
  }
});

// src/server/routes/settings.ts
import { Router as Router8 } from "express";
import { z as z8 } from "zod";
import fs6 from "fs";
import path5 from "path";
var settingsRouter = Router8();
function persistToEnvFile(user, pass, fromName) {
  try {
    const envPath = path5.resolve(process.cwd(), ".env");
    if (fs6.existsSync(envPath)) {
      let content = fs6.readFileSync(envPath, "utf-8");
      content = content.replace(/^GMAIL_USER=.*$/m, `GMAIL_USER=${user}`);
      content = content.replace(/^GMAIL_APP_PASSWORD=.*$/m, `GMAIL_APP_PASSWORD=${pass}`);
      if (fromName) {
        content = content.replace(/^DEFAULT_FROM_NAME=.*$/m, `DEFAULT_FROM_NAME=${fromName}`);
      }
      fs6.writeFileSync(envPath, content, "utf-8");
    }
  } catch (err) {
    console.error("Failed to update .env on disk:", err);
  }
}
settingsRouter.get("/", async (_req, res, next) => {
  try {
    const isMock = config.GMAIL_APP_PASSWORD.startsWith("mock_") || !config.GMAIL_USER;
    res.json({
      gmailUserMasked: maskEmail(config.GMAIL_USER),
      isAppPasswordConfigured: Boolean(config.GMAIL_APP_PASSWORD) && !config.GMAIL_APP_PASSWORD.startsWith("mock_"),
      isMockMode: isMock,
      defaultFromName: config.DEFAULT_FROM_NAME,
      sendDelayMs: config.SEND_DELAY_MS,
      maxRetries: config.MAX_RETRIES,
      maxRecipients: config.MAX_RECIPIENTS,
      environment: config.NODE_ENV
    });
  } catch (err) {
    next(err);
  }
});
var saveCredentialsSchema = z8.object({
  gmailUser: z8.string().email("Please enter a valid Gmail address"),
  gmailAppPassword: z8.string().min(8, "App password must be at least 8 characters"),
  defaultFromName: z8.string().optional()
});
settingsRouter.post("/credentials", async (req, res, next) => {
  try {
    const { gmailUser, gmailAppPassword, defaultFromName } = saveCredentialsSchema.parse(req.body);
    const cleanPassword = gmailAppPassword.replace(/\s+/g, "");
    updateRuntimeCredentials(gmailUser, cleanPassword, defaultFromName);
    persistToEnvFile(gmailUser, cleanPassword, defaultFromName);
    resetTransporter();
    const verifyResult = await verifySmtpConnection();
    await logAuditEvent("CREDENTIALS_UPDATED_VIA_UI", {
      user: maskEmail(gmailUser),
      verified: verifyResult.connected
    }, void 0, req.ip);
    res.json({
      success: true,
      connected: verifyResult.connected,
      message: verifyResult.message,
      gmailUserMasked: maskEmail(gmailUser),
      isAppPasswordConfigured: true,
      isMockMode: false
    });
  } catch (err) {
    next(err);
  }
});
settingsRouter.delete("/credentials", async (req, res, next) => {
  try {
    clearRuntimeCredentials();
    persistToEnvFile("", "");
    resetTransporter();
    await logAuditEvent("CREDENTIALS_REMOVED_VIA_UI", {}, void 0, req.ip);
    res.json({
      success: true,
      message: "Credentials removed successfully. App is now in mock mode.",
      isAppPasswordConfigured: false,
      isMockMode: true,
      gmailUserMasked: "N/A"
    });
  } catch (err) {
    next(err);
  }
});
settingsRouter.post("/verify-smtp", async (_req, res, next) => {
  try {
    const result = await verifySmtpConnection();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// src/server/middleware/errorHandler.ts
import { ZodError } from "zod";
function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: err.flatten().fieldErrors
    });
    return;
  }
  if (err instanceof Error) {
    const isProd = config.NODE_ENV === "production";
    console.error(`[API Error]: ${err.message}`, isProd ? "" : err.stack);
    res.status(500).json({
      error: err.message || "Internal Server Error",
      // Never expose stack trace in production
      ...isProd ? {} : { stack: err.stack }
    });
    return;
  }
  res.status(500).json({
    error: "An unexpected error occurred."
  });
}

// src/server/app.ts
import path6 from "path";
import fs7 from "fs";
var app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
app.use(["/api/campaigns", "/campaigns"], campaignsRouter);
app.use(["/api/campaigns/:id", "/campaigns/:id"], uploadRouter);
app.use(["/api/campaigns/:id", "/campaigns/:id"], templatesRouter);
app.use(["/api/campaigns/:id", "/campaigns/:id"], approvalRouter);
app.use(["/api/campaigns/:id", "/campaigns/:id"], queueRouter);
app.use(["/api/campaigns/:id", "/campaigns/:id"], reportsRouter);
app.use(["/api/suppression", "/suppression"], suppressionRouter);
app.use(["/api/settings", "/settings"], settingsRouter);
var imagesUploadDir = path6.resolve(process.cwd(), "uploads/images");
try {
  if (!fs7.existsSync(imagesUploadDir)) {
    fs7.mkdirSync(imagesUploadDir, { recursive: true });
  }
  app.use("/api/images", express.static(imagesUploadDir));
} catch (e) {
}
var publicImagesDir = path6.resolve(process.cwd(), "src/client/public/images");
if (fs7.existsSync(publicImagesDir)) {
  app.use("/api/images", express.static(publicImagesDir));
}
var distImagesDir = path6.resolve(process.cwd(), "dist/client/images");
if (fs7.existsSync(distImagesDir)) {
  app.use("/api/images", express.static(distImagesDir));
}
var clientDistPath = path6.resolve(process.cwd(), "dist/client");
if (fs7.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path6.join(clientDistPath, "index.html"));
  });
}
app.use(errorHandler);

// src/server/serverless.ts
function handler(req, res) {
  return app(req, res);
}
export {
  app,
  handler as default
};
