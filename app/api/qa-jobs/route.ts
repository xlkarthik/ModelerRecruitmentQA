// app/api/qa-jobs/route.ts
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { v4 as uuidv4 } from "uuid";
import { NextRequest, NextResponse } from "next/server";

import { supabase } from "../../../lib/supabase";

// Job Queue Implementation
class QAJobQueue {
  private static instance: QAJobQueue;
  private queue: Array<{
    jobId: string;
    renders: string[];
    references: string[];
    modelStats?: ModelStats;
    retryCount: number;
  }> = [];
  private processing = false;
  private maxConcurrentJobs = parseInt(
    process.env.MAX_CONCURRENT_QA_JOBS || "3"
  ); // Configurable via env var
  private maxQueueSize = parseInt(process.env.MAX_QUEUE_SIZE || "20"); // Max jobs that can wait in queue
  private activeJobs = new Set<string>();
  private maxRetries = 2;

  static getInstance() {
    if (!QAJobQueue.instance) {
      QAJobQueue.instance = new QAJobQueue();
    }
    return QAJobQueue.instance;
  }

  async addJob(
    jobId: string,
    renders: string[],
    references: string[],
    modelStats?: ModelStats
  ) {
    // Check if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(
        `Queue is full. Maximum ${this.maxQueueSize} jobs can be queued. Please try again later.`
      );
    }

    console.log(
      `Adding job ${jobId} to queue. Queue length: ${this.queue.length}/${this.maxQueueSize}`
    );

    this.queue.push({
      jobId,
      renders,
      references,
      modelStats,
      retryCount: 0,
    });

    // Update job status to queued
    await supabase.from("qa_jobs").update({ status: "queued" }).eq("id", jobId);

    this.processQueue();
  }

  private async processQueue() {
    if (this.processing || this.activeJobs.size >= this.maxConcurrentJobs) {
      return;
    }

    this.processing = true;

    while (
      this.queue.length > 0 &&
      this.activeJobs.size < this.maxConcurrentJobs
    ) {
      const job = this.queue.shift();
      if (!job) break;

      console.log(
        `Starting job ${job.jobId}. Active jobs: ${this.activeJobs.size + 1}/${
          this.maxConcurrentJobs
        }`
      );

      this.activeJobs.add(job.jobId);

      // Process job asynchronously
      this.processJob(job).finally(() => {
        this.activeJobs.delete(job.jobId);
        console.log(
          `Completed job ${job.jobId}. Active jobs: ${this.activeJobs.size}/${this.maxConcurrentJobs}`
        );

        // Continue processing queue
        setTimeout(() => this.processQueue(), 100);
      });
    }

    this.processing = false;
  }

  private async processJob(job: {
    jobId: string;
    renders: string[];
    references: string[];
    modelStats?: ModelStats;
    retryCount: number;
  }) {
    try {
      await processQAJob(
        job.jobId,
        job.renders,
        job.references,
        job.modelStats
      );
    } catch (error: any) {
      console.error(
        `Job ${job.jobId} failed (attempt ${job.retryCount + 1}):`,
        error.message
      );

      // Retry logic
      if (job.retryCount < this.maxRetries) {
        job.retryCount++;
        console.log(
          `Retrying job ${job.jobId} (attempt ${job.retryCount + 1}/${
            this.maxRetries + 1
          })`
        );

        // Add back to queue with delay
        setTimeout(() => {
          this.queue.unshift(job); // Add to front of queue for priority retry
          this.processQueue();
        }, 5000 * job.retryCount); // Exponential backoff: 5s, 10s, 15s
      } else {
        console.error(
          `Job ${job.jobId} failed permanently after ${
            this.maxRetries + 1
          } attempts`
        );

        // Mark as permanently failed
        await supabase
          .from("qa_jobs")
          .update({
            status: "failed",
            error: `Failed after ${this.maxRetries + 1} attempts: ${
              error.message
            }`,
            end_time: new Date(),
          })
          .eq("id", job.jobId);
      }
    }
  }

  // Get queue status for monitoring
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      maxQueueSize: this.maxQueueSize,
      activeJobs: this.activeJobs.size,
      maxConcurrentJobs: this.maxConcurrentJobs,
      processing: this.processing,
      queueFull: this.queue.length >= this.maxQueueSize,
    };
  }

  // Get position of job in queue
  getJobPosition(jobId: string): number {
    const position = this.queue.findIndex((job) => job.jobId === jobId);
    return position === -1 ? -1 : position + 1; // Return 1-based position, -1 if not found
  }
}

