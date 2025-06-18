// app/api/qa-jobs/route.ts
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
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
  );
  private maxQueueSize = parseInt(process.env.MAX_QUEUE_SIZE || "20");
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

    await supabase
      .from("qa_jobs")
      .update({ status: "queued" })
      .eq("id", jobId)
      .select();
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

      this.processJob(job).finally(() => {
        this.activeJobs.delete(job.jobId);
        console.log(
          `Completed job ${job.jobId}. Active jobs: ${this.activeJobs.size}/${this.maxConcurrentJobs}`
        );

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

      if (job.retryCount < this.maxRetries) {
        job.retryCount++;
        console.log(
          `Retrying job ${job.jobId} (attempt ${job.retryCount + 1}/${
            this.maxRetries + 1
          })`
        );

        setTimeout(() => {
          this.queue.unshift(job);
          this.processQueue();
        }, 5000 * job.retryCount);
      } else {
        console.error(
          `Job ${job.jobId} failed permanently after ${
            this.maxRetries + 1
          } attempts`
        );

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

  getJobPosition(jobId: string): number {
    const position = this.queue.findIndex((job) => job.jobId === jobId);
    return position === -1 ? -1 : position + 1;
  }
}

// Rate limiting per IP
const rateLimiter = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetTime: number;
} {
  const now = Date.now();
  const key = ip || "unknown";

  let limiter = rateLimiter.get(key);

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

// Type declaration for global
declare global {
  var completedJobs: Map<string, any> | undefined;
}

// Helper function to extract similarity scores and clean summary
function extractSimilarityScores(summary: string) {
  const scores: any = {};

  // Primary patterns - look for explicit percentage format
  const patterns: Record<string, RegExp> = {
    silhouette: /silhouette[:\s]*(\d+)%/i,
    proportion: /proportion[:\s]*(\d+)%/i,
    colorMaterial: /(?:color[\/\-\s]*material|color|material)[:\s]*(\d+)%/i,
    overall: /overall[:\s]*(\d+)%/i,
  };

  // Alternative patterns - percentage before keyword
  const alternativePatterns: Record<string, RegExp> = {
    silhouette: /(\d+)%[^,]*silhouette/i,
    proportion: /(\d+)%[^,]*proportion/i,
    colorMaterial: /(\d+)%[^,]*(?:color[\/\-\s]*material|color|material)/i,
    overall: /(\d+)%[^,]*overall/i,
  };

  // Try to extract scores using both pattern sets
  for (const [key, pattern] of Object.entries(patterns)) {
    let match = summary.match(pattern);
    if (!match) {
      match = summary.match(alternativePatterns[key]);
    }
    if (match) {
      scores[key] = parseInt(match[1]);
    }
  }

  // If no explicit scores found, try to infer from descriptive text
  if (Object.keys(scores).length === 0) {
    console.log(
      "No explicit scores found, attempting to infer from description..."
    );

    // Check for silhouette descriptors
    const silhouetteDescriptors = [
      "silhouette.*highly accurate",
      "silhouette.*very accurate",
      "silhouette.*accurate",
      "proportions.*highly accurate",
      "proportions.*very accurate",
      "proportions.*accurate",
    ];

    for (const descriptor of silhouetteDescriptors) {
      const match = summary.match(new RegExp(descriptor, "i"));
      if (match) {
        if (match[0].includes("highly accurate")) scores.silhouette = 95;
        else if (match[0].includes("very accurate")) scores.silhouette = 90;
        else if (match[0].includes("accurate")) scores.silhouette = 85;
        break;
      }
    }

    // Check for proportion descriptors
    const proportionDescriptors = [
      "proportions.*highly accurate",
      "proportions.*very accurate",
      "proportions.*accurate",
      "proportions.*close",
      "proportions.*similar",
    ];

    for (const descriptor of proportionDescriptors) {
      const match = summary.match(new RegExp(descriptor, "i"));
      if (match) {
        if (match[0].includes("highly accurate")) scores.proportion = 95;
        else if (match[0].includes("very accurate")) scores.proportion = 90;
        else if (match[0].includes("accurate")) scores.proportion = 85;
        else if (match[0].includes("close")) scores.proportion = 75;
        else if (match[0].includes("similar")) scores.proportion = 70;
        break;
      }
    }

    // Check for color/material issues
    const colorIssues = [
      "wood tone.*incorrect",
      "color.*different",
      "material.*different",
      "finish.*incorrect",
      "texture.*different",
    ];

    let hasColorIssues = false;
    for (const issue of colorIssues) {
      if (summary.match(new RegExp(issue, "i"))) {
        hasColorIssues = true;
        break;
      }
    }

    if (hasColorIssues) {
      scores.colorMaterial = 70; // Moderate score due to color/material issues
    } else if (scores.silhouette || scores.proportion) {
      scores.colorMaterial = 85; // Assume good if no explicit issues mentioned
    }

    // Calculate overall as average if individual scores exist
    if (scores.silhouette && scores.proportion && scores.colorMaterial) {
      scores.overall = Math.round(
        (scores.silhouette + scores.proportion + scores.colorMaterial) / 3
      );
    } else if (scores.silhouette && scores.proportion) {
      scores.overall = Math.round((scores.silhouette + scores.proportion) / 2);
    }

    console.log("Inferred scores from descriptive text:", scores);
  }

  console.log("Final extracted similarity scores:", scores);
  console.log("From summary:", summary);

  return scores;
}

// Helper function to clean summary by removing similarity scores
function cleanSummary(summary: string): string {
  // Remove the similarity scores portion from the summary
  const cleanedSummary = summary
    .replace(/\.?\s*Similarity scores:.*$/i, "") // Remove everything from "Similarity scores:" onwards
    .replace(/\.?\s*silhouette \d+%.*$/i, "") // Fallback: remove from "silhouette X%" onwards
    .trim();

  // Ensure it ends with a period
  return cleanedSummary.endsWith(".") ? cleanedSummary : cleanedSummary + ".";
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

// Process a single QA job - REMOVED PDF GENERATION
async function processQAJob(
  jobId: string,
  renders: string[],
  references: string[],
  modelStats?: ModelStats
) {
  const tmpDir = path.join("/tmp", jobId);

  try {
    const { error: statusError } = await supabase
      .from("qa_jobs")
      .update({ status: "processing" })
      .eq("id", jobId);

    if (statusError) {
      console.error(
        `Failed to update job ${jobId} to processing:`,
        statusError
      );
      throw new Error(`Failed to update job status: ${statusError.message}`);
    }

    if (fs.existsSync(tmpDir))
      fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    // Prepare GPT messages with improved system prompt
    //     const systemMessage = {
    //       role: "system",
    //       content: `You are a 3D QA specialist. Compare all 3D model angles against all reference images. Use simple, clear English.

    // ‼️ CRITICAL - READ CAREFULLY ‼️
    // PERSPECTIVE & VIEW MATCHING:
    // • ONLY compare views showing the SAME PERSPECTIVE and ANGLE of the product
    // • If the render shows a different side or angle than the reference, DO NOT compare them at all
    // • Different sides of the product should NEVER be compared (e.g., front view vs. side view)
    // • If two images show the same object from different angles, they MUST be skipped
    // • Example of INCORRECT comparison: Noting that a logo appears on the side in one image but on the front in another

    // ‼️ ABSOLUTELY NO DUPLICATE COMMENTS ‼️
    // • If you find the same issue (e.g., cushion color difference) visible in multiple views, mention it ONLY ONCE
    // • Choose the clearest/best view to report the issue, not every view where it's visible
    // • Each issue should be unique - no repetition of the same problem across different comparisons
    // • Example: If cushion is wrong color in 3 views, report it only for the best view, not all 3

    // Guidelines:
    // 1. 3D Model come from <model-viewer>—perfect fidelity is not expected.
    // 2. References are human-crafted—focus on real discrepancies.
    // 3. Analyze geometry, proportions, textures, and material colors for each pairing.
    // 4. Be extremely specific. E.g.: '3D Model shows larger marble veins in slate gray; reference has finer veins in gold.'
    // 5. Each issue must state: what's in the 3D Model, what's in the reference, the exact difference, and how to correct it.

    // ‼️IMPORTANT‼️
    // 6. Provide a pixel bbox [x,y,width,height] relative to the 3D Model image to indicate where to annotate.
    // 7. Assign severity: 'low', 'medium', or 'high'.
    // 8. SIMILARITY SCORING - BE EXTREMELY PRECISE AND ALWAYS INCLUDE EXACT PERCENTAGES:
    //    • SILHOUETTE: Compare overall shape, outline, and form. Ignore color/texture. Perfect match = 100%, completely different shape = 0%
    //    • PROPORTION: Compare relative sizes of parts (seat vs backrest, arm width vs seat width, leg thickness, etc.). Be very strict - even 5% size differences should reduce score significantly
    //    • COLOR/MATERIAL: Compare exact colors, textures, materials, surface finish. Small color shifts should significantly impact score. Perfect color match = 100%
    //    • OVERALL: Weighted average considering all factors. Be conservative - only award high scores if model is extremely close to reference
    //    • SCORING SCALE: 98-100% = nearly perfect match, 90-97% = very close with only tiny differences, 75-89% = good match but clear differences visible, 50-74% = moderate similarity with significant differences, 25-49% = poor match with major differences, <25% = completely different
    //    ‼️ MANDATORY FORMAT ‼️: You MUST end your summary with this EXACT format: 'Similarity scores: Silhouette X%, Proportion X%, Color/Material X%, Overall X%.' Replace X with actual numbers. This is REQUIRED.

    // ‼️VERY VERY VERY IMPORTANT MAKE DECISION ONLY BASED ON ‼️
    //    • If ALL scores are >80%, mark status as 'Approved', otherwise mark as 'Not Approved'.

    // ‼️IMPORTANT‼️
    // 9. NEVER repeat the same issue across multiple views - report each unique problem only once.
    // 10. Do not swap renderIndex and referenceIndex.
    // 11. Group similar issues together and choose the best view to report them.
    // 12. Before adding an issue, check if you've already reported the same problem - if yes, skip it.

    // ‼️ CORRECT EXAMPLES ‼️
    // • '3D Model shows yellow cushion fabric; reference shows white cushion fabric' - CORRECT (same view, actual difference, reported once)
    // • '3D Model shows smoother texture; reference shows more detailed grain' - CORRECT (same view, actual difference)
    // • Summary ending: 'The model shows good accuracy in shape and proportions. Similarity scores: Silhouette 92%, Proportion 88%, Color/Material 73%, Overall 84%.' - CORRECT format

    // Output *only* a single valid JSON object, for example:
    // {
    //   "differences": [
    //     {
    //       "renderIndex": 0,
    //       "referenceIndex": 1,
    //       "issues": [
    //         "3D Model shows light gray cushion fabric; reference shows off-white cushion fabric. Adjust material color to match reference."
    //       ],
    //       "bbox": [120, 240, 300, 180],
    //       "severity": "medium"
    //     }
    //   ],
    //   "summary": "The model shows good structural accuracy but has color variations in the cushioning and wood finish. The rattan details could be more refined. Similarity scores: Silhouette 92%, Proportion 88%, Color/Material 73%, Overall 84%.",
    //   "status": "• If ALL scores are >80%, mark status as 'Approved', otherwise mark as 'Not Approved'."
    // }`,
    //     };

    const systemMessage = {
      role: "system",
      content: `You are a 3D model validator. Your PRIMARY job is to REJECT completely wrong models while APPROVING reasonable matches.

‼️ PRIMARY GOAL ‼️
CATCH COMPLETELY WRONG MODELS. If someone uploads a chair when the reference shows a sofa, REJECT IT immediately.
BUT if it's the right type of object with reasonable similarity, APPROVE it.

‼️ OBJECT TYPE VALIDATION ‼️
First check: Is this even the same type of object?
• Reference shows sofa → 3D model must be a sofa
• Reference shows chair → 3D model must be a chair  
• Reference shows table → 3D model must be a table
• WRONG OBJECT TYPE = IMMEDIATE REJECTION (all scores <30%)

‼️ BALANCED SIMILARITY SCORING ‼️
Be strict with wrong objects, but reasonable with correct objects that have minor differences.

• SILHOUETTE: Basic shape outline
  - 85-100%: Very good shape match
  - 65-84%: Good shape, same object type with acceptable differences
  - 45-64%: Same object type but noticeable shape differences  
  - 25-44%: Same object type but significant shape issues
  - 0-24%: WRONG OBJECT TYPE or completely different shape

• PROPORTION: Relative part sizes
  - 85-100%: Excellent proportions
  - 65-84%: Good proportions with minor differences
  - 45-64%: Acceptable proportions with some differences
  - 25-44%: Poor proportions but same object type
  - 0-24%: Completely wrong proportions

• COLOR/MATERIAL: Visual appearance  
  - 85-100%: Excellent color/material match
  - 65-84%: Good colors, reasonable differences
  - 45-64%: Different colors but still reasonable
  - 25-44%: Clearly different colors but same material type
  - 0-24%: Completely wrong materials/colors

• OVERALL: Average of above scores

‼️ WHAT TO REJECT ‼️
• Wrong furniture type (chair vs sofa) → All scores <30%
• Completely different object → All scores <30%
• Same object but terrible execution → Overall <50%

‼️ WHAT TO APPROVE ‼️  
• Right object type with reasonable similarity → Overall ≥50%
• Minor differences in details, colors, textures are OK
• Focus on: Is this the right type of furniture with decent similarity?

‼️ MANDATORY FORMAT ‼️
Summary MUST end: "Similarity scores: Silhouette X%, Proportion X%, Color/Material X%, Overall X%."

‼️ APPROVAL RULES ‼️
• Overall score ≥70% → "Approved" 
• Overall score <50% → "Not Approved"

Be strict with wrong objects, reasonable with right objects that have minor differences.

Output only valid JSON:
{
  "differences": [
    {
      "renderIndex": 0,
      "referenceIndex": 1,
      "issues": ["Description of difference"],
      "bbox": [x, y, width, height],
      "severity": "medium"
    }
  ],
  "summary": "Assessment focusing on object type and basic similarity. Similarity scores: Silhouette X%, Proportion X%, Color/Material X%, Overall X%.",
  "status": "Approved"
}`,
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
        model: "gpt-4.1",
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

    // DEBUG: Log the exact GPT response
    console.log("🔍 DEBUG - Raw GPT Response:", raw);
    console.log("🔍 DEBUG - Parsed qaResults.status:", `"${qaResults.status}"`);
    console.log("🔍 DEBUG - qaResults.status type:", typeof qaResults.status);
    console.log(
      "🔍 DEBUG - Full qaResults:",
      JSON.stringify(qaResults, null, 2)
    );

    // Extract similarity scores from summary
    qaResults.similarityScores = extractSimilarityScores(qaResults.summary);

    // Clean the summary to remove similarity scores for display
    qaResults.summary = cleanSummary(qaResults.summary);

    // Store QA results in database
    const { data: updateData, error: updateError } = await supabase
      .from("qa_jobs")
      .update({
        status: "complete",
        end_time: new Date().toISOString(),
        qa_results: JSON.stringify(qaResults),
      })
      .eq("id", jobId)
      .select();

    if (updateError) {
      console.error(
        `❌ Failed to update job ${jobId} in database:`,
        updateError
      );
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    console.log(`✅ Successfully updated job ${jobId} status to complete`);
    console.log(`Job ${jobId} completed successfully`);

    return { jobId, status: "complete", qaResults };
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
    const ip =
      request.ip ||
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";

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

    const jobId = uuidv4();
    const { data: insertData, error: insertError } = await supabase
      .from("qa_jobs")
      .insert([
        {
          id: jobId,
          status: "pending",
          start_time: new Date().toISOString(),
        },
      ])
      .select();

    if (insertError) {
      console.error("Failed to create job:", insertError);
      return NextResponse.json(
        { error: `Failed to create job: ${insertError.message}` },
        { status: 500 }
      );
    }

    if (!insertData || insertData.length === 0) {
      console.error("No job created - insert returned empty");
      return NextResponse.json(
        { error: "Failed to create job - no data returned" },
        { status: 500 }
      );
    }

    console.log(`✅ Created job ${jobId} in database`);

    const queue = QAJobQueue.getInstance();

    try {
      await queue.addJob(jobId, renders, references, modelStats);
    } catch (queueError: any) {
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
        { status: 503 }
      );
    }

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
        estimatedWaitTime: position * 2,
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

    const { data: job, error } = await supabase
      .from("qa_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    let qaResults = null;
    if (job.qa_results) {
      try {
        qaResults = JSON.parse(job.qa_results);
        console.log(`📖 Retrieved QA results for job ${jobId} from database`);
      } catch (e) {
        console.error("Failed to parse QA results:", e);
      }
    }

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

    console.log(
      `🔍 Returning job ${jobId} with qaResults:`,
      qaResults ? "YES" : "NO"
    );

    return NextResponse.json({
      jobId,
      status: job.status,
      error: job.error,
      startTime: job.start_time,
      endTime: job.end_time,
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
