// app/api/generate-certificate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import PDFDocument from "pdfkit";

export async function POST(request: NextRequest) {
  try {
    const { jobId, candidateName, worktestLevel } = await request.json();

    if (!jobId || !candidateName || !worktestLevel) {
      return NextResponse.json(
        {
          error: "Missing required fields: jobId, candidateName, worktestLevel",
        },
        { status: 400 }
      );
    }

    // Get job details from database
    const { data: job, error } = await supabase
      .from("qa_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Parse QA results
    let qaResults = null;
    if (job.qa_results) {
      try {
        qaResults = JSON.parse(job.qa_results);
      } catch (e) {
        console.error("Failed to parse QA results:", e);
        return NextResponse.json(
          { error: "Invalid QA results data" },
          { status: 500 }
        );
      }
    }

    // Check if model is approved
    if (!qaResults || qaResults.status !== "Approved") {
      return NextResponse.json(
        { error: "Certificate can only be generated for approved models" },
        { status: 400 }
      );
    }

    // Generate PDF certificate
    const pdfBuffer = await generateCertificatePDF({
      candidateName,
      worktestLevel: worktestLevel.toUpperCase(),
      completionDate: new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
      jobId,
      certificateId: `CSTAR-${worktestLevel.toUpperCase()}-${Date.now()}`,
      similarityScores: qaResults.similarityScores || {},
    });

    // Return PDF as download
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="CharpstAR_Certificate_${candidateName.replace(
          /\s+/g,
          "_"
        )}_${worktestLevel}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error("Certificate generation error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate certificate" },
      { status: 500 }
    );
  }
}

async function generateCertificatePDF(data: {
  candidateName: string;
  worktestLevel: string;
  completionDate: string;
  jobId: string;
  certificateId: string;
  similarityScores: any;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [842, 595], // A4 landscape
        margins: { top: 60, bottom: 60, left: 60, right: 60 },
      });

      const buffers: Buffer[] = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      // Colors
      const primaryBlue = "#667eea";
      const darkGray = "#2d3748";
      const lightGray = "#718096";
      const green = "#38a169";

      // Header with gradient background
      doc.rect(0, 0, 842, 150).fill(primaryBlue);

      // Title
      doc
        .fillColor("white")
        .fontSize(36)
        .font("fontsRoboto-Regular.ttf-Bold-Bold")
        .text("CERTIFICATE OF ACHIEVEMENT", 60, 40, {
          align: "center",
          width: 722,
        });

      doc
        .fontSize(18)
        .font("fontsRoboto-Regular.ttf-Bold")
        .text("3D Modeling Worktest Completion", 60, 85, {
          align: "center",
          width: 722,
        });

      // Main content area
      doc.fillColor(darkGray);

      // "This is to certify that"
      doc
        .fontSize(16)
        .font("fontsRoboto-Regular.ttf-Bold")
        .text("This is to certify that", 60, 200, {
          align: "center",
          width: 722,
        });

      // Candidate name (large)
      doc
        .fontSize(42)
        .font("fontsRoboto-Regular.ttf-Bold")
        .text(data.candidateName, 60, 230, { align: "center", width: 722 });

      // Achievement text
      doc
        .fontSize(20)
        .font("fontsRoboto-Regular.ttf-Bold")
        .text(
          `has successfully completed the ${data.worktestLevel} LEVEL`,
          60,
          290,
          { align: "center", width: 722 }
        );

      doc.text("3D Modeling Worktest with outstanding results", 60, 320, {
        align: "center",
        width: 722,
      });

      // Scores section
      const scoresY = 380;
      const scoreWidth = 150;
      const scoreSpacing = 180;
      const startX =
        60 + (722 - (4 * scoreWidth + 3 * (scoreSpacing - scoreWidth))) / 2;

      const scores = [
        {
          label: "Silhouette",
          value: data.similarityScores.silhouette || "N/A",
        },
        {
          label: "Proportion",
          value: data.similarityScores.proportion || "N/A",
        },
        {
          label: "Color/Material",
          value: data.similarityScores.colorMaterial || "N/A",
        },
        { label: "Overall", value: data.similarityScores.overall || "N/A" },
      ];

      scores.forEach((score, index) => {
        const x = startX + index * scoreSpacing;

        // Score value
        doc
          .fillColor(green)
          .fontSize(24)
          .font("fontsRoboto-Regular.ttf-Bold-Bold")
          .text(
            `${score.value}${typeof score.value === "number" ? "%" : ""}`,
            x,
            scoresY,
            {
              align: "center",
              width: scoreWidth,
            }
          );

        // Score label
        doc
          .fillColor(lightGray)
          .fontSize(12)
          .font("fontsRoboto-Regular.ttf-Bold")
          .text(score.label.toUpperCase(), x, scoresY + 35, {
            align: "center",
            width: scoreWidth,
          });
      });

      // Footer section
      const footerY = 480;

      // Date
      doc
        .fillColor(lightGray)
        .fontSize(14)
        .font("fontsRoboto-Regular.ttf-Bold")
        .text(`Date: ${data.completionDate}`, 60, footerY);

      // Certificate ID
      doc
        .fontSize(10)
        .font("fontsRoboto-Regular.ttf-Bold")
        .text(`Certificate ID: ${data.certificateId}`, 60, footerY + 20);

      // Signature line
      doc
        .moveTo(600, footerY + 30)
        .lineTo(780, footerY + 30)
        .stroke();

      doc
        .fontSize(12)
        .font("fontsRoboto-Regular.ttf-Bold")
        .text("CharpstAR Team", 600, footerY + 40, {
          align: "center",
          width: 180,
        });

      // Company logo area (text for now)
      doc
        .fillColor(primaryBlue)
        .fontSize(24)
        .font("fontsRoboto-Regular.ttf-Bold-Bold")
        .text("CharpstAR", 60, footerY + 20);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