// Rate limiting per IP
const rateLimiter = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 5; // Max 5 requests per 15 minutes per IP

function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetTime: number;
} {
  const now = Date.now();
  const key = ip || "unknown";

  let limiter = rateLimiter.get(key);

  // Reset if window expired
  if (!limiter || now > limiter.resetTime) {
    limiter = {
      count: 0,
      resetTime: now + RATE_LIMIT_WINDOW,
    };
  }

  const allowed = limiter.count < RATE_LIMIT_MAX_REQUESTS;

  if (allowed) {
    limiter.count++;
  }

  rateLimiter.set(key, limiter);

  return {
    allowed,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - limiter.count),
    resetTime: limiter.resetTime,
  };
}

type SystemMessage = {
  role: "system";
  content: string;
};

type UserMessage = {
  role: "user";
  content: Array<{
    type: "text" | "image_url";
    text?: string;
    image_url?: { url: string };
  }>;
};

type Message = SystemMessage | UserMessage;

type ModelStats = {
  meshCount: number;
  materialCount: number;
  vertices: number;
  triangles: number;
  doubleSidedCount: number;
  doubleSidedMaterials: string[];
  fileSize: number;
  worktestLevel?: string;
  requirements?: {
    maxTriangles: number;
    maxMaterials: number;
    maxFileSize: number;
  };
};

type QAResults = {
  differences: Array<{
    renderIndex: number;
    referenceIndex: number;
    issues: string[];
    bbox: number[];
    severity: string;
  }>;
  summary: string;
  status: string;
  similarityScores?: {
    silhouette?: number;
    proportion?: number;
    colorMaterial?: number;
    overall?: number;
  };
};

