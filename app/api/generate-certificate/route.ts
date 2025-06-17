// app/api/generate-certificate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { jsPDF } from "jspdf";

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

    // Fetch job details
    const { data: job, error: fetchError } = await supabase
      .from("qa_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Parse QA results
    let qaResults: { status?: string; similarityScores?: any } | null = null;
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

    // Only approved models get certificates
    if (!qaResults || qaResults.status !== "Approved") {
      return NextResponse.json(
        { error: "Certificate can only be generated for approved models" },
        { status: 400 }
      );
    }

    // Build certificate data
    const certData = {
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
    };

    // Generate PDF
    const pdfBuffer = await generateCertificatePDF(certData);

    // Return as download
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="CharpstAR_Certificate_${candidateName.replace(
          /\s+/g,
          "_"
        )}_${worktestLevel.toUpperCase()}.pdf"`,
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

// Helper: fetch an image URL and convert to Base64
async function getImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch image");
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = response.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error("Error fetching logo:", error);
    return null;
  }
}

// Core: builds the certificate PDF
async function generateCertificatePDF(data: {
  candidateName: string;
  worktestLevel: string;
  completionDate: string;
  jobId: string;
  certificateId: string;
  similarityScores: any;
}): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 20;

  // Outer border
  doc.setDrawColor("#CCCCCC");
  doc.setLineWidth(1);
  doc.rect(margin, margin, W - margin * 2, H - margin * 2);

  // Header background wash (taller to fit larger logo + gap)
  doc.setFillColor(245, 245, 245);
  doc.rect(margin + 1, margin + 1, W - (margin + 1) * 2, 70, "F");

  // Logo (wider, centered at top)
  const logoData = await getImageAsBase64(
    "https://charpstar.se/Synsam/NewIntegrationtest/Charpstar-Logo.png"
  );
  const logoWidth = 60;
  const logoHeight = 24;
  const logoX = (W - logoWidth) / 2;
  const logoY = margin + 5;
  if (logoData) {
    doc.addImage(logoData, "PNG", logoX, logoY, logoWidth, logoHeight);
  }

  // Title & Subtitle (pushed further down)
  const gapAfterLogo = 12; // gap beneath logo
  const titleY = logoY + logoHeight + gapAfterLogo;
  const subtitleY = titleY + 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(33, 37, 41);
  doc.text("CERTIFICATE OF ACHIEVEMENT", W / 2, titleY, {
    align: "center",
  });

  // Underline
  doc.setDrawColor("#666666");
  doc.setLineWidth(0.5);
  doc.line(W / 2 - 70, titleY + 4, W / 2 + 70, titleY + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(80, 85, 100);
  doc.text("3D Modeling Worktest Completion", W / 2, subtitleY, {
    align: "center",
  });

  // Body text
  let y = subtitleY + 20;
  doc.setFontSize(16);
  doc.setTextColor(100, 108, 120);
  doc.text("This is to certify that", W / 2, y, { align: "center" });

  y += 20;
  doc.setFont("times", "bolditalic");
  doc.setFontSize(36);
  doc.setTextColor(21, 21, 21);
  doc.text(data.candidateName, W / 2, y, { align: "center" });

  y += 10;
  doc.setDrawColor(100, 108, 120);
  doc.setLineWidth(0.7);
  doc.line(W / 2 - 60, y, W / 2 + 60, y);

  y += 15;
  doc.setFont("times", "normal");
  doc.setFontSize(16);
  doc.setTextColor(33, 37, 41);
  doc.text(
    `has successfully completed initthe ${data.worktestLevel} level`,
    W / 2,
    y,
    { align: "center" }
  );

  y += 10;
  doc.setFontSize(14);
  doc.setTextColor(80, 85, 100);
  doc.text("3D Modeling Worktest", W / 2, y, {
    align: "center",
  });

  // Instruction block
  y += 40;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(33, 37, 41);
  doc.text(
    "Congratulations on passing the initial worktest! Please download this certificate and email it along with your exported .glb model to recruitment@charpstar.com for review.",
    W / 2,
    y,
    { align: "center", maxWidth: W - margin * 2 }
  );

  // Footer
  const footerY = H - margin - 25;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(100, 108, 120);
  doc.text(`Date: ${data.completionDate}`, margin + 10, footerY);
  doc.text(`Certificate ID: ${data.certificateId}`, margin + 10, footerY + 6);

  const sigX = W - margin - 60;
  doc.setDrawColor(33, 37, 41);
  doc.setLineWidth(0.5);
  doc.line(sigX, footerY, sigX + 50, footerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80, 85, 100);
  doc.text("Authorized Signatory", sigX + 25, footerY + 6, { align: "center" });
  doc.text("CharpstAR Team", sigX + 25, footerY + 12, { align: "center" });

  return Buffer.from(doc.output("arraybuffer"));
}