// Helper function to extract similarity scores from GPT summary
function extractSimilarityScores(summary: string) {
  const scores: any = {};

  // More robust patterns to catch different formats
  const patterns: Record<string, RegExp> = {
    silhouette: /silhouette[:\s]*(\d+)%/i,
    proportion: /proportion[:\s]*(\d+)%/i,
    colorMaterial: /(?:color[\/\-\s]*material|color|material)[:\s]*(\d+)%/i,
    overall: /overall[:\s]*(\d+)%/i,
  };

  // Also try these alternative patterns
  const alternativePatterns: Record<string, RegExp> = {
    silhouette: /(\d+)%[^,]*silhouette/i,
    proportion: /(\d+)%[^,]*proportion/i,
    colorMaterial: /(\d+)%[^,]*(?:color[\/\-\s]*material|color|material)/i,
    overall: /(\d+)%[^,]*overall/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    let match = summary.match(pattern);
    if (!match) {
      // Try alternative pattern
      match = summary.match(alternativePatterns[key]);
    }
    if (match) {
      scores[key] = parseInt(match[1]);
    }
  }

  console.log("Extracted similarity scores:", scores);
  console.log("From summary:", summary);

  return scores;
}
A
// Helper: generate a 2-page PDF from annotated PNGs + diff
async function generatePDF(
  annotated: string[],
  diff: any,
  modelStats?: ModelStats,
  tmpDir?: string
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      // Download font from CDN
      const fontUrl = "https://demosetc.b-cdn.net/fonts/Roboto-Regular.ttf";
      let fontBuffer: Buffer;

      try {
        const fontRes = await fetch(fontUrl);
        if (!fontRes.ok) {
          throw new Error(`Failed to fetch font: ${fontRes.status}`);
        }
        fontBuffer = Buffer.from(await fontRes.arrayBuffer());
        console.log("✅ Font downloaded from CDN");
      } catch (fontError) {
        console.error("❌ Failed to download font from CDN:", fontError);
        // Fallback to default system font
        fontBuffer = null;
      }

      // Prepare for logo
      let logoBuffer: Buffer | null = null;

      // Try to download the logo
      try {
        const logoRes = await fetch(
          "https://charpstar.se/Synsam/NewIntegrationtest/Charpstar-Logo.png"
        );
        if (logoRes.ok) {
          logoBuffer = Buffer.from(await logoRes.arrayBuffer());
          console.log("✅ Logo downloaded");
        }
      } catch (logoErr) {
        console.error("❌ Failed to download logo:", logoErr);
      }

      // Create PDF document with standard A4 size and minimal margins
      const doc = new PDFDocument({
        autoFirstPage: false,
        size: [595.28, 841.89], // A4 in points
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50,
        },
        info: {
          Title: "3D Model QA Report",
          Author: "CharpstAR QA Automator",
        },
      });

      // Create our own data collection system
      const buffers: Buffer[] = [];
      doc.on("data", (chunk) => buffers.push(Buffer.from(chunk)));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      // Register font if available
      if (fontBuffer) {
        doc.registerFont("MainFont", fontBuffer);
        doc.font("MainFont");
      }

      // Add first page
      doc.addPage();

      // --- PAGE 1: HEADER AND IMAGES ---

      // Header - use logo if available, otherwise text
      if (logoBuffer) {
        doc.image(logoBuffer, 40, 40, { width: 150 });
        doc
          .fontSize(14)
          .text("3D Model QA Report", 50, 85, { continued: false });
      } else {
        // Fallback to text only
        doc.fontSize(16).text("CharpstAR", { continued: false });
        doc.fontSize(14).text("3D Model QA Report", { continued: false });
      }

      // Horizontal rule
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      // Calculate available content width and height
      const contentWidth = 495; // 595.28 - 50 - 50 (page width minus margins)

      // Create a combined layout for all image pairs to ensure they're on the same page
      // If we have multiple images, make them smaller to fit
      const imageWidth = contentWidth;
      const imageHeight = annotated.length > 1 ? 280 : 380; // Smaller if multiple images
      const verticalGap = 10;

      let currentY = doc.y;

      // Process each image
      for (let i = 0; i < annotated.length; i++) {
        // Add a new page for each new image after the first, except for the first page
        if (i > 0) {
          // Only add a page break when needed
          if (currentY + imageHeight + 40 > 750) {
            doc.addPage();
            currentY = 70; // Reset Y position on new page
          }
        }

        // Add image caption
        doc.fontSize(12).text(`Comparison View ${i + 1}`, { align: "center" });
        doc.moveDown(0.3);
        currentY = doc.y;

        // Place image
        doc.image(annotated[i], 50, currentY, {
          width: imageWidth,
          height: imageHeight,
          fit: [imageWidth, imageHeight],
          align: "center",
        });

        // Move position for next image
        currentY += imageHeight + verticalGap;
        doc.y = currentY;
      }

      // --- MODEL PROPERTIES AND QA SUMMARY ALWAYS ON A NEW PAGE ---

      // Always start a new page for the analysis section
      doc.addPage();

      // 3D Model Properties section
      doc.fontSize(14).text("Technical Overview", { align: "left" });
      doc.moveDown(1.5);

      // Calculate column widths and positions
      // const pageWidth = 495; // Content width (right margin - left margin)
      // const leftColumnWidth = pageWidth * 0.6; // 60% for technical overview
      // const rightColumnWidth = pageWidth * 0.4; // 40% for QA summary
      // const leftColumnEnd = 50 + leftColumnWidth;
      // const contentWidth = 495; // Full width for technical overview

      // Create a two-column layout
      const originalY = doc.y; // Store the starting Y position

      // Model properties with icons for compliance - LEFT COLUMN
      doc.fontSize(11);

      // Function to add a property line with check/x mark
      const addPropertyLine = (
        property: string,
        value: string | number,
        limit?: number | null,
        unit: string = ""
      ) => {
        // Format number with commas for thousands
        const formatNumber = (num: number): string => {
          return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        };

        const valueStr =
          (typeof value === "number" ? formatNumber(value) : value) + unit;
        const checkValue =
          typeof value === "number" ? value : parseFloat(String(value));

        // Start horizontal positioning
        const startY = doc.y;

        // Draw colored circle icon based on compliance
        if (limit !== undefined) {
          const isCompliant = limit === null || checkValue <= limit;
          const circleColor = isCompliant ? "#34a853" : "#ea4335"; // Green or Red

          doc
            .circle(65, startY + 6, 5)
            .fillColor(circleColor)
            .fill();
        } else {
          // Gray circle for properties with no limit
          doc
            .circle(65, startY + 6, 5)
            .fillColor("#9aa0a6")
            .fill();
        }

        // Reset fill color for text
        doc.fillColor("#000000");

        // Property name (left aligned)
        doc.text(property, 80, startY, { continued: false, width: 160 });

        // Value (center-right aligned)
        doc.text(valueStr, 240, startY, {
          continued: false,
          width: 80,
          align: "right",
        });

        // Limit text (right aligned)
        if (limit !== undefined) {
          doc
            .fillColor("#5f6368")
            .fontSize(10)
            .text(
              limit === null
                ? ""
                : `(limit: ${limit ? formatNumber(limit) : limit}${unit})`,
              330,
              startY,
              { width: contentWidth - 280, align: "right" }
            )
            .fillColor("#000000")
            .fontSize(11);
        }

        doc.moveDown(1.5);
      };

      // Add model properties with their limits
      if (modelStats) {
        const requirements = modelStats.requirements;

        addPropertyLine(
          "Polycount",
          modelStats.triangles,
          requirements?.maxTriangles
        );
        addPropertyLine("Mesh Count", modelStats.meshCount, 5);
        addPropertyLine(
          "Material Count",
          modelStats.materialCount,
          requirements?.maxMaterials
        );
        addPropertyLine(
          "Double-sided Materials",
          modelStats.doubleSidedCount,
          0
        );
        addPropertyLine(
          "File Size",
          parseFloat((modelStats.fileSize / (1024 * 1024)).toFixed(2)),
          requirements?.maxFileSize
            ? requirements.maxFileSize / (1024 * 1024)
            : 15,
          "MB"
        );
      } else {
        // Use placeholder values if no stats provided
        const properties = [
          "• Polycount: 150,000",
          "• Material Count: 5",
          "• File Size: 5.2MB",
        ];

        properties.forEach((prop) => {
          doc.text(prop);
          doc.moveDown(1.5);
        });
      }

      // Add a horizontal line across the full page width
      const lineY = doc.y + 15;
      doc.moveTo(50, lineY).lineTo(545, lineY).stroke();

      // Reset position to continue after the horizontal line
      doc.x = 50;
      doc.y = lineY + 20;

      // QA Summary section
      doc.fontSize(14).text("QA Summary");
      doc.moveDown(0.5);

      // Summary text
      doc.fontSize(11).text(diff.summary || "No issues found.");
      doc.moveDown(1);

      doc.fontSize(12).text("Status:");
      doc.moveDown(0.5);

      doc.fontSize(11);
      doc.text(diff.status);

      // Finalize PDF
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function downloadImages(
  urls: string[],
  tmpDir: string
): Promise<string[]> {
  const allPaths: string[] = [];
  for (let idx = 0; idx < urls.length; idx++) {
    const url = urls[idx];
    let buf: Buffer;
    let ext = "png";
    if (url.startsWith("data:")) {
      const m = url.match(/^data:(.+?);base64,(.*)$/);
      if (!m) throw new Error(`Invalid data URL at index ${idx}`);
      buf = Buffer.from(m[2], "base64");
      ext = m[1].split("/")[1] || "png";
    } else {
      const res = await fetch(url);
      if (!res.ok)
        throw new Error(`Fetch failed (${res.status}) for image ${idx}`);
      const ab = await res.arrayBuffer();
      buf = Buffer.from(ab);
      ext = url.split("?")[0].split(".").pop() || "png";
    }
    const filename = `img_${idx}.${ext}`;
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, buf);
    allPaths.push(filePath);
  }
  return allPaths;
}

// Process a single QA job
async function processQAJob(
  jobId: string,
  renders: string[],
  references: string[],
  modelStats?: ModelStats
) {
  const tmpDir = path.join("/tmp", jobId);

  try {
    // Update status to processing
    await supabase
      .from("qa_jobs")
      .update({ status: "processing" })
      .eq("id", jobId);

    // Clean up and create temp directory
    if (fs.existsSync(tmpDir))
      fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    // Prepare GPT messages
    const systemMessage = {
      role: "system",
      content:
        "You are a 3D QA specialist. Compare all 3D model angles against all reference images. Use simple, clear English.\n\n" +
        "‼️ CRITICAL - READ CAREFULLY ‼️\n" +
        "PERSPECTIVE & VIEW MATCHING:\n" +
        "• ONLY compare views showing the SAME PERSPECTIVE and ANGLE of the product\n" +
        "• If the render shows a different side or angle than the reference, DO NOT compare them at all\n" +
        "• Different sides of the product should NEVER be compared (e.g., front view vs. side view)\n" +
        "• If two images show the same object from different angles, they MUST be skipped\n" +
        "• Example of INCORRECT comparison: Noting that a logo appears on the side in one image but on the front in another\n\n" +
        "‼️ ABSOLUTELY NO DUPLICATE COMMENTS ‼️\n" +
        "• If you find the same issue (e.g., cushion color difference) visible in multiple views, mention it ONLY ONCE\n" +
        "• Choose the clearest/best view to report the issue, not every view where it's visible\n" +
        "• Each issue should be unique - no repetition of the same problem across different comparisons\n" +
        "• Example: If cushion is wrong color in 3 views, report it only for the best view, not all 3\n\n" +
        "Guidelines:\n" +
        "1. 3D Model come from <model-viewer>—perfect fidelity is not expected.\n" +
        "2. References are human-crafted—focus on real discrepancies.\n" +
        "3. Analyze geometry, proportions, textures, and material colors for each pairing.\n" +
        "4. Be extremely specific. E.g.: '3D Model shows larger marble veins in slate gray; reference has finer veins in gold.'\n" +
        "5. Each issue must state: what's in the 3D Model, what's in the reference, the exact difference, and how to correct it.\n" +
        "‼️IMPORTANT‼️\n" +
        "6. Provide a pixel bbox [x,y,width,height] relative to the 3D Model image to indicate where to annotate.\n" +
        "7. Assign severity: 'low', 'medium', or 'high'.\n" +
        "8. SIMILARITY SCORING - BE EXTREMELY PRECISE:\n" +
        "   • SILHOUETTE: Compare overall shape, outline, and form. Ignore color/texture. Perfect match = 100%, completely different shape = 0%\n" +
        "   • PROPORTION: Compare relative sizes of parts (seat vs backrest, arm width vs seat width, leg thickness, etc.). Be very strict - even 5% size differences should reduce score significantly\n" +
        "   • COLOR/MATERIAL: Compare exact colors, textures, materials, surface finish. Small color shifts should significantly impact score. Perfect color match = 100%\n" +
        "   • OVERALL: Weighted average considering all factors. Be conservative - only award high scores if model is extremely close to reference\n" +
        "   • SCORING SCALE: 98-100% = nearly perfect match, 90-97% = very close with only tiny differences, 75-89% = good match but clear differences visible, 50-74% = moderate similarity with significant differences, 25-49% = poor match with major differences, <25% = completely different\n" +
        "   • Format: 'Similarity scores: Silhouette X%, Proportion X%, Color/Material X%, Overall X%.' If ALL scores are >90%, mark status as 'Approved', otherwise mark as 'Not Approved'.\n" +
        "‼️IMPORTANT‼️\n" +
        "9. NEVER repeat the same issue across multiple views - report each unique problem only once.\n" +
        "‼️IMPORTANT‼️\n" +
        "10. Do not swap renderIndex and referenceIndex.\n" +
        "11. Group similar issues together and choose the best view to report them.\n" +
        "12. Before adding an issue, check if you've already reported the same problem - if yes, skip it.\n\n" +
        "‼️ INCORRECT EXAMPLES (DO NOT DO THESE) ‼️\n" +
        "• '3D 3D Model shows side logo as \"NGS\"; reference shows different positioning and size' - WRONG! These are different views\n" +
        "• 'Render shows the product from the front; reference shows it from the back' - WRONG! Skip this comparison\n" +
        "• 'The button is visible in the 3D Model but not in the reference' - WRONG! Different perspectives\n" +
        "• Reporting 'cushion color is light gray vs off-white' for multiple views - WRONG! Report once only\n" +
        "• Giving 95% for color when there's an obvious color difference - WRONG! Be much stricter\n\n" +
        "‼️ CORRECT EXAMPLES ‼️\n" +
        "• '3D Model shows yellow cushion fabric; reference shows white cushion fabric' - CORRECT (same view, actual difference, reported once)\n" +
        "• '3D Model shows smoother texture; reference shows more detailed grain' - CORRECT (same view, actual difference)\n" +
        "• Cushion color noticeably different = Color/Material score should be 60-75%, not 85%\n" +
        "• Small proportion differences = Proportion score should be 75-85%, not 95%\n\n" +
        "Output *only* a single valid JSON object, for example:\n" +
        "{\n" +
        '  "differences": [\n' +
        "    {\n" +
        '      "renderIndex": 0,\n' +
        '      "referenceIndex": 1,\n' +
        '      "issues": [\n' +
        '        "3D Model shows light gray cushion fabric; reference shows off-white cushion fabric. Adjust material color to match reference."\n' +
        "      ],\n" +
        '      "bbox": [120, 240, 300, 180],\n' +
        '      "severity": "medium"\n' +
        "    }\n" +
        "  ],\n" +
        '  "summary": "Brief description of differences/issues found. Similarity scores: Silhouette X%, Proportion X%, Color/Material X%, Overall X%.",\n' +
        '  "status": "Approved (if ALL scores >90%) or Not Approved (if ANY score ≤90%)"\n' +
        "}",
    };

    const messages: Message[] = [
      {
        role: "system",
        content: systemMessage.content,
      },
    ];

    // Add render messages
    renders.forEach((url, i) => {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: `Rendered screenshot ${i + 1}:` },
          { type: "image_url", image_url: { url } },
        ],
      } as const);
    });

    // Add reference messages
    references.forEach((url, i) => {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: `Reference image ${i + 1}:` },
          { type: "image_url", image_url: { url } },
        ],
      } as const);
    });

    // Call GPT API
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        stream: false,
        messages,
      }),
    });

    if (!aiRes.ok) {
      throw new Error(`OpenAI API error: ${aiRes.status} ${aiRes.statusText}`);
    }

    const aiJson = await aiRes.json();
    const raw = aiJson.choices[0].message.content
      .replace(/```json|```/g, "")
      .trim();

    let qaResults: QAResults;
    try {
      qaResults = JSON.parse(raw);
    } catch (parseError) {
      throw new Error(`Failed to parse GPT response: ${parseError}`);
    }

    // Extract similarity scores from summary
    qaResults.similarityScores = extractSimilarityScores(qaResults.summary);

    // Store QA results in database
    await supabase
      .from("qa_jobs")
      .update({
        qa_results: JSON.stringify(qaResults),
      })
      .eq("id", jobId);

    // Download images and create annotations
    const allUrls = [...renders, ...references];
    const allPaths = await downloadImages(allUrls, tmpDir);
    const diffPath = path.join(tmpDir, "diff.json");
    fs.writeFileSync(diffPath, JSON.stringify(qaResults, null, 2));

    const outDir = path.join(tmpDir, "annotations");
    fs.mkdirSync(outDir, { recursive: true });

    // Call annotation service
    const imagePayload = allPaths.map((p) => {
      const buffer = fs.readFileSync(p);
      const base64 = buffer.toString("base64");
      const filename = path.basename(p);
      return { filename, data: base64 };
    });

    const response = await fetch("http://45.76.82.207:8080/annotate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: imagePayload,
        diff_json: fs.readFileSync(diffPath, "utf-8"),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Annotator server error: ${response.status} - ${errorText}`
      );
    }

    const result = await response.json();

    if (!Array.isArray(result.images) || result.images.length === 0) {
      throw new Error("No annotated images returned from annotator.");
    }

    // Save annotated images
    for (const img of result.images) {
      if (!img.filename || !img.data) {
        console.warn("Skipping invalid image object:", img);
        continue;
      }

      const buffer = Buffer.from(img.data, "base64");
      const savePath = path.join(outDir, img.filename);
      fs.writeFileSync(savePath, buffer);
    }

    const annotated = fs
      .readdirSync(outDir)
      .filter((f) => f.endsWith(".png"))
      .map((f) => path.join(outDir, f));

    // Generate PDF with QA results
    const pdfBuf = await generatePDF(annotated, qaResults, modelStats, tmpDir);

    // Save PDF
    await fetch("http://45.76.82.207:8080/save-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: `qa-report-${jobId}.pdf`,
        data: pdfBuf.toString("base64"),
      }),
    });

    const pdfPath = `http://45.76.82.207:8080/saved_pdfs/qa-report-${jobId}.pdf`;

    // Update job as complete
    await supabase
      .from("qa_jobs")
      .update({
        status: "complete",
        end_time: new Date(),
        pdf_url: pdfPath,
      })
      .eq("id", jobId);

    console.log(`Job ${jobId} completed successfully`);
    return { jobId, status: "complete", pdfPath };
  } catch (error: any) {
    console.error(`Job ${jobId} failed:`, error);

    await supabase
      .from("qa_jobs")
      .update({
        status: "failed",
        error: error.message,
        end_time: new Date(),
      })
      .eq("id", jobId);

    throw error;
  }
}

// POST endpoint to create a new QA job
export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip =
      request.ip ||
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Check rate limit
    const rateLimit = checkRateLimit(ip);
    if (!rateLimit.allowed) {
      const resetDate = new Date(rateLimit.resetTime).toISOString();
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please try again later.",
          retryAfter: rateLimit.resetTime,
          resetTime: resetDate,
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": RATE_LIMIT_MAX_REQUESTS.toString(),
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": rateLimit.resetTime.toString(),
          },
        }
      );
    }

    const { renders, references, modelStats, worktestLevel } =
      await request.json();

    // Validation
    if (!Array.isArray(renders) || renders.length !== 4) {
      return NextResponse.json(
        { error: "Must send exactly 4 renders" },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(references) ||
      references.length < 1 ||
      references.length > 5
    ) {
      return NextResponse.json(
        { error: "Must send 1-5 reference images" },
        { status: 400 }
      );
    }

    // Generate job ID and create job record
    const jobId = uuidv4();
    const { error: insertError } = await supabase.from("qa_jobs").insert([
      {
        id: jobId,
        status: "pending",
        start_time: new Date(),
      },
    ]);

    if (insertError) {
      console.error("Failed to create job:", insertError);
      return NextResponse.json(
        { error: "Failed to create job" },
        { status: 500 }
      );
    }

    // Add job to queue
    const queue = QAJobQueue.getInstance();

    try {
      await queue.addJob(jobId, renders, references, modelStats);
    } catch (queueError: any) {
      // Queue is full - clean up the job we just created
      await supabase
        .from("qa_jobs")
        .update({
          status: "failed",
          error: queueError.message,
          end_time: new Date(),
        })
        .eq("id", jobId);

      return NextResponse.json(
        {
          error: queueError.message,
          queueStatus: queue.getQueueStatus(),
        },
        { status: 503 } // Service Unavailable
      );
    }

    // Get queue status for response
    const queueStatus = queue.getQueueStatus();
    const position = queue.getJobPosition(jobId);

    console.log(
      `QA job ${jobId} created and queued. Position: ${position}, Queue status:`,
      queueStatus
    );

    return NextResponse.json(
      {
        jobId,
        status: "queued",
        queuePosition: position,
        estimatedWaitTime: position * 2, // Rough estimate: 2 minutes per job ahead
        queueInfo: {
          position: position,
          totalInQueue: queueStatus.queueLength,
          activeJobs: queueStatus.activeJobs,
          maxConcurrent: queueStatus.maxConcurrentJobs,
        },
      },
      {
        status: 202,
        headers: {
          "X-RateLimit-Limit": RATE_LIMIT_MAX_REQUESTS.toString(),
          "X-RateLimit-Remaining": rateLimit.remaining.toString(),
          "X-RateLimit-Reset": rateLimit.resetTime.toString(),
        },
      }
    );
  } catch (err: any) {
    console.error("POST /api/qa-jobs error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET endpoint to check job status
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId");
    const includeQueue = url.searchParams.get("includeQueue") === "true";

    if (!jobId) {
      // If no jobId provided, return queue status
      if (includeQueue) {
        const queue = QAJobQueue.getInstance();
        return NextResponse.json({
          queueStatus: queue.getQueueStatus(),
        });
      }

      return NextResponse.json(
        { error: "Missing jobId parameter" },
        { status: 400 }
      );
    }

    // Get job from Supabase
    const { data: job, error } = await supabase
      .from("qa_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Parse QA results if available
    let qaResults = null;
    if (job.qa_results) {
      try {
        qaResults = JSON.parse(job.qa_results);

        // Ensure similarity scores are included
        if (qaResults.summary && !qaResults.similarityScores) {
          qaResults.similarityScores = extractSimilarityScores(
            qaResults.summary
          );
        }
      } catch (e) {
        console.error("Failed to parse QA results:", e);
      }
    }

    // Get queue information if job is still queued
    let queueInfo = null;
    if (job.status === "queued" || job.status === "pending") {
      const queue = QAJobQueue.getInstance();
      const position = queue.getJobPosition(jobId);
      const queueStatus = queue.getQueueStatus();

      queueInfo = {
        position: position > 0 ? position : null,
        totalInQueue: queueStatus.queueLength,
        activeJobs: queueStatus.activeJobs,
        maxConcurrent: queueStatus.maxConcurrentJobs,
        estimatedWaitTime: position > 0 ? position * 2 : 0,
      };
    }

    // Return job status with QA results
    return NextResponse.json({
      jobId,
      status: job.status,
      error: job.error,
      startTime: job.start_time,
      endTime: job.end_time,
      pdfUrl: job.pdf_url,
      qaResults,
      queueInfo,
    });
  } catch (err: any) {
    console.error("GET /api/qa-jobs error:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}
